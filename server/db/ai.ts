import { db } from './connection.js';

export interface AiSettings {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  updatedAt: string;
}

export function getAiSettings(): AiSettings {
  return db.prepare('SELECT provider, base_url AS baseUrl, model, api_key AS apiKey, updated_at AS updatedAt FROM ai_settings WHERE id = 1').get() as AiSettings;
}

export function saveAiSettings(input: Pick<AiSettings, 'baseUrl' | 'model'> & { apiKey?: string }): AiSettings {
  const current = getAiSettings();
  const updatedAt = new Date().toISOString();
  const apiKey = input.apiKey === undefined ? current.apiKey : input.apiKey.trim();
  db.prepare('UPDATE ai_settings SET provider = ?, base_url = ?, model = ?, api_key = ?, updated_at = ? WHERE id = 1')
    .run('DeepSeek', input.baseUrl, input.model, apiKey, updatedAt);
  return getAiSettings();
}

export interface AiFeedingInsights {
  summary: string;
  insights: string[];
  alert: 'none' | 'pattern_change' | 'low_confidence' | 'growth_spurt';
  gapMinutes: number | null;
  nextFeedAt: string | null;
  recordsHash: string;
  createdAt: string;
  updatedAt: string;
}

export function getAiFeedingInsights(): AiFeedingInsights | null {
  const row = db.prepare('SELECT summary, insights_json AS insightsJson, alert, gap_minutes AS gapMinutes, next_feed_at AS nextFeedAt, records_hash AS recordsHash, created_at AS createdAt, updated_at AS updatedAt FROM ai_feeding_insights WHERE id = 1').get() as {
    summary: string;
    insightsJson: string;
    alert: AiFeedingInsights['alert'];
    gapMinutes: number | null;
    nextFeedAt: string | null;
    recordsHash: string;
    createdAt: string;
    updatedAt: string;
  } | undefined;
  if (!row) return null;
  return {
    summary: row.summary,
    insights: JSON.parse(row.insightsJson || '[]'),
    alert: row.alert,
    gapMinutes: row.gapMinutes,
    nextFeedAt: row.nextFeedAt,
    recordsHash: row.recordsHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function saveAiFeedingInsights(input: Omit<AiFeedingInsights, 'createdAt' | 'updatedAt'>): AiFeedingInsights {
  const existing = getAiFeedingInsights();
  const now = new Date().toISOString();
  if (existing) {
    db.prepare(`UPDATE ai_feeding_insights SET summary = ?, insights_json = ?, alert = ?, gap_minutes = ?, next_feed_at = ?, records_hash = ?, updated_at = ? WHERE id = 1`)
      .run(input.summary, JSON.stringify(input.insights), input.alert, input.gapMinutes, input.nextFeedAt, input.recordsHash, now);
  } else {
    db.prepare(`INSERT INTO ai_feeding_insights (id, summary, insights_json, alert, gap_minutes, next_feed_at, records_hash, created_at, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.summary, JSON.stringify(input.insights), input.alert, input.gapMinutes, input.nextFeedAt, input.recordsHash, now, now);
  }
  return getAiFeedingInsights()!;
}

export function computeFeedingRecordsHash(records: { occurredAt: string; breastMilkMl: number | null; formulaMl: number | null }[]): string {
  const key = records
    .map(r => `${r.occurredAt}|${r.breastMilkMl ?? 0}|${r.formulaMl ?? 0}`)
    .sort()
    .join('||');
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const chr = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
