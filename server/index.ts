import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import multer from 'multer';
import { requireAuth } from './auth.js';
import { avatarDir, avatarDiagnoseCached, avatarFixHint, avatarRoot, avatarTemporaryWarn, dataDir } from './avatar-dir.js';
import { BackupFileNotFoundError, defaultBackupDirectory, InvalidBackupNameError, startBackupScheduler } from './backup.js';
import { CareItemConflictError, CareItemInactiveError, CareItemOrderError, DuplicateGrowthDayError, DuplicateSupplementError, FamilyPermissionError, RecordNotFoundError } from './db/index.js';
import { createChangeHub } from './events.js';
import { startDailyReportScheduler } from './daily-report.js';
import { startPushScheduler } from './push.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAiRoutes } from './routes/ai.js';
import { registerFamilyRoutes } from './routes/family.js';
import { registerGrowthRoutes } from './routes/growth.js';
import { registerGrowthGuideRoutes } from './routes/growth-guide.js';
import { registerMilestoneRoutes } from './routes/milestones.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerPushRoutes } from './routes/push.js';
import { registerRecordRoutes } from './routes/records.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerVaccineRoutes } from './routes/vaccines.js';
import type { RouteContext } from './routes/context.js';
import { exportPayload } from './export-payload.js';

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

const routeContext: RouteContext = {
  changeHub, loginAttempts, avatarDir, dataDir, avatarRoot, avatarTemporaryWarn,
  avatarFixHint, avatarDiagnoseCached, upload, backupDirectory
};

// 登录相关路由必须在全局鉴权中间件之前注册
registerAuthRoutes(app, routeContext);
app.use('/api', requireAuth);

registerSystemRoutes(app, routeContext);
registerProfileRoutes(app, routeContext);
registerFamilyRoutes(app, routeContext);
registerAiRoutes(app);
registerGrowthRoutes(app, routeContext);
registerGrowthGuideRoutes(app, routeContext);
registerVaccineRoutes(app, routeContext);
registerMilestoneRoutes(app, routeContext);
registerRecordRoutes(app, routeContext);
registerPushRoutes(app);

if (production) {
  const staticDir = resolve('dist');
  if (!existsSync(staticDir)) throw new Error('缺少 dist 目录，请先运行 npm run build');
  // index.html 与 sw.js 必须 no-cache：前者引用带哈希的静态资源，后者要能被浏览器及时检测更新；
  // 缓存旧版本会导致部署后最多 1 小时内加载不到新版本
  app.use(express.static(staticDir, {
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  app.get('/{*splat}', (_req, res) => res.sendFile(resolve(staticDir, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));
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
