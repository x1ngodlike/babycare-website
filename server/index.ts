import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { testModelConnection } from './ai.js';
import { authenticate, clearSession, createSession, getSessionUser, requireAdmin, requireAuth, requireSuperAdmin } from './auth.js';
import type { FamilyId } from './auth.js';
import { BackupFileNotFoundError, defaultBackupDirectory, InvalidBackupNameError, listServerBackups, readServerBackup, serverBackupStatus, startBackupScheduler, writeServerBackup } from './backup.js';
import { allAudit, allRecords, CareItemConflictError, CareItemInactiveError, CareItemOrderError, DailyReport, DuplicateGrowthDayError, DuplicateSupplementError, DuplicateVaccineRecordError, FamilyPermissionError, getAiSettings, getDailyReport, getProfile, importBackup, listAudit, listCareItems, listDailyReports, listDeletedRecords, listFamilyMembers, listGrowthRecords, listRecords, listVaccineCatalog, listVaccineRecords, purgeGrowthRecord, purgeRecord, RecordNotFoundError, removeGrowthRecord, removeRecord, removeVaccineCatalogItem, removeVaccineRecord, reorderCareItems, reorderVaccineCatalog, replaceBackup, restoreGrowthRecord, restoreRecord, restoreVaccineRecord, saveAiSettings, saveCareItem, saveGrowthRecord, saveProfile, saveRecord, saveVaccineCatalogItem, saveVaccineRecord, setCareItemActive, setFamilyRole, setVaccineCatalogActive, VaccineCatalogConflictError } from './db.js';
import { createChangeHub } from './events.js';
import { generateDailyReportForDate, startDailyReportScheduler, yesterdayInShanghai } from './daily-report.js';
import { getPushStatus, startPushScheduler, stopPushScheduler, testMorningDigestPush, testFeedingGapPush, testCareItemPush, updatePushSettings } from './push.js';
import { shanghaiDateString } from './shanghai-date.js';
import type { AuditEntry, CareItem, CareRecord, FamilyMemberPermission, GrowthRecord, VaccineCatalogItem, VaccineRecord } from './types.js';

const app = express();
app.set('trust proxy', 1);
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const changeHub = createChangeHub();
const backupDirectory = defaultBackupDirectory();
// 兼容：ESM 开发环境（tsx + import.meta.url）和 CJS 生产构建（tsc 输出自带模块作用域 __dirname）
declare const __dirname: string;
const currentDir: string = (() => {
  try { if (typeof __dirname === 'string') return __dirname; } catch { /* ESM 下 __dirname 未声明 */ }
  return dirname(fileURLToPath(import.meta.url));
})();
function resolveAvatarDir(): string { const dir = join(currentDir, 'uploads', 'avatars'); if (!existsSync(dir)) try { mkdirSync(dir, { recursive: true }); } catch { /* 上传时再处理权限错误 */ } return dir; }
const avatarDir = resolveAvatarDir();

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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
app.use('/avatars', express.static(avatarDir, { maxAge: '30d' }));

const recordSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(['feeding', 'supplement', 'bowel', 'note']),
  occurredAt: z.string().datetime({ offset: true }),
  breastMilkMl: z.number().int().min(0).max(500).nullable().optional(),
  formulaMl: z.number().int().min(0).max(500).nullable().optional(),
  supplement: z.string().trim().min(1).max(30).nullable().optional(),
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

const careItemSchema = z.object({
  id: z.string().min(1).max(50), name: z.string().trim().min(1, '请填写项目名称').max(12, '项目名称不能超过 12 个字'),
  icon: z.enum(['medicine', 'massage']), sortOrder: z.number().int().min(0).max(999), active: z.boolean(),
  scheduleType: z.enum(['daily', 'interval', 'as_needed']).default('as_needed'), intervalDays: z.number().int().min(1).max(365).default(1),
  scheduleStartDate: z.string().date().nullable().default(null), reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  scheduleEndDate: z.string().date().nullable().default(null),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true })
});

