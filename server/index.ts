import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, accessSync, constants as fsConstants, statSync, Stats } from 'node:fs';
import { tmpdir as osTmpdir } from 'node:os';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { z } from 'zod';
import multer from 'multer';
import sharp from 'sharp';
import { testModelConnection } from './ai.js';
import { generateChatReply } from './chat.js';
import { authenticate, clearSession, createSession, getSessionUser, requireAdmin, requireAuth, requireSuperAdmin } from './auth.js';
import { BackupFileNotFoundError, deleteServerBackup, defaultBackupDirectory, InvalidBackupNameError, listServerBackups, readServerBackup, serverBackupStatus, startBackupScheduler, writeServerBackup, type BackupType } from './backup.js';
import { allAudit, allChatMessages, allRecords, addMemory, clearMemories, createSession as createChatSession, deleteMemory, deleteSession, CareItemConflictError, CareItemInactiveError, CareItemOrderError, computeFeedingRecordsHash, DuplicateGrowthDayError, DuplicateSupplementError, DuplicateVaccineRecordError, FamilyPermissionError, getAiFeedingInsights, getAiSettings, getCareAdherence, getSession as getChatSession, getDailyReport, getProfile, importBackup, listAudit, listCareItems, listDailyReports, listDeletedRecords, listFamilyMembers, listGrowthRecords, listMemories, listMessages, listRecords, listSessions, listVaccineCatalog, listVaccineRecords, purgeGrowthRecord, purgeRecord, RecordNotFoundError, removeGrowthRecord, removeRecord, removeVaccineCatalogItem, removeVaccineRecord, reorderCareItems, reorderVaccineCatalog, replaceBackup, restoreGrowthRecord, restoreRecord, saveAiFeedingInsights, saveAiSettings, saveCareItem, saveGrowthRecord, saveProfile, saveRecord, saveVaccineCatalogItem, saveVaccineRecord, setCareItemActive, setFamilyRole, setVaccineCatalogActive, VaccineCatalogConflictError } from './db.js';
import { createChangeHub } from './events.js';
import { generateDailyReportForDate, startDailyReportScheduler, yesterdayInShanghai } from './daily-report.js';
import { generateFeedingInsights, generateGrowthEvaluation } from './ai.js';
import { assessHeight, assessWeight, milkReferenceRange, GROWTH_STANDARD_MAX_MONTHS } from './growth-standards.js';
import { saveGrowthEvaluation } from './db.js';
import { addDaysToDateString, shanghaiDayUtcRange } from './shanghai-date.js';
import { startPushScheduler } from './push.js';
import { registerPushRoutes } from './routes/push.js';
import { shanghaiDateString } from './shanghai-date.js';
import { predictFeeding, type FeedingPrediction } from '../shared/feeding-prediction.js';
import type { AuditEntry, CareItem, CareRecord, FamilyId, FamilyMemberPermission, GrowthRecord, VaccineCatalogItem, VaccineRecord } from './types.js';

