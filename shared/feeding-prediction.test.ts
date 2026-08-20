import { describe, it, expect } from 'vitest';
import { predictFeeding, formatDurationFromNow, formatTimeShort, periodLabels, type FeedingPredictionInput } from './feeding-prediction.js';

function makeRecord(offsetMinutesAgo: number, breastMl = 0, formulaMl = 0): FeedingPredictionInput {
  const date = new Date(Date.now() - offsetMinutesAgo * 60000);
  return {
    occurredAt: date.toISOString(),
    breastMilkMl: breastMl || null,
    formulaMl: formulaMl || null
  };
}

describe('predictFeeding', () => {
  it('returns unavailable when no records', () => {
    const result = predictFeeding([]);
    expect(result.available).toBe(false);
    expect(result.reason).toBe('no_records');
  });

  it('returns unavailable with insufficient data (only 1 record)', () => {
    const result = predictFeeding([makeRecord(60)]);
    expect(result.available).toBe(false);
    expect(result.reason).toBe('insufficient_data');
    expect(result.lastFeedAt).not.toBeNull();
  });

  it('predicts next feed with regular 3-hour intervals', () => {
    const now = new Date();
    const records: FeedingPredictionInput[] = [];
    for (let i = 10; i <= 100; i += 30) {
      records.push({
        occurredAt: new Date(now.getTime() - i * 60000).toISOString(),
        breastMilkMl: 80,
        formulaMl: 40
      });
    }
    const result = predictFeeding(records, now);
    expect(result.available).toBe(true);
    expect(result.gapMinutes).not.toBeNull();
    expect(result.upcomingFeeds.length).toBeGreaterThan(0);
    expect(result.volumeMl).toBeGreaterThan(0);
    expect(result.nextFeedAt).not.toBeNull();
    expect(result.nextFeedEarliest).not.toBeNull();
    expect(result.nextFeedLatest).not.toBeNull();
  });

  it('predicts with varied intervals (day vs night)', () => {
    const now = new Date('2026-08-16T14:00:00+08:00');
    const records: FeedingPredictionInput[] = [];
    for (let dayOffset = 10; dayOffset >= 1; dayOffset--) {
      const base = new Date(now.getTime() - dayOffset * 86400000);
      base.setHours(8, 0, 0, 0);
      records.push({ occurredAt: base.toISOString(), breastMilkMl: 90, formulaMl: 60 });
      const lateMorning = new Date(base.getTime() + 120 * 60000);
      records.push({ occurredAt: lateMorning.toISOString(), breastMilkMl: 100, formulaMl: 0 });
      const afternoon = new Date(base.getTime() + 300 * 60000);
      records.push({ occurredAt: afternoon.toISOString(), breastMilkMl: 0, formulaMl: 120 });
      const evening = new Date(base.getTime() + 480 * 60000);
      records.push({ occurredAt: evening.toISOString(), breastMilkMl: 80, formulaMl: 60 });
    }
    const result = predictFeeding(records, now);
    expect(result.available).toBe(true);
    expect(result.gapMinutes).not.toBeNull();
    expect(result.overallMedianGapMinutes).not.toBeNull();
    expect(result.periodGaps.length).toBeGreaterThanOrEqual(1);
  });

  it('handles records with mixed feeding types (breast + formula)', () => {
    const now = new Date();
    const records: FeedingPredictionInput[] = [];
    for (let i = 1; i <= 20; i++) {
      const offset = i * 90;
      records.push({
        occurredAt: new Date(now.getTime() - offset * 60000).toISOString(),
        breastMilkMl: i % 2 === 0 ? 100 : 0,
        formulaMl: i % 2 === 0 ? 0 : 120
      });
    }
    const result = predictFeeding(records, now);
    expect(result.available).toBe(true);
    expect(result.volumeMl).toBeGreaterThan(0);
  });

  it('limits upcoming feeds to requested count', () => {
    const now = new Date();
    const records: FeedingPredictionInput[] = [];
    for (let i = 1; i <= 30; i++) {
      records.push(makeRecord(i * 60, 80, 40));
    }
    const result = predictFeeding(records, now, 14, 5);
    expect(result.upcomingFeeds.length).toBe(5);
  });

  it('includes confidence score based on data volume', () => {
    const now = new Date();
    const fewRecords: FeedingPredictionInput[] = [];
    for (let i = 1; i <= 4; i++) {
      fewRecords.push(makeRecord(i * 120, 80));
    }
    const manyRecords: FeedingPredictionInput[] = [];
    for (let i = 1; i <= 40; i++) {
      manyRecords.push(makeRecord(i * 60, 80));
    }
    const fewResult = predictFeeding(fewRecords, now);
    const manyResult = predictFeeding(manyRecords, now);
    expect(manyResult.confidence).toBeGreaterThan(fewResult.confidence);
  });
});

describe('formatDurationFromNow', () => {
  it('shows minutes for near-future times', () => {
    const now = new Date();
    const in10Min = new Date(now.getTime() + 10 * 60000).toISOString();
    const result = formatDurationFromNow(in10Min, now);
    expect(result).toContain('10');
    expect(result).toContain('分钟');
  });

  it('shows hours for later times', () => {
    const now = new Date();
    const in2Hours = new Date(now.getTime() + 2 * 3600000).toISOString();
    const result = formatDurationFromNow(in2Hours, now);
    expect(result).toContain('2');
    expect(result).toContain('小时');
  });

  it('shows already fed for past times', () => {
    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60000).toISOString();
    const result = formatDurationFromNow(tenMinAgo, now);
    expect(result).toBe('应该已经喂了');
  });
});

describe('formatTimeShort', () => {
  it('formats ISO date to HH:MM', () => {
    const result = formatTimeShort('2026-08-16T14:35:00+08:00');
    expect(result).toBe('14:35');
  });
});

describe('periodLabels', () => {
  it('has labels for all periods', () => {
    expect(periodLabels.day).toBeDefined();
    expect(periodLabels.night).toBeDefined();
  });
});
