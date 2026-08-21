import { db } from './connection.js';
import type { AuditIdentity, GrowthGuideEntry, GrowthGuideEntryKind, GrowthGuideEntryState } from '../types.js';

const columns = `item_key AS itemKey, kind, state, completed_at AS completedAt, created_at AS createdAt, updated_at AS updatedAt, created_by AS createdBy, updated_by AS updatedBy`;

export function listGrowthGuideEntries(): GrowthGuideEntry[] {
  return db.prepare(`SELECT ${columns} FROM growth_guide_entries ORDER BY COALESCE(completed_at, updated_at) DESC`).all() as GrowthGuideEntry[];
}

export function saveGrowthGuideEntry(input: {
  itemKey: string;
  kind: GrowthGuideEntryKind;
  state: GrowthGuideEntryState;
  completedAt?: string | null;
}, actor: AuditIdentity): GrowthGuideEntry {
  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT ${columns} FROM growth_guide_entries WHERE item_key = ?`).get(input.itemKey) as GrowthGuideEntry | undefined;
  const completedAt = input.completedAt === undefined ? now : input.completedAt;
  db.prepare(`INSERT INTO growth_guide_entries (item_key, kind, state, completed_at, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_key) DO UPDATE SET kind=excluded.kind, state=excluded.state, completed_at=excluded.completed_at, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
    .run(input.itemKey, input.kind, input.state, completedAt, existing?.createdAt || now, now, existing?.createdBy || actor, actor);
  return db.prepare(`SELECT ${columns} FROM growth_guide_entries WHERE item_key = ?`).get(input.itemKey) as GrowthGuideEntry;
}

export function removeGrowthGuideEntry(itemKey: string): boolean {
  return db.prepare('DELETE FROM growth_guide_entries WHERE item_key = ?').run(itemKey).changes > 0;
}
