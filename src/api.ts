import type { AiSettingsPublic, AuditEntry, Capabilities, CareRecord, DraftRecord, FamilyId, Profile, SessionUser } from './types';

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
  login: (identity: FamilyId, password: string) => request<{ authenticated: boolean; user: SessionUser }>('/api/login', { method: 'POST', body: JSON.stringify({ identity, password }) }),
  logout: () => request('/api/logout', { method: 'POST' }),
  profile: () => request<Profile>('/api/profile'),
  capabilities: () => request<Capabilities>('/api/capabilities'),
  aiSettings: () => request<AiSettingsPublic>('/api/ai/settings'),
  updateAiSettings: (settings: { baseUrl: string; model: string; apiKey?: string }) => request<AiSettingsPublic>('/api/ai/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  testAiSettings: (settings: { baseUrl: string; model: string; apiKey?: string }) => request<{ ok: boolean; message: string }>('/api/ai/settings/test', { method: 'POST', body: JSON.stringify(settings) }),
  interpret: (transcript: string) => request<{ records: DraftRecord[]; model: string }>('/api/ai/interpret', { method: 'POST', body: JSON.stringify({ transcript }) }),
  updateProfile: (profile: Profile) => request<Profile>('/api/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  records: (from: string, to: string) => request<CareRecord[]>(`/api/records?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  createRecord: (record: DraftRecord & { id?: string }) => request<CareRecord>('/api/records', { method: 'POST', body: JSON.stringify(record) }),
  updateRecord: (id: string, record: DraftRecord) => request<CareRecord>(`/api/records/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteRecord: (id: string) => request<{ deleted: boolean; record: CareRecord | null }>(`/api/records/${id}`, { method: 'DELETE' }),
  restoreRecord: (id: string) => request<CareRecord>(`/api/records/${id}/restore`, { method: 'POST' }),
  audit: (id: string) => request<AuditEntry[]>(`/api/records/${id}/audit`),
  importData: (data: unknown) => request<{ imported: number; profileRestored: boolean }>('/api/import', { method: 'POST', body: JSON.stringify(data) }),
  transcribe: async (audio: Blob) => {
    const form = new FormData();
    form.append('audio', audio, 'baby-recording.webm');
    const response = await fetch('/api/voice/transcribe', { method: 'POST', credentials: 'same-origin', body: form });
    const body = await response.json().catch(() => ({ error: '语音识别失败' }));
    if (!response.ok) throw new Error(body.error || '语音识别失败');
    return body as { transcript: string; model: string };
  }
};
