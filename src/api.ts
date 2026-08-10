import type { AiSettingsPublic, AuditEntry, Capabilities, CareItem, CareRecord, DraftGrowthRecord, DraftRecord, FamilyId, FamilyMemberPermission, GrowthRecord, Profile, ServerBackupFile, ServerBackupStatus, SessionUser, UserRole } from './types';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
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
  updateProfile: (profile: Profile) => request<Profile>('/api/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  growthRecords: () => request<GrowthRecord[]>('/api/growth-records'),
  deletedGrowthRecords: () => request<GrowthRecord[]>('/api/growth-records/deleted'),
  createGrowthRecord: (record: DraftGrowthRecord) => request<GrowthRecord>('/api/growth-records', { method: 'POST', body: JSON.stringify(record) }),
  updateGrowthRecord: (id: string, record: DraftGrowthRecord) => request<GrowthRecord>(`/api/growth-records/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteGrowthRecord: (id: string) => request<{ deleted: boolean; record: GrowthRecord }>(`/api/growth-records/${id}`, { method: 'DELETE' }),
  restoreGrowthRecord: (id: string) => request<GrowthRecord>(`/api/growth-records/${id}/restore`, { method: 'POST' }),
  purgeGrowthRecord: (id: string) => request<{ deleted: boolean }>(`/api/growth-records/${id}/permanent`, { method: 'DELETE' }),
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
  createCareItem: (item: Pick<CareItem, 'name' | 'icon' | 'sortOrder'>) => request<CareItem>('/api/care-items', { method: 'POST', body: JSON.stringify(item) }),
  updateCareItem: (id: string, item: Pick<CareItem, 'name' | 'icon' | 'sortOrder'>) => request<CareItem>(`/api/care-items/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(item) }),
  setCareItemActive: (id: string, active: boolean) => request<CareItem>(`/api/care-items/${encodeURIComponent(id)}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  reorderCareItems: (ids: string[]) => request<CareItem[]>('/api/care-items/order', { method: 'PUT', body: JSON.stringify({ ids }) }),
  backupStatus: () => request<ServerBackupStatus>('/api/backups/status'),
  serverBackups: () => request<ServerBackupFile[]>('/api/backups'),
  createServerBackup: () => request<{ name: string; createdAt: string; status: ServerBackupStatus }>('/api/backups', { method: 'POST' }),
  restoreServerBackup: (name: string) => request<{ imported: number; profileRestored: boolean; restoredFrom: string; status: ServerBackupStatus }>(`/api/backups/${encodeURIComponent(name)}/restore`, { method: 'POST' }),
  importData: (data: unknown) => request<{ imported: number; profileRestored: boolean }>('/api/import', { method: 'POST', body: JSON.stringify(data) }),
};
