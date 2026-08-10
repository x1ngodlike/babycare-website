import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuditEntry, CareRecord } from './types.js';

const directory = mkdtempSync(join(tmpdir(), 'baby-care-db-test-'));
process.env.DATABASE_PATH = join(directory, 'test.db');

const db = await import('./db.js');

function record(overrides: Partial<CareRecord> = {}): CareRecord {
  const now = '2026-08-09T08:00:00.000Z';
  return {
    id: crypto.randomUUID(), type: 'supplement', occurredAt: now,
    breastMilkMl: null, formulaMl: null, supplement: 'AD', bowelSize: null, note: null,
    createdAt: now, updatedAt: now, createdBy: 'father', updatedBy: 'father',
    deletedAt: null, deletedBy: null, ...overrides
  };
}

beforeAll(() => expect(db.getProfile()).toMatchObject({ name: '示例宝宝' }));
afterAll(() => { db.closeDatabaseForTests(); rmSync(directory, { recursive: true, force: true }); });

describe('record reliability', () => {
  it('stores model settings with safe defaults', () => {
    expect(db.getAiSettings()).toMatchObject({ provider: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: '' });
    db.saveAiSettings({ baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: 'test-key' });
    expect(db.getAiSettings()).toMatchObject({ model: 'deepseek-v4-flash', apiKey: 'test-key' });
    db.saveAiSettings({ baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' });
    expect(db.getAiSettings().apiKey).toBe('test-key');
  });
  it('blocks duplicate supplements on the same care day', () => {
    db.saveRecord(record({ id: '11111111-1111-4111-8111-111111111111' }));
    expect(() => db.saveRecord(record({ id: '22222222-2222-4222-8222-222222222222' }))).toThrow(db.DuplicateSupplementError);
  });

  it('soft deletes, restores and records audit history', () => {
    const firstId = '11111111-1111-4111-8111-111111111111';
    const deleted = db.removeRecord(firstId, 'mother');
    expect(deleted?.deletedBy).toBe('mother');
    const replacement = record({ id: '33333333-3333-4333-8333-333333333333', createdBy: 'mother', updatedBy: 'mother' });
    db.saveRecord(replacement);
    expect(() => db.restoreRecord(firstId, 'father')).toThrow(db.DuplicateSupplementError);
    db.removeRecord(replacement.id, 'father');
    expect(db.restoreRecord(firstId, 'father').deletedAt).toBeNull();
    expect(db.listAudit(firstId).map((item: AuditEntry) => item.action)).toEqual(expect.arrayContaining(['create', 'delete', 'restore']));
  });

  it('restores profile and records in one backup import', () => {
    const feeding = record({ id: '44444444-4444-4444-8444-444444444444', type: 'feeding', supplement: null, breastMilkMl: 90 });
    const result = db.importBackup({ profile: { name: '测试宝宝', birthDate: '2026-01-01' }, records: [feeding] });
    expect(result).toEqual({ imported: 1, profileRestored: true });
    expect(db.getProfile().name).toBe('测试宝宝');
    expect(db.allRecords().some((item: CareRecord) => item.id === feeding.id)).toBe(true);
  });

  it('replaces current profile, records and audit history during an exact restore', () => {
    const onlyRecord = record({ id: '55555555-5555-4555-8555-555555555555', type: 'feeding', supplement: null, breastMilkMl: 120 });
    const audit: AuditEntry = { id: 88, recordId: onlyRecord.id, action: 'create', actor: 'mother', occurredAt: onlyRecord.createdAt, snapshot: onlyRecord };
    const result = db.replaceBackup({ profile: { name: '恢复宝宝', birthDate: '2026-02-02' }, records: [onlyRecord], audits: [audit] });
    expect(result).toEqual({ imported: 1, profileRestored: true });
    expect(db.getProfile()).toMatchObject({ name: '恢复宝宝', birthDate: '2026-02-02' });
    expect(db.allRecords(true).map((item: CareRecord) => item.id)).toEqual([onlyRecord.id]);
    expect(db.allAudit()).toEqual([audit]);
  });
});