const careItemInputSchema = z.object({
  name: z.string().trim().min(1).max(12), icon: z.enum(['medicine', 'massage']).default('medicine'),
  sortOrder: z.number().int().min(0).max(999), scheduleType: z.enum(['daily', 'interval', 'as_needed']),
  intervalDays: z.number().int().min(1).max(365), scheduleStartDate: z.string().date().nullable(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(), scheduleEndDate: z.string().date().nullable()
}).superRefine((value, ctx) => {
  if (value.scheduleType !== 'as_needed' && !value.scheduleStartDate) ctx.addIssue({ code: 'custom', message: '请设置计划开始日期' });
  if (value.scheduleStartDate && value.scheduleEndDate && value.scheduleEndDate < value.scheduleStartDate) ctx.addIssue({ code: 'custom', message: '结束日期不能早于开始日期' });
});

const familyMemberSchema = z.object({
  id: z.enum(['father', 'mother', 'grandfather', 'grandmother']),
  name: z.string().min(1).max(10),
  role: z.enum(['superadmin', 'admin', 'member'])
});

const growthRecordSchema = z.object({
  id: z.string().uuid().optional(),
  measuredOn: z.string().date(),
  heightCm: z.number().min(20).max(150),
  weightKg: z.number().min(0.5).max(50),
  createdAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  createdBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  updatedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  deletedAt: z.string().datetime({ offset: true }).nullable().optional(),
  deletedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).nullable().optional()
});

const vaccineRecordSchema = z.object({
  id: z.string().uuid().optional(),
  vaccineName: z.string().trim().min(1).max(40),
  category: z.enum(['program', 'self_paid']).optional(),
  dose: z.number().int().min(1).max(9),
  plannedOn: z.string().date(),
  appointmentOn: z.string().date().nullable().optional(),
  appointmentTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  administeredOn: z.string().date().nullable(),
  note: z.string().trim().max(100).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  createdBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  updatedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  deletedAt: z.string().datetime({ offset: true }).nullable().optional(),
  deletedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).nullable().optional()
});

const vaccineCatalogInputSchema = z.object({
  name: z.string().trim().min(1, '请填写疫苗名称').max(50, '疫苗名称过长'),
  category: z.enum(['program', 'self_paid']),
  shortName: z.string().trim().max(30).nullable().optional(),
  description: z.string().trim().max(300),
  doseCount: z.number().int().min(1).max(9).nullable(),
  intervalSummary: z.string().trim().max(200)
});

const backupPayloadSchema = z.object({
  version: z.number().int().optional(),
  profile: z.object({ name: z.string().trim().min(1).max(30), birthDate: z.string().date(), sex: z.enum(['male', 'female', 'unspecified']).optional(), nickname: z.string().trim().max(20).optional(), caregiverTitle: z.string().trim().max(10).optional(), avatar: z.string().max(200).nullable().optional() }).optional(),
  records: z.array(recordSchema).max(10000),
  audits: z.array(auditEntrySchema).max(50000).optional(),
  careItems: z.array(careItemSchema).max(100).optional(),
  familyMembers: z.array(familyMemberSchema).max(4).optional(),
  growthRecords: z.array(growthRecordSchema).max(1000).optional(),
  vaccineRecords: z.array(vaccineRecordSchema).max(1000).optional(),
  vaccineCatalog: z.array(z.object({ id: z.string().min(1).max(50), name: z.string().min(1).max(50), category: z.enum(['program', 'self_paid']), shortName: z.string().max(30).nullable(), description: z.string().max(300), doseCount: z.number().int().min(1).max(20).nullable(), intervalSummary: z.string().max(200), active: z.boolean(), sortOrder: z.number().int().min(0).max(9999), isSystem: z.boolean().optional().default(false) })).max(100).optional(),
  dailyReports: z.array(z.object({
    reportDate: z.string(), summary: z.string(), suggestions: z.array(z.string()), model: z.string(), generatedAt: z.string()
  })).max(3650).optional()
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

function normalizeGrowthRecord(input: z.infer<typeof growthRecordSchema>, actor: FamilyId, preserveAudit = false): GrowthRecord {
  const now = new Date().toISOString();
  return {
    id: input.id || randomUUID(), measuredOn: input.measuredOn,
    heightCm: Math.round(input.heightCm * 10) / 10, weightKg: Math.round(input.weightKg * 100) / 100,
    createdAt: input.createdAt || now, updatedAt: preserveAudit && input.updatedAt ? input.updatedAt : now,
    createdBy: preserveAudit ? input.createdBy || 'legacy' : actor,
    updatedBy: preserveAudit ? input.updatedBy || input.createdBy || 'legacy' : actor,
    deletedAt: preserveAudit ? input.deletedAt || null : null,
    deletedBy: preserveAudit ? input.deletedBy || null : null
  };
}

function normalizeVaccineRecord(input: z.infer<typeof vaccineRecordSchema>, actor: FamilyId, preserveAudit = false): VaccineRecord {
  const now = new Date().toISOString();
  return {
    id: input.id || randomUUID(), vaccineName: input.vaccineName, category: input.category || 'program', dose: input.dose,
    plannedOn: input.plannedOn, appointmentOn: input.appointmentOn || null, appointmentTime: input.appointmentOn ? input.appointmentTime || null : null, administeredOn: input.administeredOn, note: input.note || null,
    createdAt: input.createdAt || now, updatedAt: preserveAudit && input.updatedAt ? input.updatedAt : now,
    createdBy: preserveAudit ? input.createdBy || 'legacy' : actor,
    updatedBy: preserveAudit ? input.updatedBy || input.createdBy || 'legacy' : actor,
    deletedAt: preserveAudit ? input.deletedAt || null : null,
    deletedBy: preserveAudit ? input.deletedBy || null : null
  };
}

function exportPayload() {
  return { version: 10, exportedAt: new Date().toISOString(), profile: getProfile(), records: allRecords(true), audits: allAudit(), careItems: listCareItems(true), familyMembers: listFamilyMembers(), growthRecords: listGrowthRecords(true), vaccineRecords: listVaccineRecords(true), vaccineCatalog: listVaccineCatalog(true), dailyReports: listDailyReports() };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/session', (req, res) => {
  const user = getSessionUser(req);
  res.json({ authenticated: Boolean(user), user });
});
app.get('/api/login-options', (_req, res) => res.json(listFamilyMembers()));

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
app.get('/api/capabilities', (_req, res) => {
  const settings = getAiSettings();
  res.json({ aiEnabled: Boolean(settings.apiKey), aiModel: settings.apiKey ? settings.model : null });
});

app.get('/api/family-members', requireSuperAdmin, (_req, res) => res.json(listFamilyMembers()));

app.put('/api/family-members/:id/role', requireSuperAdmin, (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = z.object({ role: z.enum(['admin', 'member']) }).safeParse(req.body);
  const parsedId = z.enum(['mother', 'grandfather', 'grandmother']).safeParse(id);
  if (!parsed.success || !parsedId.success) return res.status(400).json({ error: '家庭成员权限格式不正确' });
  const member = setFamilyRole(parsedId.data, parsed.data.role);
  changeHub.broadcast('all');
  return res.json(member);
});

app.get('/api/ai/settings', requireSuperAdmin, (_req, res) => res.json(publicAiSettings()));

app.put('/api/ai/settings', requireSuperAdmin, (req, res) => {
  const parsed = aiSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '模型配置格式不正确' });
  saveAiSettings(parsed.data);
  return res.json(publicAiSettings());
});

