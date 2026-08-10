import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuditEntry, CareRecord, GrowthRecord } from './types.js';

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

function growth(overrides: Partial<GrowthRecord> = {}): GrowthRecord {
  const now = '2026-08-10T08:00:00.000Z';
  return { id: crypto.randomUUID(), measuredOn: '2026-08-10', heightCm: 62.5, weightKg: 6.35, createdAt: now, updatedAt: now, createdBy: 'father', updatedBy: 'father', deletedAt: null, deletedBy: null, ...overrides };
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

  it('manages configurable care items and keeps history when an item is renamed or disabled', () => {
    expect(db.listCareItems().map((item: { name: string }) => item.name)).toEqual(expect.arrayContaining(['AD', 'VD', '益生菌', '推拿']));
    const item = db.saveCareItem({ id: 'touch', name: '抚触', icon: 'massage', sortOrder: 50 });
    const saved = db.saveRecord(record({ id: '66666666-6666-4666-8666-666666666666', supplement: item.name, occurredAt: '2026-08-10T08:00:00.000Z' }));
    db.saveCareItem({ ...item, name: '全身抚触' });
    expect(db.allRecords(true).find((entry: CareRecord) => entry.id === saved.id)?.supplement).toBe('全身抚触');
    expect(db.setCareItemActive(item.id, false).active).toBe(false);
    expect(() => db.saveRecord(record({ id: '77777777-7777-4777-8777-777777777777', supplement: '全身抚触', occurredAt: '2026-08-11T08:00:00.000Z' }))).toThrow(db.CareItemInactiveError);
  });

  it('reorders every care item in one transaction', () => {
    const before = db.listCareItems(true);
    const ids = before.map((item: { id: string }) => item.id).reverse();
    expect(db.reorderCareItems(ids).map((item: { id: string }) => item.id)).toEqual(ids);
    expect(() => db.reorderCareItems(ids.slice(1))).toThrow(db.CareItemOrderError);
  });

  it('lets the super administrator update child account roles while keeping father fixed', () => {
    expect(db.listFamilyMembers()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'father', role: 'superadmin' }),
      expect.objectContaining({ id: 'mother', role: 'admin' })
    ]));
    expect(db.setFamilyRole('grandfather', 'admin')).toMatchObject({ id: 'grandfather', role: 'admin' });
    expect(db.getFamilyRole('grandfather')).toBe('admin');
    expect(() => db.setFamilyRole('father', 'member')).toThrow(db.FamilyPermissionError);
    db.setFamilyRole('grandfather', 'member');
  });

  it('permanently removes only records already in the recycle bin', () => {
    const item = record({ id: '88888888-8888-4888-8888-888888888888', type: 'feeding', supplement: null, breastMilkMl: 80 });
    db.saveRecord(item);
    expect(db.purgeRecord(item.id)).toBe(false);
    db.removeRecord(item.id, 'mother');
    expect(db.listDeletedRecords().some((entry: CareRecord) => entry.id === item.id)).toBe(true);
    expect(db.purgeRecord(item.id)).toBe(true);
    expect(db.allRecords(true).some((entry: CareRecord) => entry.id === item.id)).toBe(false);
    expect(db.listAudit(item.id)).toEqual([]);
  });

  it('keeps one active growth record per Monday-to-Sunday week and supports recovery', () => {
    const monday = growth({ id: '99999999-9999-4999-8999-999999999991', measuredOn: '2026-08-10' });
    expect(db.saveGrowthRecord(monday)).toMatchObject({ heightCm: 62.5, weightKg: 6.35 });
    expect(() => db.saveGrowthRecord(growth({ id: '99999999-9999-4999-8999-999999999992', measuredOn: '2026-08-16' }))).toThrow(db.DuplicateGrowthWeekError);
    const nextWeek = growth({ id: '99999999-9999-4999-8999-999999999993', measuredOn: '2026-08-17', heightCm: 63.1 });
    db.saveGrowthRecord(nextWeek);
    expect(db.listGrowthRecords()).toHaveLength(2);
    expect(db.removeGrowthRecord(monday.id, 'mother')?.deletedBy).toBe('mother');
    expect(db.restoreGrowthRecord(monday.id, 'father').deletedAt).toBeNull();
    db.removeGrowthRecord(monday.id, 'father');
    expect(db.purgeGrowthRecord(monday.id)).toBe(true);
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
    expect(db.listGrowthRecords(true)).toEqual([]);
  });
});