const app = express();
app.set('trust proxy', 1);
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
// 定期清理已过期的登录失败记录，防止长期运行时 Map 无限增长
setInterval(() => {
  const now = Date.now();
  for (const [key, state] of loginAttempts) {
    if (state.resetAt <= now) loginAttempts.delete(key);
  }
}, 60 * 60 * 1000).unref();
const changeHub = createChangeHub();
const backupDirectory = defaultBackupDirectory();
// 数据根：优先显式 DATA_DIR，否则用 DATABASE_PATH 目录（db / backup / avatars 三兄弟共用同一个持久化根）
const databasePath = process.env.DATABASE_PATH || './data/baby-care.db';
const inferredDataDir = isAbsolute(databasePath) ? dirname(databasePath) : resolve(dirname(databasePath));
const configuredDataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : inferredDataDir;
function makeAvatarDir(dataRoot: string): { dir: string; isTemporary: boolean } {
  const dir = join(dataRoot, 'uploads', 'avatars');
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, fsConstants.W_OK);
    return { dir, isTemporary: false };
  } catch {
    const fallback = join(osTmpdir(), 'babycare-avatars');
    try { mkdirSync(fallback, { recursive: true }); accessSync(fallback, fsConstants.W_OK); return { dir: fallback, isTemporary: true }; }
    catch { return { dir, isTemporary: false }; }
  }
}
const avatarRoot = makeAvatarDir(configuredDataDir);
const dataDir = avatarRoot.isTemporary ? dirname(dirname(avatarRoot.dir)) : configuredDataDir;
if (avatarRoot.isTemporary) {
  console.warn(`[avatars] ⚠️  DATA_DIR 不可写（${configuredDataDir}），已切换到临时目录 ${avatarRoot.dir}。重启后头像会丢失！请把 volume 挂对：Docker -v <host_data>:/data，或在宿主机 chown -R 1000:1000 <host_data>。`);
}
const avatarHintDir = avatarRoot.dir;
const avatarTemporaryWarn = avatarRoot.isTemporary ? '头像临时模式（重启丢失）' : '';
function diagnosePathTree(target: string): { path: string; exists: boolean; isDirectory: boolean; writable: boolean; note?: string }[] {
  // 从根到目标逐级诊断：/app → /app/data → /app/data/uploads → /app/data/uploads/avatars
  const parts: string[] = [];
  let p = target;
  while (true) {
    parts.push(p);
    const parent = dirname(p);
    if (parent === p) break;
    p = parent;
  }
  parts.reverse();
  return parts.map(path => {
    let st: Stats | undefined;
    try { st = statSync(path); } catch { /* not exists */ }
    const exists = st !== undefined;
    const isDirectory = Boolean(st?.isDirectory());
    let writable = false;
    try { if (exists) accessSync(path, fsConstants.W_OK); writable = true; } catch { /* not writable */ }
    let note: string | undefined;
    if (exists && !isDirectory) note = '⚠️ 同名文件占位（不是目录）';
    return { path, exists, isDirectory, writable, note };
  });
}
function avatarFixHint(dir: string): string {
  const raw = process.env.DATA_DIR || '';
  if (avatarRoot.isTemporary) {
    return `当前为临时模式（${avatarTemporaryWarn}），请给容器挂持久化卷：Docker -v <宿主机数据目录>:/data 且宿主机目录对 UID 1000 可写`;
  }
  return `请确保 DATA_DIR volume 挂对 + UID 1000 可写：mkdir -p ${dir} && chown -R 1000:1000 ${join(dataDir, 'uploads')} ${dir}${raw ? `（环境变量 DATA_DIR=${raw}）` : ''}`;
}
function resolveAvatarDir(): string {
  const dir = avatarHintDir;
  let diagnose: ReturnType<typeof diagnosePathTree> | null = null;
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }); }
    catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const tree = diagnosePathTree(dir);
      diagnose = tree;
      const blocked = tree.reverse().find(item => !item.exists || !item.isDirectory || !item.writable);
      console.error(`[avatars] 上传目录创建失败：${dir}（DATA_DIR=${process.env.DATA_DIR || inferredDataDir}）。阻断点：${blocked?.path ?? dir}${blocked?.note ? ' ' + blocked.note : ''}（${msg}）。${avatarFixHint(dir)}`);
      return dir;
    }
  }
  try {
    // 建完立刻测写权限，避免上传到半路才炸
    accessSync(dir, fsConstants.W_OK);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!diagnose) diagnose = diagnosePathTree(dir);
    const tree = diagnose;
    const blocked = tree.slice().reverse().find(item => !item.exists || !item.isDirectory || !item.writable);
    console.error(`[avatars] 上传目录不可写：${dir}。阻断点：${blocked?.path ?? dir}${blocked?.note ? ' ' + blocked.note : ''}（${msg}）。${avatarFixHint(dir)}`);
  }
  return dir;
}
function avatarDiagnoseCached(): ReturnType<typeof diagnosePathTree> { return diagnosePathTree(avatarDir); }
const avatarDir = resolveAvatarDir();
// 启动期自检日志：帮助快速定位目录/权限问题
{
  const tree = diagnosePathTree(avatarDir);
  const rows = tree.map(item => {
    const flag = item.note ? item.note : (!item.exists ? '❌不存在' : !item.isDirectory ? '❌不是目录' : !item.writable ? '❌不可写' : '✅正常');
    return `${flag} ${item.path}`;
  }).join('； ');
  const status = avatarRoot.isTemporary ? '[临时模式]' : '[正常]';
  console.log(`[avatars] 头像目录初始化 ${status}：${avatarDir}。路径诊断：${rows}`);
  if (avatarRoot.isTemporary) {
    console.warn(`[avatars] ⚠️ DATA_DIR 不可写（${configuredDataDir}），已切换到临时目录 ${avatarDir}。重启后头像会丢失！请把 volume 挂对：Docker -v <host_data>:/data，或在宿主机 chown -R 1000:1000 <host_data>。`);
  }
}

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
app.use(express.json({ limit: '10mb' }));
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
  id: z.string().optional(),
  type: z.enum(['feeding', 'supplement', 'bowel', 'note']),
  occurredAt: z.string().datetime({ offset: true }),
  breastMilkMl: z.number().int().min(0).max(500).nullable().optional(),
  formulaMl: z.number().int().min(0).max(500).nullable().optional(),
  supplement: z.string().trim().min(1).max(30).nullable().optional(),
  bowelSize: z.enum(['大', '中', '小']).nullable().optional(),
  subject: z.string().trim().max(100).nullable().optional(),
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
  if (value.type === 'note' && !value.subject && !value.note) ctx.addIssue({ code: 'custom', message: '请填写事项内容' });
});

const auditEntrySchema = z.object({
  id: z.number().int().optional(), recordId: z.string(),
  action: z.enum(['create', 'update', 'delete', 'restore', 'import']),
  actor: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']),
  occurredAt: z.string().datetime({ offset: true }), snapshot: z.record(z.string(), z.unknown()).nullable()
});

