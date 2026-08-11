import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shanghaiDayUtcRange } from './shanghai-date.js';
import type { AuditEntry, CareRecord, GrowthRecord, VaccineRecord } from './types.js';

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

function vaccine(overrides: Partial<VaccineRecord> = {}): VaccineRecord {
  const now = '2026-08-11T08:00:00.000Z';
  return { id: crypto.randomUUID(), vaccineName: '乙肝疫苗', category: 'program', dose: 1, plannedOn: '2026-01-01', administeredOn: '2026-01-01', note: null, createdAt: now, updatedAt: now, createdBy: 'father', updatedBy: 'father', deletedAt: null, deletedBy: null, ...overrides };
}

beforeAll(() => expect(db.getProfile()).toMatchObject({ name: '示例宝宝' }));
afterAll(() => { db.closeDatabaseForTests(); rmSync(directory, { recursive: true, force: true }); });

describe('record reliability', () => {
  it('stores, protects, soft deletes and restores vaccine records', () => {
    const first = db.saveVaccineRecord(vaccine());
    expect(db.listVaccineRecords()).toContainEqual(first);
    const appointed = db.saveVaccineRecord({ ...first, plannedOn: '2026-01-01', appointmentOn: '2026-01-08', appointmentTime: '09:30' });
    expect(appointed).toMatchObject({ plannedOn: '2026-01-01', appointmentOn: '2026-01-08', appointmentTime: '09:30' });
    expect(db.saveVaccineRecord({ ...appointed, appointmentOn: null, appointmentTime: null })).toMatchObject({ plannedOn: '2026-01-01', appointmentOn: null });
    expect(() => db.saveVaccineRecord(vaccine())).toThrow(db.DuplicateVaccineRecordError);
    expect(db.removeVaccineRecord(first.id, 'mother')?.deletedBy).toBe('mother');
    expect(db.listVaccineRecords()).not.toContainEqual(expect.objectContaining({ id: first.id }));
    expect(db.restoreVaccineRecord(first.id, 'father').deletedAt).toBeNull();
  });

  it('keeps exactly ten protected defaults and only allows toggling them', () => {
    const catalog = db.listVaccineCatalog(true);
    expect(catalog).toHaveLength(10);
    expect(catalog.filter((item: { active: boolean }) => item.active)).toHaveLength(10);
    expect(catalog.filter((item: { active: boolean; category: string }) => item.active && item.category === 'program')).toHaveLength(8);
    expect(catalog.every((item: { isSystem: boolean }) => item.isSystem)).toBe(true);
    expect(catalog).toContainEqual(expect.objectContaining({ id: 'pcv13', name: '13价肺炎疫苗' }));
    expect(catalog).toContainEqual(expect.objectContaining({ id: 'rv5', name: '五价轮状疫苗' }));
    expect(db.setVaccineCatalogActive('hepb', false).active).toBe(false);
    expect(db.setVaccineCatalogActive('hepb', true).active).toBe(true);
    expect(() => db.saveVaccineCatalogItem({ ...catalog[0], description: '不能修改。' })).toThrow(db.VaccineCatalogConflictError);
    expect(db.removeVaccineCatalogItem(catalog[0].id)).toBe(false);
  });

  it('creates, edits and soft deletes vaccine catalog items without touching history', () => {
    const created = db.saveVaccineCatalogItem({ id: 'custom-test', name: '测试疫苗', category: 'self_paid', shortName: null, description: '用于测试。', doseCount: 2, intervalSummary: '共 2 剂，每剂间隔 1 个月', active: true, sortOrder: 999, isSystem: false });
    expect(created).toMatchObject({ name: '测试疫苗', doseCount: 2, active: true });
    const modified = db.saveVaccineCatalogItem({ ...created, name: '修改后的测试疫苗', description: '修改后的说明。', doseCount: 3 });
    expect(modified).toMatchObject({ name: '修改后的测试疫苗', description: '修改后的说明。', doseCount: 3 });
    expect(() => db.saveVaccineCatalogItem({ ...modified, id: 'custom-duplicate' })).toThrow(db.VaccineCatalogConflictError);
    expect(db.removeVaccineCatalogItem(modified.id)).toBe(true);
    expect(db.listVaccineCatalog(true)).not.toContainEqual(expect.objectContaining({ id: modified.id }));
    const restored = db.saveVaccineCatalogItem({ ...modified, id: 'new-id', description: '重新添加。' });
    expect(restored).toMatchObject({ id: modified.id, name: '修改后的测试疫苗', description: '重新添加。' });
  });

  it('stores the baby sex and defaults legacy profile imports safely', () => {
    expect(db.saveProfile('示例宝宝', '2026-01-01', 'female')).toMatchObject({ sex: 'female' });
    db.importBackup({ profile: { name: '旧备份宝宝', birthDate: '2026-01-02' }, records: [] });
    expect(db.getProfile()).toMatchObject({ name: '旧备份宝宝', sex: 'unspecified' });
  });

  it('stores model settings with safe defaults', () => {
    expect(db.getAiSettings()).toMatchObject({ provider: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: '' });
    db.saveAiSettings({ baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: 'test-key' });
    expect(db.getAiSettings()).toMatchObject({ model: 'deepseek-v4-flash', apiKey: 'test-key' });
    db.saveAiSettings({ baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' });
    expect(db.getAiSettings().apiKey).toBe('test-key');
  });

  it('counts midnight-to-midnight milk records using Shanghai UTC boundaries', () => {
    const samples = [
      record({ id: '10101010-1010-4010-8010-101010101010', type: 'feeding', supplement: null, occurredAt: '2027-02-02T15:59:59.999Z', breastMilkMl: 90 }),
      record({ id: '20202020-2020-4020-8020-202020202020', type: 'feeding', supplement: null, occurredAt: '2027-02-02T16:00:00.000Z', breastMilkMl: 1 }),
      record({ id: '30303030-3030-4030-8030-303030303030', type: 'feeding', supplement: null, occurredAt: '2027-02-02T16:17:00.000Z', formulaMl: 2 }),
      record({ id: '40404040-4040-4040-8040-404040404040', type: 'feeding', supplement: null, occurredAt: '2027-02-02T23:59:00.000Z', breastMilkMl: 3 }),
      record({ id: '50505050-5050-4050-8050-505050505050', type: 'feeding', supplement: null, occurredAt: '2027-02-03T00:00:00.000Z', formulaMl: 4 }),
      record({ id: '60606060-6060-4060-8060-606060606060', type: 'feeding', supplement: null, occurredAt: '2027-02-03T15:59:59.999Z', breastMilkMl: 5 }),
      record({ id: '70707070-7070-4070-8070-707070707070', type: 'feeding', supplement: null, occurredAt: '2027-02-03T16:00:00.000Z', formulaMl: 90 })
    ];
    samples.forEach(db.saveRecord);
    const range = shanghaiDayUtcRange('2027-02-03');
    const feedings = db.listRecords(range.from, range.to).filter((item: CareRecord) => item.type === 'feeding');
    expect(feedings).toHaveLength(5);
    expect(feedings.reduce((sum: number, item: CareRecord) => sum + (item.breastMilkMl || 0), 0)).toBe(9);
    expect(feedings.reduce((sum: number, item: CareRecord) => sum + (item.formulaMl || 0), 0)).toBe(6);
  });

  it('invalidates reports for record creation, cross-day edits, deletion and restoration', () => {
    const firstDate = '2027-03-01'; const secondDate = '2027-03-02';
    const item = record({ id: '80808080-8080-4080-8080-808080808080', type: 'feeding', supplement: null, occurredAt: '2027-02-28T16:17:00.000Z', breastMilkMl: 80 });
    const report = (reportDate: string) => ({ reportDate, summary: '测试报告', suggestions: ['测试建议'], model: 'test', generatedAt: '2027-03-03T00:00:00.000Z' });
    db.saveDailyReport(report(firstDate));
    db.saveRecord(item);
    expect(db.getDailyReport(firstDate)).toBeNull();

    db.saveDailyReport(report(firstDate)); db.saveDailyReport(report(secondDate));
    const moved = db.saveRecord({ ...item, occurredAt: '2027-03-01T16:17:00.000Z', updatedAt: '2027-03-02T01:00:00.000Z' });
    expect(db.getDailyReport(firstDate)).toBeNull();
    expect(db.getDailyReport(secondDate)).toBeNull();

    db.saveDailyReport(report(secondDate));
    db.removeRecord(moved.id, 'father');
    expect(db.getDailyReport(secondDate)).toBeNull();
    db.saveDailyReport(report(secondDate));
    db.restoreRecord(moved.id, 'father');
    expect(db.getDailyReport(secondDate)).toBeNull();
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
    const item = db.saveCareItem({ id: 'touch', name: '抚触', icon: 'massage', sortOrder: 50, scheduleType: 'interval', intervalDays: 2, scheduleStartDate: '2026-08-10', reminderTime: '20:00', scheduleEndDate: null });
    expect(item).toEqual(expect.objectContaining({ scheduleType: 'interval', intervalDays: 2, scheduleStartDate: '2026-08-10', reminderTime: '20:00' }));
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

  it('keeps one active growth record per day and supports recovery', () => {
    const monday = growth({ id: '99999999-9999-4999-8999-999999999991', measuredOn: '2026-08-10' });
    expect(db.saveGrowthRecord(monday)).toMatchObject({ heightCm: 62.5, weightKg: 6.35 });
    expect(() => db.saveGrowthRecord(growth({ id: '99999999-9999-4999-8999-999999999992', measuredOn: '2026-08-10' }))).toThrow(db.DuplicateGrowthDayError);
    const nextDay = growth({ id: '99999999-9999-4999-8999-999999999993', measuredOn: '2026-08-11', heightCm: 63.1 });
    db.saveGrowthRecord(nextDay);
    expect(db.listGrowthRecords()).toHaveLength(2);
    expect(db.removeGrowthRecord(monday.id, 'mother')?.deletedBy).toBe('mother');
    const replacement = growth({ id: '99999999-9999-4999-8999-999999999994', measuredOn: '2026-08-10' });
    db.saveGrowthRecord(replacement);
    expect(() => db.restoreGrowthRecord(monday.id, 'father')).toThrow(db.DuplicateGrowthDayError);
    db.removeGrowthRecord(replacement.id, 'father');
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
