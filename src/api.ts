import type { AiSettingsPublic, AuditEntry, Capabilities, CareItem, CareRecord, DraftGrowthRecord, DraftRecord, DraftVaccineCatalogItem, DraftVaccineRecord, FamilyId, FamilyMemberPermission, GrowthRecord, Profile, PushStatus, ServerBackupFile, ServerBackupStatus, SessionUser, UserRole, VaccineCatalogItem, VaccineRecord } from './types';

export interface GrowthIndicatorAssessment {
  value: number;
  z: number;
  band: 'low' | 'below' | 'mid' | 'above' | 'high';
  bandLabel: string;
  anchors: { p3: number; p15: number; p50: number; p85: number; p97: number };
}

export interface GrowthAssessmentEvaluation {
  text: string;
  suggestions: string[];
  evaluatedAt: string | null;
}

export interface GrowthAssessment {
  available: boolean;
  reason?: 'no_sex' | 'no_records' | 'out_of_range';
  maxMonths?: number;
  latestRecordId?: string;
  measuredOn?: string;
  ageMonths?: number;
  height?: GrowthIndicatorAssessment;
  weight?: GrowthIndicatorAssessment;
  milk?: { avgDailyMl: number; daysCounted: number; referenceMin: number; referenceMax: number } | null;
  evaluation?: GrowthAssessmentEvaluation | null;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const defaultHeaders: Record<string, string> = isFormData ? {} : { 'Content-Type': 'application/json' };
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { ...defaultHeaders, ...options?.headers },
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: '请求失败' }));
    throw new ApiError(body.error || '请求失败', response.status, body.code, body);
  }
  return response.json();
}

