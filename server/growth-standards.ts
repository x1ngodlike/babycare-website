import type { BabySex } from './types.js';

// WHO 儿童生长标准（2006）Z 评分表，按月龄取整月锚点，相邻月线性插值。
// 身长（卧位）用于 0-23 月，身高（站立）用于 24 月及以上；24 月处的 -0.7cm 差异源于测量方式切换。
// 数据来源：WHO Length/Height-for-age、Weight-for-age z-scores 官方表（0-2 岁身长 / 2-5 岁身高 / 0-5 岁体重）。
// 判定界值参照 WS 423-2013《5 岁以下儿童生长状况判定》：Z<-2 偏低、-2≤Z<-1 中下、-1≤Z≤1 中等、1<Z≤2 中上、Z>2 偏高。

export type GrowthBand = 'low' | 'below' | 'mid' | 'above' | 'high';

export interface IndicatorAssessment {
  value: number;
  z: number;
  band: GrowthBand;
  bandLabel: string;
  anchors: { p3: number; p15: number; p50: number; p85: number; p97: number };
}

// 每月一行：[-2SD, -1SD, 中位数, +1SD, +2SD]
const BOYS_HEIGHT: readonly (readonly number[])[] = [
  [46.1, 48.0, 49.9, 51.8, 53.7], [50.8, 52.8, 54.7, 56.7, 58.6], [54.4, 56.4, 58.4, 60.4, 62.4],
  [57.3, 59.4, 61.4, 63.5, 65.5], [59.7, 61.8, 63.9, 66.0, 68.0], [61.7, 63.8, 65.9, 68.0, 70.1],
  [63.3, 65.5, 67.6, 69.8, 71.9], [64.8, 67.0, 69.2, 71.3, 73.5], [66.2, 68.4, 70.6, 72.8, 75.0],
  [67.5, 69.7, 72.0, 74.2, 76.5], [68.7, 71.0, 73.3, 75.6, 77.9], [69.9, 72.2, 74.5, 76.9, 79.2],
  [71.0, 73.4, 75.7, 78.1, 80.5], [72.1, 74.5, 76.9, 79.3, 81.8], [73.1, 75.6, 78.0, 80.5, 83.0],
  [74.1, 76.6, 79.1, 81.7, 84.2], [75.0, 77.6, 80.2, 82.8, 85.4], [76.0, 78.6, 81.2, 83.9, 86.5],
  [76.9, 79.6, 82.3, 85.0, 87.7], [77.7, 80.5, 83.2, 86.0, 88.8], [78.6, 81.4, 84.2, 87.0, 89.8],
  [79.4, 82.3, 85.1, 88.0, 90.9], [80.2, 83.1, 86.0, 89.0, 91.9], [81.0, 83.9, 86.9, 89.9, 92.9],
  [81.0, 84.1, 87.1, 90.2, 93.2], [81.7, 84.9, 88.0, 91.1, 94.2], [82.5, 85.6, 88.8, 92.0, 95.2],
  [83.1, 86.4, 89.6, 92.9, 96.1], [83.8, 87.1, 90.4, 93.7, 97.0], [84.5, 87.8, 91.2, 94.5, 97.9],
  [85.1, 88.5, 91.9, 95.3, 98.7], [85.7, 89.2, 92.7, 96.1, 99.6], [86.4, 89.9, 93.4, 96.9, 100.4],
  [86.9, 90.5, 94.1, 97.6, 101.2], [87.5, 91.1, 94.8, 98.4, 102.0], [88.1, 91.8, 95.4, 99.1, 102.7],
  [88.7, 92.4, 96.1, 99.8, 103.5]
];

const GIRLS_HEIGHT: readonly (readonly number[])[] = [
  [45.4, 47.3, 49.1, 51.0, 52.9], [49.8, 51.7, 53.7, 55.6, 57.6], [53.0, 55.0, 57.1, 59.1, 61.1],
  [55.6, 57.7, 59.8, 61.9, 64.0], [57.8, 59.9, 62.1, 64.3, 66.4], [59.6, 61.8, 64.0, 66.2, 68.5],
  [61.2, 63.5, 65.7, 68.0, 70.3], [62.7, 65.0, 67.3, 69.6, 71.9], [64.0, 66.4, 68.7, 71.1, 73.5],
  [65.3, 67.7, 70.1, 72.6, 75.0], [66.5, 69.0, 71.5, 73.9, 76.4], [67.7, 70.3, 72.8, 75.3, 77.8],
  [68.9, 71.4, 74.0, 76.6, 79.2], [70.0, 72.6, 75.2, 77.8, 80.5], [71.0, 73.7, 76.4, 79.1, 81.7],
  [72.0, 74.8, 77.5, 80.2, 83.0], [73.0, 75.8, 78.6, 81.4, 84.2], [74.0, 76.8, 79.7, 82.5, 85.4],
  [74.9, 77.8, 80.7, 83.6, 86.5], [75.8, 78.8, 81.7, 84.7, 87.6], [76.7, 79.7, 82.7, 85.7, 88.7],
  [77.5, 80.6, 83.7, 86.7, 89.8], [78.4, 81.5, 84.6, 87.7, 90.8], [79.2, 82.3, 85.5, 88.7, 91.9],
  [79.3, 82.5, 85.7, 88.9, 92.2], [80.0, 83.3, 86.6, 89.9, 93.1], [80.8, 84.1, 87.4, 90.8, 94.1],
  [81.5, 84.9, 88.3, 91.7, 95.0], [82.2, 85.7, 89.1, 92.5, 96.0], [82.9, 86.4, 89.9, 93.4, 96.9],
  [83.6, 87.1, 90.7, 94.2, 97.7], [84.3, 87.9, 91.4, 95.0, 98.6], [84.9, 88.6, 92.2, 95.8, 99.4],
  [85.6, 89.3, 92.9, 96.6, 100.3], [86.2, 89.9, 93.6, 97.4, 101.1], [86.8, 90.6, 94.4, 98.1, 101.9],
  [87.4, 91.2, 95.1, 98.9, 102.7]
];

