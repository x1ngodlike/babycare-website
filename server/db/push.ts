import { db } from './connection.js';

export type FeedingGapLevel = 'none' | 'level1' | 'level2';

export interface PushSentFlags {
  morningDigestDate?: string | null;
  lastFeedRecordId?: string | null;
  feedingGapNotifiedLevel?: FeedingGapLevel;
}

export interface PushSettings {
  enabled: boolean;
  pushplusToken: string;
  pushplusTopic: string;
  morningDigestEnabled: boolean;
  morningDigestTime: string;
  feedingGapEnabled: boolean;
  feedingGapLevel1Minutes: number;
  feedingGapLevel2Minutes: number;
  feedPrepEnabled: boolean;
  feedPrepMinutes: number;
  careItemEnabled: boolean;
  pushSentFlags: PushSentFlags;
  updatedAt: string;
}

export function getPushSettings(): PushSettings {
  const row = db.prepare('SELECT enabled, pushplus_token AS pushplusToken, pushplus_topic AS pushplusTopic, morning_digest_enabled AS morningDigestEnabled, morning_digest_time AS morningDigestTime, feeding_gap_enabled AS feedingGapEnabled, feeding_gap_level1_minutes AS feedingGapLevel1Minutes, feeding_gap_level2_minutes AS feedingGapLevel2Minutes, feed_prep_enabled AS feedPrepEnabled, feed_prep_minutes AS feedPrepMinutes, care_item_enabled AS careItemEnabled, push_sent_flags AS pushSentFlags, updated_at AS updatedAt FROM push_settings WHERE id = 1').get() as { enabled: number; pushplusToken?: string; pushplusTopic?: string; morningDigestEnabled?: number; morningDigestTime?: string; feedingGapEnabled?: number; feedingGapLevel1Minutes?: number; feedingGapLevel2Minutes?: number; feedPrepEnabled?: number; feedPrepMinutes?: number; careItemEnabled?: number; pushSentFlags?: string; updatedAt: string } | undefined;
  const envEnabled = process.env.PUSH_ENABLED === 'true';
  function parseFlags(raw: string | undefined): PushSentFlags {
    if (!raw) return {};
    try {
      const obj = JSON.parse(raw);
      return {
        morningDigestDate: typeof obj.morningDigestDate === 'string' ? obj.morningDigestDate : null,
        lastFeedRecordId: typeof obj.lastFeedRecordId === 'string' ? obj.lastFeedRecordId : null,
        feedingGapNotifiedLevel: (obj.feedingGapNotifiedLevel === 'level1' || obj.feedingGapNotifiedLevel === 'level2') ? obj.feedingGapNotifiedLevel : undefined
      };
    } catch {
      return {};
    }
  }
  if (!row) {
    return {
      enabled: envEnabled,
      pushplusToken: '',
      pushplusTopic: '',
      morningDigestEnabled: true,
      morningDigestTime: '08:00',
      feedingGapEnabled: true,
      feedingGapLevel1Minutes: 150,
      feedingGapLevel2Minutes: 180,
      feedPrepEnabled: true,
      feedPrepMinutes: 30,
      careItemEnabled: true,
      pushSentFlags: {},
      updatedAt: new Date().toISOString()
    };
  }
  return {
    enabled: Boolean(row.enabled) || envEnabled,
    pushplusToken: row.pushplusToken || '',
    pushplusTopic: row.pushplusTopic || '',
    morningDigestEnabled: row.morningDigestEnabled === undefined ? true : Boolean(row.morningDigestEnabled),
    morningDigestTime: /^\d{2}:\d{2}$/.test(row.morningDigestTime || '') ? row.morningDigestTime! : '08:00',
    feedingGapEnabled: row.feedingGapEnabled === undefined ? true : Boolean(row.feedingGapEnabled),
    feedingGapLevel1Minutes: Number.isSafeInteger(row.feedingGapLevel1Minutes) && row.feedingGapLevel1Minutes! > 0 ? row.feedingGapLevel1Minutes! : 150,
    feedingGapLevel2Minutes: Number.isSafeInteger(row.feedingGapLevel2Minutes) && row.feedingGapLevel2Minutes! > 0 ? row.feedingGapLevel2Minutes! : 180,
    feedPrepEnabled: row.feedPrepEnabled === undefined ? true : Boolean(row.feedPrepEnabled),
    feedPrepMinutes: Number.isSafeInteger(row.feedPrepMinutes) && row.feedPrepMinutes! >= 0 && row.feedPrepMinutes! <= 120 ? row.feedPrepMinutes! : 30,
    careItemEnabled: row.careItemEnabled === undefined ? true : Boolean(row.careItemEnabled),
    pushSentFlags: parseFlags(row.pushSentFlags),
    updatedAt: row.updatedAt
  };
}

