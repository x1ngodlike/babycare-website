export type RecordType = 'feeding' | 'supplement' | 'bowel' | 'note';
export type Supplement = string;
export type BowelSize = '大' | '中' | '小';
export type AuditIdentity = 'father' | 'mother' | 'grandfather' | 'grandmother' | 'legacy';
export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'import';
export type FamilyId = 'father' | 'mother' | 'grandfather' | 'grandmother';
export type UserRole = 'superadmin' | 'admin' | 'member';

export interface FamilyMemberPermission {
  id: FamilyId;
  name: string;
  role: UserRole;
}

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

export interface CareItem {
  id: string;
  name: string;
  icon: 'medicine' | 'massage';
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