const careItemSchema = z.object({
  id: z.string().min(1).max(50), name: z.string().trim().min(1, '请填写项目名称').max(12, '项目名称不能超过 12 个字'),
  category: z.enum(['medication', 'care']).optional(), icon: z.enum(['medicine', 'massage', 'bath', 'care']), sortOrder: z.number().int().min(0).max(999), active: z.boolean(),
  scheduleType: z.enum(['daily', 'interval', 'weekly', 'pattern', 'as_needed']).default('as_needed'), intervalDays: z.number().int().min(1).max(365).default(1),
  scheduleStartDate: z.string().date().nullable().default(null), reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  scheduleEndDate: z.string().date().nullable().default(null),
  reminderTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(10).nullable().optional(),
  weekDays: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  patternDays: z.array(z.boolean()).min(2).max(14).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true })
});

const careItemInputSchema = z.object({
  name: z.string().trim().min(1).max(12), category: z.enum(['medication', 'care']), icon: z.enum(['medicine', 'massage', 'bath', 'care']),
  sortOrder: z.number().int().min(0).max(999), scheduleType: z.enum(['daily', 'interval', 'weekly', 'pattern', 'as_needed']),
  intervalDays: z.number().int().min(1).max(365), scheduleStartDate: z.string().date().nullable(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  reminderTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(10).nullable().optional(),
  scheduleEndDate: z.string().date().nullable(),
  weekDays: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  patternDays: z.array(z.boolean()).min(2).max(14).nullable().optional()
}).superRefine((value, ctx) => {
  if (value.scheduleType !== 'as_needed' && !value.scheduleStartDate) ctx.addIssue({ code: 'custom', message: '请设置计划开始日期' });
  if (value.scheduleType === 'weekly' && (!value.weekDays || value.weekDays.length === 0)) ctx.addIssue({ code: 'custom', message: '请选择至少一个星期' });
  if (value.scheduleType === 'pattern' && (!value.patternDays || value.patternDays.length === 0)) ctx.addIssue({ code: 'custom', message: '请设置循环模式' });
  if (value.scheduleStartDate && value.scheduleEndDate && value.scheduleEndDate < value.scheduleStartDate) ctx.addIssue({ code: 'custom', message: '结束日期不能早于开始日期' });
});

const familyMemberSchema = z.object({
  id: z.enum(['father', 'mother', 'grandfather', 'grandmother']),
  name: z.string().min(1).max(10),
  role: z.enum(['superadmin', 'admin', 'member'])
});

const growthRecordSchema = z.object({
  id: z.string().optional(),
  measuredOn: z.string().date(),
  heightCm: z.number().min(20).max(150),
  weightKg: z.number().min(0.5).max(50),
  createdAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  createdBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  updatedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  deletedAt: z.string().datetime({ offset: true }).nullable().optional(),
  deletedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).nullable().optional(),
  evaluation: z.string().nullable().optional(),
  evaluatedAt: z.string().datetime({ offset: true }).nullable().optional()
});

const vaccineRecordSchema = z.object({
  id: z.string().optional(),
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
  profile: z.object({ name: z.string().trim().min(1).max(30), birthDate: z.string().date(), birthTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), sex: z.enum(['male', 'female', 'unspecified']).optional(), nickname: z.string().trim().max(20).optional(), caregiverTitle: z.string().trim().max(10).optional(), avatar: z.string().max(200).nullable().optional() }).passthrough().optional(),
  records: z.array(recordSchema).max(10000),
  audits: z.array(auditEntrySchema).max(50000).optional(),
  careItems: z.array(careItemSchema).max(100).optional(),
  familyMembers: z.array(familyMemberSchema).max(4).optional(),
  growthRecords: z.array(growthRecordSchema).max(1000).optional(),
  vaccineRecords: z.array(vaccineRecordSchema).max(1000).optional(),
  vaccineCatalog: z.array(z.object({ id: z.string().min(1).max(50), name: z.string().min(1).max(50), category: z.enum(['program', 'self_paid']), shortName: z.string().max(30).nullable(), description: z.string().max(300), doseCount: z.number().int().min(1).max(20).nullable(), intervalSummary: z.string().max(200), active: z.boolean(), sortOrder: z.number().int().min(0).max(9999), isSystem: z.boolean().optional().default(false) })).max(100).optional(),
  dailyReports: z.array(z.object({
    reportDate: z.string(), summary: z.string(), suggestions: z.array(z.string()), model: z.string(), generatedAt: z.string()
  })).max(3650).optional(),
  aiMemories: z.array(z.object({
    id: z.string(), content: z.string(), category: z.enum(['preferences', 'health', 'notes']), createdAt: z.string(), updatedAt: z.string()
  })).max(1000).optional(),
  chatSessions: z.array(z.object({
    id: z.string(), userId: z.enum(['father', 'mother', 'grandfather', 'grandmother']), title: z.string().nullable(), createdAt: z.string(), updatedAt: z.string()
  })).max(1000).optional(),
  chatMessages: z.array(z.object({
    id: z.string(), sessionId: z.string(), role: z.enum(['user', 'assistant']), content: z.string(), createdAt: z.string()
  })).max(50000).optional()
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
    subject: input.type === 'note' ? input.subject || input.note || null : null,
    note: input.type === 'note' && !input.subject ? null : input.note ?? null,
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
    deletedBy: preserveAudit ? input.deletedBy || null : null,
    evaluation: preserveAudit ? input.evaluation || null : null,
    evaluatedAt: preserveAudit ? input.evaluatedAt || null : null
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

function normalizeDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  // 将 "2026-08-10 11:15:47" 格式转换为 ISO 格式
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.replace(' ', 'T') + 'Z';
  }
  return value;
}

