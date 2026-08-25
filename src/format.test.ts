import { describe, expect, it } from 'vitest';
import { formatMilkVolume } from './format';

describe('formatMilkVolume', () => {
  it('保留 10000 mL 以下的原单位', () => {
    expect(formatMilkVolume(0)).toEqual({ amount: '0', unit: 'mL' });
    expect(formatMilkVolume(928)).toEqual({ amount: '928', unit: 'mL' });
    expect(formatMilkVolume(3_270)).toEqual({ amount: '3270', unit: 'mL' });
    expect(formatMilkVolume(9_999)).toEqual({ amount: '9999', unit: 'mL' });
  });

  it('将 10000 mL 及以上换算为两位小数的 L', () => {
    expect(formatMilkVolume(10_000)).toEqual({ amount: '10.00', unit: 'L' });
    expect(formatMilkVolume(25_060)).toEqual({ amount: '25.06', unit: 'L' });
  });
});