export const api = {
  session: () => request<{ authenticated: boolean; user: SessionUser | null }>('/api/session'),
  loginOptions: () => request<FamilyMemberPermission[]>('/api/login-options'),
  login: (identity: FamilyId, password: string) => request<{ authenticated: boolean; user: SessionUser }>('/api/login', { method: 'POST', body: JSON.stringify({ identity, password }) }),
  logout: () => request('/api/logout', { method: 'POST' }),
  profile: () => request<Profile>('/api/profile'),
  capabilities: () => request<Capabilities>('/api/capabilities'),
  aiSettings: () => request<AiSettingsPublic>('/api/ai/settings'),
  updateAiSettings: (settings: { baseUrl: string; model: string; apiKey?: string }) => request<AiSettingsPublic>('/api/ai/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  testAiSettings: (settings: { baseUrl: string; model: string; apiKey?: string }) => request<{ ok: boolean; message: string }>('/api/ai/settings/test', { method: 'POST', body: JSON.stringify(settings) }),
  dailyReport: (date?: string) => request<{ date: string; exists: boolean; summary?: string; suggestions?: string[]; model?: string; generatedAt?: string }>(`/api/daily-report${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  generateDailyReport: (date?: string) => request<{ date: string; summary: string; suggestions: string[]; model: string; generatedAt: string }>(`/api/daily-report/generate${date ? `?date=${encodeURIComponent(date)}` : ''}`, { method: 'POST' }),
  updateProfile: (profile: Partial<Pick<Profile, 'nickname' | 'caregiverTitle' | 'birthTime'>> & Pick<Profile, 'name' | 'birthDate' | 'sex'>) => request<Profile>('/api/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  growthRecords: () => request<GrowthRecord[]>('/api/growth-records'),
  deletedGrowthRecords: () => request<GrowthRecord[]>('/api/growth-records/deleted'),
  createGrowthRecord: (record: DraftGrowthRecord) => request<GrowthRecord>('/api/growth-records', { method: 'POST', body: JSON.stringify(record) }),
  updateGrowthRecord: (id: string, record: DraftGrowthRecord) => request<GrowthRecord>(`/api/growth-records/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteGrowthRecord: (id: string) => request<{ deleted: boolean; record: GrowthRecord }>(`/api/growth-records/${id}`, { method: 'DELETE' }),
  restoreGrowthRecord: (id: string) => request<GrowthRecord>(`/api/growth-records/${id}/restore`, { method: 'POST' }),
  purgeGrowthRecord: (id: string) => request<{ deleted: boolean }>(`/api/growth-records/${id}/permanent`, { method: 'DELETE' }),
  growthAssessment: () => request<GrowthAssessment>('/api/growth-assessment'),
  generateGrowthEvaluation: (id: string) => request<{ evaluation: GrowthAssessmentEvaluation }>(`/api/growth-records/${id}/evaluation`, { method: 'POST' }),
  vaccineRecords: () => request<VaccineRecord[]>('/api/vaccine-records'),
  vaccineCatalog: () => request<VaccineCatalogItem[]>('/api/vaccine-catalog'),
  createVaccineCatalogItem: (item: DraftVaccineCatalogItem) => request<VaccineCatalogItem>('/api/vaccine-catalog', { method: 'POST', body: JSON.stringify(item) }),
  updateVaccineCatalogItem: (id: string, item: DraftVaccineCatalogItem) => request<VaccineCatalogItem>(`/api/vaccine-catalog/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(item) }),
  deleteVaccineCatalogItem: (id: string) => request<{ deleted: boolean }>(`/api/vaccine-catalog/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  setVaccineCatalogActive: (id: string, active: boolean) => request<VaccineCatalogItem>(`/api/vaccine-catalog/${encodeURIComponent(id)}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  reorderVaccineCatalog: (ids: string[]) => request<VaccineCatalogItem[]>('/api/vaccine-catalog/order', { method: 'PUT', body: JSON.stringify({ ids }) }),
  createVaccineRecord: (record: DraftVaccineRecord) => request<VaccineRecord>('/api/vaccine-records', { method: 'POST', body: JSON.stringify(record) }),
  updateVaccineRecord: (id: string, record: DraftVaccineRecord) => request<VaccineRecord>(`/api/vaccine-records/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteVaccineRecord: (id: string) => request<{ deleted: boolean; record: VaccineRecord | null }>(`/api/vaccine-records/${id}`, { method: 'DELETE' }),
  familyMembers: () => request<FamilyMemberPermission[]>('/api/family-members'),
  updateFamilyRole: (id: Exclude<FamilyId, 'father'>, role: Exclude<UserRole, 'superadmin'>) => request<FamilyMemberPermission>(`/api/family-members/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  records: (from: string, to: string) => request<CareRecord[]>(`/api/records?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  deletedRecords: () => request<CareRecord[]>('/api/records/deleted'),
  createRecord: (record: DraftRecord & { id?: string }) => request<CareRecord>('/api/records', { method: 'POST', body: JSON.stringify(record) }),
  updateRecord: (id: string, record: DraftRecord) => request<CareRecord>(`/api/records/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteRecord: (id: string) => request<{ deleted: boolean; record: CareRecord | null }>(`/api/records/${id}`, { method: 'DELETE' }),
  restoreRecord: (id: string) => request<CareRecord>(`/api/records/${id}/restore`, { method: 'POST' }),
  purgeRecord: (id: string) => request<{ deleted: boolean }>(`/api/records/${id}/permanent`, { method: 'DELETE' }),
  audit: (id: string) => request<AuditEntry[]>(`/api/records/${id}/audit`),
  careItems: () => request<CareItem[]>('/api/care-items'),
  createCareItem: (item: Pick<CareItem, 'name' | 'category' | 'icon' | 'sortOrder' | 'scheduleType' | 'intervalDays' | 'scheduleStartDate' | 'reminderTime' | 'scheduleEndDate'>) => request<CareItem>('/api/care-items', { method: 'POST', body: JSON.stringify(item) }),
  updateCareItem: (id: string, item: Pick<CareItem, 'name' | 'category' | 'icon' | 'sortOrder' | 'scheduleType' | 'intervalDays' | 'scheduleStartDate' | 'reminderTime' | 'scheduleEndDate'>) => request<CareItem>(`/api/care-items/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(item) }),
  setCareItemActive: (id: string, active: boolean) => request<CareItem>(`/api/care-items/${encodeURIComponent(id)}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  reorderCareItems: (ids: string[]) => request<CareItem[]>('/api/care-items/order', { method: 'PUT', body: JSON.stringify({ ids }) }),
  backupStatus: () => request<ServerBackupStatus>('/api/backups/status'),
  serverBackups: () => request<ServerBackupFile[]>('/api/backups'),
  createServerBackup: () => request<{ name: string; createdAt: string; status: ServerBackupStatus }>('/api/backups', { method: 'POST' }),
  restoreServerBackup: (name: string) => request<{ imported: number; profileRestored: boolean; restoredFrom: string; status: ServerBackupStatus }>(`/api/backups/${encodeURIComponent(name)}/restore`, { method: 'POST' }),
  importData: (data: unknown) => request<{ imported: number; profileRestored: boolean }>('/api/import', { method: 'POST', body: JSON.stringify(data) }),
  pushStatus: () => request<PushStatus>('/api/push/status'),
  savePushSettings: (data: { enabled?: boolean; pushplusToken?: string; pushplusTopic?: string; morningDigestEnabled?: boolean; morningDigestTime?: string; feedingGapEnabled?: boolean; feedingGapLevel1Minutes?: number; feedingGapLevel2Minutes?: number; careItemEnabled?: boolean }) => request<PushStatus>('/api/push/settings', { method: 'POST', body: JSON.stringify(data) }),
  testMorningDigestPush: () => request<{ ok: boolean; message: string }>('/api/push/test/morning-digest', { method: 'POST' }),
  testFeedingGapPush: (level: 'level1' | 'level2' = 'level1') => request<{ ok: boolean; message: string }>('/api/push/test/feeding-gap', { method: 'POST', body: JSON.stringify({ level }) }),
  testCareItemPush: () => request<{ ok: boolean; message: string }>('/api/push/test/care-item', { method: 'POST' }),
  enablePush: () => request<PushStatus>('/api/push/enable', { method: 'POST' }),
  disablePush: () => request<PushStatus>('/api/push/disable', { method: 'POST' }),
  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return request<{ url: string; profile: Profile }>('/api/profile/avatar', { method: 'POST', body: formData });
  },
  removeAvatar: () => request<{ ok: boolean; profile: Profile }>('/api/profile/avatar', { method: 'DELETE' }),
};