function exportPayload() {
  const records = allRecords(true).map(record => {
    if (record.type === 'feeding') {
      if (record.breastMilkMl == null && record.formulaMl == null) record.breastMilkMl = 0;
    } else if (record.type === 'supplement') {
      if (!record.supplement) record.supplement = '未记录';
    } else if (record.type === 'bowel') {
      if (!record.bowelSize) record.bowelSize = '中';
    } else if (record.type === 'note') {
      if (!record.subject && !record.note) record.note = '无备注';
    }
    return record;
  });
  const careItems = listCareItems(true).map(item => ({
    ...item,
    createdAt: normalizeDateTime(item.createdAt) || new Date().toISOString(),
    updatedAt: normalizeDateTime(item.updatedAt) || new Date().toISOString()
  }));
  const growthRecords = listGrowthRecords(true).map(record => ({
    ...record,
    createdAt: normalizeDateTime(record.createdAt) || new Date().toISOString(),
    updatedAt: normalizeDateTime(record.updatedAt) || new Date().toISOString(),
    evaluatedAt: normalizeDateTime(record.evaluatedAt)
  }));
  const vaccineRecords = listVaccineRecords(true).map(record => ({
    ...record,
    createdAt: normalizeDateTime(record.createdAt) || new Date().toISOString(),
    updatedAt: normalizeDateTime(record.updatedAt) || new Date().toISOString(),
    administeredOn: record.administeredOn || null
  }));
  const profile = getProfile();
  return { version: 10, exportedAt: new Date().toISOString(), profile: profile || { name: '宝宝', birthDate: new Date().toISOString().slice(0, 10), birthTime: null, sex: 'unspecified' as const, nickname: '', caregiverTitle: '', avatar: null }, records, audits: allAudit(), careItems, familyMembers: listFamilyMembers(), growthRecords, vaccineRecords, vaccineCatalog: listVaccineCatalog(true), dailyReports: listDailyReports(), aiMemories: listMemories(), chatSessions: listSessions(), chatMessages: allChatMessages() };
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

// ----- AI 对话 -----
const chatMessageSchema = z.object({
  sessionId: z.string().uuid().optional(),
  userId: z.enum(['father', 'mother', 'grandfather', 'grandmother']).optional(),
  message: z.string().trim().min(1).max(2000)
});
const memoryInputSchema = z.object({
  content: z.string().trim().min(1).max(300),
  category: z.enum(['preferences', 'health', 'notes'])
});

app.post('/api/ai/chat', async (req, res) => {
  const user = getSessionUser(req)!;
  const parsed = chatMessageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '对话内容格式不正确' });
  const settings = getAiSettings();
  if (!settings.apiKey) return res.status(400).json({ error: '服务器尚未配置 AI 模型，请先在设置中配置' });
  const targetUserId = (user.role === 'superadmin' && parsed.data.userId && parsed.data.userId !== user.id) ? parsed.data.userId : user.id;
  try {
    const result = await generateChatReply({ baseUrl: settings.baseUrl, model: settings.model, apiKey: settings.apiKey }, { userId: targetUserId, sessionId: parsed.data.sessionId, message: parsed.data.message });
    return res.json({ reply: result.reply, sessionId: result.sessionId, title: result.title, extractedMemories: result.extractedMemories, userId: targetUserId });
  } catch (error) {
    return res.status(502).json({ error: modelError(error) });
  }
});

app.get('/api/ai/chat/sessions', (req, res) => {
  const user = getSessionUser(req)!;
  const requested = typeof req.query.userId === 'string' ? (req.query.userId as FamilyId) : undefined;
  if (user.role !== 'superadmin' && requested && requested !== user.id) return res.status(403).json({ error: '只能查看自己的对话' });
  const userId = (user.role === 'superadmin' && requested) ? requested : user.id;
  return res.json({ sessions: listSessions(userId) });
});

app.post('/api/ai/chat/sessions', (req, res) => {
  const user = getSessionUser(req)!;
  const parsed = z.object({ userId: z.enum(['father', 'mother', 'grandfather', 'grandmother']).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '参数不正确' });
  const targetUserId = (user.role === 'superadmin' && parsed.data.userId) ? parsed.data.userId : user.id;
  const session = createChatSession(targetUserId);
  return res.status(201).json(session);
});

app.get('/api/ai/chat/sessions/:id/messages', (req, res) => {
  const user = getSessionUser(req)!;
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '会话编号不正确' });
  const session = getChatSession(parsed.data);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  if (session.userId !== user.id && user.role !== 'superadmin') return res.status(403).json({ error: '只能查看自己的对话' });
  return res.json({ messages: listMessages(parsed.data) });
});

app.delete('/api/ai/chat/sessions/:id', (req, res) => {
  const user = getSessionUser(req)!;
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '会话编号不正确' });
  const session = getChatSession(parsed.data);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  if (session.userId !== user.id && user.role !== 'superadmin') return res.status(403).json({ error: '只能删除自己的对话' });
  deleteSession(parsed.data);
  return res.json({ deleted: true });
});

