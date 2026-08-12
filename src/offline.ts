import type { CareRecord, DraftRecord, Profile, SessionUser } from './types';
import { createUuid } from './id';

const legacyCacheKey = 'baby-care-record-cache';
const cacheKey = (actorId: string) => `baby-care-record-cache-${actorId}`;
const rememberedUserKey = 'baby-care-remembered-user';
const profileKey = 'baby-care-profile-cache';
const outboxKey = (actorId: string) => `baby-care-outbox-${actorId}`;

export type QueuedAction = { id: string; action: 'create' | 'update' | 'delete' | 'restore'; recordId?: string; payload?: DraftRecord };

function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); }
  catch (error) { console.warn('本地缓存写入失败，已跳过缓存', error); }
}

export function cacheRecords(actorId: string, records: CareRecord[]) {
  writeStorage(cacheKey(actorId), JSON.stringify(records));
}

export function getCachedRecords(actorId: string): CareRecord[] {
  try {
    const scoped = localStorage.getItem(cacheKey(actorId));
    return JSON.parse(scoped ?? localStorage.getItem(legacyCacheKey) ?? '[]');
  } catch { return []; }
}

export function rememberUser(user: SessionUser) {
  writeStorage(rememberedUserKey, JSON.stringify(user));
}

export function getRememberedUser(): SessionUser | null {
  try { return JSON.parse(localStorage.getItem(rememberedUserKey) || 'null'); } catch { return null; }
}

export function clearRememberedUser() { localStorage.removeItem(rememberedUserKey); }

export function cacheProfile(profile: Profile) { writeStorage(profileKey, JSON.stringify(profile)); }
export function getCachedProfile(): Profile | null {
  try { return JSON.parse(localStorage.getItem(profileKey) || 'null'); } catch { return null; }
}

export function getOutbox(actorId: string): QueuedAction[] {
  try { return JSON.parse(localStorage.getItem(outboxKey(actorId)) || '[]'); } catch { return []; }
}

export function queueAction(actorId: string, action: Omit<QueuedAction, 'id'>) {
  const current = getOutbox(actorId);
  let queued = [...current];
  if (action.recordId) {
    const createIndex = queued.findIndex(item => item.action === 'create' && item.payload?.id === action.recordId);
    if (createIndex >= 0 && action.action === 'update' && action.payload) {
      queued[createIndex] = { ...queued[createIndex], payload: action.payload };
      setOutbox(actorId, queued); return queued;
    }
    if (createIndex >= 0 && action.action === 'delete') {
      queued.splice(createIndex, 1); setOutbox(actorId, queued); return queued;
    }
    if (action.action === 'restore') {
      const deleteIndex = queued.findIndex(item => item.action === 'delete' && item.recordId === action.recordId);
      if (deleteIndex >= 0) { queued.splice(deleteIndex, 1); setOutbox(actorId, queued); return queued; }
    }
    queued = queued.filter(item => !(item.recordId === action.recordId && (item.action === 'update' || item.action === 'restore')));
  }
  queued.push({ ...action, id: createUuid() });
  setOutbox(actorId, queued);
  return queued;
}

export function setOutbox(actorId: string, actions: QueuedAction[]) {
  writeStorage(outboxKey(actorId), JSON.stringify(actions));
}
