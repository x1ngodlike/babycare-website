export type RecordType = 'feeding' | 'supplement' | 'bowel' | 'note';
export type Supplement = 'AD' | 'VD' | '益生菌';
export type BowelSize = '大' | '中' | '小';
export type AuditIdentity = 'father' | 'mother' | 'grandfather' | 'grandmother' | 'legacy';
export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'import';

export interface CareRecord {
  id: string;
  type: RecordType;
  occurredAt: string;
  breastMilkMl: number | null;
  formulaMl: number | null;
  supplement: Supplement | null;
  bowelSize: BowelSize | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: AuditIdentity;
  updatedBy: AuditIdentity;
  deletedAt: string | null;
  deletedBy: AuditIdentity | null;
}

export interface AuditEntry {
  id: number;
  recordId: string;
  action: AuditAction;
  actor: AuditIdentity;
  occurredAt: string;
  snapshot: CareRecord | null;
}

export interface DraftRecord {
  type: RecordType;
  occurredAt: string;
  breastMilkMl?: number | null;
  formulaMl?: number | null;
  supplement?: Supplement | null;
  bowelSize?: BowelSize | null;
  note?: string | null;
}
