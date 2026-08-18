import { db } from './connection.js';
import type { BabySex } from '../types.js';

export function getProfile() {
  return db.prepare('SELECT name, birth_date AS birthDate, birth_time AS birthTime, sex, nickname, caregiver_title AS caregiverTitle, avatar, updated_at AS updatedAt FROM profile WHERE id = 1').get() as { name: string; birthDate: string; birthTime: string | null; sex: BabySex; nickname: string; caregiverTitle: string; avatar: string | null; updatedAt: string };
}

type SaveProfileObject = { name: string; birthDate: string; birthTime?: string | null; sex: BabySex; nickname?: string; caregiverTitle?: string; avatar?: string | null };
export function saveProfile(params: SaveProfileObject): { name: string; birthDate: string; birthTime: string | null; sex: BabySex; nickname: string; caregiverTitle: string; avatar: string | null; updatedAt: string };
export function saveProfile(name: string, birthDate: string, sex: BabySex): { name: string; birthDate: string; birthTime: string | null; sex: BabySex; nickname: string; caregiverTitle: string; avatar: string | null; updatedAt: string };
export function saveProfile(first: SaveProfileObject | string, birthDate?: string, sex?: BabySex) {
  let params: SaveProfileObject;
  if (typeof first === 'string') {
    params = { name: first, birthDate: birthDate!, sex: sex ?? 'unspecified' };
  } else {
    params = first;
  }
  const { name, birthDate: bd, sex: sx } = params;
  const existing = getProfile();
  const nickname = params.nickname !== undefined ? params.nickname.trim() : existing.nickname;
  const caregiverTitle = params.caregiverTitle !== undefined ? params.caregiverTitle.trim() || '妈妈' : existing.caregiverTitle;
  const avatar = params.avatar !== undefined ? params.avatar : existing.avatar;
  const birthTime = params.birthTime !== undefined ? (params.birthTime || null) : existing.birthTime;
  const updatedAt = new Date().toISOString();
  db.prepare('UPDATE profile SET name = ?, birth_date = ?, birth_time = ?, sex = ?, nickname = ?, caregiver_title = ?, avatar = ?, updated_at = ? WHERE id = 1').run(name, bd, birthTime, sx, nickname, caregiverTitle, avatar, updatedAt);
  return { name, birthDate: bd, birthTime, sex: sx, nickname, caregiverTitle, avatar, updatedAt };
}