app.post('/api/ai/settings/test', requireSuperAdmin, async (req, res) => {
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

app.get('/api/daily-report', async (req, res) => {
  const date = typeof req.query.date === 'string' && req.query.date ? req.query.date : yesterdayInShanghai();
  let report = getDailyReport(date);
  if (!report && getAiSettings().apiKey) {
    try { report = await generateDailyReportForDate(date); }
    catch (error) { console.error('[daily-report] 按需生成失败', error); }
  }
  if (!report) return res.json({ date, exists: false });
  return res.json({ date, exists: true, summary: report.summary, suggestions: report.suggestions, model: report.model, generatedAt: report.generatedAt });
});

app.post('/api/daily-report/generate', async (req, res) => {
  const date = typeof req.query.date === 'string' && req.query.date ? req.query.date : yesterdayInShanghai();
  try {
    const report = await generateDailyReportForDate(date);
    return res.json({ date: report.reportDate, summary: report.summary, suggestions: report.suggestions, model: report.model, generatedAt: report.generatedAt });
  } catch (error) {
    if (error instanceof Error && error.message === '服务器尚未配置 AI 模型') return res.status(503).json({ error: error.message });
    return res.status(502).json({ error: modelError(error) });
  }
});

app.put('/api/profile', requireAdmin, (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(30), birthDate: z.string().date(), sex: z.enum(['male', 'female', 'unspecified']).default('unspecified'), nickname: z.string().trim().max(20).optional(), caregiverTitle: z.string().trim().max(10).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '宝宝资料格式不正确' });
  if (new Date(`${parsed.data.birthDate}T00:00:00+08:00`) > new Date()) return res.status(400).json({ error: '出生日期不能晚于今天' });
  const profile = saveProfile({ name: parsed.data.name, birthDate: parsed.data.birthDate, sex: parsed.data.sex, nickname: parsed.data.nickname, caregiverTitle: parsed.data.caregiverTitle });
  changeHub.broadcast('profile');
  return res.json(profile);
});