app.get('/api/ai/memories', (_req, res) => res.json({ memories: listMemories() }));

app.post('/api/ai/memories', (req, res) => {
  const parsed = memoryInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '记忆格式不正确' });
  const memory = addMemory(parsed.data.content, parsed.data.category);
  return res.status(201).json(memory);
});

app.delete('/api/ai/memories/:id', requireSuperAdmin, (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '记忆编号不正确' });
  if (!deleteMemory(parsed.data)) return res.status(404).json({ error: '记忆不存在' });
  return res.json({ deleted: true });
});

app.delete('/api/ai/memories', requireSuperAdmin, (_req, res) => {
  clearMemories();
  return res.json({ cleared: true });
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
  const parsed = z.object({ name: z.string().trim().min(1).max(30), birthDate: z.string().date(), birthTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间格式不正确').optional().nullable(), sex: z.enum(['male', 'female', 'unspecified']).default('unspecified'), nickname: z.string().trim().max(20).optional(), caregiverTitle: z.string().trim().max(10).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '宝宝资料格式不正确' });
  if (new Date(`${parsed.data.birthDate}T00:00:00+08:00`) > new Date()) return res.status(400).json({ error: '出生日期不能晚于今天' });
  const profile = saveProfile({ name: parsed.data.name, birthDate: parsed.data.birthDate, birthTime: parsed.data.birthTime ?? null, sex: parsed.data.sex, nickname: parsed.data.nickname, caregiverTitle: parsed.data.caregiverTitle });
  changeHub.broadcast('profile');
  return res.json(profile);
});

app.post('/api/profile/avatar', requireAdmin, upload.single('avatar'), async (req, res) => {
  const hint = avatarFixHint(avatarDir);
  function withTree(prefix: string): string {
    const tree = avatarDiagnoseCached();
    const rows = tree.map(item => {
      const flag = item.note ? item.note : (!item.exists ? '❌不存在' : !item.isDirectory ? '❌不是目录' : !item.writable ? '❌不可写' : '✅正常');
      return `${flag} ${item.path}`;
    }).join('； ');
    const warn = avatarRoot.isTemporary ? `[⚠️${avatarTemporaryWarn}] ` : '';
    return `${warn}${prefix}。路径诊断：${rows}。${hint}`;
  }
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: '请上传头像图片' });
    if (!file.mimetype.startsWith('image/')) return res.status(400).json({ error: '仅支持图片格式（PNG / JPG / WebP 等）' });
    try {
      mkdirSync(avatarDir, { recursive: true });
      accessSync(avatarDir, fsConstants.W_OK);
    }
    catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('ENOTDIR')) return res.status(500).json({ error: withTree(`上传路径里夹了非目录（${avatarDir} 父级存在同名文件）。请在容器里删除占位文件后执行：mkdir -p ${avatarDir} && chmod 755 ${join(dataDir, 'uploads')} ${avatarDir}`) });
      if (msg.includes('EROFS') || msg.includes('Read-only file system')) return res.status(500).json({ error: withTree(`DATA_DIR（${dataDir}）落在容器只读分层。请把 Docker volume 挂到 ${dataDir}`) });
      if (msg.includes('EACCES') || msg.includes('EPERM') || /permission/i.test(msg)) return res.status(500).json({ error: withTree(`上传目录权限不足：${avatarDir}（DATA_DIR=${process.env.DATA_DIR || '默认 ./data'}）`) });
      if (msg.includes('ENOENT')) return res.status(500).json({ error: withTree(`上传目录不存在或无法写入：${avatarDir}`) });
      return res.status(500).json({ error: withTree(`上传目录无法创建：${avatarDir}（${msg || '请查看服务器日志'}）`) });
    }
    const filename = `avatar_${randomUUID()}.webp`;
    const filepath = join(avatarDir, filename);
    try {
      try { mkdirSync(dirname(filepath), { recursive: true }); } catch { /* 已存在或外层已处理 */ }
      try { accessSync(dirname(filepath), fsConstants.W_OK); }
      catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ error: withTree(`上传目录不可写：${dirname(filepath)}（${msg}）`) });
      }
      await sharp(file.buffer)
        .rotate()
        .resize(512, 512, { fit: 'cover', position: 'entropy' })
        .webp({ quality: 82, effort: 6 })
        .toFile(filepath);
    } catch (inner) {
      const msg = inner instanceof Error ? inner.message : String(inner);
      if (msg.includes('ENOTDIR')) return res.status(500).json({ error: withTree(`上传路径里夹了非目录（${filepath} 父级存在同名文件）。请清理占位文件`) });
      if (msg.includes('EROFS') || msg.includes('Read-only file system')) return res.status(500).json({ error: withTree(`DATA_DIR（${dataDir}）落在只读分层，写失败。请改 volume 挂载到可写层`) });
      if (msg.includes('EACCES') || msg.includes('EPERM') || /permission/i.test(msg)) return res.status(500).json({ error: withTree(`上传目录权限不足：${avatarDir}`) });
      if (msg.includes('ENOENT')) return res.status(500).json({ error: withTree(`上传目录不存在或无法写入：${avatarDir}`) });
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
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('ENOTDIR')) return res.status(500).json({ error: withTree(`上传路径里夹了非目录（父级存在同名占位文件）。请清理占位文件`) });
    if (msg.includes('EROFS') || msg.includes('Read-only file system')) return res.status(500).json({ error: withTree(`DATA_DIR（${dataDir}）落在只读分层。请给 DATA_DIR 挂可写 volume`) });
    if (msg.includes('EACCES') || msg.includes('EPERM') || /permission/i.test(msg)) return res.status(500).json({ error: withTree(`上传目录权限不足：${avatarDir}`) });
    if (msg.includes('ENOENT')) return res.status(500).json({ error: withTree(`上传目录不存在或无法写入：${avatarDir}`) });
    if (/too large|file size/i.test(msg)) return res.status(413).json({ error: '图片超过 8MB，压缩后再上传' });
    if (msg) return res.status(500).json({ error: `头像上传失败：${msg}` });
    res.status(500).json({ error: withTree('头像上传失败，请重试或联系管理员查看日志') });
  }
});

