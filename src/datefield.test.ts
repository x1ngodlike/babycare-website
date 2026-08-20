import { describe, expect, it } from 'vitest';
import { clampDay, combineLocal, compareDay, isValidDay, minutesAgoIso, monthGrid, shiftMonth, splitLocal } from './DateField';

describe('isValidDay', () => {
  it('接受合法日期', () => {
    expect(isValidDay('2026-08-12')).toBe(true);
    expect(isValidDay('2024-02-29')).toBe(true); // 闰年
    expect(isValidDay('2026-01-01')).toBe(true);
  });
  it('拒绝不存在的日期', () => {
    expect(isValidDay('2026-02-29')).toBe(false); // 非闰年
    expect(isValidDay('2026-02-30')).toBe(false);
    expect(isValidDay('2026-13-01')).toBe(false);
    expect(isValidDay('2026-04-31')).toBe(false);
    expect(isValidDay('2026-00-10')).toBe(false);
  });
  it('拒绝格式错误的输入', () => {
    expect(isValidDay('')).toBe(false);
    expect(isValidDay('2026-8-12')).toBe(false);
    expect(isValidDay('2026/08/12')).toBe(false);
    expect(isValidDay('abc')).toBe(false);
  });
});

describe('compareDay', () => {
  it('按时间先后比较', () => {
    expect(compareDay('2026-08-11', '2026-08-12')).toBe(-1);
    expect(compareDay('2026-08-12', '2026-08-12')).toBe(0);
    expect(compareDay('2026-08-13', '2026-08-12')).toBe(1);
  });
  it('跨月跨年比较正确', () => {
    expect(compareDay('2026-01-31', '2026-02-01')).toBe(-1);
    expect(compareDay('2025-12-31', '2026-01-01')).toBe(-1);
  });
});

describe('shiftMonth', () => {
  it('月内平移', () => {
    expect(shiftMonth(2026, 7, 1)).toEqual({ year: 2026, month: 8 });
    expect(shiftMonth(2026, 7, -1)).toEqual({ year: 2026, month: 6 });
  });
  it('跨年边界', () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth(2025, 11, 1)).toEqual({ year: 2026, month: 0 });
    expect(shiftMonth(2026, 0, -13)).toEqual({ year: 2024, month: 11 });
  });
});

describe('monthGrid', () => {
  it('固定返回 42 格且周一开头', () => {
    const grid = monthGrid(2026, 7); // 2026 年 8 月
    expect(grid).toHaveLength(42);
    // 2026-08-01 是周六，周一开头时前面有 5 格外月日期
    expect(grid[0].day).toBe('2026-07-27');
    expect(grid[0].inMonth).toBe(false);
    expect(grid[5].day).toBe('2026-08-01');
    expect(grid[5].inMonth).toBe(true);
  });
  it('闰年 2 月包含 29 日', () => {
    const days = monthGrid(2024, 1).filter(cell => cell.inMonth).map(cell => cell.day);
    expect(days).toHaveLength(29);
    expect(days).toContain('2024-02-29');
  });
  it('非闰年 2 月只有 28 天', () => {
    const days = monthGrid(2026, 1).filter(cell => cell.inMonth).map(cell => cell.day);
    expect(days).toHaveLength(28);
    expect(days).not.toContain('2026-02-29');
  });
});

describe('clampDay', () => {
  it('限制在 min/max 内', () => {
    expect(clampDay('2026-08-01', '2026-08-05', '2026-08-20')).toBe('2026-08-05');
    expect(clampDay('2026-08-25', '2026-08-05', '2026-08-20')).toBe('2026-08-20');
    expect(clampDay('2026-08-12', '2026-08-05', '2026-08-20')).toBe('2026-08-12');
  });
  it('无边界时原样返回', () => {
    expect(clampDay('2026-08-12')).toBe('2026-08-12');
  });
});

describe('splitLocal / combineLocal', () => {
  it('ISO 与本地 day+time 可以往返', () => {
    const iso = new Date(2026, 7, 12, 13, 6).toISOString();
    const parts = splitLocal(iso);
    expect(parts.day).toBe('2026-08-12');
    expect(parts.time).toBe('13:06');
    expect(combineLocal(parts.day, parts.time)).toBe(iso);
  });
});

describe('minutesAgoIso', () => {
  it('以点击时的当前时间向前计算', () => {
    const now = new Date('2026-08-20T14:26:30.000Z').getTime();
    expect(minutesAgoIso(10, now)).toBe('2026-08-20T14:16:30.000Z');
    expect(minutesAgoIso(30, now)).toBe('2026-08-20T13:56:30.000Z');
  });
});