app.post('/api/profile/avatar', requireAdmin, upload.single('avatar'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: '请上传头像图片' });
    if (!file.mimetype.startsWith('image/')) return res.status(400).json({ error: '仅支持图片格式（PNG / JPG / WebP 等）' });
    if (!existsSync(avatarDir)) mkdirSync(avatarDir, { recursive: true });
    const filename = `avatar_${uuidv4()}.webp`;
    const filepath = join(avatarDir, filename);
    try {
      await sharp(file.buffer)
        .rotate()
        .resize(512, 512, { fit: 'cover', position: 'entropy' })
        .webp({ quality: 82, effort: 6 })
        .toFile(filepath);
    } catch (inner) {
      const msg = inner instanceof Error ? inner.message : '';
      if (msg.includes('EACCES') || msg.includes('EPERM') || /permission/i.test(msg)) return res.status(500).json({ error: '服务器上传目录权限不足，请联系管理员设置 server/uploads/avatars 可写' });
      if (msg.includes('ENOENT')) return res.status(500).json({ error: '服务器上传目录不存在或无法写入' });
      if (/unsupported|not a valid|decode|format/i.test(msg)) return res.status(400).json({ error: '图片格式不支持或文件已损坏，换一张试试' });
      return res.status(500).json({ error: `图片处理失败（${msg || '请查看服务器日志'}）` });
    }
    const profile = getProfile();
    if (profile.avatar) {
      const oldPath = join(avatarDir, profile.avatar.replace('/avatars/', ''));
      if (existsSync(oldPath)) try { unlinkSync(oldPath); } catch { /* ignore */ }
    }
    const newAvatarUrl = `/avatars/${filename}`;
    const next = saveProfile({ ...profile, avatar: newAvatarUrl });
    changeHub.broadcast('profile');
    res.json({ url: newAvatarUrl, profile: next });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('EACCES') || msg.includes('EPERM') || /permission/i.test(msg)) return res.status(500).json({ error: '服务器上传目录权限不足，请联系管理员设置 server/uploads/avatars 可写' });
    if (msg.includes('ENOENT')) return res.status(500).json({ error: '服务器上传目录不存在或无法写入' });
    if (/too large|file size/i.test(msg)) return res.status(413).json({ error: '图片超过 8MB，压缩后再上传' });
    if (msg) return res.status(500).json({ error: `头像上传失败：${msg}` });
    res.status(500).json({ error: '头像上传失败，请重试或联系管理员查看日志' });
  }
});

app.delete('/api/profile/avatar', requireAdmin, (_req, res) => {
  try {
    const profile = getProfile();
    if (profile.avatar) {
      const oldPath = join(avatarDir, profile.avatar.replace('/avatars/', ''));
      if (existsSync(oldPath)) try { unlinkSync(oldPath); } catch { /* ignore */ }
    }
    const next = saveProfile({ ...profile, avatar: null });
    changeHub.broadcast('profile');
    res.json({ ok: true, profile: next });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    res.status(500).json({ error: msg ? `头像移除失败：${msg}` : '头像移除失败' });
  }
});

app.get('/api/growth-records', (_req, res) => res.json(listGrowthRecords()));

app.get('/api/growth-records/deleted', requireAdmin, (_req, res) => res.json(listGrowthRecords(true).filter(record => record.deletedAt)));

function validateGrowthDate(measuredOn: string) {
  const profile = getProfile();
  if (measuredOn < profile.birthDate) return '测量日期不能早于出生日期';
  if (measuredOn > new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })) return '测量日期不能晚于今天';
  return '';
}

app.post('/api/growth-records', (req, res) => {
  const parsed = growthRecordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '成长记录格式不正确' });
  const dateError = validateGrowthDate(parsed.data.measuredOn);
  if (dateError) return res.status(400).json({ error: dateError });
  const record = saveGrowthRecord(normalizeGrowthRecord(parsed.data, getSessionUser(req)!.id));
  changeHub.broadcast('all');
  return res.status(201).json(record);
});

app.put('/api/growth-records/:id', (req, res) => {
  const parsed = growthRecordSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '成长记录格式不正确' });
  const dateError = validateGrowthDate(parsed.data.measuredOn);
  if (dateError) return res.status(400).json({ error: dateError });
  const record = saveGrowthRecord(normalizeGrowthRecord(parsed.data, getSessionUser(req)!.id));
  changeHub.broadcast('all');
  return res.json(record);
});

app.delete('/api/growth-records/:id', requireAdmin, (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '成长记录编号不正确' });
  const record = removeGrowthRecord(parsed.data, getSessionUser(req)!.id);
  if (!record) return res.status(404).json({ error: '成长记录不存在' });
  changeHub.broadcast('all');
  return res.json({ deleted: true, record });
});

app.post('/api/growth-records/:id/restore', requireAdmin, (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '成长记录编号不正确' });
  const record = restoreGrowthRecord(parsed.data, getSessionUser(req)!.id);
  changeHub.broadcast('all');
  return res.json(record);
});