export function savePushSettings(input: Partial<Pick<PushSettings, 'enabled' | 'pushplusToken' | 'pushplusTopic' | 'morningDigestEnabled' | 'morningDigestTime' | 'feedingGapEnabled' | 'feedingGapLevel1Minutes' | 'feedingGapLevel2Minutes' | 'feedPrepEnabled' | 'feedPrepMinutes' | 'careItemEnabled'>>): PushSettings {
  const current = getPushSettings();
  const enabled = input.enabled === undefined ? current.enabled : input.enabled;
  const pushplusToken = input.pushplusToken === undefined ? current.pushplusToken : input.pushplusToken.trim();
  const pushplusTopic = input.pushplusTopic === undefined ? current.pushplusTopic : input.pushplusTopic.trim();
  const morningDigestEnabled = input.morningDigestEnabled === undefined ? current.morningDigestEnabled : input.morningDigestEnabled;
  const morningDigestTime = input.morningDigestTime === undefined ? current.morningDigestTime : (/^\d{2}:\d{2}$/.test(input.morningDigestTime.trim()) ? input.morningDigestTime.trim() : current.morningDigestTime);
  const feedingGapEnabled = input.feedingGapEnabled === undefined ? current.feedingGapEnabled : input.feedingGapEnabled;
  const feedingGapLevel1Minutes = input.feedingGapLevel1Minutes === undefined ? current.feedingGapLevel1Minutes : input.feedingGapLevel1Minutes;
  const feedingGapLevel2Minutes = input.feedingGapLevel2Minutes === undefined ? current.feedingGapLevel2Minutes : input.feedingGapLevel2Minutes;
  const feedPrepEnabled = input.feedPrepEnabled === undefined ? current.feedPrepEnabled : input.feedPrepEnabled;
  const feedPrepMinutes = input.feedPrepMinutes === undefined ? current.feedPrepMinutes : input.feedPrepMinutes;
  const careItemEnabled = input.careItemEnabled === undefined ? current.careItemEnabled : input.careItemEnabled;
  const updatedAt = new Date().toISOString();
  const info = db.prepare('UPDATE push_settings SET enabled = ?, pushplus_token = ?, pushplus_topic = ?, morning_digest_enabled = ?, morning_digest_time = ?, feeding_gap_enabled = ?, feeding_gap_level1_minutes = ?, feeding_gap_level2_minutes = ?, feed_prep_enabled = ?, feed_prep_minutes = ?, care_item_enabled = ?, updated_at = ? WHERE id = 1')
    .run(enabled ? 1 : 0, pushplusToken, pushplusTopic, morningDigestEnabled ? 1 : 0, morningDigestTime, feedingGapEnabled ? 1 : 0, feedingGapLevel1Minutes, feedingGapLevel2Minutes, feedPrepEnabled ? 1 : 0, feedPrepMinutes, careItemEnabled ? 1 : 0, updatedAt);
  if (!info.changes) {
    db.prepare(`
      INSERT INTO push_settings
        (id, enabled, pushplus_token, pushplus_topic, morning_digest_enabled, morning_digest_time, feeding_gap_enabled, feeding_gap_level1_minutes, feeding_gap_level2_minutes, feed_prep_enabled, feed_prep_minutes, care_item_enabled, push_sent_flags, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(enabled ? 1 : 0, pushplusToken, pushplusTopic, morningDigestEnabled ? 1 : 0, morningDigestTime, feedingGapEnabled ? 1 : 0, feedingGapLevel1Minutes, feedingGapLevel2Minutes, feedPrepEnabled ? 1 : 0, feedPrepMinutes, careItemEnabled ? 1 : 0, '{}', updatedAt);
  }
  return getPushSettings();
}

export function writePushSentFlags(patch: Partial<PushSentFlags>): PushSentFlags {
  const current = getPushSettings().pushSentFlags;
  const next: PushSentFlags = { ...current, ...patch };
  const serialized = JSON.stringify(next);
  db.prepare('UPDATE push_settings SET push_sent_flags = ?, updated_at = ? WHERE id = 1').run(serialized, new Date().toISOString());
  return next;
}

export type AppNotificationType = 'morning' | 'feeding' | 'care';
export interface AppNotificationMessage {
  id: number;
  type: AppNotificationType;
  title: string;
  body: string;
  target: string;
  createdAt: string;
}

export function touchAppNotificationClient(clientId: string): { isNew: boolean; cursor: number } {
  const existing = db.prepare('SELECT client_id FROM app_notification_clients WHERE client_id = ?').get(clientId);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO app_notification_clients (client_id, last_seen_at) VALUES (?, ?)
    ON CONFLICT(client_id) DO UPDATE SET last_seen_at=excluded.last_seen_at`).run(clientId, now);
  const latest = db.prepare('SELECT COALESCE(MAX(id), 0) AS cursor FROM app_notifications').get() as { cursor: number };
  return { isNew: !existing, cursor: latest.cursor };
}

export function hasRecentAppNotificationClient(now = new Date()): boolean {
  const cutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  return Boolean(db.prepare('SELECT 1 FROM app_notification_clients WHERE last_seen_at >= ? LIMIT 1').get(cutoff));
}

export function enqueueAppNotification(input: { type: AppNotificationType; title: string; body: string; target?: string }): AppNotificationMessage {
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  db.prepare('DELETE FROM app_notifications WHERE expires_at < ?').run(createdAt);
  const result = db.prepare('INSERT INTO app_notifications (type, title, body, target, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(input.type, input.title, input.body, input.target || 'today', createdAt, expiresAt);
  return { id: Number(result.lastInsertRowid), type: input.type, title: input.title, body: input.body, target: input.target || 'today', createdAt };
}

export function listAppNotifications(after: number, limit = 50): { items: AppNotificationMessage[]; cursor: number } {
  const now = new Date().toISOString();
  db.prepare('DELETE FROM app_notifications WHERE expires_at < ?').run(now);
  const items = db.prepare(`SELECT id, type, title, body, target, created_at AS createdAt
    FROM app_notifications WHERE id > ? ORDER BY id LIMIT ?`).all(after, limit) as AppNotificationMessage[];
  return { items, cursor: items.at(-1)?.id || after };
}
