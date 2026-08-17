export type RecordType = 'feeding' | 'supplement' | 'bowel' | 'note';
export type Supplement = string;
export type BowelSize = '大' | '中' | '小';
export type AuditIdentity = 'father' | 'mother' | 'grandfather' | 'grandmother' | 'legacy';
export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'import';
export type FamilyId = 'father' | 'mother' | 'grandfather' | 'grandmother';
export type UserRole = 'superadmin' | 'admin' | 'member';
export type BabySex = 'male' | 'female' | 'unspecified';

export interface FamilyMemberPermission {
  id: FamilyId;
  name: string;
  role: UserRole;
}

export interface GrowthRecord {
  id: string;
  measuredOn: string;
  heightCm: number;
  weightKg: number;
  createdAt: string;
  updatedAt: string;
  createdBy: AuditIdentity;
  updatedBy: AuditIdentity;
  deletedAt: string | null;
  deletedBy: AuditIdentity | null;
  evaluation: string | null;
  evaluatedAt: string | null;
}

export interface VaccineRecord {
  id: string;
  vaccineName: string;
  category: 'program' | 'self_paid';
  dose: number;
  plannedOn: string;
  appointmentOn?: string | null;
  appointmentTime?: string | null;
  administeredOn: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: AuditIdentity;
  updatedBy: AuditIdentity;
  deletedAt: string | null;
  deletedBy: AuditIdentity | null;
}

export interface VaccineCatalogItem {
  id: string;
  name: string;
  category: 'program' | 'self_paid';
  shortName: string | null;
  description: string;
  doseCount: number | null;
  intervalSummary: string;
  active: boolean;
  sortOrder: number;
  isSystem: boolean;
}

export interface CareRecord {
  id: string;
  type: RecordType;
  occurredAt: string;
  breastMilkMl: number | null;
  formulaMl: number | null;
  supplement: Supplement | null;
  bowelSize: BowelSize | null;
  subject: string | null;
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
  subject?: string | null;
  note?: string | null;
}

export interface CareItem {
  id: string;
  name: string;
  category: 'medication' | 'care';
  icon: 'medicine' | 'massage' | 'bath' | 'care';
  sortOrder: number;
  active: boolean;
  scheduleType: 'daily' | 'interval' | 'weekly' | 'pattern' | 'as_needed';
  intervalDays: number;
  scheduleStartDate: string | null;
  reminderTime: string | null;
  reminderTimes: string[] | null;
  scheduleEndDate: string | null;
  weekDays: number[] | null;
  patternDays: boolean[] | null;
  courseDays: number | null;
  courseStartDate: string | null;
  createdAt: string;
  updatedAt: string;
}