app.delete('/api/growth-records/:id/permanent', requireAdmin, (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '成长记录编号不正确' });
  if (!purgeGrowthRecord(parsed.data)) return res.status(404).json({ error: '已删除的成长记录不存在' });
  changeHub.broadcast('all');
  return res.json({ deleted: true });
});

app.get('/api/vaccine-records', (_req, res) => res.json(listVaccineRecords()));

app.get('/api/vaccine-catalog', (_req, res) => res.json(listVaccineCatalog(true)));

app.post('/api/vaccine-catalog', requireAdmin, (req, res) => {
  const parsed = vaccineCatalogInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '疫苗信息格式不正确' });
  const current = listVaccineCatalog(true);
  const item: VaccineCatalogItem = { id: randomUUID(), ...parsed.data, shortName: parsed.data.shortName || null, description: parsed.data.description || '尚未填写。', intervalSummary: parsed.data.intervalSummary || '按接种门诊安排', active: true, sortOrder: (current.at(-1)?.sortOrder || 0) + 10, isSystem: false };
  try { const saved = saveVaccineCatalogItem(item); changeHub.broadcast('all'); return res.status(201).json(saved); }
  catch (error) { if (error instanceof VaccineCatalogConflictError) return res.status(409).json({ error: error.message }); throw error; }
});

app.put('/api/vaccine-catalog/:id', requireAdmin, (req, res) => {
  const parsed = vaccineCatalogInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '疫苗信息格式不正确' });
  const existing = listVaccineCatalog(true).find(item => item.id === req.params.id);
  if (!existing) return res.status(404).json({ error: '疫苗不存在' });
  if (existing.isSystem) return res.status(400).json({ error: '系统默认疫苗只能修改启用状态' });
  try { const saved = saveVaccineCatalogItem({ ...existing, ...parsed.data, shortName: parsed.data.shortName || null, description: parsed.data.description || '尚未填写。', intervalSummary: parsed.data.intervalSummary || '按接种门诊安排' }); changeHub.broadcast('all'); return res.json(saved); }
  catch (error) { if (error instanceof VaccineCatalogConflictError) return res.status(409).json({ error: error.message }); throw error; }
});

app.delete('/api/vaccine-catalog/:id', requireAdmin, (req, res) => {
  const existing = listVaccineCatalog(true).find(item => item.id === req.params.id);
  if (existing?.isSystem) return res.status(400).json({ error: '系统默认疫苗不能删除' });
  if (!removeVaccineCatalogItem(String(req.params.id))) return res.status(404).json({ error: '疫苗不存在' });
  changeHub.broadcast('all');
  return res.json({ deleted: true });
});

app.patch('/api/vaccine-catalog/:id/active', requireAdmin, (req, res) => {
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '启用状态格式不正确' });
  try { const item = setVaccineCatalogActive(String(req.params.id), parsed.data.active); changeHub.broadcast('all'); return res.json(item); }
  catch (error) { if (error instanceof RecordNotFoundError) return res.status(404).json({ error: error.message }); throw error; }
});

app.put('/api/vaccine-catalog/order', requireAdmin, (req, res) => {
  const parsed = z.object({ ids: z.array(z.string().min(1).max(50)).min(1).max(100) }).safeParse(req.body);
  if (!parsed.success || new Set(parsed.data.ids).size !== parsed.data.ids.length) return res.status(400).json({ error: '疫苗顺序格式不正确' });
  try { const items = reorderVaccineCatalog(parsed.data.ids); changeHub.broadcast('all'); return res.json(items); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : '排序失败' }); }
});

app.get('/api/vaccine-records/deleted', requireAdmin, (_req, res) => res.json(listVaccineRecords(true).filter(record => record.deletedAt)));

app.post('/api/vaccine-records', (req, res) => {
  const parsed = vaccineRecordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '疫苗记录格式不正确' });
  const profile = getProfile();
  if (parsed.data.plannedOn < profile.birthDate || (parsed.data.administeredOn && parsed.data.administeredOn < profile.birthDate)) return res.status(400).json({ error: '接种日期不能早于出生日期' });
  if (parsed.data.appointmentOn && parsed.data.appointmentOn < profile.birthDate) return res.status(400).json({ error: '预约日期不能早于出生日期' });
  if (parsed.data.administeredOn && parsed.data.administeredOn > shanghaiDateString()) return res.status(400).json({ error: '接种日期不能晚于今天' });
  try { const record = saveVaccineRecord(normalizeVaccineRecord(parsed.data, getSessionUser(req)!.id)); changeHub.broadcast('all'); return res.status(201).json(record); }
  catch (error) { if (error instanceof DuplicateVaccineRecordError) return res.status(409).json({ error: error.message, code: 'DUPLICATE_VACCINE_RECORD', existing: error.existing }); throw error; }
});

