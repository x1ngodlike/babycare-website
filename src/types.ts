export type RecordType = 'feeding' | 'supplement' | 'bowel' | 'note';
export type Supplement = string;
export type BowelSize = '大' | '中' | '小';
export type FamilyId = 'father' | 'mother' | 'grandfather' | 'grandmother';
export type UserRole = 'superadmin' | 'admin' | 'member';
export type AuditIdentity = FamilyId | 'legacy';
export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'import';
export interface SessionUser { id: FamilyId; name: string; role: UserRole }
export interface FamilyMemberPermission { id: FamilyId; name: string; role: UserRole }
export interface Capabilities {
  aiTranscription: boolean;
  transcribeModel: string | null;
  aiInterpretation: boolean;
  interpretationModel: string | null;
}
export interface AiSettingsPublic {
  provider: string;
  baseUrl: string;
  model: string;
  configured: boolean;
  keyHint: string;
  updatedAt: string;
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

export interface Profile { name: string; birthDate: string; updatedAt?: string }
export interface ServerBackupStatus { directory: string; intervalHours: number; retention: number; count: number; lastBackupAt: string | null; nextBackupAt: string }
export interface ServerBackupFile { name: string; createdAt: string; size: number }
export interface CareItem { id: string; name: string; icon: 'medicine' | 'massage'; sortOrder: number; active: boolean; createdAt: string; updatedAt: string }
export interface DraftRecord {
  id?: string;
  type: RecordType;
  occurredAt: string;
  breastMilkMl?: number | null;
  formulaMl?: number | null;
  supplement?: Supplement | null;
  bowelSize?: BowelSize | null;
  note?: string | null;
}
