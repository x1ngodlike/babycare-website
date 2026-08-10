import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { interpretTranscript, testModelConnection } from './ai.js';
import { authenticate, clearSession, createSession, getSessionUser, requireAdmin, requireAuth } from './auth.js';
import type { FamilyId } from './auth.js';
import { BackupFileNotFoundError, defaultBackupDirectory, InvalidBackupNameError, listServerBackups, readServerBackup, serverBackupStatus, startBackupScheduler, writeServerBackup } from './backup.js';
import { allAudit, allRecords, DuplicateSupplementError, getAiSettings, getProfile, importBackup, listAudit, listRecords, RecordNotFoundError, removeRecord, replaceBackup, restoreRecord, saveAiSettings, saveProfile, saveRecord } from './db.js';
import { createChangeHub } from './events.js';
import type { AuditEntry, CareRecord } from './types.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const changeHub = createChangeHub();
const backupDirectory = defaultBackupDirectory();
const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, file.mimetype.startsWith('audio/'))
});

if (production && (!(process.env.FATHER_PASSWORD || process.env.ADMIN_PASSWORD) || !process.env.MOTHER_PASSWORD || !process.env.GRANDFATHER_PASSWORD || !process.env.GRANDMOTHER_PASSWORD || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('生产环境必须设置四位家人的密码和至少 32 位的 SESSION_SECRET');
}

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: production ? {
    directives: { upgradeInsecureRequests: process.env.COOKIE_SECURE === 'true' ? [] : null }
  } : false,
  crossOriginEmbedderPolicy: false
}));
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'microphone=(self)');
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  if (!production) return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  const forwardedHost = req.get('x-forwarded-host');
  const host = forwardedHost || req.get('host');
  if (host && new URL(origin).host === host) return next();
  return res.status(403).json({ error: '请求来源不受信任' });
});

const recordSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(['feeding', 'supplement', 'bowel', 'note']),
  occurredAt: z.string().datetime({ offset: true }),
  breastMilkMl: z.number().int().min(0).max(500).nullable().optional(),
  formulaMl: z.number().int().min(0).max(500).nullable().optional(),
  supplement: z.enum(['AD', 'VD', '益生菌']).nullable().optional(),
  bowelSize: z.enum(['大', '中', '小']).nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  createdBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  updatedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  deletedAt: z.string().datetime({ offset: true }).nullable().optional(),
  deletedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).nullable().optional()
}).superRefine((value, ctx) => {
  if (value.type === 'feeding' && !value.breastMilkMl && !value.formulaMl) ctx.addIssue({ code: 'custom', message: '请填写母乳量或奶粉量' });
  if (value.type === 'supplement' && !value.supplement) ctx.addIssue({ code: 'custom', message: '请选择营养补充剂' });
  if (value.type === 'bowel' && !value.bowelSize) ctx.addIssue({ code: 'custom', message: '请选择排便量' });
  if (value.type === 'note' && !value.note) ctx.addIssue({ code: 'custom', message: '请填写备注内容' });
});

const auditEntrySchema = z.object({
  id: z.number().int().optional(), recordId: z.string().uuid(),
  action: z.enum(['create', 'update', 'delete', 'restore', 'import']),
  actor: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']),
  occurredAt: z.string().datetime({ offset: true }), snapshot: z.record(z.string(), z.unknown()).nullable()
});

const backupPayloadSchema = z.object({
  version: z.number().int().optional(),
  profile: z.object({ name: z.string().trim().min(1).max(30), birthDate: z.string().date() }).optional(),
  records: z.array(recordSchema).max(10000),
  audits: z.array(auditEntrySchema).max(50000).optional()
});

const aiSettingsSchema = z.object({
  baseUrl: z.string().trim().url('接口地址格式不正确').refine(value => new URL(value).protocol === 'https:', '接口地址必须使用 HTTPS'),
  model: z.string().trim().min(1, '请填写模型名称').max(100, '模型名称过长'),
  apiKey: z.string().trim().max(500, '密钥过长').optional()
});

function publicAiSettings() {
  const settings = getAiSettings();
  return {
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    configured: Boolean(settings.apiKey),
    keyHint: settings.apiKey ? `••••${settings.apiKey.slice(-4)}` : '',
    updatedAt: settings.updatedAt
  };
}

function modelSettings(input?: z.infer<typeof aiSettingsSchema>) {
  const saved = getAiSettings();
  return {
    baseUrl: input?.baseUrl || saved.baseUrl,
    model: input?.model || saved.model,
    apiKey: input?.apiKey || saved.apiKey
  };
}

function modelError(error: unknown) {
  if (error instanceof z.ZodError) return '模型返回的数据格式不正确';
  if (error instanceof SyntaxError) return '模型返回的内容不是有效数据';
  return error instanceof Error ? error.message : '模型服务暂时不可用';
}