app.put('/api/vaccine-records/:id', (req, res) => {
  const parsed = vaccineRecordSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '疫苗记录格式不正确' });
  try { const record = saveVaccineRecord(normalizeVaccineRecord(parsed.data, getSessionUser(req)!.id)); changeHub.broadcast('all'); return res.json(record); }
  catch (error) { if (error instanceof DuplicateVaccineRecordError) return res.status(409).json({ error: error.message, code: 'DUPLICATE_VACCINE_RECORD', existing: error.existing }); throw error; }
});

app.delete('/api/vaccine-records/:id', requireAdmin, (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '疫苗记录编号不正确' });
  const record = removeVaccineRecord(parsed.data, getSessionUser(req)!.id); changeHub.broadcast('all');
  return res.json({ deleted: Boolean(record), record });
});

app.post('/api/vaccine-records/:id/restore', requireAdmin, (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '疫苗记录编号不正确' });
  try { const record = restoreVaccineRecord(parsed.data, getSessionUser(req)!.id); changeHub.broadcast('all'); return res.json(record); }
  catch (error) { if (error instanceof DuplicateVaccineRecordError) return res.status(409).json({ error: '当前已有相同疫苗和剂次的记录' }); throw error; }
});

app.get('/api/records', (req, res) => {
  const parsed = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: '日期范围格式不正确' });
  return res.json(listRecords(parsed.data.from, parsed.data.to));
});

app.get('/api/care-items', (req, res) => {
  const role = getSessionUser(req)!.role;
  return res.json(listCareItems(role === 'superadmin' || role === 'admin'));
});

app.post('/api/care-items', requireAdmin, (req, res) => {
  const parsed = careItemInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '照护项目格式不正确' });
  const item = saveCareItem({ id: randomUUID(), ...parsed.data });
  changeHub.broadcast('all');
  return res.status(201).json(item);
});

app.put('/api/care-items/order', requireAdmin, (req, res) => {
  const parsed = z.object({ ids: z.array(z.string().min(1).max(50)).min(1).max(100).refine(ids => new Set(ids).size === ids.length, '项目顺序不能重复') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '项目顺序格式不正确' });
  const items = reorderCareItems(parsed.data.ids);
  changeHub.broadcast('all');
  return res.json(items);
});

app.put('/api/care-items/:id', requireAdmin, (req, res) => {
  const parsed = careItemInputSchema.safeParse(req.body);
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!parsed.success || !id) return res.status(400).json({ error: parsed.success ? '照护项目格式不正确' : parsed.error.issues[0]?.message || '照护项目格式不正确' });
  const item = saveCareItem({ id, ...parsed.data });
  changeHub.broadcast('all');
  return res.json(item);
});

app.patch('/api/care-items/:id/active', requireAdmin, (req, res) => {
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!parsed.success || !id) return res.status(400).json({ error: '照护项目状态不正确' });
  const item = setCareItemActive(id, parsed.data.active);
  changeHub.broadcast('all');
  return res.json(item);
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

app.get('/api/records/deleted', requireAdmin, (_req, res) => res.json(listDeletedRecords()));

app.delete('/api/records/:id', requireAdmin, (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '记录编号不正确' });
  const record = removeRecord(parsed.data, getSessionUser(req)!.id);
  if (record) changeHub.broadcast('records');
  return res.json({ deleted: Boolean(record), record });
});

app.post('/api/records/:id/restore', requireAdmin, (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '记录编号不正确' });
  const record = restoreRecord(parsed.data, getSessionUser(req)!.id);
  changeHub.broadcast('records');
  return res.json(record);
});

app.delete('/api/records/:id/permanent', requireAdmin, (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '记录编号不正确' });
  const deleted = purgeRecord(parsed.data);
  if (!deleted) return res.status(404).json({ error: '已删除记录不存在' });
  changeHub.broadcast('records');
  return res.json({ deleted: true });
});

app.get('/api/records/:id/audit', requireAdmin, (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '记录编号不正确' });
  return res.json(listAudit(parsed.data));
});

