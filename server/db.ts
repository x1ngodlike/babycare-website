import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AuditAction, AuditEntry, AuditIdentity, BabySex, CareItem, CareRecord, FamilyId, FamilyMemberPermission, GrowthRecord, UserRole, VaccineCatalogItem, VaccineRecord } from './types.js';

const databasePath = process.env.DATABASE_PATH || './data/baby-care.db';
mkdirSync(dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    sex TEXT NOT NULL DEFAULT 'unspecified' CHECK (sex IN ('male', 'female', 'unspecified')),
    updated_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO profile (id, name, birth_date, updated_at)
  VALUES (1, '示例宝宝', '2026-01-01', datetime('now'));

  CREATE TABLE IF NOT EXISTS care_records (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('feeding', 'supplement', 'bowel', 'note')),
    occurred_at TEXT NOT NULL,
    breast_milk_ml INTEGER,
    formula_ml INTEGER,
    supplement TEXT CHECK (supplement IN ('AD', 'VD', '益生菌')),
    bowel_size TEXT CHECK (bowel_size IN ('大', '中', '小')),
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_care_records_occurred_at ON care_records(occurred_at);
`);

const profileColumns = db.prepare('PRAGMA table_info(profile)').all() as { name: string }[];
if (!profileColumns.some(column => column.name === 'sex')) db.exec("ALTER TABLE profile ADD COLUMN sex TEXT NOT NULL DEFAULT 'unspecified' CHECK (sex IN ('male', 'female', 'unspecified'))");

const recordColumns = db.prepare('PRAGMA table_info(care_records)').all() as { name: string }[];
if (!recordColumns.some(column => column.name === 'created_by')) db.exec("ALTER TABLE care_records ADD COLUMN created_by TEXT NOT NULL DEFAULT 'legacy'");
if (!recordColumns.some(column => column.name === 'updated_by')) db.exec("ALTER TABLE care_records ADD COLUMN updated_by TEXT NOT NULL DEFAULT 'legacy'");
if (!recordColumns.some(column => column.name === 'deleted_at')) db.exec('ALTER TABLE care_records ADD COLUMN deleted_at TEXT');
if (!recordColumns.some(column => column.name === 'deleted_by')) db.exec('ALTER TABLE care_records ADD COLUMN deleted_by TEXT');

const recordTableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'care_records'").get() as { sql: string }).sql;
if (recordTableSql.includes("supplement IN ('AD', 'VD', '益生菌')")) db.transaction(() => {
  db.exec(`
    CREATE TABLE care_records_unrestricted (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('feeding', 'supplement', 'bowel', 'note')),
      occurred_at TEXT NOT NULL,
      breast_milk_ml INTEGER,
      formula_ml INTEGER,
      supplement TEXT,
      bowel_size TEXT CHECK (bowel_size IN ('大', '中', '小')),
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'legacy',
      updated_by TEXT NOT NULL DEFAULT 'legacy',
      deleted_at TEXT,
      deleted_by TEXT
    );
    INSERT INTO care_records_unrestricted
      SELECT id, type, occurred_at, breast_milk_ml, formula_ml, supplement, bowel_size, note,
        created_at, updated_at, created_by, updated_by, deleted_at, deleted_by FROM care_records;
    DROP TABLE care_records;
    ALTER TABLE care_records_unrestricted RENAME TO care_records;
    CREATE INDEX idx_care_records_occurred_at ON care_records(occurred_at);
  `);
})();

db.exec(`
  CREATE TABLE IF NOT EXISTS record_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore', 'import')),
    actor TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    snapshot TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_record_audit_record_id ON record_audit(record_id, occurred_at DESC);

  CREATE TABLE IF NOT EXISTS ai_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO ai_settings (id, provider, base_url, model, api_key, updated_at)
  VALUES (1, 'DeepSeek', 'https://api.deepseek.com', 'deepseek-v4-flash', '', datetime('now'));

  CREATE TABLE IF NOT EXISTS care_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL CHECK (icon IN ('medicine', 'massage')),
    sort_order INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO care_items (id, name, icon, sort_order, active, created_at, updated_at) VALUES
    ('ad', 'AD', 'medicine', 10, 1, datetime('now'), datetime('now')),
    ('vd', 'VD', 'medicine', 20, 1, datetime('now'), datetime('now')),
    ('probiotic', '益生菌', 'medicine', 30, 1, datetime('now'), datetime('now')),
    ('massage', '推拿', 'massage', 40, 1, datetime('now'), datetime('now'));

  CREATE TABLE IF NOT EXISTS family_permissions (
    id TEXT PRIMARY KEY CHECK (id IN ('father', 'mother', 'grandfather', 'grandmother')),
    role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'member')),
    updated_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO family_permissions (id, role, updated_at) VALUES
    ('father', 'superadmin', datetime('now')),
    ('mother', 'admin', datetime('now')),
    ('grandfather', 'member', datetime('now')),
    ('grandmother', 'member', datetime('now'));

  CREATE TABLE IF NOT EXISTS growth_records (
    id TEXT PRIMARY KEY,
    measured_on TEXT NOT NULL,
    height_cm REAL NOT NULL,
    weight_kg REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    deleted_at TEXT,
    deleted_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_growth_records_measured_on ON growth_records(measured_on DESC);

  CREATE TABLE IF NOT EXISTS vaccine_records (
    id TEXT PRIMARY KEY,
    vaccine_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'program' CHECK (category IN ('program', 'self_paid')),
    dose INTEGER NOT NULL,
    planned_on TEXT NOT NULL,
    appointment_on TEXT,
    appointment_time TEXT,
    administered_on TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    deleted_at TEXT,
    deleted_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_vaccine_records_administered_on ON vaccine_records(administered_on DESC);

  CREATE TABLE IF NOT EXISTS vaccine_catalog (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK (category IN ('program', 'self_paid')),
    short_name TEXT,
    description TEXT NOT NULL,
    dose_count INTEGER,
    interval_summary TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL,
    is_system INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT
  );
`);

const vaccineTableColumns = db.prepare('PRAGMA table_info(vaccine_records)').all() as { name: string }[];
if (!vaccineTableColumns.some(column => column.name === 'category')) db.exec("ALTER TABLE vaccine_records ADD COLUMN category TEXT NOT NULL DEFAULT 'program' CHECK (category IN ('program', 'self_paid'))");
if (!vaccineTableColumns.some(column => column.name === 'appointment_on')) db.exec('ALTER TABLE vaccine_records ADD COLUMN appointment_on TEXT');
if (!vaccineTableColumns.some(column => column.name === 'appointment_time')) db.exec('ALTER TABLE vaccine_records ADD COLUMN appointment_time TEXT');
const vaccineCatalogTableColumns = db.prepare('PRAGMA table_info(vaccine_catalog)').all() as { name: string }[];
if (!vaccineCatalogTableColumns.some(column => column.name === 'deleted_at')) db.exec('ALTER TABLE vaccine_catalog ADD COLUMN deleted_at TEXT');
if (!vaccineCatalogTableColumns.some(column => column.name === 'is_system')) db.exec('ALTER TABLE vaccine_catalog ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0');

const defaultVaccineCatalog: Omit<VaccineCatalogItem, 'active'>[] = [
  { id: 'hepb', name: '乙肝疫苗', category: 'program', shortName: '乙肝', description: '用于预防乙型病毒性肝炎。', doseCount: 3, intervalSummary: '共 3 剂：出生时、1 月龄、6 月龄', sortOrder: 10, isSystem: true },
  { id: 'bcg', name: '卡介苗', category: 'program', shortName: '卡介苗', description: '用于预防儿童结核病，尤其是结核性脑膜炎、粟粒性肺结核等重症。', doseCount: 1, intervalSummary: '共 1 剂：出生时接种', sortOrder: 20, isSystem: true },
  { id: 'polio', name: '脊灰疫苗', category: 'program', shortName: '脊灰', description: '用于预防脊髓灰质炎。', doseCount: 4, intervalSummary: '共 4 剂：2、3、4 月龄及 4 周岁', sortOrder: 30, isSystem: true },
  { id: 'dtap', name: '百白破疫苗', category: 'program', shortName: '百白破', description: '用于预防百日咳、白喉和破伤风。', doseCount: 5, intervalSummary: '共 5 剂：3、4、5、18 月龄及 6 周岁', sortOrder: 40, isSystem: true },
  { id: 'mmr', name: '麻腮风疫苗', category: 'program', shortName: '麻腮风', description: '用于预防麻疹、流行性腮腺炎和风疹。', doseCount: 2, intervalSummary: '共 2 剂：8 月龄、18 月龄', sortOrder: 50, isSystem: true },
  { id: 'je', name: '乙脑疫苗', category: 'program', shortName: '乙脑', description: '用于预防流行性乙型脑炎。', doseCount: 2, intervalSummary: '减毒活疫苗共 2 剂：8 月龄、2 周岁；灭活疫苗程序不同，以接种门诊安排为准', sortOrder: 60, isSystem: true },
  { id: 'meningococcal', name: '流脑疫苗', category: 'program', shortName: '流脑', description: '用于预防流行性脑脊髓膜炎。', doseCount: 4, intervalSummary: '共 4 剂：6、9 月龄及 3、6 周岁', sortOrder: 70, isSystem: true },
  { id: 'hepa', name: '甲肝疫苗', category: 'program', shortName: '甲肝', description: '用于预防甲型病毒性肝炎。', doseCount: 1, intervalSummary: '减毒活疫苗共 1 剂：18 月龄；灭活疫苗程序不同，以接种门诊安排为准', sortOrder: 80, isSystem: true },
  { id: 'pcv13', name: '13价肺炎疫苗', category: 'self_paid', shortName: '13价肺炎', description: '用于预防相应血清型肺炎球菌引起的侵袭性疾病。', doseCount: 4, intervalSummary: '常见共 4 剂：6 月龄内完成 3 剂基础免疫，每剂间隔 1–2 个月；12–15 月龄加强 1 剂。具体以产品说明和接种门诊安排为准', sortOrder: 90, isSystem: true },
  { id: 'rv5', name: '五价轮状疫苗', category: 'self_paid', shortName: '五价轮状', description: '用于预防相应型别轮状病毒引起的胃肠炎。', doseCount: 3, intervalSummary: '共 3 剂：6–12 周龄开始，每剂间隔 4–10 周；第 3 剂不晚于 32 周龄', sortOrder: 100, isSystem: true }
];
const systemVaccineIds = new Set(defaultVaccineCatalog.map(item => item.id));
const legacyPresetIds = ['pentavalent', 'quadrivalent', 'hib', 'varicella', 'flu', 'ev71', 'menac', 'ppv23', 'rotavirus', 'rabies', 'hepe'];
const syncDefaultVaccineCatalog = db.transaction(() => {
  db.prepare("UPDATE vaccine_records SET vaccine_name = '13价肺炎疫苗' WHERE vaccine_name IN ('13价肺炎球菌疫苗', '13价肺炎球菌多糖结合疫苗')").run();
  db.prepare("UPDATE vaccine_records SET vaccine_name = '五价轮状疫苗' WHERE vaccine_name IN ('五价轮状病毒疫苗', '五价轮状病毒减毒活疫苗')").run();
  db.prepare('UPDATE vaccine_catalog SET is_system = 0').run();
  const upsert = db.prepare(`INSERT INTO vaccine_catalog (id, name, category, short_name, description, dose_count, interval_summary, active, sort_order, is_system, deleted_at)
    VALUES (@id, @name, @category, @shortName, @description, @doseCount, @intervalSummary, @active, @sortOrder, 1, NULL)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, short_name=excluded.short_name,
      description=excluded.description, dose_count=excluded.dose_count, interval_summary=excluded.interval_summary,
      sort_order=excluded.sort_order, is_system=1, deleted_at=NULL`);
  for (const item of defaultVaccineCatalog) upsert.run({ ...item, active: 1 });
  const archiveUnusedPreset = db.prepare(`UPDATE vaccine_catalog SET active = 0, deleted_at = COALESCE(deleted_at, datetime('now'))
    WHERE id = ? AND NOT EXISTS (SELECT 1 FROM vaccine_records WHERE vaccine_name = vaccine_catalog.name)`);
  for (const id of legacyPresetIds) archiveUnusedPreset.run(id);
});
syncDefaultVaccineCatalog();
const knownSelfPaidVaccines = [
  '五联疫苗（DTaP-IPV-Hib）', '四联疫苗（DTaP-IPV）', 'b型流感嗜血杆菌结合疫苗',
  '13价肺炎球菌多糖结合疫苗', '23价肺炎球菌多糖疫苗', '五价轮状病毒减毒活疫苗',
  '口服轮状病毒活疫苗', '水痘减毒活疫苗', '季节性流感疫苗', '鼻喷流感减毒活疫苗',
  'AC群流脑结合疫苗', 'ACYW135群流脑多糖疫苗', '流脑多糖结合疫苗',
  '肠道病毒71型灭活疫苗', '狂犬病疫苗', '戊型肝炎疫苗'
];
const markSelfPaid = db.prepare('UPDATE vaccine_records SET category = \'self_paid\' WHERE vaccine_name = ? AND category <> \'self_paid\'');
db.transaction(() => { for (const name of knownSelfPaidVaccines) markSelfPaid.run(name); })();

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_reports (
    report_date TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    suggestions TEXT NOT NULL,
    model TEXT NOT NULL,
    generated_at TEXT NOT NULL
  );
`);

const columns = `
  id, type, occurred_at AS occurredAt, breast_milk_ml AS breastMilkMl,
  formula_ml AS formulaMl, supplement, bowel_size AS bowelSize, note,
  created_at AS createdAt, updated_at AS updatedAt, created_by AS createdBy, updated_by AS updatedBy,
  deleted_at AS deletedAt, deleted_by AS deletedBy
`;

function getRecord(id: string): CareRecord | null {
  return db.prepare(`SELECT ${columns} FROM care_records WHERE id = ?`).get(id) as CareRecord | undefined || null;
}

function careDay(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

function addAudit(recordId: string, action: AuditAction, actor: AuditIdentity, snapshot: CareRecord | null, occurredAt = new Date().toISOString()) {
  db.prepare('INSERT INTO record_audit (record_id, action, actor, occurred_at, snapshot) VALUES (?, ?, ?, ?, ?)')
    .run(recordId, action, actor, occurredAt, snapshot ? JSON.stringify(snapshot) : null);
}

export class DuplicateSupplementError extends Error {
  existing: CareRecord;
  constructor(existing: CareRecord) {
    super(`${existing.supplement} 今天已经记录`);
    this.existing = existing;
  }
}

export class RecordNotFoundError extends Error {}
export class CareItemConflictError extends Error {}
export class CareItemInactiveError extends Error {}
export class CareItemOrderError extends Error {}
export class VaccineCatalogConflictError extends Error {}
export class FamilyPermissionError extends Error {}
export class DuplicateGrowthDayError extends Error {
  existing: GrowthRecord;
  constructor(existing: GrowthRecord) { super('当天已经记录身高体重'); this.existing = existing; }
}

function ensureNoDuplicateSupplement(record: CareRecord) {
  if (record.type !== 'supplement' || !record.supplement) return;
  const existing = db.prepare(`
    SELECT ${columns} FROM care_records
    WHERE type = 'supplement' AND supplement = ? AND deleted_at IS NULL AND id <> ?
      AND date(occurred_at, '+8 hours') = ?
    LIMIT 1
  `).get(record.supplement, record.id, careDay(record.occurredAt)) as CareRecord | undefined;
  if (existing) throw new DuplicateSupplementError(existing);
}

function ensureCareItemAvailable(record: CareRecord, existing: CareRecord | null) {
  if (record.type !== 'supplement' || !record.supplement || existing?.supplement === record.supplement) return;
  const item = db.prepare('SELECT active FROM care_items WHERE name = ?').get(record.supplement) as { active: number } | undefined;
  if (!item?.active) throw new CareItemInactiveError('这个项目已停用，请选择其他项目');
}

export function listRecords(from: string, to: string): CareRecord[] {
  return db.prepare(`SELECT ${columns} FROM care_records WHERE deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at DESC`).all(from, to) as CareRecord[];
}

export function allRecords(includeDeleted = false): CareRecord[] {
  const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
  return db.prepare(`SELECT ${columns} FROM care_records ${where} ORDER BY occurred_at DESC`).all() as CareRecord[];
}

const saveRecordTransaction = db.transaction((record: CareRecord): CareRecord => {
  const existing = getRecord(record.id);
  if (existing?.deletedAt) throw new RecordNotFoundError('记录已经删除');
  ensureCareItemAvailable(record, existing);
  ensureNoDuplicateSupplement(record);
  if (existing) {
    db.prepare(`
      UPDATE care_records SET
        type=@type, occurred_at=@occurredAt, breast_milk_ml=@breastMilkMl, formula_ml=@formulaMl,
        supplement=@supplement, bowel_size=@bowelSize, note=@note, updated_at=@updatedAt, updated_by=@updatedBy
      WHERE id=@id AND deleted_at IS NULL
    `).run(record);
  } else {
    db.prepare(`
      INSERT INTO care_records (id, type, occurred_at, breast_milk_ml, formula_ml, supplement, bowel_size, note, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
      VALUES (@id, @type, @occurredAt, @breastMilkMl, @formulaMl, @supplement, @bowelSize, @note, @createdAt, @updatedAt, @createdBy, @updatedBy, NULL, NULL)
    `).run(record);
  }
  const saved = getRecord(record.id)!;
  addAudit(saved.id, existing ? 'update' : 'create', saved.updatedBy, saved);
  return saved;
});
export function saveRecord(record: CareRecord): CareRecord { return saveRecordTransaction(record); }

const removeRecordTransaction = db.transaction((id: string, actor: AuditIdentity): CareRecord | null => {
  const existing = getRecord(id);
  if (!existing || existing.deletedAt) return null;
  const now = new Date().toISOString();
  db.prepare('UPDATE care_records SET deleted_at = ?, deleted_by = ?, updated_at = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL')
    .run(now, actor, now, actor, id);
  const deleted = getRecord(id)!;
  addAudit(id, 'delete', actor, deleted, now);
  return deleted;
});
export function removeRecord(id: string, actor: AuditIdentity): CareRecord | null { return removeRecordTransaction(id, actor); }

const restoreRecordTransaction = db.transaction((id: string, actor: AuditIdentity): CareRecord => {
  const existing = getRecord(id);
  if (!existing) throw new RecordNotFoundError('记录不存在');
  if (!existing.deletedAt) return existing;
  ensureNoDuplicateSupplement({ ...existing, deletedAt: null, deletedBy: null });
  const now = new Date().toISOString();
  db.prepare('UPDATE care_records SET deleted_at = NULL, deleted_by = NULL, updated_at = ?, updated_by = ? WHERE id = ?').run(now, actor, id);
  const restored = getRecord(id)!;
  addAudit(id, 'restore', actor, restored, now);
  return restored;
});
export function restoreRecord(id: string, actor: AuditIdentity): CareRecord { return restoreRecordTransaction(id, actor); }

const purgeRecordTransaction = db.transaction((id: string): boolean => {
  const existing = getRecord(id);
  if (!existing?.deletedAt) return false;
  db.prepare('DELETE FROM record_audit WHERE record_id = ?').run(id);
  return db.prepare('DELETE FROM care_records WHERE id = ? AND deleted_at IS NOT NULL').run(id).changes > 0;
});
export function purgeRecord(id: string): boolean { return purgeRecordTransaction(id); }

export function listDeletedRecords(): CareRecord[] {
  return db.prepare(`SELECT ${columns} FROM care_records WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all() as CareRecord[];
}

export function listAudit(recordId: string): AuditEntry[] {
  const rows = db.prepare(`SELECT id, record_id AS recordId, action, actor, occurred_at AS occurredAt, snapshot FROM record_audit WHERE record_id = ? ORDER BY occurred_at DESC, id DESC`).all(recordId) as (Omit<AuditEntry, 'snapshot'> & { snapshot: string | null })[];
  return rows.map(row => ({ ...row, snapshot: row.snapshot ? JSON.parse(row.snapshot) as CareRecord : null }));
}

export function allAudit(): AuditEntry[] {
  const rows = db.prepare(`SELECT id, record_id AS recordId, action, actor, occurred_at AS occurredAt, snapshot FROM record_audit ORDER BY occurred_at ASC, id ASC`).all() as (Omit<AuditEntry, 'snapshot'> & { snapshot: string | null })[];
  return rows.map(row => ({ ...row, snapshot: row.snapshot ? JSON.parse(row.snapshot) as CareRecord : null }));
}

export function getProfile() {
  return db.prepare('SELECT name, birth_date AS birthDate, sex, updated_at AS updatedAt FROM profile WHERE id = 1').get() as { name: string; birthDate: string; sex: BabySex; updatedAt: string };
}

export function saveProfile(name: string, birthDate: string, sex: BabySex = 'unspecified') {
  const updatedAt = new Date().toISOString();
  db.prepare('UPDATE profile SET name = ?, birth_date = ?, sex = ?, updated_at = ? WHERE id = 1').run(name, birthDate, sex, updatedAt);
  return { name, birthDate, sex, updatedAt };
}

const careItemColumns = 'id, name, icon, sort_order AS sortOrder, active, created_at AS createdAt, updated_at AS updatedAt';
function normalizeCareItem(row: Omit<CareItem, 'active'> & { active: number }): CareItem { return { ...row, active: Boolean(row.active) }; }
export function listCareItems(includeInactive = false): CareItem[] {
  const rows = db.prepare(`SELECT ${careItemColumns} FROM care_items ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort_order, created_at`).all() as (Omit<CareItem, 'active'> & { active: number })[];
  return rows.map(normalizeCareItem);
}
export function saveCareItem(input: Pick<CareItem, 'id' | 'name' | 'icon' | 'sortOrder'>): CareItem {
  const existingByName = db.prepare('SELECT id FROM care_items WHERE name = ? AND id <> ?').get(input.name, input.id) as { id: string } | undefined;
  if (existingByName) throw new CareItemConflictError('已经存在同名项目');
  const existing = db.prepare('SELECT name FROM care_items WHERE id = ?').get(input.id) as { name: string } | undefined;
  const now = new Date().toISOString();
  db.transaction(() => {
    if (existing) {
      if (existing.name !== input.name) db.prepare('UPDATE care_records SET supplement = ? WHERE supplement = ?').run(input.name, existing.name);
      db.prepare('UPDATE care_items SET name = ?, icon = ?, sort_order = ?, updated_at = ? WHERE id = ?').run(input.name, input.icon, input.sortOrder, now, input.id);
    } else {
      db.prepare('INSERT INTO care_items (id, name, icon, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)').run(input.id, input.name, input.icon, input.sortOrder, now, now);
    }
  })();
  return listCareItems(true).find(item => item.id === input.id)!;
}
export function setCareItemActive(id: string, active: boolean): CareItem {
  const now = new Date().toISOString();
  const result = db.prepare('UPDATE care_items SET active = ?, updated_at = ? WHERE id = ?').run(active ? 1 : 0, now, id);
  if (!result.changes) throw new RecordNotFoundError('照护项目不存在');
  return listCareItems(true).find(item => item.id === id)!;
}

export function reorderCareItems(ids: string[]): CareItem[] {
  const currentIds = listCareItems(true).map(item => item.id);
  if (ids.length !== currentIds.length || new Set(ids).size !== ids.length || currentIds.some(id => !ids.includes(id))) {
    throw new CareItemOrderError('项目顺序已变化，请刷新后重试');
  }
  const update = db.prepare('UPDATE care_items SET sort_order = ?, updated_at = ? WHERE id = ?');
  const now = new Date().toISOString();
  db.transaction(() => ids.forEach((id, index) => update.run((index + 1) * 10, now, id)))();
  return listCareItems(true);
}

const familyNames: Record<FamilyId, string> = { father: '爸爸', mother: '妈妈', grandfather: '爷爷', grandmother: '奶奶' };
export function listFamilyMembers(): FamilyMemberPermission[] {
  const rows = db.prepare("SELECT id, role FROM family_permissions ORDER BY CASE id WHEN 'father' THEN 1 WHEN 'mother' THEN 2 WHEN 'grandfather' THEN 3 ELSE 4 END").all() as { id: FamilyId; role: UserRole }[];
  return rows.map(row => ({ ...row, name: familyNames[row.id] }));
}
export function getFamilyRole(id: FamilyId): UserRole {
  return (db.prepare('SELECT role FROM family_permissions WHERE id = ?').get(id) as { role: UserRole } | undefined)?.role || (id === 'father' ? 'superadmin' : 'member');
}
export function setFamilyRole(id: FamilyId, role: Exclude<UserRole, 'superadmin'>): FamilyMemberPermission {
  if (id === 'father') throw new FamilyPermissionError('超管账号的权限不能修改');
  const result = db.prepare('UPDATE family_permissions SET role = ?, updated_at = ? WHERE id = ?').run(role, new Date().toISOString(), id);
  if (!result.changes) throw new FamilyPermissionError('家庭成员不存在');
  return listFamilyMembers().find(member => member.id === id)!;
}

export function replaceFamilyRoles(items: Pick<FamilyMemberPermission, 'id' | 'role'>[]) {
  const allowed = new Map(items.map(item => [item.id, item.role]));
  const update = db.prepare('UPDATE family_permissions SET role = ?, updated_at = ? WHERE id = ?');
  const now = new Date().toISOString();
  db.transaction(() => {
    update.run('superadmin', now, 'father');
    for (const id of ['mother', 'grandfather', 'grandmother'] as FamilyId[]) {
      const role = allowed.get(id);
      update.run(role === 'admin' ? 'admin' : 'member', now, id);
    }
  })();
}

const growthColumns = `id, measured_on AS measuredOn, height_cm AS heightCm, weight_kg AS weightKg,
  created_at AS createdAt, updated_at AS updatedAt, created_by AS createdBy, updated_by AS updatedBy,
  deleted_at AS deletedAt, deleted_by AS deletedBy`;
function getGrowthRecord(id: string): GrowthRecord | null {
  return db.prepare(`SELECT ${growthColumns} FROM growth_records WHERE id = ?`).get(id) as GrowthRecord | undefined || null;
}
function duplicateGrowthRecord(record: GrowthRecord) {
  return db.prepare(`SELECT ${growthColumns} FROM growth_records WHERE deleted_at IS NULL AND measured_on = ? AND id <> ? LIMIT 1`)
    .get(record.measuredOn, record.id) as GrowthRecord | undefined;
}
export function listGrowthRecords(includeDeleted = false): GrowthRecord[] {
  const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
  return db.prepare(`SELECT ${growthColumns} FROM growth_records ${where} ORDER BY measured_on DESC, updated_at DESC`).all() as GrowthRecord[];
}
const saveGrowthTransaction = db.transaction((record: GrowthRecord): GrowthRecord => {
  const existing = getGrowthRecord(record.id);
  if (existing?.deletedAt) throw new RecordNotFoundError('成长记录已经删除');
  const duplicate = duplicateGrowthRecord(record);
  if (duplicate) throw new DuplicateGrowthDayError(duplicate);
  if (existing) {
    db.prepare('UPDATE growth_records SET measured_on = ?, height_cm = ?, weight_kg = ?, updated_at = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL')
      .run(record.measuredOn, record.heightCm, record.weightKg, record.updatedAt, record.updatedBy, record.id);
  } else {
    db.prepare(`INSERT INTO growth_records (id, measured_on, height_cm, weight_kg, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
      .run(record.id, record.measuredOn, record.heightCm, record.weightKg, record.createdAt, record.updatedAt, record.createdBy, record.updatedBy);
  }
  return getGrowthRecord(record.id)!;
});
export function saveGrowthRecord(record: GrowthRecord): GrowthRecord { return saveGrowthTransaction(record); }
export function removeGrowthRecord(id: string, actor: AuditIdentity): GrowthRecord | null {
  const now = new Date().toISOString();
  const result = db.prepare('UPDATE growth_records SET deleted_at = ?, deleted_by = ?, updated_at = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL').run(now, actor, now, actor, id);
  return result.changes ? getGrowthRecord(id) : null;
}
export function restoreGrowthRecord(id: string, actor: AuditIdentity): GrowthRecord {
  const existing = getGrowthRecord(id);
  if (!existing?.deletedAt) throw new RecordNotFoundError('已删除的成长记录不存在');
  const duplicate = duplicateGrowthRecord(existing);
  if (duplicate) throw new DuplicateGrowthDayError(duplicate);
  const now = new Date().toISOString();
  db.prepare('UPDATE growth_records SET deleted_at = NULL, deleted_by = NULL, updated_at = ?, updated_by = ? WHERE id = ?').run(now, actor, id);
  return getGrowthRecord(id)!;
}
export function purgeGrowthRecord(id: string): boolean {
  return db.prepare('DELETE FROM growth_records WHERE id = ? AND deleted_at IS NOT NULL').run(id).changes > 0;
}

const vaccineColumns = `id, vaccine_name AS vaccineName, category, dose, planned_on AS plannedOn,
  appointment_on AS appointmentOn, appointment_time AS appointmentTime, administered_on AS administeredOn, note, created_at AS createdAt, updated_at AS updatedAt,
  created_by AS createdBy, updated_by AS updatedBy, deleted_at AS deletedAt, deleted_by AS deletedBy`;

function getVaccineRecord(id: string): VaccineRecord | null {
  return db.prepare(`SELECT ${vaccineColumns} FROM vaccine_records WHERE id = ?`).get(id) as VaccineRecord | undefined || null;
}

export function listVaccineRecords(includeDeleted = false): VaccineRecord[] {
  const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
  return db.prepare(`SELECT ${vaccineColumns} FROM vaccine_records ${where} ORDER BY COALESCE(administered_on, planned_on) DESC, updated_at DESC`).all() as VaccineRecord[];
}

export class DuplicateVaccineRecordError extends Error {
  existing: VaccineRecord;
  constructor(existing: VaccineRecord) { super('这针疫苗已经记录'); this.existing = existing; }
}

export function saveVaccineRecord(record: VaccineRecord): VaccineRecord {
  const storedRecord = { appointmentOn: null, appointmentTime: null, ...record };
  const existing = getVaccineRecord(record.id);
  const duplicate = db.prepare(`SELECT ${vaccineColumns} FROM vaccine_records WHERE vaccine_name = ? AND dose = ? AND deleted_at IS NULL AND id <> ? LIMIT 1`)
    .get(record.vaccineName, record.dose, record.id) as VaccineRecord | undefined;
  if (duplicate) throw new DuplicateVaccineRecordError(duplicate);
  if (existing?.deletedAt) throw new RecordNotFoundError('疫苗记录已经删除');
  if (existing) db.prepare(`UPDATE vaccine_records SET vaccine_name=@vaccineName, category=@category, dose=@dose, planned_on=@plannedOn,
    appointment_on=@appointmentOn, appointment_time=@appointmentTime, administered_on=@administeredOn, note=@note, updated_at=@updatedAt, updated_by=@updatedBy WHERE id=@id AND deleted_at IS NULL`).run(storedRecord);
  else db.prepare(`INSERT INTO vaccine_records (id, vaccine_name, category, dose, planned_on, appointment_on, appointment_time, administered_on, note, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
    VALUES (@id, @vaccineName, @category, @dose, @plannedOn, @appointmentOn, @appointmentTime, @administeredOn, @note, @createdAt, @updatedAt, @createdBy, @updatedBy, NULL, NULL)`).run(storedRecord);
  return getVaccineRecord(record.id)!;
}

export function removeVaccineRecord(id: string, actor: AuditIdentity): VaccineRecord | null {
  const existing = getVaccineRecord(id);
  if (!existing || existing.deletedAt) return null;
  const now = new Date().toISOString();
  db.prepare('UPDATE vaccine_records SET deleted_at = ?, deleted_by = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(now, actor, now, actor, id);
  return getVaccineRecord(id);
}

export function restoreVaccineRecord(id: string, actor: AuditIdentity): VaccineRecord {
  const existing = getVaccineRecord(id);
  if (!existing) throw new RecordNotFoundError('疫苗记录不存在');
  const duplicate = db.prepare(`SELECT ${vaccineColumns} FROM vaccine_records WHERE vaccine_name = ? AND dose = ? AND deleted_at IS NULL AND id <> ? LIMIT 1`)
    .get(existing.vaccineName, existing.dose, id) as VaccineRecord | undefined;
  if (duplicate) throw new DuplicateVaccineRecordError(duplicate);
  const now = new Date().toISOString();
  db.prepare('UPDATE vaccine_records SET deleted_at = NULL, deleted_by = NULL, updated_at = ?, updated_by = ? WHERE id = ?').run(now, actor, id);
  return getVaccineRecord(id)!;
}

const vaccineCatalogColumns = `id, name, category, short_name AS shortName, description, dose_count AS doseCount, interval_summary AS intervalSummary, active, sort_order AS sortOrder, is_system AS isSystem`;
type VaccineCatalogRow = Omit<VaccineCatalogItem, 'active'> & { active: number };
function mapVaccineCatalog(item: VaccineCatalogRow): VaccineCatalogItem { return { ...item, active: Boolean(item.active), isSystem: Boolean(item.isSystem) }; }
export function listVaccineCatalog(includeInactive = false): VaccineCatalogItem[] {
  const where = includeInactive ? 'WHERE deleted_at IS NULL' : 'WHERE active = 1 AND deleted_at IS NULL';
  return (db.prepare(`SELECT ${vaccineCatalogColumns} FROM vaccine_catalog ${where} ORDER BY sort_order, name`).all() as VaccineCatalogRow[]).map(mapVaccineCatalog);
}
export function setVaccineCatalogActive(id: string, active: boolean): VaccineCatalogItem {
  if (!db.prepare('UPDATE vaccine_catalog SET active = ? WHERE id = ? AND deleted_at IS NULL').run(active ? 1 : 0, id).changes) throw new RecordNotFoundError('疫苗不存在');
  return mapVaccineCatalog(db.prepare(`SELECT ${vaccineCatalogColumns} FROM vaccine_catalog WHERE id = ?`).get(id) as VaccineCatalogRow);
}
export function saveVaccineCatalogItem(item: VaccineCatalogItem): VaccineCatalogItem {
  const existingById = db.prepare(`SELECT ${vaccineCatalogColumns} FROM vaccine_catalog WHERE id = ?`).get(item.id) as VaccineCatalogRow | undefined;
  if (existingById?.isSystem) throw new VaccineCatalogConflictError('系统默认疫苗只能修改启用状态');
  const existingByName = db.prepare('SELECT id, deleted_at AS deletedAt FROM vaccine_catalog WHERE name = ?').get(item.name) as { id: string; deletedAt: string | null } | undefined;
  if (existingByName && !existingByName.deletedAt && existingByName.id !== item.id) throw new VaccineCatalogConflictError('已经存在同名疫苗');
  if (existingById) {
    try {
      db.prepare(`UPDATE vaccine_catalog SET name = @name, category = @category, short_name = @shortName, description = @description,
        dose_count = @doseCount, interval_summary = @intervalSummary, active = @active, sort_order = @sortOrder, is_system = 0, deleted_at = NULL WHERE id = @id`)
        .run({ ...item, active: item.active ? 1 : 0 });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) throw new VaccineCatalogConflictError('已经存在同名疫苗');
      throw error;
    }
  } else if (existingByName?.deletedAt) {
    db.prepare(`UPDATE vaccine_catalog SET category = @category, short_name = @shortName, description = @description,
      dose_count = @doseCount, interval_summary = @intervalSummary, active = @active, sort_order = @sortOrder, is_system = 0, deleted_at = NULL WHERE id = @existingId`)
      .run({ ...item, existingId: existingByName.id, active: item.active ? 1 : 0 });
    item = { ...item, id: existingByName.id };
  } else {
    db.prepare(`INSERT INTO vaccine_catalog (id, name, category, short_name, description, dose_count, interval_summary, active, sort_order, is_system, deleted_at)
      VALUES (@id, @name, @category, @shortName, @description, @doseCount, @intervalSummary, @active, @sortOrder, 0, NULL)`)
      .run({ ...item, active: item.active ? 1 : 0 });
  }
  return mapVaccineCatalog(db.prepare(`SELECT ${vaccineCatalogColumns} FROM vaccine_catalog WHERE id = ? AND deleted_at IS NULL`).get(item.id) as VaccineCatalogRow);
}
export function removeVaccineCatalogItem(id: string): boolean {
  return Boolean(db.prepare("UPDATE vaccine_catalog SET active = 0, deleted_at = datetime('now') WHERE id = ? AND is_system = 0 AND deleted_at IS NULL").run(id).changes);
}
export function reorderVaccineCatalog(ids: string[]): VaccineCatalogItem[] {
  const all = listVaccineCatalog(true);
  if (ids.length !== all.length || ids.some(id => !all.some(item => item.id === id))) throw new Error('疫苗顺序不完整');
  if (all.some(item => item.isSystem)) throw new Error('系统默认疫苗不可调整顺序');
  const update = db.prepare('UPDATE vaccine_catalog SET sort_order = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, index) => update.run((index + 1) * 10, id)))();
  return listVaccineCatalog(true);
}

export interface AiSettings {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  updatedAt: string;
}

export function getAiSettings(): AiSettings {
  return db.prepare('SELECT provider, base_url AS baseUrl, model, api_key AS apiKey, updated_at AS updatedAt FROM ai_settings WHERE id = 1').get() as AiSettings;
}

export function saveAiSettings(input: Pick<AiSettings, 'baseUrl' | 'model'> & { apiKey?: string }): AiSettings {
  const current = getAiSettings();
  const updatedAt = new Date().toISOString();
  const apiKey = input.apiKey === undefined ? current.apiKey : input.apiKey.trim();
  db.prepare('UPDATE ai_settings SET provider = ?, base_url = ?, model = ?, api_key = ?, updated_at = ? WHERE id = 1')
    .run('DeepSeek', input.baseUrl, input.model, apiKey, updatedAt);
  return getAiSettings();
}

export interface DailyReport {
  reportDate: string;
  summary: string;
  suggestions: string[];
  model: string;
  generatedAt: string;
}

export function getDailyReport(date: string): DailyReport | null {
  const row = db.prepare('SELECT report_date AS reportDate, summary, suggestions, model, generated_at AS generatedAt FROM daily_reports WHERE report_date = ?').get(date) as { reportDate: string; summary: string; suggestions: string; model: string; generatedAt: string } | undefined;
  if (!row) return null;
  return { ...row, suggestions: JSON.parse(row.suggestions) as string[] };
}

export function saveDailyReport(report: DailyReport): DailyReport {
  db.prepare('INSERT INTO daily_reports (report_date, summary, suggestions, model, generated_at) VALUES (@reportDate, @summary, @suggestions, @model, @generatedAt) ON CONFLICT(report_date) DO UPDATE SET summary=excluded.summary, suggestions=excluded.suggestions, model=excluded.model, generated_at=excluded.generated_at')
    .run({ ...report, suggestions: JSON.stringify(report.suggestions) });
  return report;
}

export function listDailyReports(): DailyReport[] {
  const rows = db.prepare('SELECT report_date AS reportDate, summary, suggestions, model, generated_at AS generatedAt FROM daily_reports ORDER BY report_date DESC').all() as (Omit<DailyReport, 'suggestions'> & { suggestions: string })[];
  return rows.map(row => ({ ...row, suggestions: JSON.parse(row.suggestions) as string[] }));
}

type ImportPayload = { profile?: { name: string; birthDate: string; sex?: BabySex }; records: CareRecord[]; audits?: AuditEntry[]; careItems?: CareItem[]; familyMembers?: FamilyMemberPermission[]; growthRecords?: GrowthRecord[]; vaccineRecords?: VaccineRecord[]; vaccineCatalog?: VaccineCatalogItem[]; dailyReports?: DailyReport[] };
type ImportResult = { imported: number; profileRestored: boolean };
const importBackupTransaction = db.transaction((payload: ImportPayload): ImportResult => {
  if (payload.profile) saveProfile(payload.profile.name, payload.profile.birthDate, payload.profile.sex);
  if (payload.careItems?.length) for (const item of payload.careItems) {
    db.prepare(`INSERT INTO care_items (id, name, icon, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, icon=excluded.icon, sort_order=excluded.sort_order, active=excluded.active, updated_at=excluded.updated_at`)
      .run(item.id, item.name, item.icon, item.sortOrder, item.active ? 1 : 0, item.createdAt, item.updatedAt);
  }
  if (payload.familyMembers?.length) replaceFamilyRoles(payload.familyMembers);
  if (payload.growthRecords?.length) {
    const upsertGrowth = db.prepare(`INSERT INTO growth_records (id, measured_on, height_cm, weight_kg, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
      VALUES (@id, @measuredOn, @heightCm, @weightKg, @createdAt, @updatedAt, @createdBy, @updatedBy, @deletedAt, @deletedBy)
      ON CONFLICT(id) DO UPDATE SET measured_on=excluded.measured_on, height_cm=excluded.height_cm, weight_kg=excluded.weight_kg,
        updated_at=excluded.updated_at, updated_by=excluded.updated_by, deleted_at=excluded.deleted_at, deleted_by=excluded.deleted_by`);
    for (const record of payload.growthRecords) upsertGrowth.run(record);
  }
  if (payload.vaccineRecords?.length) {
    const upsertVaccine = db.prepare(`INSERT INTO vaccine_records (id, vaccine_name, category, dose, planned_on, appointment_on, appointment_time, administered_on, note, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
      VALUES (@id, @vaccineName, @category, @dose, @plannedOn, @appointmentOn, @appointmentTime, @administeredOn, @note, @createdAt, @updatedAt, @createdBy, @updatedBy, @deletedAt, @deletedBy)
      ON CONFLICT(id) DO UPDATE SET vaccine_name=excluded.vaccine_name, category=excluded.category, dose=excluded.dose, planned_on=excluded.planned_on,
        appointment_on=excluded.appointment_on, appointment_time=excluded.appointment_time, administered_on=excluded.administered_on, note=excluded.note, updated_at=excluded.updated_at, updated_by=excluded.updated_by,
        deleted_at=excluded.deleted_at, deleted_by=excluded.deleted_by`);
    for (const record of payload.vaccineRecords) upsertVaccine.run({ appointmentOn: null, appointmentTime: null, ...record });
  }
  if (payload.vaccineCatalog?.length) {
    const upsertCatalog = db.prepare(`INSERT INTO vaccine_catalog (id, name, category, short_name, description, dose_count, interval_summary, active, sort_order, is_system) VALUES (@id, @name, @category, @shortName, @description, @doseCount, @intervalSummary, @active, @sortOrder, @isSystem) ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, short_name=excluded.short_name, description=excluded.description, dose_count=excluded.dose_count, interval_summary=excluded.interval_summary, active=excluded.active, sort_order=excluded.sort_order, is_system=excluded.is_system`);
    for (const item of payload.vaccineCatalog) upsertCatalog.run({ ...item, active: item.active ? 1 : 0, isSystem: systemVaccineIds.has(item.id) ? 1 : 0 });
  }
  if (payload.dailyReports?.length) {
    const upsertReport = db.prepare('INSERT INTO daily_reports (report_date, summary, suggestions, model, generated_at) VALUES (@reportDate, @summary, @suggestions, @model, @generatedAt) ON CONFLICT(report_date) DO UPDATE SET summary=excluded.summary, suggestions=excluded.suggestions, model=excluded.model, generated_at=excluded.generated_at');
    for (const report of payload.dailyReports) upsertReport.run({ ...report, suggestions: JSON.stringify(report.suggestions) });
  }
  const upsert = db.prepare(`
    INSERT INTO care_records (id, type, occurred_at, breast_milk_ml, formula_ml, supplement, bowel_size, note, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
    VALUES (@id, @type, @occurredAt, @breastMilkMl, @formulaMl, @supplement, @bowelSize, @note, @createdAt, @updatedAt, @createdBy, @updatedBy, @deletedAt, @deletedBy)
    ON CONFLICT(id) DO UPDATE SET
      type=excluded.type, occurred_at=excluded.occurred_at, breast_milk_ml=excluded.breast_milk_ml,
      formula_ml=excluded.formula_ml, supplement=excluded.supplement, bowel_size=excluded.bowel_size,
      note=excluded.note, updated_at=excluded.updated_at, updated_by=excluded.updated_by,
      deleted_at=excluded.deleted_at, deleted_by=excluded.deleted_by
  `);
  for (const record of payload.records) upsert.run(record);
  if (payload.audits?.length) {
    const ids = [...new Set(payload.records.map(record => record.id))];
    const removeAudit = db.prepare('DELETE FROM record_audit WHERE record_id = ?');
    for (const id of ids) removeAudit.run(id);
    for (const audit of payload.audits) addAudit(audit.recordId, audit.action, audit.actor, audit.snapshot, audit.occurredAt);
  } else {
    for (const record of payload.records) addAudit(record.id, 'import', record.updatedBy || 'legacy', record);
  }
  syncDefaultVaccineCatalog();
  return { imported: payload.records.length, profileRestored: Boolean(payload.profile) };
});
export function importBackup(payload: ImportPayload): ImportResult { return importBackupTransaction(payload); }

type ReplacePayload = { profile: { name: string; birthDate: string; sex?: BabySex }; records: CareRecord[]; audits?: AuditEntry[]; careItems?: CareItem[]; familyMembers?: FamilyMemberPermission[]; growthRecords?: GrowthRecord[]; vaccineRecords?: VaccineRecord[]; vaccineCatalog?: VaccineCatalogItem[]; dailyReports?: DailyReport[] };
const replaceBackupTransaction = db.transaction((payload: ReplacePayload): ImportResult => {
  db.prepare('DELETE FROM record_audit').run();
  db.prepare('DELETE FROM care_records').run();
  saveProfile(payload.profile.name, payload.profile.birthDate, payload.profile.sex);
  if (payload.careItems?.length) {
    db.prepare('DELETE FROM care_items').run();
    const insertItem = db.prepare('INSERT INTO care_items (id, name, icon, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const item of payload.careItems) insertItem.run(item.id, item.name, item.icon, item.sortOrder, item.active ? 1 : 0, item.createdAt, item.updatedAt);
  }
  if (payload.familyMembers?.length) replaceFamilyRoles(payload.familyMembers);
  db.prepare('DELETE FROM growth_records').run();
  if (payload.growthRecords?.length) {
    const insertGrowth = db.prepare(`INSERT INTO growth_records (id, measured_on, height_cm, weight_kg, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
      VALUES (@id, @measuredOn, @heightCm, @weightKg, @createdAt, @updatedAt, @createdBy, @updatedBy, @deletedAt, @deletedBy)`);
    for (const record of payload.growthRecords) insertGrowth.run(record);
  }
  db.prepare('DELETE FROM vaccine_records').run();
  if (payload.vaccineRecords?.length) {
    const insertVaccine = db.prepare(`INSERT INTO vaccine_records (id, vaccine_name, category, dose, planned_on, appointment_on, appointment_time, administered_on, note, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
      VALUES (@id, @vaccineName, @category, @dose, @plannedOn, @appointmentOn, @appointmentTime, @administeredOn, @note, @createdAt, @updatedAt, @createdBy, @updatedBy, @deletedAt, @deletedBy)`);
    for (const record of payload.vaccineRecords) insertVaccine.run({ appointmentOn: null, appointmentTime: null, ...record });
  }
  if (payload.vaccineCatalog?.length) {
    db.prepare('DELETE FROM vaccine_catalog').run();
    const insertCatalog = db.prepare(`INSERT INTO vaccine_catalog (id, name, category, short_name, description, dose_count, interval_summary, active, sort_order, is_system) VALUES (@id, @name, @category, @shortName, @description, @doseCount, @intervalSummary, @active, @sortOrder, @isSystem)`);
    for (const item of payload.vaccineCatalog) insertCatalog.run({ ...item, active: item.active ? 1 : 0, isSystem: systemVaccineIds.has(item.id) ? 1 : 0 });
  }
  db.prepare('DELETE FROM daily_reports').run();
  if (payload.dailyReports?.length) {
    const insertReport = db.prepare('INSERT INTO daily_reports (report_date, summary, suggestions, model, generated_at) VALUES (@reportDate, @summary, @suggestions, @model, @generatedAt)');
    for (const report of payload.dailyReports) insertReport.run({ ...report, suggestions: JSON.stringify(report.suggestions) });
  }
  const insertRecord = db.prepare(`
    INSERT INTO care_records (id, type, occurred_at, breast_milk_ml, formula_ml, supplement, bowel_size, note, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
    VALUES (@id, @type, @occurredAt, @breastMilkMl, @formulaMl, @supplement, @bowelSize, @note, @createdAt, @updatedAt, @createdBy, @updatedBy, @deletedAt, @deletedBy)
  `);
  for (const record of payload.records) insertRecord.run(record);
  if (payload.audits?.length) {
    const insertAudit = db.prepare('INSERT INTO record_audit (id, record_id, action, actor, occurred_at, snapshot) VALUES (@id, @recordId, @action, @actor, @occurredAt, @snapshot)');
    for (const audit of payload.audits) insertAudit.run({ ...audit, snapshot: audit.snapshot ? JSON.stringify(audit.snapshot) : null });
  } else {
    for (const record of payload.records) addAudit(record.id, 'import', record.updatedBy || 'legacy', record);
  }
  syncDefaultVaccineCatalog();
  return { imported: payload.records.length, profileRestored: true };
});
export function replaceBackup(payload: ReplacePayload): ImportResult { return replaceBackupTransaction(payload); }

export function closeDatabaseForTests() { db.close(); }
