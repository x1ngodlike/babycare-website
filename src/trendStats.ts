import { addDays, isoDay } from './date';
import type { CareRecord } from './types';

type FeedingRecord = Pick<CareRecord, 'type' | 'occurredAt' | 'breastMilkMl' | 'formulaMl'>;

/** 有记录的日期并不代表完整记录；无记录时返回 null，不折算为零。 */
export function feedingStats(records: FeedingRecord[]) {
  const feeds = records.filter(record => record.type === 'feeding');
  const days = new Set(feeds.map(record => isoDay(new Date(record.occurredAt)))).size;
  const milk = feeds.reduce((sum, record) => sum + (record.breastMilkMl ?? 0) + (record.formulaMl ?? 0), 0);
  const times = feeds.map(record => new Date(record.occurredAt).getTime()).sort((a, b) => a - b);
  return {
    days,
    feeds: feeds.length,
    milk,
    dailyMilk: days ? milk / days : null,
    gapHours: times.length < 2 ? null : (times[times.length - 1] - times[0]) / (times.length - 1) / 3_600_000,
  };
}

export function sevenDayWindow<T extends FeedingRecord>(records: T[], end: Date, today: Date) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(end, index - 6));
  const keys = new Set(days.map(isoDay));
  const selected = records.filter(record => keys.has(isoDay(new Date(record.occurredAt))));
  const complete = selected.filter(record => isoDay(new Date(record.occurredAt)) < isoDay(today));
  return { days, records: selected, stats: feedingStats(complete) };
}

/** 与所选七日总量对应；包含今天时，上期末日只取截至同一时刻的记录。 */
export function compareSevenDays<T extends FeedingRecord>(records: T[], selected: Date, today: Date) {
  const current = sevenDayWindow(records, selected, today);
  const previous = sevenDayWindow(records, addDays(selected, -7), today);
  const includesToday = isoDay(selected) === isoDay(today);
  const previousCutoff = addDays(today, -7).getTime();
  const currentStats = feedingStats(current.records);
  const previousStats = feedingStats(previous.records.filter(record => !includesToday || new Date(record.occurredAt).getTime() <= previousCutoff));
  const comparable = currentStats.days === 7 && previousStats.days === 7;
  // 日均与间隔跟随上方指标排除今天，上期也排除对应末日，保持相同日期进度。
  const averageDays = includesToday ? 6 : 7;
  const currentAverage = current.stats;
  const previousAverage = feedingStats(previous.records.filter(record => !includesToday || isoDay(new Date(record.occurredAt)) < isoDay(previous.days[6])));
  const averagesComparable = currentAverage.days === averageDays && previousAverage.days === averageDays;

  return {
    current: { ...current, stats: currentStats },
    previous: { ...previous, stats: previousStats },
    comparable,
    delta: comparable ? currentStats.milk - previousStats.milk : null,
    includesToday,
    averages: {
      current: currentAverage,
      previous: previousAverage,
      days: averageDays,
      comparable: averagesComparable,
      dailyMilkDelta: averagesComparable && currentAverage.dailyMilk !== null && previousAverage.dailyMilk !== null ? currentAverage.dailyMilk - previousAverage.dailyMilk : null,
      gapHoursDelta: averagesComparable && currentAverage.gapHours !== null && previousAverage.gapHours !== null ? currentAverage.gapHours - previousAverage.gapHours : null,
    },
  };
}
