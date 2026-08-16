export type FeedingPeriod = 'night' | 'earlyMorning' | 'morning' | 'midday' | 'afternoon' | 'evening';

export interface FeedingPredictionInput {
  occurredAt: string;
  breastMilkMl: number | null;
  formulaMl: number | null;
}

export interface FeedingGapStats {
  period: FeedingPeriod;
  count: number;
  medianMinutes: number | null;
  minMinutes: number | null;
  maxMinutes: number | null;
}

export interface FeedingVolumeStats {
  period: FeedingPeriod;
  count: number;
  medianMl: number | null;
}

export interface FeedingPrediction {
  available: boolean;
  reason?: 'no_records' | 'insufficient_data';
  lastFeedAt: string | null;
  nextFeedAt: string | null;
  nextFeedEarliest: string | null;
  nextFeedLatest: string | null;
  gapMinutes: number | null;
  volumeMl: number | null;
  confidence: number;
  upcomingFeeds: UpcomingFeed[];
  periodGaps: FeedingGapStats[];
  periodVolumes: FeedingVolumeStats[];
  overallMedianGapMinutes: number | null;
  dataDays: number;
  dataFeeds: number;
}

export interface UpcomingFeed {
  index: number;
  predictedAt: string;
  earliest: string;
  latest: string;
  estimatedMl: number | null;
  period: FeedingPeriod;
}

const periodDefs: { period: FeedingPeriod; startHour: number; endHour: number }[] = [
  { period: 'night', startHour: 0, endHour: 5 },
  { period: 'earlyMorning', startHour: 5, endHour: 8 },
  { period: 'morning', startHour: 8, endHour: 11 },
  { period: 'midday', startHour: 11, endHour: 14 },
  { period: 'afternoon', startHour: 14, endHour: 18 },
  { period: 'evening', startHour: 18, endHour: 24 }
];

const SHANGHAI_TZ = 'Asia/Shanghai';

function getPeriod(date: Date): FeedingPeriod {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: SHANGHAI_TZ, hour: '2-digit', hour12: false });
  const hour = Number(formatter.format(date));
  for (const def of periodDefs) {
    if (hour >= def.startHour && hour < def.endHour) return def.period;
  }
  return 'evening';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

