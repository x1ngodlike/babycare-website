export type RecordType = 'feeding' | 'supplement' | 'bowel' | 'note';
export type Supplement = string;
export type BowelSize = '大' | '中' | '小';
export type FamilyId = 'father' | 'mother' | 'grandfather' | 'grandmother';
export type UserRole = 'superadmin' | 'admin' | 'member';
export type BabySex = 'male' | 'female' | 'unspecified';
export type AuditIdentity = FamilyId | 'legacy';
export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'import';
export interface SessionUser { id: FamilyId; name: string; role: UserRole }
export interface FamilyMemberPermission { id: FamilyId; name: string; role: UserRole }
export interface GrowthRecord { id: string; measuredOn: string; heightCm: number; weightKg: number; createdAt: string; updatedAt: string; createdBy: AuditIdentity; updatedBy: AuditIdentity; deletedAt: string | null; deletedBy: AuditIdentity | null }
export interface DraftGrowthRecord { id?: string; measuredOn: string; heightCm: number; weightKg: number }
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
export interface DraftVaccineRecord { id?: string; vaccineName: string; category: 'program' | 'self_paid'; dose: number; plannedOn: string; appointmentOn?: string | null; appointmentTime?: string | null; administeredOn: string | null; note?: string | null }
export interface VaccineCatalogItem { id: string; name: string; category: 'program' | 'self_paid'; shortName: string | null; description: string; doseCount: number | null; intervalSummary: string; active: boolean; sortOrder: number; isSystem: boolean }
export type DraftVaccineCatalogItem = Pick<VaccineCatalogItem, 'name' | 'category' | 'shortName' | 'description' | 'doseCount' | 'intervalSummary'>;
export interface Capabilities {
  aiEnabled: boolean;
  aiModel: string | null;
}
export type FeedingGapLevel = 'none' | 'level1' | 'level2';
export interface PushStatus {
  enabled: boolean;
  pushplusConfigured: boolean;
  pushplusTokenMasked: string;
  pushplusTopic: string;
  schedulerRunning: boolean;
  lastCheckAt: string | null;
  todayPushedItems: number;
  updatedAt: string | null;

  morningDigestEnabled: boolean;
  morningDigestTime: string;
  morningDigestTodaySent: boolean;
  feedingGapEnabled: boolean;
  feedingGapLevel1Minutes: number;
  feedingGapLevel2Minutes: number;
  careItemEnabled: boolean;
  currentFeedingGapMinutes: number | null;
  feedingGapLevel: FeedingGapLevel;
  lastFeedAt: string | null;
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

export interface Profile { name: string; birthDate: string; birthTime?: string; sex: BabySex; nickname: string; caregiverTitle: string; avatar: string | null; updatedAt?: string }
export interface ServerBackupStatus { directory: string; intervalHours: number; retention: number; count: number; lastBackupAt: string | null; nextBackupAt: string }
export interface ServerBackupFile { name: string; createdAt: string; size: number }
export type CareScheduleType = 'daily' | 'interval' | 'as_needed';
export type CareItemCategory = 'medication' | 'care';
export type CareItemIcon = 'medicine' | 'massage' | 'bath' | 'care';
export interface CareItem {
  id: string;
  name: string;
  category: CareItemCategory;
  icon: CareItemIcon;
  sortOrder: number;
  active: boolean;
  scheduleType: CareScheduleType;
  intervalDays: number;
  scheduleStartDate: string | null;
  reminderTime: string | null;
  scheduleEndDate: string | null;
  createdAt: string;
  updatedAt: string;
}
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