const BOYS_WEIGHT: readonly (readonly number[])[] = [
  [2.5, 2.9, 3.3, 3.9, 4.4], [3.4, 3.9, 4.5, 5.1, 5.8], [4.3, 4.9, 5.6, 6.3, 7.1],
  [5.0, 5.7, 6.4, 7.2, 8.0], [5.6, 6.2, 7.0, 7.8, 8.7], [6.0, 6.7, 7.5, 8.4, 9.3],
  [6.4, 7.1, 7.9, 8.8, 9.8], [6.7, 7.4, 8.3, 9.2, 10.3], [6.9, 7.7, 8.6, 9.6, 10.7],
  [7.1, 8.0, 8.9, 9.9, 11.0], [7.4, 8.2, 9.2, 10.2, 11.4], [7.6, 8.4, 9.4, 10.5, 11.7],
  [7.7, 8.6, 9.6, 10.8, 12.0], [7.9, 8.8, 9.9, 11.0, 12.3], [8.1, 9.0, 10.1, 11.3, 12.6],
  [8.3, 9.2, 10.3, 11.5, 12.8], [8.4, 9.4, 10.5, 11.7, 13.1], [8.6, 9.6, 10.7, 12.0, 13.4],
  [8.8, 9.8, 10.9, 12.2, 13.7], [8.9, 10.0, 11.1, 12.5, 13.9], [9.1, 10.1, 11.3, 12.7, 14.2],
  [9.2, 10.3, 11.5, 12.9, 14.5], [9.4, 10.5, 11.8, 13.2, 14.7], [9.5, 10.7, 12.0, 13.4, 15.0],
  [9.7, 10.8, 12.2, 13.6, 15.3], [9.8, 11.0, 12.4, 13.9, 15.5], [10.0, 11.1, 12.5, 14.1, 15.8],
  [10.1, 11.3, 12.7, 14.3, 16.1], [10.2, 11.5, 12.9, 14.5, 16.3], [10.4, 11.6, 13.1, 14.8, 16.6],
  [10.5, 11.8, 13.3, 15.0, 16.9], [10.7, 11.9, 13.5, 15.2, 17.1], [10.8, 12.1, 13.7, 15.4, 17.4],
  [10.9, 12.2, 13.8, 15.6, 17.6], [11.0, 12.4, 14.0, 15.8, 17.8], [11.2, 12.5, 14.2, 16.0, 18.1],
  [11.3, 12.7, 14.3, 16.2, 18.3]
];

const GIRLS_WEIGHT: readonly (readonly number[])[] = [
  [2.4, 2.8, 3.2, 3.7, 4.2], [3.2, 3.6, 4.2, 4.8, 5.5], [3.9, 4.5, 5.1, 5.8, 6.6],
  [4.5, 5.2, 5.8, 6.6, 7.5], [5.0, 5.7, 6.4, 7.3, 8.2], [5.4, 6.1, 6.9, 7.8, 8.8],
  [5.7, 6.5, 7.3, 8.2, 9.3], [6.0, 6.8, 7.6, 8.6, 9.8], [6.3, 7.0, 7.9, 9.0, 10.2],
  [6.5, 7.3, 8.2, 9.3, 10.5], [6.7, 7.5, 8.5, 9.6, 10.9], [6.9, 7.7, 8.7, 9.9, 11.2],
  [7.0, 7.9, 8.9, 10.1, 11.5], [7.2, 8.1, 9.2, 10.4, 11.8], [7.4, 8.3, 9.4, 10.6, 12.1],
  [7.6, 8.5, 9.6, 10.9, 12.4], [7.7, 8.7, 9.8, 11.1, 12.6], [7.9, 8.9, 10.0, 11.4, 12.9],
  [8.1, 9.1, 10.2, 11.6, 13.2], [8.2, 9.2, 10.4, 11.8, 13.5], [8.4, 9.4, 10.6, 12.1, 13.7],
  [8.6, 9.6, 10.9, 12.3, 14.0], [8.7, 9.8, 11.1, 12.5, 14.3], [8.9, 10.0, 11.3, 12.8, 14.6],
  [9.0, 10.2, 11.5, 13.0, 14.8], [9.2, 10.3, 11.7, 13.3, 15.1], [9.4, 10.5, 11.9, 13.5, 15.4],
  [9.5, 10.7, 12.1, 13.7, 15.7], [9.7, 10.9, 12.3, 14.0, 16.0], [9.8, 11.1, 12.5, 14.2, 16.2],
  [10.0, 11.2, 12.7, 14.4, 16.5], [10.1, 11.4, 12.9, 14.7, 16.8], [10.3, 11.6, 13.1, 14.9, 17.1],
  [10.4, 11.7, 13.3, 15.1, 17.3], [10.5, 11.9, 13.5, 15.4, 17.6], [10.7, 12.0, 13.7, 15.6, 17.9],
  [10.8, 12.2, 13.9, 15.8, 18.1]
];

