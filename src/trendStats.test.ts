import { describe, expect, it } from 'vitest';
import { addDays, isoDay } from './date';
import { compareSevenDays, feedingStats, sevenDayWindow } from './trendStats';

const today = new Date('2026-09-09T12:00:00');
function feed(day: string, milk = 100, time = '08:00') {
  return { type: 'feeding' as const, occurredAt: `${day}T${time}:00`, breastMilkMl: milk, formulaMl: null };
}

describe('七日统计口径', () => {
  it('只取图表中的七天，排除第八天；日均分子和分母都排除今天', () => {
    const records = Array.from({ length: 8 }, (_, i) => feed(isoDay(addDays(today, -i)), i === 0 ? 900 : 100));
    const window = sevenDayWindow(records, today, today);
    expect(window.days.map(isoDay)).toEqual(['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09']);
    expect(feedingStats(window.records).milk).toBe(1500);
    expect(window.stats).toMatchObject({ days: 6, milk: 600, dailyMilk: 100 });
  });

  it('历史七日包含所选日，并排除两端范围外的数据', () => {
    const end = new Date('2026-09-08T12:00:00');
    const window = sevenDayWindow([feed('2026-09-01', 900), feed('2026-09-02', 60), feed('2026-09-08', 140, '23:59'), feed('2026-09-09', 900)], end, today);
    expect(window.stats).toMatchObject({ days: 2, milk: 200, dailyMilk: 100 });
    expect(window.records).toHaveLength(2);
  });

  it('无喂奶数据返回空值，其他记录不构成喂奶记录日', () => {
    expect(feedingStats([{ ...feed('2026-09-08'), type: 'note' }])).toMatchObject({ days: 0, milk: 0, dailyMilk: null, gapHours: null });
    expect(sevenDayWindow([feed('2026-09-09')], today, today).stats.dailyMilk).toBeNull();
  });

  it('混合喂养合计奶量；间隔排序后计算并包含跨夜', () => {
    expect(feedingStats([{ ...feed('2026-09-09', 60), formulaMl: 40 }, feed('2026-09-08', 100, '20:00')])).toMatchObject({ milk: 200, dailyMilk: 100, gapHours: 12 });
    expect(feedingStats([feed('2026-09-08')]).gapHours).toBeNull();
  });
});

describe('七日总奶量增减', () => {
  const records = Array.from({ length: 14 }, (_, i) => feed(isoDay(addDays(today, -i)), i < 7 ? 200 : 100));
  it('与所选七日一致，上期末日排除晚于当前时刻的记录', () => {
    const comparison = compareSevenDays([...records, feed('2026-09-02', 900, '16:00')], today, today);
    expect(comparison.current.days.map(isoDay)).toEqual(['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09']);
    expect(isoDay(comparison.previous.days[0])).toBe('2026-08-27');
    expect(comparison.current.stats.milk).toBe(1400);
    expect(comparison.previous.stats.milk).toBe(700);
    expect(comparison.delta).toBe(700);
    expect(comparison.includesToday).toBe(true);
  });
  it('缺少任一天时不显示差值，同日重复记录不能补足天数', () => {
    const comparison = compareSevenDays([...records.slice(1), records[1]], today, today);
    expect(comparison.delta).toBeNull();
    expect(comparison.current.stats.days).toBe(6);
  });
  it('上期末日同一时刻之前无记录时，不把缺失当成零', () => {
    const partial = records.filter(record => !record.occurredAt.startsWith('2026-09-02'));
    expect(compareSevenDays([...partial, feed('2026-09-02', 100, '16:00')], today, today).delta).toBeNull();
  });
  it('历史周期包含末日晚间记录，支持减少与持平', () => {
    const historical = Array.from({ length: 14 }, (_, i) => feed(isoDay(addDays(today, -i - 1)), i < 7 ? 100 : 200, '20:00'));
    expect(compareSevenDays(historical, addDays(today, -1), today).delta).toBe(-700);
    expect(compareSevenDays(historical.map(record => ({ ...record, breastMilkMl: 100 })), addDays(today, -1), today).delta).toBe(0);
  });
  it('回看日期与跨年窗口边界正确', () => {
    const comparison = compareSevenDays([], new Date('2026-01-03T12:00:00'), today);
    expect(isoDay(comparison.current.days[0])).toBe('2025-12-28');
    expect(isoDay(comparison.previous.days[6])).toBe('2025-12-27');
    expect(comparison.delta).toBeNull();
  });
});


describe('记录日均和记录间隔增减', () => {
  const history = Array.from({ length: 14 }, (_, i) => {
    const day = isoDay(addDays(today, -i));
    return [feed(day, i < 7 ? 200 : 100, '08:00'), feed(day, i < 7 ? 200 : 100, i < 7 ? '10:00' : '12:00')];
  }).flat();
  it('排除今天和上期对应末日，与显示的日均及间隔同口径', () => {
    const records = [...history, feed(isoDay(today), 900, '11:00'), feed(isoDay(addDays(today, -7)), 900, '18:00')];
    const result = compareSevenDays(records, today, today).averages;
    expect(result.comparable).toBe(true);
    expect(result.days).toBe(6);
    expect(result.current.dailyMilk).toBe(400);
    expect(result.previous.dailyMilk).toBe(200);
    expect(result.dailyMilkDelta).toBe(200);
    expect(result.current.gapHours).toBeCloseTo(122 / 11);
    expect(result.previous.gapHours).toBeCloseTo(124 / 11);
    expect(result.gapHoursDelta).toBeCloseTo(-2 / 11);
  });
  it('今天尚未录入时，已结束日期的日均和间隔仍可比较', () => {
    const records = history.filter(record => !record.occurredAt.startsWith(isoDay(today)));
    const result = compareSevenDays(records, today, today);
    expect(result.delta).toBeNull();
    expect(result.averages.dailyMilkDelta).toBe(200);
  });
  it('任一对应日期缺失时，日均和间隔均不计算变化', () => {
    const records = history.filter(record => !record.occurredAt.startsWith(isoDay(addDays(today, -2))));
    const result = compareSevenDays(records, today, today).averages;
    expect(result.dailyMilkDelta).toBeNull();
    expect(result.gapHoursDelta).toBeNull();
  });
  it('历史日期比较完整七天，持平返回零', () => {
    const records = Array.from({ length: 14 }, (_, i) => feed(isoDay(addDays(today, -i - 1))));
    const result = compareSevenDays(records, addDays(today, -1), today).averages;
    expect(result.days).toBe(7);
    expect(result.dailyMilkDelta).toBe(0);
    expect(result.gapHoursDelta).toBe(0);
  });
});
