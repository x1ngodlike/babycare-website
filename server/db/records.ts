import { db } from './connection.js';
import { canonicalInstant } from '../shanghai-date.js';
import { dateStringInTimeZone } from '../../shared/date.js';
import { DuplicateSupplementError, CareItemInactiveError, RecordNotFoundError } from './errors.js';
import { invalidateDailyReports } from './daily-reports.js';
import type { AuditAction, AuditChange, AuditEntry, AuditIdentity, CareRecord } from '../types.js';

const columns = `
  id, type, occurred_at AS occurredAt, breast_milk_ml AS breastMilkMl,
  formula_ml AS formulaMl, supplement, bowel_size AS bowelSize, subject, note,
  created_at AS createdAt, updated_at AS updatedAt, created_by AS createdBy, updated_by AS updatedBy,
  deleted_at AS deletedAt, deleted_by AS deletedBy
`;

function getRecord(id: string): CareRecord | null {
  return db.prepare(`SELECT ${columns} FROM care_records WHERE id = ?`).get(id) as CareRecord | undefined || null;
}

export function addAudit(recordId: string, action: AuditAction, actor: AuditIdentity, snapshot: CareRecord | null, occurredAt = new Date().toISOString(), changes: AuditChange[] | null = null) {
  db.prepare('INSERT INTO record_audit (record_id, action, actor, occurred_at, snapshot, changes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(recordId, action, actor, occurredAt, snapshot ? JSON.stringify(snapshot) : null, changes ? JSON.stringify(changes) : null);
}

const AUDIT_COMPARE_FIELDS: (keyof CareRecord)[] = ['type', 'occurredAt', 'breastMilkMl', 'formulaMl', 'supplement', 'bowelSize', 'subject', 'note'];

function computeChanges(oldRecord: CareRecord | null | undefined, newRecord: CareRecord): AuditChange[] {
  if (!oldRecord) return [];
  const changes: AuditChange[] = [];
  for (const field of AUDIT_COMPARE_FIELDS) {
    const oldVal = oldRecord[field];
    const newVal = newRecord[field];
    if (oldVal !== newVal) {
      changes.push({ field: field as string, old: oldVal, new: newVal });
    }
  }
  return changes;
}

function ensureNoDuplicateSupplement(record: CareRecord) {
  if (record.type !== 'supplement' || !record.supplement) return;
  const existing = db.prepare(`
    SELECT ${columns} FROM care_records
    WHERE type = 'supplement' AND supplement = ? AND deleted_at IS NULL AND id <> ?
      AND date(occurred_at, '+8 hours') = ?
    LIMIT 1
  `).get(record.supplement, record.id, dateStringInTimeZone(new Date(record.occurredAt))) as CareRecord | undefined;
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
  record = { ...record, occurredAt: canonicalInstant(record.occurredAt) };
  const existing = getRecord(record.id);
  if (existing?.deletedAt) throw new RecordNotFoundError('记录已经删除');
  ensureCareItemAvailable(record, existing);
  ensureNoDuplicateSupplement(record);
  if (existing) {
    db.prepare(`
      UPDATE care_records SET
        type=@type, occurred_at=@occurredAt, breast_milk_ml=@breastMilkMl, formula_ml=@formulaMl,
        supplement=@supplement, bowel_size=@bowelSize, subject=@subject, note=@note, updated_at=@updatedAt, updated_by=@updatedBy
      WHERE id=@id AND deleted_at IS NULL
    `).run(record);
  } else {
    db.prepare(`
      INSERT INTO care_records (id, type, occurred_at, breast_milk_ml, formula_ml, supplement, bowel_size, subject, note, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
      VALUES (@id, @type, @occurredAt, @breastMilkMl, @formulaMl, @supplement, @bowelSize, @subject, @note, @createdAt, @updatedAt, @createdBy, @updatedBy, NULL, NULL)
    `).run(record);
  }
  const saved = getRecord(record.id)!;
  const changes = existing ? computeChanges(existing, saved) : null;
  addAudit(saved.id, existing ? 'update' : 'create', saved.updatedBy, saved, undefined, changes);
  invalidateDailyReports(existing?.occurredAt, saved.occurredAt);
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
  invalidateDailyReports(deleted.occurredAt);
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
  invalidateDailyReports(restored.occurredAt);
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
  const rows = db.prepare(`SELECT id, record_id AS recordId, action, actor, occurred_at AS occurredAt, snapshot, changes FROM record_audit WHERE record_id = ? ORDER BY occurred_at DESC, id DESC`).all(recordId) as (Omit<AuditEntry, 'snapshot' | 'changes'> & { snapshot: string | null; changes: string | null })[];
  return rows.map(row => ({ ...row, snapshot: row.snapshot ? JSON.parse(row.snapshot) as CareRecord : null, changes: row.changes ? JSON.parse(row.changes) as AuditChange[] : null }));
}

export function allAudit(): AuditEntry[] {
  const rows = db.prepare(`SELECT id, record_id AS recordId, action, actor, occurred_at AS occurredAt, snapshot, changes FROM record_audit ORDER BY occurred_at ASC, id ASC`).all() as (Omit<AuditEntry, 'snapshot' | 'changes'> & { snapshot: string | null; changes: string | null })[];
  return rows.map(row => ({ ...row, snapshot: row.snapshot ? JSON.parse(row.snapshot) as CareRecord : null, changes: row.changes ? JSON.parse(row.changes) as AuditChange[] : null }));
}
