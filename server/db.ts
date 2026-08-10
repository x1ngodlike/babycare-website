import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AuditAction, AuditEntry, AuditIdentity, CareRecord } from './types.js';

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

const recordColumns = db.prepare('PRAGMA table_info(care_records)').all() as { name: string }[];
if (!recordColumns.some(column => column.name === 'created_by')) db.exec("ALTER TABLE care_records ADD COLUMN created_by TEXT NOT NULL DEFAULT 'legacy'");
if (!recordColumns.some(column => column.name === 'updated_by')) db.exec("ALTER TABLE care_records ADD COLUMN updated_by TEXT NOT NULL DEFAULT 'legacy'");
if (!recordColumns.some(column => column.name === 'deleted_at')) db.exec('ALTER TABLE care_records ADD COLUMN deleted_at TEXT');
if (!recordColumns.some(column => column.name === 'deleted_by')) db.exec('ALTER TABLE care_records ADD COLUMN deleted_by TEXT');

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

export function listAudit(recordId: string): AuditEntry[] {
  const rows = db.prepare(`SELECT id, record_id AS recordId, action, actor, occurred_at AS occurredAt, snapshot FROM record_audit WHERE record_id = ? ORDER BY occurred_at DESC, id DESC`).all(recordId) as (Omit<AuditEntry, 'snapshot'> & { snapshot: string | null })[];
  return rows.map(row => ({ ...row, snapshot: row.snapshot ? JSON.parse(row.snapshot) as CareRecord : null }));
}

export function allAudit(): AuditEntry[] {
  const rows = db.prepare(`SELECT id, record_id AS recordId, action, actor, occurred_at AS occurredAt, snapshot FROM record_audit ORDER BY occurred_at ASC, id ASC`).all() as (Omit<AuditEntry, 'snapshot'> & { snapshot: string | null })[];
  return rows.map(row => ({ ...row, snapshot: row.snapshot ? JSON.parse(row.snapshot) as CareRecord : null }));
}

export function getProfile() {
  return db.prepare('SELECT name, birth_date AS birthDate, updated_at AS updatedAt FROM profile WHERE id = 1').get() as { name: string; birthDate: string; updatedAt: string };
}

export function saveProfile(name: string, birthDate: string) {
  const updatedAt = new Date().toISOString();
  db.prepare('UPDATE profile SET name = ?, birth_date = ?, updated_at = ? WHERE id = 1').run(name, birthDate, updatedAt);
  return { name, birthDate, updatedAt };
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

type ImportPayload = { profile?: { name: string; birthDate: string }; records: CareRecord[]; audits?: AuditEntry[] };
type ImportResult = { imported: number; profileRestored: boolean };
const importBackupTransaction = db.transaction((payload: ImportPayload): ImportResult => {
  if (payload.profile) saveProfile(payload.profile.name, payload.profile.birthDate);
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
  return { imported: payload.records.length, profileRestored: Boolean(payload.profile) };
});
export function importBackup(payload: ImportPayload): ImportResult { return importBackupTransaction(payload); }

type ReplacePayload = { profile: { name: string; birthDate: string }; records: CareRecord[]; audits?: AuditEntry[] };
const replaceBackupTransaction = db.transaction((payload: ReplacePayload): ImportResult => {
  db.prepare('DELETE FROM record_audit').run();
  db.prepare('DELETE FROM care_records').run();
  saveProfile(payload.profile.name, payload.profile.birthDate);
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
  return { imported: payload.records.length, profileRestored: true };
});
export function replaceBackup(payload: ReplacePayload): ImportResult { return replaceBackupTransaction(payload); }

export function closeDatabaseForTests() { db.close(); }