app.get('/api/export', requireSuperAdmin, (_req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="babycare-backup-${shanghaiDateString()}.json"`);
  res.json(exportPayload());
});

app.get('/api/backups/status', requireSuperAdmin, (_req, res) => res.json(serverBackupStatus(backupDirectory)));
app.get('/api/backups', requireSuperAdmin, (_req, res) => res.json(listServerBackups(backupDirectory)));

app.post('/api/backups', requireSuperAdmin, (_req, res) => {
  const result = writeServerBackup(exportPayload(), { directory: backupDirectory });
  res.status(201).json(result);
});

app.post('/api/backups/:name/restore', requireSuperAdmin, (req, res) => {
  const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
  const parsed = backupPayloadSchema.safeParse(readServerBackup(name, backupDirectory));
  if (!parsed.success || !parsed.data.profile) return res.status(400).json({ error: '服务器备份内容不完整，无法恢复' });
  writeServerBackup(exportPayload(), { directory: backupDirectory });
  const records = parsed.data.records.map(item => normalizeRecord(item, 'father', true));
  const audits = parsed.data.audits?.map(item => ({ ...item, id: item.id || 0, snapshot: item.snapshot as CareRecord | null })) as AuditEntry[] | undefined;
  const growthRecords = parsed.data.growthRecords?.map(item => normalizeGrowthRecord(item, 'father', true));
  const vaccineRecords = parsed.data.vaccineRecords?.map(item => normalizeVaccineRecord(item, 'father', true));
  const result = replaceBackup({ profile: parsed.data.profile, records, audits, careItems: parsed.data.careItems as CareItem[] | undefined, familyMembers: parsed.data.familyMembers as FamilyMemberPermission[] | undefined, growthRecords, vaccineRecords, vaccineCatalog: parsed.data.vaccineCatalog as VaccineCatalogItem[] | undefined });
  changeHub.broadcast('all');
  res.json({ ...result, restoredFrom: name, status: serverBackupStatus(backupDirectory) });
});

app.post('/api/import', requireSuperAdmin, (req, res) => {
  const parsed = backupPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '导入文件格式不正确' });
  writeServerBackup(exportPayload(), { directory: backupDirectory });
  const records = parsed.data.records.map(item => normalizeRecord(item, 'father', true));
  const audits = parsed.data.audits?.map(item => ({ ...item, id: item.id || 0, snapshot: item.snapshot as CareRecord | null })) as AuditEntry[] | undefined;
  const growthRecords = parsed.data.growthRecords?.map(item => normalizeGrowthRecord(item, 'father', true));
  const vaccineRecords = parsed.data.vaccineRecords?.map(item => normalizeVaccineRecord(item, 'father', true));
  const result = importBackup({ profile: parsed.data.profile, records, audits, careItems: parsed.data.careItems as CareItem[] | undefined, familyMembers: parsed.data.familyMembers as FamilyMemberPermission[] | undefined, growthRecords, vaccineRecords, vaccineCatalog: parsed.data.vaccineCatalog as VaccineCatalogItem[] | undefined });
  changeHub.broadcast('all');
  res.json(result);
});

app.get('/api/push/status', (_req, res) => res.json(getPushStatus()));

app.post('/api/push/settings', requireSuperAdmin, express.json(), async (req, res) => {
  const body = req.body || {};
  const { enabled, pushplusToken, pushplusTopic, morningDigestEnabled, morningDigestTime, feedingGapEnabled, feedingGapLevel1Minutes, feedingGapLevel2Minutes, careItemEnabled } = body;
  if (enabled !== undefined && typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled 必须为布尔值' });
  if (pushplusToken !== undefined && typeof pushplusToken !== 'string') return res.status(400).json({ error: 'pushplusToken 必须为字符串' });
  if (pushplusTopic !== undefined && typeof pushplusTopic !== 'string') return res.status(400).json({ error: 'pushplusTopic 必须为字符串' });
  if (morningDigestEnabled !== undefined && typeof morningDigestEnabled !== 'boolean') return res.status(400).json({ error: 'morningDigestEnabled 必须为布尔值' });
  if (morningDigestTime !== undefined) {
    if (typeof morningDigestTime !== 'string' || !/^\d{2}:\d{2}$/.test(morningDigestTime.trim())) return res.status(400).json({ error: 'morningDigestTime 必须为 HH:MM 格式（如 08:00）' });
  }
  if (feedingGapEnabled !== undefined && typeof feedingGapEnabled !== 'boolean') return res.status(400).json({ error: 'feedingGapEnabled 必须为布尔值' });
  if (feedingGapLevel1Minutes !== undefined) {
    if (!Number.isSafeInteger(feedingGapLevel1Minutes) || feedingGapLevel1Minutes < 30) return res.status(400).json({ error: 'feedingGapLevel1Minutes 必须为大于等于 30 分钟的整数' });
  }
  if (feedingGapLevel2Minutes !== undefined) {
    if (!Number.isSafeInteger(feedingGapLevel2Minutes) || feedingGapLevel2Minutes < 30) return res.status(400).json({ error: 'feedingGapLevel2Minutes 必须为大于等于 30 分钟的整数' });
  }
  if (careItemEnabled !== undefined && typeof careItemEnabled !== 'boolean') return res.status(400).json({ error: 'careItemEnabled 必须为布尔值' });
  const l1 = feedingGapLevel1Minutes ?? null;
  const l2 = feedingGapLevel2Minutes ?? null;
  if (l1 !== null && l2 !== null && l2 <= l1) {
    return res.status(400).json({ error: '重点提醒分钟数必须大于轻度提醒' });
  }
  try {
    const result = await updatePushSettings({
      ...(enabled !== undefined ? { enabled } : {}),
      ...(pushplusToken !== undefined ? { pushplusToken } : {}),
      ...(pushplusTopic !== undefined ? { pushplusTopic } : {}),
      ...(morningDigestEnabled !== undefined ? { morningDigestEnabled } : {}),
      ...(morningDigestTime !== undefined ? { morningDigestTime } : {}),
      ...(feedingGapEnabled !== undefined ? { feedingGapEnabled } : {}),
      ...(feedingGapLevel1Minutes !== undefined ? { feedingGapLevel1Minutes } : {}),
      ...(feedingGapLevel2Minutes !== undefined ? { feedingGapLevel2Minutes } : {}),
      ...(careItemEnabled !== undefined ? { careItemEnabled } : {})
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : '保存失败' });
  }
});

app.post('/api/push/test/morning-digest', requireSuperAdmin, async (_req, res) => {
  const result = await testMorningDigestPush();
  if (!result.ok) return res.status(502).json({ error: result.error || '早报测试推送失败' });
  return res.json({ ok: true, message: '早报测试消息已发送，请在微信中查看。' });
});

app.post('/api/push/test/feeding-gap', requireSuperAdmin, express.json(), async (req, res) => {
  const level = (req.body?.level === 'level2') ? 'level2' : 'level1';
  const result = await testFeedingGapPush(level);
  if (!result.ok) return res.status(502).json({ error: result.error || '喂奶间隔测试推送失败' });
  const label = level === 'level2' ? '重点' : '轻度';
  return res.json({ ok: true, message: `喂奶间隔（${label}）测试消息已发送，请在微信中查看。` });
});

app.post('/api/push/test/care-item', requireSuperAdmin, async (_req, res) => {
  const result = await testCareItemPush();
  if (!result.ok) return res.status(502).json({ error: result.error || '用药与照护提醒测试推送失败' });
  return res.json({ ok: true, message: '用药与照护测试消息已发送，请在微信中查看。' });
});

app.post('/api/push/enable', requireSuperAdmin, async (_req, res) => {
  const result = await updatePushSettings({ enabled: true });
  return res.json(result);
});

app.post('/api/push/disable', requireSuperAdmin, async (_req, res) => {
  const result = await updatePushSettings({ enabled: false });
  return res.json(result);
});

if (production) {
  const staticDir = resolve('dist');
  if (!existsSync(staticDir)) throw new Error('缺少 dist 目录，请先运行 npm run build');
  app.use(express.static(staticDir, { maxAge: '1h' }));
  app.get('/{*splat}', (_req, res) => res.sendFile(resolve(staticDir, 'index.html')));
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof DuplicateGrowthDayError) return res.status(409).json({ error: error.message, code: 'DUPLICATE_GROWTH_DAY', existing: error.existing });
  if (error instanceof DuplicateSupplementError) return res.status(409).json({ error: error.message, code: 'DUPLICATE_SUPPLEMENT', existing: error.existing });
  if (error instanceof CareItemConflictError) return res.status(409).json({ error: error.message, code: 'CARE_ITEM_CONFLICT' });
  if (error instanceof CareItemInactiveError) return res.status(409).json({ error: error.message, code: 'CARE_ITEM_INACTIVE' });
  if (error instanceof CareItemOrderError) return res.status(409).json({ error: error.message, code: 'CARE_ITEM_ORDER_CHANGED' });
  if (error instanceof FamilyPermissionError) return res.status(400).json({ error: error.message, code: 'FAMILY_PERMISSION_ERROR' });
  if (error instanceof RecordNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof InvalidBackupNameError || error instanceof SyntaxError) return res.status(400).json({ error: '服务器备份文件不正确' });
  if (error instanceof BackupFileNotFoundError) return res.status(404).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: '服务器暂时无法处理，请稍后重试' });
});

startBackupScheduler(exportPayload, backupDirectory);
startDailyReportScheduler();
startPushScheduler();
const listenHost = production ? '0.0.0.0' : '127.0.0.1';
app.listen(port, listenHost, () => console.log(`Baby care server listening on http://${listenHost}:${port}`));