app.delete('/api/profile/avatar', requireAdmin, (_req, res) => {
  function withTree(prefix: string): string {
    const tree = avatarDiagnoseCached();
    const rows = tree.map(item => {
      const flag = item.note ? item.note : (!item.exists ? '❌不存在' : !item.isDirectory ? '❌不是目录' : !item.writable ? '❌不可写' : '✅正常');
      return `${flag} ${item.path}`;
    }).join('； ');
    const warn = avatarRoot.isTemporary ? `[⚠️${avatarTemporaryWarn}] ` : '';
    return `${warn}${prefix}。路径诊断：${rows}。${avatarFixHint(avatarDir)}`;
  }
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
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('ENOTDIR')) return res.status(500).json({ error: withTree('上传路径里夹了非目录（父级存在同名占位文件）。请清理占位文件') });
    if (msg.includes('EROFS') || msg.includes('Read-only file system')) return res.status(500).json({ error: withTree(`DATA_DIR（${dataDir}）落在只读分层`) });
    if (msg.includes('EACCES') || msg.includes('EPERM') || /permission/i.test(msg)) return res.status(500).json({ error: withTree(`上传目录权限不足：${avatarDir}`) });
    if (msg.includes('ENOENT')) return res.status(500).json({ error: withTree(`上传目录不存在或无法写入：${avatarDir}`) });
    if (msg) return res.status(500).json({ error: `头像删除失败：${msg}` });
    res.status(500).json({ error: '头像删除失败，请重试或联系管理员查看日志' });
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
  const previous = listGrowthRecords().find(item => item.id === parsed.data.id);
  const record = saveGrowthRecord(normalizeGrowthRecord(parsed.data, getSessionUser(req)!.id));
  if (previous?.evaluation && (previous.heightCm !== record.heightCm || previous.weightKg !== record.weightKg || previous.measuredOn !== record.measuredOn)) saveGrowthEvaluation(record.id, '');
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

function ageMonthsAt(birthDate: string, onDate: string): number {
  const from = new Date(`${birthDate}T00:00:00Z`).getTime();
  const to = new Date(`${onDate}T00:00:00Z`).getTime();
  return (to - from) / (30.4375 * 86400_000);
}

function parseGrowthEvaluation(raw: string | null, evaluatedAt: string | null): { text: string; evaluatedAt: string | null } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { evaluation?: unknown };
    if (typeof parsed.evaluation === 'string' && parsed.evaluation.trim()) {
      return { text: parsed.evaluation.trim(), evaluatedAt };
    }
  } catch { /* 兼容非 JSON 旧值 */ }
  return { text: raw, evaluatedAt };
}

function recentMilkStats(today: string): { avgDailyMl: number; daysCounted: number } {
  let total = 0; let days = 0;
  for (let offset = 1; offset <= 7; offset += 1) {
    const range = shanghaiDayUtcRange(addDaysToDateString(today, -offset));
    const dayFeedings = listRecords(range.from, range.to).filter(record => record.type === 'feeding');
    if (!dayFeedings.length) continue;
    days += 1;
    total += dayFeedings.reduce((sum, record) => sum + (record.breastMilkMl || 0) + (record.formulaMl || 0), 0);
  }
  return { avgDailyMl: days ? Math.round(total / days) : 0, daysCounted: days };
}

app.get('/api/growth-assessment', (_req, res) => {
  const profile = getProfile();
  const records = listGrowthRecords();
  const latest = records[0];
  if (profile.sex !== 'male' && profile.sex !== 'female') return res.json({ available: false, reason: 'no_sex' });
  if (!latest) return res.json({ available: false, reason: 'no_records' });
  const ageMonths = ageMonthsAt(profile.birthDate, latest.measuredOn);
  const height = assessHeight(profile.sex, ageMonths, latest.heightCm);
  const weight = assessWeight(profile.sex, ageMonths, latest.weightKg);
  if (!height || !weight) return res.json({ available: false, reason: 'out_of_range', maxMonths: GROWTH_STANDARD_MAX_MONTHS });
  const today = shanghaiDateString();
  const milkRange = milkReferenceRange(ageMonths);
  const milk = milkRange ? { ...recentMilkStats(today), referenceMin: milkRange.min, referenceMax: milkRange.max } : null;
  return res.json({
    available: true,
    latestRecordId: latest.id,
    measuredOn: latest.measuredOn,
    ageMonths: Math.round(ageMonths * 10) / 10,
    height,
    weight,
    milk,
    evaluation: parseGrowthEvaluation(latest.evaluation, latest.evaluatedAt)
  });
});

