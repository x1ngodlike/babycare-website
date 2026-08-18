// 头像目录的初始化与路径诊断：启动时尽早定位 DATA_DIR 权限问题，并给上传路由提供可读的错误提示。
import { existsSync, mkdirSync, accessSync, constants as fsConstants, statSync, type Stats } from 'node:fs';
import { tmpdir as osTmpdir } from 'node:os';
import { resolve, join, dirname, isAbsolute } from 'node:path';

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
export const dataDir = avatarRoot.isTemporary ? dirname(dirname(avatarRoot.dir)) : configuredDataDir;
if (avatarRoot.isTemporary) {
  console.warn(`[avatars] ⚠️  DATA_DIR 不可写（${configuredDataDir}），已切换到临时目录 ${avatarRoot.dir}。重启后头像会丢失！请把 volume 挂对：Docker -v <host_data>:/data，或在宿主机 chown -R 1000:1000 <host_data>。`);
}
export const avatarHintDir = avatarRoot.dir;
export const avatarTemporaryWarn = avatarRoot.isTemporary ? '头像临时模式（重启丢失）' : '';
export function diagnosePathTree(target: string): { path: string; exists: boolean; isDirectory: boolean; writable: boolean; note?: string }[] {
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
export function avatarFixHint(dir: string): string {
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
export function avatarDiagnoseCached(): ReturnType<typeof diagnosePathTree> { return diagnosePathTree(avatarDir); }
export const avatarDir = resolveAvatarDir();
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

export { avatarRoot };
