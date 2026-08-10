import { mkdtempSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backupIntervalMs, serverBackupStatus, writeServerBackup } from './backup.js';

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function temporaryDirectory() { const directory = mkdtempSync(join(tmpdir(), 'babycare-backup-')); directories.push(directory); return directory; }

describe('服务器备份', () => {
  it('使用临时文件原子写入可读取的 JSON 备份', () => {
    const directory = temporaryDirectory(); const now = new Date('2026-08-10T06:00:00.123Z');
    const result = writeServerBackup({ version: 2, records: [{ id: 'demo' }] }, { directory, now });
    expect(result.name).toBe('babycare-backup-20260810-060000-123.json');
    expect(JSON.parse(readFileSync(join(directory, result.name), 'utf8'))).toEqual({ version: 2, records: [{ id: 'demo' }] });
    expect(result.status.count).toBe(1);
  });

  it('只保留设定数量的最新备份', () => {
    const directory = temporaryDirectory();
    for (let index = 0; index < 4; index += 1) {
      const now = new Date(Date.UTC(2026, 7, 10, index));
      const result = writeServerBackup({ index }, { directory, now, retention: 2 });
      utimesSync(join(directory, result.name), now, now);
    }
    expect(serverBackupStatus(directory).count).toBe(2);
  });

  it('同一毫秒连续备份不会覆盖已有文件', () => {
    const directory = temporaryDirectory(); const now = new Date('2026-08-10T06:00:00.000Z');
    const first = writeServerBackup({ order: 1 }, { directory, now }); const second = writeServerBackup({ order: 2 }, { directory, now });
    expect(second.name).not.toBe(first.name);
    expect(serverBackupStatus(directory).count).toBe(2);
  });

  it('下一次备份时间是最近备份六小时后', () => {
    const directory = temporaryDirectory(); const createdAt = new Date('2026-08-10T06:00:00.000Z');
    const result = writeServerBackup({}, { directory, now: createdAt });
    utimesSync(join(directory, result.name), createdAt, createdAt);
    const status = serverBackupStatus(directory, new Date('2026-08-10T07:00:00.000Z'));
    expect(new Date(status.nextBackupAt).getTime()).toBe(createdAt.getTime() + backupIntervalMs);
  });
});