app.post('/api/growth-records/:id/evaluation', requireAdmin, async (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: '成长记录编号不正确' });
  const settings = getAiSettings();
  if (!settings.apiKey) return res.status(503).json({ error: '服务器尚未配置 AI 模型' });
  const records = listGrowthRecords();
  const record = records.find(item => item.id === parsed.data);
  if (!record) return res.status(404).json({ error: '成长记录不存在' });
  const profile = getProfile();
  if (profile.sex !== 'male' && profile.sex !== 'female') return res.status(400).json({ error: '请先在宝宝资料中设置性别' });
  const ageMonths = ageMonthsAt(profile.birthDate, record.measuredOn);
  const height = assessHeight(profile.sex, ageMonths, record.heightCm);
  const weight = assessWeight(profile.sex, ageMonths, record.weightKg);
  if (!height || !weight) return res.status(400).json({ error: `月龄超过 ${GROWTH_STANDARD_MAX_MONTHS} 个月，暂不支持 AI 评价` });
  const previous = records[records.findIndex(item => item.id === record.id) + 1] || null;
  try {
    const result = await generateGrowthEvaluation({
      babyName: profile.name,
      ageText: calculateAgeText(profile.birthDate, record.measuredOn),
      sex: profile.sex,
      height,
      weight,
      previous: previous ? {
        measuredOn: previous.measuredOn,
        heightCm: previous.heightCm,
        weightKg: previous.weightKg,
        daysSince: Math.max(0, Math.round((new Date(`${record.measuredOn}T00:00:00Z`).getTime() - new Date(`${previous.measuredOn}T00:00:00Z`).getTime()) / 86400_000))
      } : null
    }, { baseUrl: settings.baseUrl, model: settings.model, apiKey: settings.apiKey });
    const saved = saveGrowthEvaluation(record.id, JSON.stringify(result));
    if (!saved) return res.status(404).json({ error: '成长记录不存在' });
    return res.json({ evaluation: parseGrowthEvaluation(saved.evaluation, saved.evaluatedAt) });
  } catch (error) {
    console.error('[growth-evaluation] 生成失败', error);
    return res.status(502).json({ error: error instanceof Error ? error.message : 'AI 评价生成失败' });
  }
});

function calculateAgeText(birthDate: string, onDate: string): string {
  const birth = new Date(`${birthDate}T12:00:00`);
  const at = new Date(`${onDate}T12:00:00`);
  let months = (at.getFullYear() - birth.getFullYear()) * 12 + (at.getMonth() - birth.getMonth());
  if (at.getDate() < birth.getDate()) months -= 1;
  const anniversary = new Date(birth.getFullYear(), birth.getMonth() + months, birth.getDate());
  const days = Math.max(0, Math.floor((at.getTime() - anniversary.getTime()) / 86400_000));
  return `${Math.max(0, months)}个月${days ? `${days}天` : ''}`;
}

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

app.get('/api/records', (req, res) => {
  const parsed = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: '日期范围格式不正确' });
  return res.json(listRecords(parsed.data.from, parsed.data.to));
});

app.get('/api/feeding-prediction', async (_req, res) => {
  const today = shanghaiDateString();
  const range = shanghaiDayUtcRange(today);
  const lookbackFrom = new Date(new Date(range.from).getTime() - 14 * 86400000).toISOString();
  const records = listRecords(lookbackFrom, range.to).filter(r => r.type === 'feeding');
  const prediction: FeedingPrediction = predictFeeding(records.map(r => ({
    occurredAt: r.occurredAt,
    breastMilkMl: r.breastMilkMl,
    formulaMl: r.formulaMl
  })));

  const settings = getAiSettings();
  const feedingRecords = records.filter(r => r.type === 'feeding');

  if (!settings.apiKey || !prediction.available || feedingRecords.length < 2) {
    return res.json(prediction);
  }

  const recordsHash = computeFeedingRecordsHash(records);
  const cached = getAiFeedingInsights();
  const now = Date.now();
  const cacheFresh = cached &&
    cached.recordsHash === recordsHash &&
    (now - new Date(cached.updatedAt).getTime()) < 3600_000;

  if (cacheFresh && cached) {
    return res.json({
      ...prediction,
      aiInsights: {
        summary: cached.summary,
        insights: cached.insights,
        alert: cached.alert
      },
      cached: true
    });
  }

  try {
    const profile = getProfile();
    const ageText = calculateAgeText(profile.birthDate, today);
    const insights = await generateFeedingInsights({
      babyName: profile.name || '宝宝',
      ageText,
      sex: profile.sex,
      prediction: {
        available: prediction.available,
        gapMinutes: prediction.gapMinutes,
        volumeMl: prediction.volumeMl,
        confidence: prediction.confidence,
        nextFeedAt: prediction.nextFeedAt,
        upcomingFeeds: prediction.upcomingFeeds.map(f => ({
          predictedAt: f.predictedAt,
          earliest: f.earliest,
          latest: f.latest,
          estimatedMl: f.estimatedMl,
          period: f.period
        })),
        periodGaps: prediction.periodGaps.map(g => ({ period: g.period, count: g.count, medianMinutes: g.medianMinutes })),
        periodVolumes: prediction.periodVolumes.map(v => ({ period: v.period, count: v.count, medianMl: v.medianMl })),
        overallMedianGapMinutes: prediction.overallMedianGapMinutes,
        dataDays: prediction.dataDays,
        dataFeeds: prediction.dataFeeds
      },
      recentFeedings: records.slice(-7).map(r => ({
        occurredAt: r.occurredAt,
        breastMilkMl: r.breastMilkMl,
        formulaMl: r.formulaMl,
        note: r.note || undefined
      }))
    }, settings);

    saveAiFeedingInsights({
      summary: insights.summary,
      insights: insights.insights,
      alert: insights.alert,
      gapMinutes: null,
      nextFeedAt: null,
      recordsHash
    });

    return res.json({
      ...prediction,
      aiInsights: {
        summary: insights.summary,
        insights: insights.insights,
        alert: insights.alert
      }
    });
  } catch (e) {
    console.error('[feeding-prediction] AI error:', e instanceof Error ? e.message : e);
    return res.json(prediction);
  }
});

