import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const backupIntervalMs = 6 * 60 * 60 * 1000;
export const backupRetention = 30;

export type BackupType = 'manual' | 'auto';

export interface ServerBackupStatus {
  directory: string;
  intervalHours: number;
  retention: number;
  count: number;
  lastBackupAt: string | null;
  nextBackupAt: string;
}

export interface ServerBackupFile { name: string; createdAt: string; size: number; type: BackupType }
export class InvalidBackupNameError extends Error {}
export class BackupFileNotFoundError extends Error {}

const backupPattern = /^babycare-backup-(manual|auto)-\d{8}-\d{6}-\d{3}\.json$/;
const legacyBackupPattern = /^babycare-backup-\d{8}-\d{6}-\d{3}\.json$/;

export function defaultBackupDirectory(databasePath = process.env.DATABASE_PATH || './data/baby-care.db') {
  return join(dirname(databasePath), 'backups');
}

function parseBackupType(name: string): BackupType {
  const match = name.match(backupPattern);
  if (match) return match[1] as BackupType;
  return 'auto';
}

function backupFiles(directory: string) {
  mkdirSync(directory, { recursive: true });
  return readdirSync(directory)
    .filter(name => backupPattern.test(name) || legacyBackupPattern.test(name))
    .map(name => { const stats = statSync(join(directory, name)); return { name, modifiedAt: stats.mtimeMs, size: stats.size }; })
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
}

export function listServerBackups(directory = defaultBackupDirectory()): ServerBackupFile[] {
  return backupFiles(directory).map(file => ({
    name: file.name,
    createdAt: new Date(file.modifiedAt).toISOString(),
    size: file.size,
    type: parseBackupType(file.name)
  }));
}

export function readServerBackup(name: string, directory = defaultBackupDirectory()) {
  if (!backupPattern.test(name) && !legacyBackupPattern.test(name)) throw new InvalidBackupNameError('备份文件名不正确');
  const path = join(directory, name);
  if (!existsSync(path)) throw new BackupFileNotFoundError('服务器备份不存在');
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function deleteServerBackup(name: string, directory = defaultBackupDirectory()): void {
  if (!backupPattern.test(name) && !legacyBackupPattern.test(name)) throw new InvalidBackupNameError('备份文件名不正确');
  const path = join(directory, name);
  if (!existsSync(path)) throw new BackupFileNotFoundError('服务器备份不存在');
  unlinkSync(path);
}

function backupName(now: Date, type: BackupType = 'auto') {
  const digits = now.toISOString().replace(/\D/g, '');
  return `babycare-backup-${type}-${digits.slice(0, 8)}-${digits.slice(8, 14)}-${digits.slice(14, 17)}.json`;
}

export function serverBackupStatus(directory = defaultBackupDirectory(), now = new Date()): ServerBackupStatus {
  const files = backupFiles(directory);
  const lastBackupAt = files[0] ? new Date(files[0].modifiedAt).toISOString() : null;
  const nextAt = lastBackupAt ? Math.max(now.getTime(), new Date(lastBackupAt).getTime() + backupIntervalMs) : now.getTime();
  return { directory, intervalHours: 6, retention: backupRetention, count: files.length, lastBackupAt, nextBackupAt: new Date(nextAt).toISOString() };
}

export function writeServerBackup(payload: unknown, options: { directory?: string; now?: Date; retention?: number; type?: BackupType } = {}) {
  const directory = options.directory || defaultBackupDirectory(); const now = options.now || new Date(); const retention = options.retention ?? backupRetention; const type = options.type || 'auto';
  mkdirSync(directory, { recursive: true });
  let createdAt = now; let name = backupName(createdAt, type); let target = join(directory, name);
  while (existsSync(target)) { createdAt = new Date(createdAt.getTime() + 1); name = backupName(createdAt, type); target = join(directory, name); }
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, target);
  const files = backupFiles(directory);
  for (const file of files.slice(retention)) unlinkSync(join(directory, file.name));
  return { name, createdAt: createdAt.toISOString(), status: serverBackupStatus(directory, createdAt) };
}

export function startBackupScheduler(createPayload: () => unknown, directory = defaultBackupDirectory()) {
  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    const status = serverBackupStatus(directory);
    const delay = Math.max(250, new Date(status.nextBackupAt).getTime() - Date.now());
    timer = setTimeout(() => {
      try {
        const latest = serverBackupStatus(directory);
        if (new Date(latest.nextBackupAt).getTime() <= Date.now()) writeServerBackup(createPayload(), { directory, type: 'auto' });
      }
      catch (error) { console.error('自动备份失败', error); }
      schedule();
    }, delay);
    timer.unref();
  };
  schedule();
  return () => { if (timer) clearTimeout(timer); };
}
