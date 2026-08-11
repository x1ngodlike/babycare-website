import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { testModelConnection } from './ai.js';
import { authenticate, clearSession, createSession, getSessionUser, requireAdmin, requireAuth, requireSuperAdmin } from './auth.js';
import type { FamilyId } from './auth.js';
import { BackupFileNotFoundError, defaultBackupDirectory, InvalidBackupNameError, listServerBackups, readServerBackup, serverBackupStatus, startBackupScheduler, writeServerBackup } from './backup.js';
import { allAudit, allRecords, CareItemConflictError, CareItemInactiveError, CareItemOrderError, DailyReport, DuplicateGrowthDayError, DuplicateSupplementError, DuplicateVaccineRecordError, FamilyPermissionError, getAiSettings, getDailyReport, getProfile, importBackup, listAudit, listCareItems, listDailyReports, listDeletedRecords, listFamilyMembers, listGrowthRecords, listRecords, listVaccineCatalog, listVaccineRecords, purgeGrowthRecord, purgeRecord, RecordNotFoundError, removeGrowthRecord, removeRecord, removeVaccineCatalogItem, removeVaccineRecord, reorderCareItems, reorderVaccineCatalog, replaceBackup, restoreGrowthRecord, restoreRecord, restoreVaccineRecord, saveAiSettings, saveCareItem, saveGrowthRecord, saveProfile, saveRecord, saveVaccineCatalogItem, saveVaccineRecord, setCareItemActive, setFamilyRole, setVaccineCatalogActive, VaccineCatalogConflictError } from './db.js';
import { createChangeHub } from './events.js';
import { generateDailyReportForDate, startDailyReportScheduler, yesterdayInShanghai } from './daily-report.js';
import type { AuditEntry, CareItem, CareRecord, FamilyMemberPermission, GrowthRecord, VaccineCatalogItem, VaccineRecord } from './types.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const changeHub = createChangeHub();
const backupDirectory = defaultBackupDirectory();

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
  profile: z.object({ name: z.string().trim().min(1).max(30), birthDate: z.string().date(), sex: z.enum(['male', 'female', 'unspecified']).optional() }).optional(),
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

app.put('/api/profile', requireSuperAdmin, (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(30), birthDate: z.string().date(), sex: z.enum(['male', 'female', 'unspecified']).default('unspecified') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '宝宝资料格式不正确' });
  if (new Date(`${parsed.data.birthDate}T00:00:00+08:00`) > new Date()) return res.status(400).json({ error: '出生日期不能晚于今天' });
  const profile = saveProfile(parsed.data.name, parsed.data.birthDate, parsed.data.sex);
  changeHub.broadcast('profile');
  return res.json(profile);
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
  if (parsed.data.administeredOn && parsed.data.administeredOn > new Date().toISOString().slice(0, 10)) return res.status(400).json({ error: '接种日期不能晚于今天' });
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
  res.setHeader('Content-Disposition', `attachment; filename="babycare-backup-${new Date().toISOString().slice(0, 10)}.json"`);
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
const listenHost = production ? '0.0.0.0' : '127.0.0.1';
app.listen(port, listenHost, () => console.log(`Baby care server listening on http://${listenHost}:${port}`));
