import { describe, expect, it } from 'vitest';
import { canAutoOpenDailyReport, millisecondsUntilDailyReportAutoOpen } from '../src/dailyReport';

describe('daily report auto open time', () => {
  it('keeps the report marked new before 08:00', () => {
    const now = new Date(2026, 7, 24, 7, 59, 30);
    expect(canAutoOpenDailyReport(now)).toBe(false);
    expect(millisecondsUntilDailyReportAutoOpen(now)).toBe(30_000);
  });

  it('allows the first automatic open from 08:00', () => {
    expect(canAutoOpenDailyReport(new Date(2026, 7, 24, 8, 0, 0))).toBe(true);
    expect(millisecondsUntilDailyReportAutoOpen(new Date(2026, 7, 24, 9, 30, 0))).toBe(0);
  });
});