export function predictFeeding(
  records: FeedingPredictionInput[],
  now: Date = new Date(),
  lookbackDays = 14,
  upcomingCount = 3
): FeedingPrediction {
  const feedings = records
    .map(r => ({ ...r, date: new Date(r.occurredAt) }))
    .filter(r => !isNaN(r.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (feedings.length === 0) {
    return {
      available: false,
      reason: 'no_records',
      lastFeedAt: null,
      nextFeedAt: null,
      nextFeedEarliest: null,
      nextFeedLatest: null,
      gapMinutes: null,
      volumeMl: null,
      confidence: 0,
      upcomingFeeds: [],
      periodGaps: [],
      periodVolumes: [],
      overallMedianGapMinutes: null,
      dataDays: 0,
      dataFeeds: 0
    };
  }

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const recentFeedings = feedings.filter(f => f.date >= cutoff);

  if (recentFeedings.length < 2) {
    return {
      available: false,
      reason: 'insufficient_data',
      lastFeedAt: feedings[feedings.length - 1].occurredAt,
      nextFeedAt: null,
      nextFeedEarliest: null,
      nextFeedLatest: null,
      gapMinutes: null,
      volumeMl: null,
      confidence: 0,
      upcomingFeeds: [],
      periodGaps: [],
      periodVolumes: [],
      overallMedianGapMinutes: null,
      dataDays: Math.min(lookbackDays, Math.ceil((now.getTime() - new Date(feedings[0].occurredAt).getTime()) / 86400000)),
      dataFeeds: feedings.length
    };
  }

  const gaps: { minutes: number; from: Date; to: Date; period: FeedingPeriod }[] = [];
  for (let i = 1; i < recentFeedings.length; i++) {
    const prev = recentFeedings[i - 1];
    const curr = recentFeedings[i];
    const minutes = minutesBetween(prev.date, curr.date);
    if (minutes > 0 && minutes <= 600) {
      gaps.push({
        minutes,
        from: prev.date,
        to: curr.date,
        period: getPeriod(curr.date)
      });
    }
  }

  const volumes: { ml: number; date: Date; period: FeedingPeriod }[] = [];
  for (const f of recentFeedings) {
    const ml = (f.breastMilkMl || 0) + (f.formulaMl || 0);
    if (ml > 0) volumes.push({ ml, date: f.date, period: getPeriod(f.date) });
  }

  const periodGapsMap = new Map<FeedingPeriod, number[]>();
  const periodVolumesMap = new Map<FeedingPeriod, number[]>();
  for (const g of gaps) {
    const arr = periodGapsMap.get(g.period) || [];
    arr.push(g.minutes);
    periodGapsMap.set(g.period, arr);
  }
  for (const v of volumes) {
    const arr = periodVolumesMap.get(v.period) || [];
    arr.push(v.ml);
    periodVolumesMap.set(v.period, arr);
  }

  const periodGaps: FeedingGapStats[] = periodDefs.map(def => {
    const vals = periodGapsMap.get(def.period) || [];
    const med = median(vals);
    return {
      period: def.period,
      count: vals.length,
      medianMinutes: med,
      minMinutes: vals.length > 0 ? Math.min(...vals) : null,
      maxMinutes: vals.length > 0 ? Math.max(...vals) : null
    };
  }).filter(s => s.count > 0);

  const periodVolumes: FeedingVolumeStats[] = periodDefs.map(def => {
    const vals = periodVolumesMap.get(def.period) || [];
    return { period: def.period, count: vals.length, medianMl: median(vals) };
  }).filter(s => s.count > 0);

  const allGapMinutes = gaps.map(g => g.minutes);
  const overallMedianGap = median(allGapMinutes);

  const lastFeed = feedings[feedings.length - 1];
  const lastPeriod = getPeriod(lastFeed.date);
  const nextPeriod = predictNextPeriod(lastPeriod, now);

  const nextPeriodGap = periodGaps.find(g => g.period === nextPeriod);
  const nextPeriodVolume = periodVolumes.find(v => v.period === nextPeriod);

  const gapMinutes = nextPeriodGap?.medianMinutes ?? overallMedianGap ?? 180;
  const volumeMl = nextPeriodVolume?.medianMl ?? (periodVolumes.length > 0 ? median(periodVolumes.flatMap(v => v.medianMl ? [v.medianMl] : [])) : null) ?? 120;

  const earliestGap = Math.max(30, Math.round(gapMinutes * 0.75));
  const latestGap = Math.round(gapMinutes * 1.25);

  const nextFeedDate = new Date(lastFeed.date.getTime() + gapMinutes * 60000);
  const nextEarliestDate = new Date(lastFeed.date.getTime() + earliestGap * 60000);
  const nextLatestDate = new Date(lastFeed.date.getTime() + latestGap * 60000);

  const upcomingFeeds: UpcomingFeed[] = [];
  let lastPredicted = lastFeed.date;
  for (let i = 0; i < upcomingCount; i++) {
    const gapForThisPeriod = getGapForPrediction(lastPredicted, periodGaps, overallMedianGap);
    const thisPeriod = getPeriod(lastPredicted);
    const volForThisPeriod = periodVolumes.find(v => v.period === thisPeriod)?.medianMl
      ?? (periodVolumes.length > 0 ? median(periodVolumes.flatMap(v => v.medianMl ? [v.medianMl] : [])) : null)
      ?? 120;
    const predictedAt = new Date(lastPredicted.getTime() + gapForThisPeriod * 60000);
    const earliest = new Date(lastPredicted.getTime() + Math.max(30, Math.round(gapForThisPeriod * 0.75)) * 60000);
    const latest = new Date(lastPredicted.getTime() + Math.round(gapForThisPeriod * 1.25) * 60000);
    upcomingFeeds.push({
      index: i + 1,
      predictedAt: predictedAt.toISOString(),
      earliest: earliest.toISOString(),
      latest: latest.toISOString(),
      estimatedMl: volForThisPeriod,
      period: getPeriod(predictedAt)
    });
    lastPredicted = predictedAt;
  }

  const totalDays = recentFeedings.length > 1
    ? Math.max(1, Math.round((recentFeedings[recentFeedings.length - 1].date.getTime() - recentFeedings[0].date.getTime()) / 86400000))
    : 0;

  const dataDays = totalDays || Math.min(lookbackDays, Math.max(1, Math.ceil((now.getTime() - feedings[0].date.getTime()) / 86400000)));

  return {
    available: true,
    lastFeedAt: lastFeed.occurredAt,
    nextFeedAt: nextFeedDate.toISOString(),
    nextFeedEarliest: nextEarliestDate.toISOString(),
    nextFeedLatest: nextLatestDate.toISOString(),
    gapMinutes,
    volumeMl,
    confidence: Math.min(1, allGapMinutes.length / 8),
    upcomingFeeds,
    periodGaps,
    periodVolumes,
    overallMedianGapMinutes: overallMedianGap,
    dataDays,
    dataFeeds: feedings.length
  };
}

function predictNextPeriod(currentPeriod: FeedingPeriod, now: Date): FeedingPeriod {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: SHANGHAI_TZ, hour: '2-digit', hour12: false });
  const currentHour = Number(formatter.format(now));
  const def = periodDefs.find(d => currentHour >= d.startHour && currentHour < d.endHour);
  return def ? def.period : currentPeriod;
}

function getGapForPrediction(afterTime: Date, periodGaps: FeedingGapStats[], overallMedian: number | null): number {
  const period = getPeriod(afterTime);
  const periodStats = periodGaps.find(g => g.period === period);
  if (periodStats?.medianMinutes) return periodStats.medianMinutes;
  if (overallMedian) return overallMedian;
  return 180;
}

export function formatDurationFromNow(targetIso: string, now: Date = new Date()): string {
  const target = new Date(targetIso);
  const diffMs = target.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes <= 0) return '应该已经喂了';
  if (diffMinutes < 60) return `约 ${diffMinutes} 分钟后`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (hours < 24) return minutes > 0 ? `约 ${hours} 小时${minutes}分钟后` : `约 ${hours} 小时后`;
  const days = Math.floor(hours / 24);
  const remainH = hours % 24;
  return days > 0 ? `约 ${days} 天${remainH}小时后` : `约 ${hours} 小时后`;
}

export function formatTimeShort(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('zh-CN', { timeZone: SHANGHAI_TZ, hour: '2-digit', minute: '2-digit', hour12: false });
}

export const periodLabels: Record<FeedingPeriod, string> = {
  night: '凌晨',
  earlyMorning: '清晨',
  morning: '上午',
  midday: '中午',
  afternoon: '下午',
  evening: '晚上'
};