function normalizeRecord(input: z.infer<typeof recordSchema>, actor: FamilyId, preserveAudit = false): CareRecord {
  const now = new Date().toISOString();
  return {
    id: input.id || randomUUID(),
    type: input.type,
    occurredAt: input.occurredAt,
    breastMilkMl: input.type === 'feeding' ? input.breastMilkMl ?? null : null,
    formulaMl: input.type === 'feeding' ? input.formulaMl ?? null : null,
    supplement: input.type === 'supplement' ? input.supplement ?? null : null,
    bowelSize: input.type === 'bowel' ? input.bowelSize ?? null : null,
    note: input.note ?? null,
    createdAt: input.createdAt || now,
    updatedAt: preserveAudit && input.updatedAt ? input.updatedAt : now,
    createdBy: preserveAudit ? input.createdBy || 'legacy' : actor,
    updatedBy: preserveAudit ? input.updatedBy || input.createdBy || 'legacy' : actor,
    deletedAt: preserveAudit ? input.deletedAt || null : null,
    deletedBy: preserveAudit ? input.deletedBy || null : null
  };
}

function exportPayload() {
  return { version: 2, exportedAt: new Date().toISOString(), profile: getProfile(), records: allRecords(true), audits: allAudit() };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/session', (req, res) => {
  const user = getSessionUser(req);
  res.json({ authenticated: Boolean(user), user });
});

app.post('/api/login', (req, res) => {
  const identity = z.enum(['father', 'mother', 'grandfather', 'grandmother']).safeParse(req.body?.identity);
  if (!identity.success) return res.status(400).json({ error: '请选择登录身份' });
  const ip = `${req.ip || 'unknown'}:${identity.data}`;
  const now = Date.now();
  const state = loginAttempts.get(ip);
  if (state && state.resetAt > now && state.count >= 8) return res.status(429).json({ error: '尝试次数过多，请 15 分钟后再试' });
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = authenticate(identity.data, password);
  if (!user) {
    const next = state && state.resetAt > now ? { ...state, count: state.count + 1 } : { count: 1, resetAt: now + 15 * 60 * 1000 };
    loginAttempts.set(ip, next);
    return res.status(401).json({ error: '密码不正确' });
  }
  loginAttempts.delete(ip);
  createSession(res, user);
  return res.json({ authenticated: true, user });
});

app.post('/api/logout', (_req, res) => {
  clearSession(res);
  res.json({ authenticated: false });
});

app.use('/api', requireAuth);

app.get('/api/profile', (_req, res) => res.json(getProfile()));
app.get('/api/events', (req, res) => changeHub.connect(req, res));
app.get('/api/capabilities', (_req, res) => res.json({
  aiTranscription: Boolean(process.env.OPENAI_API_KEY),
  transcribeModel: process.env.OPENAI_API_KEY ? transcribeModel : null,
  aiInterpretation: Boolean(getAiSettings().apiKey),
  interpretationModel: getAiSettings().apiKey ? getAiSettings().model : null
}));

app.get('/api/ai/settings', requireAdmin, (_req, res) => res.json(publicAiSettings()));

app.put('/api/ai/settings', requireAdmin, (req, res) => {
  const parsed = aiSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '模型配置格式不正确' });
  saveAiSettings(parsed.data);
  return res.json(publicAiSettings());
});

app.post('/api/ai/settings/test', requireAdmin, async (req, res) => {
  const parsed = aiSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '模型配置格式不正确' });
  const settings = modelSettings(parsed.data);
  if (!settings.apiKey) return res.status(400).json({ error: '请先填写 API 密钥' });
  try {
    await testModelConnection(settings);
    return res.json({ ok: true, message: '连接成功，模型可以正常使用' });
  } catch (error) {
    return res.status(502).json({ error: modelError(error) });
  }
});

app.post('/api/ai/interpret', async (req, res) => {
  const parsed = z.object({ transcript: z.string().trim().min(1).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '没有收到有效的语音文字' });
  const settings = modelSettings();
  if (!settings.apiKey) return res.status(503).json({ error: '服务器尚未配置指令理解模型' });
  try {
    const records = await interpretTranscript(parsed.data.transcript, settings);
    return res.json({ records, model: settings.model });
  } catch (error) {
    return res.status(502).json({ error: modelError(error) });
  }
});

app.post('/api/voice/transcribe', audioUpload.single('audio'), async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: '服务器尚未配置 AI 语音服务' });
  if (!req.file) return res.status(400).json({ error: '没有收到有效的录音文件' });

  const extension = req.file.mimetype.includes('mp4') ? 'm4a' : req.file.mimetype.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('model', transcribeModel);
  form.append('language', 'zh');
  const audioBytes = Uint8Array.from(req.file.buffer);
  form.append('file', new Blob([audioBytes], { type: req.file.mimetype }), `baby-recording.${extension}`);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(30_000)
  });
  const body = await response.json().catch(() => ({})) as { text?: string; error?: { message?: string } };
  if (!response.ok || !body.text) return res.status(502).json({ error: body.error?.message || 'AI 语音识别暂时不可用' });
  return res.json({ transcript: body.text, model: transcribeModel });
});