app.get('/api/care-items', (_req, res) => {
  return res.json(listCareItems(true));
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

app.get('/api/care-items/adherence', requireAuth, (_req, res) => {
  const items = getCareAdherence(30);
  return res.json({ items });
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

app.post('/api/backups', requireSuperAdmin, (req, res) => {
  const type = (req.body?.type === 'manual' || req.body?.type === 'auto') ? req.body.type : 'manual';
  const result = writeServerBackup(exportPayload(), { directory: backupDirectory, type: type as BackupType });
  res.status(201).json(result);
});

app.delete('/api/backups/:name', requireSuperAdmin, (req, res) => {
  const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
  try {
    deleteServerBackup(name, backupDirectory);
    res.json({ deleted: true, status: serverBackupStatus(backupDirectory) });
  } catch (error) {
    if (error instanceof InvalidBackupNameError) return res.status(400).json({ error: error.message });
    if (error instanceof BackupFileNotFoundError) return res.status(404).json({ error: error.message });
    res.status(500).json({ error: '删除备份失败' });
  }
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
  const result = replaceBackup({ profile: parsed.data.profile, records, audits, careItems: parsed.data.careItems as CareItem[] | undefined, familyMembers: parsed.data.familyMembers as FamilyMemberPermission[] | undefined, growthRecords, vaccineRecords, vaccineCatalog: parsed.data.vaccineCatalog as VaccineCatalogItem[] | undefined, dailyReports: parsed.data.dailyReports });
  changeHub.broadcast('all');
  res.json({ ...result, restoredFrom: name, status: serverBackupStatus(backupDirectory) });
});

app.post('/api/import', requireSuperAdmin, (req, res) => {
  const mode = req.body.mode === 'replace' ? 'replace' : 'merge';
  const { mode: _ignored, ...payload } = req.body;
  const parsed = backupPayloadSchema.safeParse(payload);
  if (!parsed.success) return res.status(400).json({ error: '导入文件格式不正确' });
  writeServerBackup(exportPayload(), { directory: backupDirectory });
  const records = parsed.data.records.map(item => normalizeRecord(item, 'father', true));
  const audits = parsed.data.audits?.map(item => ({ ...item, id: item.id || 0, snapshot: item.snapshot as CareRecord | null })) as AuditEntry[] | undefined;
  const growthRecords = parsed.data.growthRecords?.map(item => normalizeGrowthRecord(item, 'father', true));
  const vaccineRecords = parsed.data.vaccineRecords?.map(item => normalizeVaccineRecord(item, 'father', true));
  const defaultProfile = { name: '宝宝', birthDate: new Date().toISOString().slice(0, 10), birthTime: null, sex: 'unspecified' as const, nickname: '', caregiverTitle: '', avatar: null };
  const importPayload = { profile: parsed.data.profile || defaultProfile, records, audits, careItems: parsed.data.careItems as CareItem[] | undefined, familyMembers: parsed.data.familyMembers as FamilyMemberPermission[] | undefined, growthRecords, vaccineRecords, vaccineCatalog: parsed.data.vaccineCatalog as VaccineCatalogItem[] | undefined, dailyReports: parsed.data.dailyReports };
  const result = mode === 'replace' ? replaceBackup(importPayload) : importBackup(importPayload);
  changeHub.broadcast('all');
  res.json({ ...result, mode });
});

registerPushRoutes(app);

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
try { startPushScheduler(); } catch (e) { console.error('[push] 推送调度器启动失败（已忽略，不影响主服务）:', e); }
const listenHost = '0.0.0.0';
app.listen(port, listenHost, () => console.log(`Baby care server listening on http://${listenHost}:${port}`));
