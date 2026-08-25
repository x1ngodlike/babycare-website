export interface FormattedMilkVolume {
  amount: string;
  unit: 'mL' | 'L';
}

/** Convert aggregate milk volume for display without changing the mL source value. */
export function formatMilkVolume(value: number): FormattedMilkVolume {
  if (!Number.isFinite(value)) return { amount: '—', unit: 'mL' };
  if (Math.abs(value) < 10_000) return { amount: String(value), unit: 'mL' };
  return { amount: (value / 1_000).toFixed(2), unit: 'L' };
}