app.put('/api/profile', requireAdmin, (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(30), birthDate: z.string().date() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '宝宝资料格式不正确' });
  if (new Date(`${parsed.data.birthDate}T00:00:00+08:00`) > new Date()) return res.status(400).json({ error: '出生日期不能晚于今天' });
  const profile = saveProfile(parsed.data.name, parsed.data.birthDate);
  changeHub.broadcast('profile');
  return res.json(profile);
});

app.get('/api/records', (req, res) => {
  const parsed = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: '日期范围格式不正确' });
  return res.json(listRecords(parsed.data.from, parsed.data.to));
});

app.post('/api/records', (req, res) => {
  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '记录格式不正确' });
  if (new Date(parsed.data.occurredAt).getTime() > Date.now() + 10 * 60 * 1000) return res.status(400).json({ error: '记录时间不能晚于当前时间' });
  const record = saveRecord(normalizeRecord(parsed.data, getSessionUser(req)!.id));
  changeHub.broadcast('records');
  return res.status(201).json(record);
});

app.put('/api/records/:id', (req, res) => {
  const parsed = recordSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '记录格式不正确' });
  if (new Date(parsed.data.occurredAt).getTime() > Date.now() + 10 * 60 * 1000) return res.status(400).json({ error: '记录时间不能晚于当前时间' });
  const record = saveRecord(normalizeRecord(parsed.data, getSessionUser(req)!.id));
  changeHub.broadcast('records');
  return res.json(record);
});

app.delete('/api/records/:id', (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '记录编号不正确' });
  const record = removeRecord(parsed.data, getSessionUser(req)!.id);
  if (record) changeHub.broadcast('records');
  return res.json({ deleted: Boolean(record), record });
});

app.post('/api/records/:id/restore', (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '记录编号不正确' });
  const record = restoreRecord(parsed.data, getSessionUser(req)!.id);
  changeHub.broadcast('records');
  return res.json(record);
});

app.get('/api/records/:id/audit', (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '记录编号不正确' });
  return res.json(listAudit(parsed.data));
});

app.get('/api/export', requireAdmin, (_req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="babycare-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(exportPayload());
});

app.get('/api/backups/status', requireAdmin, (_req, res) => res.json(serverBackupStatus(backupDirectory)));
app.get('/api/backups', requireAdmin, (_req, res) => res.json(listServerBackups(backupDirectory)));

app.post('/api/backups', requireAdmin, (_req, res) => {
  const result = writeServerBackup(exportPayload(), { directory: backupDirectory });
  res.status(201).json(result);
});

app.post('/api/backups/:name/restore', requireAdmin, (req, res) => {
  const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
  const parsed = backupPayloadSchema.safeParse(readServerBackup(name, backupDirectory));
  if (!parsed.success || !parsed.data.profile) return res.status(400).json({ error: '服务器备份内容不完整，无法恢复' });
  writeServerBackup(exportPayload(), { directory: backupDirectory });
  const records = parsed.data.records.map(item => normalizeRecord(item, 'father', true));
  const audits = parsed.data.audits?.map(item => ({ ...item, id: item.id || 0, snapshot: item.snapshot as CareRecord | null })) as AuditEntry[] | undefined;
  const result = replaceBackup({ profile: parsed.data.profile, records, audits });
  changeHub.broadcast('all');
  res.json({ ...result, restoredFrom: name, status: serverBackupStatus(backupDirectory) });
});

app.post('/api/import', requireAdmin, (req, res) => {
  const parsed = backupPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '导入文件格式不正确' });
  writeServerBackup(exportPayload(), { directory: backupDirectory });
  const records = parsed.data.records.map(item => normalizeRecord(item, 'father', true));
  const audits = parsed.data.audits?.map(item => ({ ...item, id: item.id || 0, snapshot: item.snapshot as CareRecord | null })) as AuditEntry[] | undefined;
  const result = importBackup({ profile: parsed.data.profile, records, audits });
  changeHub.broadcast('all');
  res.json(result);
});

if (production) {
  const staticDir = resolve('dist');
  if (!existsSync(staticDir)) throw new Error('缺少 dist 目录，请先运行 npm run build');
  app.use(express.static(staticDir, { maxAge: '1h' }));
  app.get('/{*splat}', (_req, res) => res.sendFile(resolve(staticDir, 'index.html')));
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof DuplicateSupplementError) return res.status(409).json({ error: error.message, code: 'DUPLICATE_SUPPLEMENT', existing: error.existing });
  if (error instanceof RecordNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof InvalidBackupNameError || error instanceof SyntaxError) return res.status(400).json({ error: '服务器备份文件不正确' });
  if (error instanceof BackupFileNotFoundError) return res.status(404).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: '服务器暂时无法处理，请稍后重试' });
});

startBackupScheduler(exportPayload, backupDirectory);
app.listen(port, '0.0.0.0', () => console.log(`Baby care server listening on ${port}`));
