import { describe, expect, it } from 'vitest';
import { assessHeight, assessWeight, milkReferenceRange, GROWTH_STANDARD_MAX_MONTHS } from './growth-standards.js';

describe('WS/T 423-2022 growth standards assessment', () => {
  it('scores a median measurement as z 0 / 中', () => {
    const height = assessHeight('male', 0, 51.2);
    expect(height?.z).toBe(0);
    expect(height?.band).toBe('mid');
    expect(height?.bandLabel).toBe('中');
    expect(height?.anchors).toEqual({ minus2sd: 47.3, minus1sd: 49.2, median: 51.2, plus1sd: 53.1, plus2sd: 55.0 });
  });

  it('interpolates anchors between whole months', () => {
    // 男童 0.5 月身高中位数 = (51.2 + 55.1) / 2 = 53.15，z 应为 0
    const height = assessHeight('male', 0.5, 53.15);
    expect(height?.z).toBeCloseTo(0, 1);
    expect(height?.anchors.median).toBeCloseTo(53.15, 1);
  });

  it('interpolates anchors across the 3-month rows after age 2', () => {
    // 男童 25.5 月身高中位数 = 88.2 + (90.8 - 88.2) × 1.5 / 3 = 89.5
    const height = assessHeight('male', 25.5, 89.5);
    expect(height?.z).toBeCloseTo(0, 1);
    expect(height?.anchors.median).toBeCloseTo(89.5, 1);
  });

  it('assigns bands per the SD-method boundaries in table 2', () => {
    // 男童 0 月体重：-2SD=2.7、-1SD=3.1、中位=3.5、+1SD=3.9、+2SD=4.3
    expect(assessWeight('male', 0, 2.7)?.band).toBe('below');
    expect(assessWeight('male', 0, 3.1)?.band).toBe('mid');
    expect(assessWeight('male', 0, 4.3)?.band).toBe('high');
    expect(assessWeight('male', 0, 3.9)?.band).toBe('above');
    expect(assessWeight('male', 0, 1.5)?.band).toBe('low');
  });

  it('clamps extrapolated z scores to ±3', () => {
    expect(assessHeight('male', 0, 100)?.z).toBe(3);
    expect(assessHeight('male', 0, 20)?.z).toBe(-3);
  });

  it('returns null for unsupported sex or age range', () => {
    expect(assessHeight('unspecified', 6, 60)).toBeNull();
    expect(assessWeight('female', -1, 6)).toBeNull();
    expect(assessHeight('female', 82, 110)).toBeNull();
    expect(assessWeight('male', GROWTH_STANDARD_MAX_MONTHS + 0.5, 14)).toBeNull();
  });

  it('supports ages up to the last table row at 81 months', () => {
    // 男童 81 月身高中位数 123.5cm、体重中位数 23.4kg
    expect(assessHeight('male', 81, 123.5)?.z).toBe(0);
    expect(assessWeight('male', 81, 23.4)?.z).toBe(0);
  });

  it('keeps female and male tables distinct', () => {
    expect(assessHeight('female', 0, 50.3)?.z).toBe(0);
    expect(assessHeight('female', 0, 51.2)?.z).toBeGreaterThan(0);
  });
});

describe('milk reference ranges', () => {
  it('maps age brackets to daily totals', () => {
    expect(milkReferenceRange(0)).toEqual({ min: 500, max: 800 });
    expect(milkReferenceRange(2.9)).toEqual({ min: 500, max: 800 });
    expect(milkReferenceRange(3)).toEqual({ min: 700, max: 1000 });
    expect(milkReferenceRange(5.9)).toEqual({ min: 700, max: 1000 });
    expect(milkReferenceRange(6)).toEqual({ min: 600, max: 900 });
    expect(milkReferenceRange(11.9)).toEqual({ min: 600, max: 900 });
    expect(milkReferenceRange(12)).toEqual({ min: 400, max: 600 });
    expect(milkReferenceRange(36)).toEqual({ min: 400, max: 600 });
  });

  it('returns null outside the supported age range', () => {
    expect(milkReferenceRange(-0.5)).toBeNull();
    expect(milkReferenceRange(37)).toBeNull();
  });
});
