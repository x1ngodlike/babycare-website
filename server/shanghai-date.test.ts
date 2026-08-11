import { describe, expect, it } from 'vitest';
import { canonicalInstant, shanghaiDateForInstant, shanghaiDayUtcRange } from './shanghai-date.js';

describe('Shanghai care-day boundaries', () => {
  it('converts one Shanghai calendar day to indexed UTC ISO boundaries', () => {
    expect(shanghaiDayUtcRange('2026-08-12')).toEqual({
      from: '2026-08-11T16:00:00.000Z',
      to: '2026-08-12T16:00:00.000Z'
    });
  });

  it('keeps midnight and late-night records on the correct Shanghai date', () => {
    expect(shanghaiDateForInstant('2026-08-11T15:59:59.999Z')).toBe('2026-08-11');
    expect(shanghaiDateForInstant('2026-08-11T16:00:00.000Z')).toBe('2026-08-12');
    expect(shanghaiDateForInstant('2026-08-11T16:17:00.000Z')).toBe('2026-08-12');
    expect(shanghaiDateForInstant('2026-08-12T15:59:59.999Z')).toBe('2026-08-12');
    expect(shanghaiDateForInstant('2026-08-12T16:00:00.000Z')).toBe('2026-08-13');
  });

  it('canonicalizes legacy offset timestamps without changing their instant', () => {
    expect(canonicalInstant('2026-08-12T00:17:00+08:00')).toBe('2026-08-11T16:17:00.000Z');
  });
});
