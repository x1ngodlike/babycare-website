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
  feedPrepEnabled: boolean;
  feedPrepMinutes: number;
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

export type MilestoneCategory = 'gross_motor' | 'fine_motor' | 'language' | 'cognitive' | 'social';
export interface MilestoneRecord {
  id: string;
  milestoneKey: string;
  category: MilestoneCategory;
  achievedOn: string;
  note: string | null;
  photo: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: AuditIdentity;
  updatedBy: AuditIdentity;
  deletedAt: string | null;
  deletedBy: AuditIdentity | null;
}
export interface DraftMilestoneRecord {
  id?: string;
  milestoneKey: string;
  achievedOn: string;
  note?: string | null;
  photo?: string | null;
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

export interface AuditChange {
  field: string;
  old: unknown;
  new: unknown;
}

export interface AuditEntry {
  id: number;
  recordId: string;
  action: AuditAction;
  actor: AuditIdentity;
  occurredAt: string;
  snapshot: CareRecord | null;
  changes: AuditChange[] | null;
}

export type AiMemoryCategory = 'preferences' | 'health' | 'notes';
export interface AiMemory { id: string; content: string; category: AiMemoryCategory; createdAt: string; updatedAt: string; expiresAt: string | null; status: 'active' | 'resolved'; resolvedAt: string | null }
export interface ChatSession { id: string; userId: FamilyId; title: string | null; createdAt: string; updatedAt: string }
export interface ChatMessage { id: string; sessionId: string; role: 'user' | 'assistant'; content: string; createdAt: string }
export interface ExtractedMemory { category: AiMemoryCategory; content: string; expiresAt?: string | null }
export interface ChatReply { reply: string; sessionId: string; title: string | null; extractedMemories: ExtractedMemory[]; resolvedMemories: { id: string; content: string }[]; userId: FamilyId }

export interface Profile { name: string; birthDate: string; birthTime?: string; sex: BabySex; nickname: string; caregiverTitle: string; avatar: string | null; updatedAt?: string }
export interface ServerBackupStatus { directory: string; intervalHours: number; retention: number; count: number; lastBackupAt: string | null; nextBackupAt: string }
export type BackupType = 'manual' | 'auto';
export interface ServerBackupFile { name: string; createdAt: string; size: number; type: BackupType }
export type CareScheduleType = 'daily' | 'interval' | 'weekly' | 'pattern' | 'as_needed';
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
  reminderTimes: string[] | null;
  scheduleEndDate: string | null;
  weekDays: number[] | null;
  patternDays: boolean[] | null;
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
  subject?: string | null;
  note?: string | null;
}

export interface GrowthCurveRecord {
  id: string;
  measuredOn: string;
  ageMonths: number;
  heightCm: number;
  weightKg: number;
  heightZ: number | null;
  weightZ: number | null;
  heightPercentile: number | null;
  weightPercentile: number | null;
  heightBand: string | null;
  weightBand: string | null;
  createdBy: AuditIdentity;
}

export interface GrowthReferenceAnchor {
  ageMonths: number;
  minus2sd: number;
  minus1sd: number;
  median: number;
  plus1sd: number;
  plus2sd: number;
}

export interface GrowthCurveData {
  available: boolean;
  reason?: 'no_sex' | 'no_records';
  records?: GrowthCurveRecord[];
  reference?: {
    height: GrowthReferenceAnchor[];
    weight: GrowthReferenceAnchor[];
  };
  meta?: {
    sex: BabySex;
    maxAgeMonths: number;
    standardName: string;
    recordCount: number;
  };
}

export type SystemAuditEventType = 'export' | 'import' | 'backup' | 'restore' | 'delete_backup';
export interface SystemAuditEntry {
  id: number;
  eventType: SystemAuditEventType;
  actor: AuditIdentity;
  occurredAt: string;
  details: Record<string, unknown> | null;
  status: 'success' | 'failure';
}