export const GROWTH_STANDARD_MAX_MONTHS = 36;

const BAND_LABELS: Record<GrowthBand, string> = {
  low: '偏低',
  below: '中下',
  mid: '中等',
  above: '中上',
  high: '偏高'
};

function interpolateAnchors(table: readonly (readonly number[])[], ageMonths: number): number[] {
  const clamped = Math.min(Math.max(ageMonths, 0), GROWTH_STANDARD_MAX_MONTHS);
  const lower = Math.floor(clamped);
  const upper = Math.min(lower + 1, GROWTH_STANDARD_MAX_MONTHS);
  const ratio = clamped - lower;
  return table[lower].map((value, index) => {
    const next = table[upper][index];
    return lower === upper ? value : value + (next - value) * ratio;
  });
}

function bandOf(z: number): GrowthBand {
  if (z < -2) return 'low';
  if (z < -1) return 'below';
  if (z <= 1) return 'mid';
  if (z <= 2) return 'above';
  return 'high';
}

// 锚点 Z 值：[-2, -1, 0, 1, 2]，落在相邻锚点间线性插值，超出后按端点段斜率外推并截断到 ±3。
function zFromAnchors(value: number, anchors: number[]): number {
  const zs = [-2, -1, 0, 1, 2];
  if (value <= anchors[0]) {
    const slope = anchors[1] - anchors[0] || 1;
    return Math.max(-3, -2 + (value - anchors[0]) / slope);
  }
  if (value >= anchors[4]) {
    const slope = anchors[4] - anchors[3] || 1;
    return Math.min(3, 2 + (value - anchors[4]) / slope);
  }
  for (let index = 0; index < 4; index += 1) {
    if (value <= anchors[index + 1]) {
      const span = anchors[index + 1] - anchors[index] || 1;
      return zs[index] + (value - anchors[index]) / span;
    }
  }
  return 0;
}

export function assessIndicator(table: readonly (readonly number[])[], ageMonths: number, value: number): IndicatorAssessment {
  const anchors = interpolateAnchors(table, ageMonths);
  const z = Math.round(zFromAnchors(value, anchors) * 100) / 100;
  const band = bandOf(z);
  return {
    value,
    z,
    band,
    bandLabel: BAND_LABELS[band],
    anchors: { p3: anchors[0], p15: anchors[1], p50: anchors[2], p85: anchors[3], p97: anchors[4] }
  };
}

export function assessHeight(sex: BabySex, ageMonths: number, heightCm: number): IndicatorAssessment | null {
  if (sex !== 'male' && sex !== 'female') return null;
  if (ageMonths < 0 || ageMonths > GROWTH_STANDARD_MAX_MONTHS) return null;
  return assessIndicator(sex === 'male' ? BOYS_HEIGHT : GIRLS_HEIGHT, ageMonths, heightCm);
}

export function assessWeight(sex: BabySex, ageMonths: number, weightKg: number): IndicatorAssessment | null {
  if (sex !== 'male' && sex !== 'female') return null;
  if (ageMonths < 0 || ageMonths > GROWTH_STANDARD_MAX_MONTHS) return null;
  return assessIndicator(sex === 'male' ? BOYS_WEIGHT : GIRLS_WEIGHT, ageMonths, weightKg);
}

// 奶量参考区间（每日总量，mL）：参考中国居民膳食指南与儿保常规建议，仅供参考。
export function milkReferenceRange(ageMonths: number): { min: number; max: number } | null {
  if (ageMonths < 0) return null;
  if (ageMonths < 3) return { min: 500, max: 800 };
  if (ageMonths < 6) return { min: 700, max: 1000 };
  if (ageMonths < 12) return { min: 600, max: 900 };
  if (ageMonths <= 36) return { min: 400, max: 600 };
  return null;
}
