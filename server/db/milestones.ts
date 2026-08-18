import { db } from './connection.js';
import { RecordNotFoundError } from './errors.js';
import type { AuditIdentity, MilestoneRecord } from '../types.js';

const milestoneColumns = `id, milestone_key AS milestoneKey, category, achieved_on AS achievedOn, note, photo, created_at AS createdAt, updated_at AS updatedAt, created_by AS createdBy, updated_by AS updatedBy, deleted_at AS deletedAt, deleted_by AS deletedBy`;

function getMilestoneRecord(id: string): MilestoneRecord | null {
  return db.prepare(`SELECT ${milestoneColumns} FROM milestones WHERE id = ?`).get(id) as MilestoneRecord | undefined || null;
}

export function listMilestoneRecords(includeDeleted = false): MilestoneRecord[] {
  const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
  return db.prepare(`SELECT ${milestoneColumns} FROM milestones ${where} ORDER BY achieved_on DESC, updated_at DESC`).all() as MilestoneRecord[];
}

export function saveMilestoneRecord(record: MilestoneRecord): MilestoneRecord {
  const existing = getMilestoneRecord(record.id);
  if (existing?.deletedAt) throw new RecordNotFoundError('里程碑记录已删除');
  if (existing) {
    db.prepare(`UPDATE milestones SET milestone_key = ?, category = ?, achieved_on = ?, note = ?, photo = ?, updated_at = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(record.milestoneKey, record.category, record.achievedOn, record.note, record.photo, record.updatedAt, record.updatedBy, record.id);
  } else {
    db.prepare(`INSERT INTO milestones (id, milestone_key, category, achieved_on, note, photo, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
      .run(record.id, record.milestoneKey, record.category, record.achievedOn, record.note, record.photo, record.createdAt, record.updatedAt, record.createdBy, record.updatedBy);
  }
  return getMilestoneRecord(record.id)!;
}

export function removeMilestoneRecord(id: string, actor: AuditIdentity): MilestoneRecord | null {
  const now = new Date().toISOString();
  const result = db.prepare('UPDATE milestones SET deleted_at = ?, deleted_by = ?, updated_at = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL').run(now, actor, now, actor, id);
  return result.changes ? getMilestoneRecord(id) : null;
}

export function restoreMilestoneRecord(id: string, actor: AuditIdentity): MilestoneRecord {
  const existing = getMilestoneRecord(id);
  if (!existing?.deletedAt) throw new RecordNotFoundError('已删除的里程碑记录不存在');
  const now = new Date().toISOString();
  db.prepare('UPDATE milestones SET deleted_at = NULL, deleted_by = NULL, updated_at = ?, updated_by = ? WHERE id = ?').run(now, actor, id);
  return getMilestoneRecord(id)!;
}

export function purgeMilestoneRecord(id: string): boolean {
  return db.prepare('DELETE FROM milestones WHERE id = ? AND deleted_at IS NOT NULL').run(id).changes > 0;
}
