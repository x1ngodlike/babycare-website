import { db } from './connection.js';
import { DuplicateGrowthDayError, RecordNotFoundError } from './errors.js';
import type { AuditIdentity, GrowthRecord } from '../types.js';

const growthColumns = `id, measured_on AS measuredOn, height_cm AS heightCm, weight_kg AS weightKg,
  created_at AS createdAt, updated_at AS updatedAt, created_by AS createdBy, updated_by AS updatedBy,
  deleted_at AS deletedAt, deleted_by AS deletedBy, evaluation, evaluated_at AS evaluatedAt`;
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

export function saveGrowthEvaluation(id: string, evaluation: string): GrowthRecord | null {
  const now = new Date().toISOString();
  const result = db.prepare('UPDATE growth_records SET evaluation = ?, evaluated_at = ? WHERE id = ? AND deleted_at IS NULL').run(evaluation, now, id);
  return result.changes ? getGrowthRecord(id) : null;
}
