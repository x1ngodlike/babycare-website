import { describe, expect, it } from 'vitest';
import { describeWeatherCode, diaryPeriodForHour } from './weather';

describe('diary theme weather', () => {
  it('uses four concise time periods', () => {
    expect(diaryPeriodForHour(5)).toBe('morning');
    expect(diaryPeriodForHour(12)).toBe('daytime');
    expect(diaryPeriodForHour(18)).toBe('evening');
    expect(diaryPeriodForHour(23)).toBe('night');
    expect(diaryPeriodForHour(3)).toBe('night');
  });

  it('maps WMO weather codes to stable visual groups', () => {
    expect(describeWeatherCode(0, true)).toMatchObject({ kind: 'clear', label: '晴', icon: '☀️' });
    expect(describeWeatherCode(0, false)).toMatchObject({ kind: 'clear', icon: '🌙' });
    expect(describeWeatherCode(63)).toMatchObject({ kind: 'rain', label: '雨' });
    expect(describeWeatherCode(75)).toMatchObject({ kind: 'snow' });
    expect(describeWeatherCode(95)).toMatchObject({ kind: 'thunder' });
  });
});
