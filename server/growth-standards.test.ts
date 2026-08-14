import { describe, expect, it } from 'vitest';
import { assessHeight, assessWeight, milkReferenceRange } from './growth-standards.js';

describe('WHO growth standards assessment', () => {
  it('scores a median measurement as z 0 / 中等', () => {
    const height = assessHeight('male', 0, 49.9);
    expect(height?.z).toBe(0);
    expect(height?.band).toBe('mid');
    expect(height?.bandLabel).toBe('中等');
    expect(height?.anchors).toEqual({ p3: 46.1, p15: 48.0, p50: 49.9, p85: 51.8, p97: 53.7 });
  });

  it('interpolates anchors between whole months', () => {
    // 男童 0.5 月身高中位数 = (49.9 + 54.7) / 2 = 52.3，z 应为 0
    const height = assessHeight('male', 0.5, 52.3);
    expect(height?.z).toBeCloseTo(0, 1);
    expect(height?.anchors.p50).toBeCloseTo(52.3, 1);
  });

  it('assigns bands around the WS 423 boundary values', () => {
    // -2SD 落在“中下”，-1SD 及以内为“中等”，+2SD 为“中上”
    expect(assessWeight('male', 0, 2.5)?.band).toBe('below');
    expect(assessWeight('male', 0, 2.9)?.band).toBe('mid');
    expect(assessWeight('male', 0, 4.4)?.band).toBe('above');
    expect(assessWeight('male', 0, 1.5)?.band).toBe('low');
    expect(assessWeight('male', 0, 6)?.band).toBe('high');
  });

  it('clamps extrapolated z scores to ±3', () => {
    expect(assessHeight('male', 0, 100)?.z).toBe(3);
    expect(assessHeight('male', 0, 20)?.z).toBe(-3);
  });

  it('returns null for unsupported sex or age range', () => {
    expect(assessHeight('unspecified', 6, 60)).toBeNull();
    expect(assessWeight('female', -1, 6)).toBeNull();
    expect(assessHeight('female', 37, 90)).toBeNull();
    expect(assessWeight('male', 36.5, 14)).toBeNull();
  });

  it('keeps female and male tables distinct', () => {
    expect(assessHeight('female', 0, 49.1)?.z).toBe(0);
    expect(assessHeight('female', 0, 49.9)?.z).toBeGreaterThan(0);
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
