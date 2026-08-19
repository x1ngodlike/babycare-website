import type { BabySex } from './types.js';
import {
  WHO_BOYS_WEIGHT, WHO_GIRLS_WEIGHT,
  WHO_BOYS_LENGTH, WHO_GIRLS_LENGTH,
  WHO_BOYS_HEIGHT, WHO_GIRLS_HEIGHT
} from './who-standards-data.js';

// 中国《7岁以下儿童生长标准》（WS/T 423-2022，国家卫健委 2022 发布、2023-03-01 实施）附录 B 标准差数值。
// 行格式：[月龄, -2SD, -1SD, 中位数, +1SD, +2SD]；0-23 月龄逐月一行，2 岁起每 3 个月一行，相邻锚点线性插值。
// 数据来源：国家卫生健康委员会官网发布 PDF 表 B.1（男童体重）、B.2（女童体重）、B.3（男童身长/身高）、B.4（女童身长/身高）。
// 身长（卧位）用于 0-23 月，身高（站立）用于 2 岁及以上；判定界值按标准表 2（标准差法）：
// <-2SD 下、-2SD≤·<-1SD 中下、-1SD≤·<+1SD 中、+1SD≤·<+2SD 中上、≥+2SD 上。

// WHO《Child Growth Standards》（2006）数据见 who-standards-data.ts；
// 体重 0-60 月、身长 0-24 月（卧位）、身高 24-60 月（站位）。曲线展示用，评估逻辑共用。

export type GrowthBand = 'low' | 'below' | 'mid' | 'above' | 'high';

export interface IndicatorAssessment {
  value: number;
  z: number;
  band: GrowthBand;
  bandLabel: string;
  anchors: { minus2sd: number; minus1sd: number; median: number; plus1sd: number; plus2sd: number };
}

export interface ReferenceAnchor {
  ageMonths: number;
  minus2sd: number;
  minus1sd: number;
  median: number;
  plus1sd: number;
  plus2sd: number;
}

export interface GrowthStandard {
  id: 'cn' | 'who';
  name: string;
  maxMonths: number;
  boysWeight: readonly (readonly number[])[];
  girlsWeight: readonly (readonly number[])[];
  boysHeightLength: readonly (readonly number[])[];   // 0 .. switchMonth（身长/CN 全龄合表）
  girlsHeightLength: readonly (readonly number[])[];
  boysHeightStature?: readonly (readonly number[])[]; // switchMonth .. maxMonths（仅 WHO 身高）
  girlsHeightStature?: readonly (readonly number[])[];
  heightSwitchMonth?: number;
}

// [月龄, -2SD, -1SD, 中位数, +1SD, +2SD]，单位厘米（表 B.3）
const BOYS_HEIGHT: readonly (readonly number[])[] = [
  [0, 47.3, 49.2, 51.2, 53.1, 55], [1, 51.1, 53.1, 55.1, 57.2, 59.2],
  [2, 54.7, 56.8, 59, 61.1, 63.2], [3, 57.8, 60, 62.2, 64.4, 66.6],
  [4, 60.3, 62.5, 64.8, 67.1, 69.4], [5, 62.3, 64.6, 66.9, 69.3, 71.6],
  [6, 64, 66.3, 68.7, 71.1, 73.5], [7, 65.4, 67.9, 70.3, 72.7, 75.1],
  [8, 66.8, 69.3, 71.7, 74.2, 76.7], [9, 68, 70.5, 73.1, 75.6, 78.1],
  [10, 69.2, 71.8, 74.3, 76.9, 79.4], [11, 70.3, 72.9, 75.5, 78.1, 80.7],
  [12, 71.4, 74.1, 76.7, 79.3, 81.9], [13, 72.5, 75.1, 77.8, 80.5, 83.1],
  [14, 73.5, 76.2, 78.9, 81.6, 84.3], [15, 74.5, 77.2, 80, 82.7, 85.5],
  [16, 75.5, 78.2, 81, 83.8, 86.6], [17, 76.4, 79.2, 82.1, 84.9, 87.7],
  [18, 77.4, 80.2, 83.1, 86, 88.8], [19, 78.3, 81.2, 84.1, 87, 89.9],
  [20, 79.2, 82.2, 85.1, 88, 91], [21, 80.1, 83.1, 86.1, 89.1, 92],
  [22, 81, 84, 87, 90.1, 93.1], [23, 81.9, 84.9, 88, 91, 94.1],
  [24, 82, 85.1, 88.2, 91.3, 94.4], [27, 84.4, 87.6, 90.8, 94, 97.2],
  [30, 86.6, 89.9, 93.2, 96.5, 99.8], [33, 88.6, 92, 95.4, 98.8, 102.2],
  [36, 90.5, 94, 97.5, 101, 104.5], [39, 92.2, 95.9, 99.5, 103.1, 106.7],
  [42, 93.9, 97.6, 101.3, 105, 108.7], [45, 95.6, 99.4, 103.1, 106.9, 110.7],
  [48, 97.2, 101, 104.9, 108.8, 112.6], [51, 98.8, 102.7, 106.6, 110.6, 114.5],
  [54, 100.3, 104.4, 108.4, 112.4, 116.5], [57, 102, 106.1, 110.2, 114.3, 118.4],
  [60, 103.6, 107.8, 112, 116.2, 120.4], [63, 105.2, 109.5, 113.7, 118, 122.3],
  [66, 106.7, 111.1, 115.5, 119.8, 124.2], [69, 108.2, 112.7, 117.1, 121.6, 126.1],
  [72, 109.7, 114.3, 118.8, 123.3, 127.9], [75, 111.2, 115.8, 120.4, 125, 129.7],
  [78, 112.6, 117.3, 122, 126.7, 131.4], [81, 113.9, 118.7, 123.5, 128.3, 133.1]
];

// [月龄, -2SD, -1SD, 中位数, +1SD, +2SD]，单位厘米（表 B.4）
const GIRLS_HEIGHT: readonly (readonly number[])[] = [
  [0, 46.6, 48.4, 50.3, 52.2, 54.1], [1, 50.1, 52.1, 54.1, 56.1, 58.1],
  [2, 53.5, 55.6, 57.7, 59.8, 61.9], [3, 56.4, 58.6, 60.8, 62.9, 65.1],
  [4, 58.8, 61, 63.3, 65.5, 67.7], [5, 60.7, 63, 65.3, 67.6, 69.9],
  [6, 62.4, 64.7, 67.1, 69.4, 71.7], [7, 63.9, 66.3, 68.7, 71, 73.4],
  [8, 65.3, 67.7, 70.1, 72.5, 75], [9, 66.5, 69, 71.5, 73.9, 76.4],
  [10, 67.8, 70.3, 72.8, 75.3, 77.8], [11, 68.9, 71.5, 74, 76.6, 79.1],
  [12, 70.1, 72.6, 75.2, 77.8, 80.4], [13, 71.1, 73.8, 76.4, 79, 81.7],
  [14, 72.2, 74.9, 77.5, 80.2, 82.9], [15, 73.2, 75.9, 78.6, 81.4, 84.1],
  [16, 74.2, 77, 79.7, 82.5, 85.2], [17, 75.2, 78, 80.8, 83.6, 86.4],
  [18, 76.2, 79, 81.9, 84.7, 87.5], [19, 77.1, 80, 82.9, 85.8, 88.6],
  [20, 78.1, 81, 83.9, 86.8, 89.7], [21, 79, 81.9, 84.9, 87.8, 90.8],
  [22, 79.9, 82.8, 85.8, 88.8, 91.8], [23, 80.7, 83.7, 86.8, 89.8, 92.8],
  [24, 80.8, 83.9, 87, 90.1, 93.1], [27, 83.2, 86.4, 89.5, 92.7, 95.9],
  [30, 85.3, 88.6, 91.9, 95.2, 98.5], [33, 87.3, 90.7, 94.1, 97.5, 100.9],
  [36, 89.3, 92.7, 96.2, 99.7, 103.2], [39, 91.1, 94.6, 98.2, 101.8, 105.3],
  [42, 92.8, 96.4, 100.1, 103.7, 107.4], [45, 94.4, 98.2, 101.9, 105.6, 109.4],
  [48, 96, 99.8, 103.7, 107.5, 111.3], [51, 97.6, 101.5, 105.4, 109.3, 113.2],
  [54, 99.2, 103.2, 107.2, 111.2, 115.2], [57, 100.8, 104.9, 109, 113.1, 117.2],
  [60, 102.5, 106.6, 110.8, 115, 119.1], [63, 104.1, 108.3, 112.6, 116.8, 121.1],
  [66, 105.6, 109.9, 114.3, 118.6, 123], [69, 107.1, 111.5, 115.9, 120.4, 124.8],
  [72, 108.5, 113, 117.5, 122, 126.5], [75, 109.9, 114.5, 119.1, 123.7, 128.2],
  [78, 111.3, 115.9, 120.6, 125.3, 129.9], [81, 112.6, 117.3, 122.1, 126.8, 131.6]
];

// [月龄, -2SD, -1SD, 中位数, +1SD, +2SD]，单位千克（表 B.1）
const BOYS_WEIGHT: readonly (readonly number[])[] = [
  [0, 2.7, 3.1, 3.5, 3.9, 4.3], [1, 3.6, 4.1, 4.6, 5.1, 5.6],
  [2, 4.6, 5.2, 5.8, 6.5, 7.2], [3, 5.5, 6.1, 6.8, 7.6, 8.4],
  [4, 6, 6.7, 7.5, 8.3, 9.3], [5, 6.5, 7.2, 8, 8.9, 9.9],
  [6, 6.8, 7.6, 8.4, 9.4, 10.5], [7, 7.1, 7.9, 8.8, 9.8, 10.9],
  [8, 7.4, 8.2, 9.1, 10.1, 11.3], [9, 7.6, 8.4, 9.4, 10.4, 11.6],
  [10, 7.8, 8.7, 9.6, 10.7, 11.9], [11, 8, 8.9, 9.8, 10.9, 12.2],
  [12, 8.2, 9.1, 10.1, 11.2, 12.4], [13, 8.3, 9.2, 10.3, 11.4, 12.7],
  [14, 8.5, 9.4, 10.5, 11.6, 12.9], [15, 8.7, 9.6, 10.7, 11.8, 13.2],
  [16, 8.8, 9.8, 10.9, 12.1, 13.4], [17, 9, 10, 11.1, 12.3, 13.7],
  [18, 9.2, 10.2, 11.3, 12.5, 14], [19, 9.4, 10.4, 11.5, 12.8, 14.2],
  [20, 9.5, 10.6, 11.7, 13, 14.5], [21, 9.7, 10.8, 11.9, 13.3, 14.8],
  [22, 9.9, 11, 12.2, 13.5, 15], [23, 10.1, 11.1, 12.4, 13.7, 15.3],
  [24, 10.2, 11.3, 12.6, 14, 15.6], [27, 10.7, 11.8, 13.1, 14.6, 16.3],
  [30, 11.1, 12.3, 13.7, 15.2, 17], [33, 11.5, 12.7, 14.2, 15.8, 17.6],
  [36, 11.9, 13.2, 14.6, 16.3, 18.3], [39, 12.3, 13.6, 15.2, 16.9, 19],
  [42, 12.7, 14.1, 15.7, 17.5, 19.7], [45, 13.1, 14.5, 16.2, 18.1, 20.4],
  [48, 13.5, 15, 16.7, 18.8, 21.1], [51, 13.9, 15.5, 17.3, 19.4, 21.9],
  [54, 14.3, 15.9, 17.9, 20.1, 22.7], [57, 14.7, 16.4, 18.4, 20.8, 23.6],
  [60, 15.1, 16.9, 19.1, 21.6, 24.5], [63, 15.6, 17.5, 19.7, 22.3, 25.5],
  [66, 16, 18, 20.3, 23.1, 26.4], [69, 16.4, 18.5, 21, 23.9, 27.4],
  [72, 16.8, 19, 21.6, 24.7, 28.4], [75, 17.2, 19.5, 22.2, 25.5, 29.4],
  [78, 17.6, 20, 22.8, 26.2, 30.3], [81, 17.9, 20.4, 23.4, 26.9, 31.2]
];

// [月龄, -2SD, -1SD, 中位数, +1SD, +2SD]，单位千克（表 B.2）
const GIRLS_WEIGHT: readonly (readonly number[])[] = [
  [0, 2.6, 3, 3.3, 3.7, 4.1], [1, 3.4, 3.8, 4.3, 4.8, 5.3],
  [2, 4.3, 4.8, 5.4, 6, 6.7], [3, 5, 5.6, 6.2, 6.9, 7.7],
  [4, 5.5, 6.2, 6.9, 7.7, 8.6], [5, 6, 6.6, 7.4, 8.2, 9.2],
  [6, 6.3, 7, 7.8, 8.7, 9.7], [7, 6.6, 7.3, 8.1, 9.1, 10.2],
  [8, 6.9, 7.6, 8.4, 9.4, 10.6], [9, 7.1, 7.8, 8.7, 9.7, 10.9],
  [10, 7.3, 8.1, 9, 10, 11.2], [11, 7.5, 8.3, 9.2, 10.3, 11.5],
  [12, 7.7, 8.5, 9.4, 10.5, 11.8], [13, 7.8, 8.7, 9.6, 10.7, 12.1],
  [14, 8, 8.8, 9.8, 11, 12.3], [15, 8.2, 9, 10, 11.2, 12.6],
  [16, 8.3, 9.2, 10.3, 11.5, 12.9], [17, 8.5, 9.4, 10.5, 11.7, 13.1],
  [18, 8.7, 9.6, 10.7, 11.9, 13.4], [19, 8.9, 9.8, 10.9, 12.2, 13.7],
  [20, 9, 10, 11.1, 12.4, 13.9], [21, 9.2, 10.2, 11.3, 12.6, 14.2],
  [22, 9.4, 10.4, 11.5, 12.9, 14.5], [23, 9.5, 10.6, 11.7, 13.1, 14.8],
  [24, 9.7, 10.7, 11.9, 13.3, 15], [27, 10.1, 11.2, 12.5, 14, 15.8],
  [30, 10.6, 11.7, 13, 14.6, 16.5], [33, 11, 12.2, 13.6, 15.2, 17.2],
  [36, 11.4, 12.6, 14.1, 15.9, 17.9], [39, 11.8, 13.1, 14.7, 16.5, 18.7],
  [42, 12.2, 13.6, 15.2, 17.1, 19.4], [45, 12.6, 14, 15.7, 17.7, 20.1],
  [48, 13, 14.5, 16.2, 18.3, 20.8], [51, 13.3, 14.9, 16.7, 18.9, 21.5],
  [54, 13.7, 15.3, 17.2, 19.5, 22.2], [57, 14.1, 15.8, 17.8, 20.2, 23],
  [60, 14.5, 16.3, 18.4, 20.9, 23.8], [63, 14.9, 16.8, 19, 21.6, 24.7],
  [66, 15.3, 17.3, 19.6, 22.3, 25.5], [69, 15.7, 17.8, 20.2, 23, 26.4],
  [72, 16.1, 18.2, 20.7, 23.7, 27.3], [75, 16.4, 18.7, 21.3, 24.4, 28.1],
  [78, 16.8, 19.1, 21.8, 25.1, 28.9], [81, 17.1, 19.5, 22.4, 25.8, 29.8]
];

// CN 标准：身长/身高合一表（0–81 月）；保留旧实现语义。
export const CN_STANDARD: GrowthStandard = {
  id: 'cn',
  name: 'WS/T 423-2022',
  maxMonths: 81,
  boysWeight: BOYS_WEIGHT,
  girlsWeight: GIRLS_WEIGHT,
  boysHeightLength: BOYS_HEIGHT,
  girlsHeightLength: GIRLS_HEIGHT
};

// WHO 标准：体重 0–60 月，身长 0–24 月（卧位）+ 身高 24–60 月（站位）。
export const WHO_STANDARD: GrowthStandard = {
  id: 'who',
  name: 'WHO 儿童生长标准',
  maxMonths: 60,
  boysWeight: WHO_BOYS_WEIGHT,
  girlsWeight: WHO_GIRLS_WEIGHT,
  boysHeightLength: WHO_BOYS_LENGTH,
  girlsHeightLength: WHO_GIRLS_LENGTH,
  boysHeightStature: WHO_BOYS_HEIGHT,
  girlsHeightStature: WHO_GIRLS_HEIGHT,
  heightSwitchMonth: 24
};

// 向后兼容：旧代码以常量形式导入"标准覆盖月龄"，仍按 CN 算。
export const GROWTH_STANDARD_MAX_MONTHS = CN_STANDARD.maxMonths;

// z-score 转百分位（0-100），使用 Abramowitz-Stegun 近似，误差 < 7.5e-8
export function zToPercentile(z: number): number {
  if (z <= -3) return 0.1;
  if (z >= 3) return 99.9;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) prob = 1 - prob;
  return Math.round(prob * 1000) / 10;
}

// 给定标准与性别/月龄，返回用于评估/插值的"身高"表（WHO 在切换月龄之后用 stature 表）。
function heightTableFor(standard: GrowthStandard, sex: BabySex, ageMonths: number): readonly (readonly number[])[] {
  const switchM = standard.heightSwitchMonth;
  if (standard.boysHeightStature && standard.girlsHeightStature && switchM != null && ageMonths >= switchM) {
    return sex === 'male' ? standard.boysHeightStature : standard.girlsHeightStature;
  }
  return sex === 'male' ? standard.boysHeightLength : standard.girlsHeightLength;
}

// 身高参考曲线在 WHO 下需要把身长（0–switchMonth）与身高（switchMonth+1..max）拼成一条连续序列，
// 便于成长曲线一次绘制。CN 无身高/身长分段，直接返回单表。
function heightReferenceTable(standard: GrowthStandard, sex: BabySex): readonly (readonly number[])[] {
  const length = sex === 'male' ? standard.boysHeightLength : standard.girlsHeightLength;
  if (!standard.boysHeightStature || !standard.girlsHeightStature || standard.heightSwitchMonth == null) {
    return length;
  }
  const stature = sex === 'male' ? standard.boysHeightStature : standard.girlsHeightStature;
  const switchM = standard.heightSwitchMonth;
  return [...length.filter(row => row[0] <= switchM), ...stature.filter(row => row[0] > switchM)];
}

// 获取指定性别和指标的参考曲线锚点（过滤到 maxAgeMonths）
export function getReferenceAnchors(
  sex: BabySex,
  indicator: 'height' | 'weight',
  maxAgeMonths: number,
  standard: GrowthStandard = CN_STANDARD
): ReferenceAnchor[] {
  if (sex !== 'male' && sex !== 'female') return [];
  const table = indicator === 'height'
    ? heightReferenceTable(standard, sex)
    : (sex === 'male' ? standard.boysWeight : standard.girlsWeight);
  return table
    .filter(row => row[0] <= maxAgeMonths)
    .map(row => ({
      ageMonths: row[0],
      minus2sd: row[1],
      minus1sd: row[2],
      median: row[3],
      plus1sd: row[4],
      plus2sd: row[5]
    }));
}

const BAND_LABELS: Record<GrowthBand, string> = {
  low: '下',
  below: '中下',
  mid: '中',
  above: '中上',
  high: '上'
};

function interpolateAnchors(table: readonly (readonly number[])[], ageMonths: number, maxMonths: number): number[] {
  const clamped = Math.min(Math.max(ageMonths, 0), maxMonths);
  let lower = 0;
  for (let index = table.length - 1; index >= 0; index -= 1) {
    if (table[index][0] <= clamped) { lower = index; break; }
  }
  const upper = Math.min(lower + 1, table.length - 1);
  const lowerAge = table[lower][0];
  const upperAge = table[upper][0];
  const ratio = upperAge === lowerAge ? 0 : (clamped - lowerAge) / (upperAge - lowerAge);
  return table[lower].slice(1).map((value, index) => value + (table[upper][index + 1] - value) * ratio);
}

function bandOf(z: number): GrowthBand {
  if (z < -2) return 'low';
  if (z < -1) return 'below';
  if (z < 1) return 'mid';
  if (z < 2) return 'above';
  return 'high';
}

// 锚点 SD 值：[-2, -1, 0, 1, 2]，落在相邻锚点间线性插值，超出后按端点段斜率外推并截断到 ±3。
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

export function assessIndicator(table: readonly (readonly number[])[], ageMonths: number, value: number, maxMonths: number): IndicatorAssessment {
  const anchors = interpolateAnchors(table, ageMonths, maxMonths);
  const z = Math.round(zFromAnchors(value, anchors) * 100) / 100;
  const band = bandOf(z);
  return {
    value,
    z,
    band,
    bandLabel: BAND_LABELS[band],
    anchors: { minus2sd: anchors[0], minus1sd: anchors[1], median: anchors[2], plus1sd: anchors[3], plus2sd: anchors[4] }
  };
}

export function assessHeight(sex: BabySex, ageMonths: number, heightCm: number, standard: GrowthStandard = CN_STANDARD): IndicatorAssessment | null {
  if (sex !== 'male' && sex !== 'female') return null;
  if (ageMonths < 0 || ageMonths > standard.maxMonths) return null;
  return assessIndicator(heightTableFor(standard, sex, ageMonths), ageMonths, heightCm, standard.maxMonths);
}

export function assessWeight(sex: BabySex, ageMonths: number, weightKg: number, standard: GrowthStandard = CN_STANDARD): IndicatorAssessment | null {
  if (sex !== 'male' && sex !== 'female') return null;
  if (ageMonths < 0 || ageMonths > standard.maxMonths) return null;
  return assessIndicator(sex === 'male' ? standard.boysWeight : standard.girlsWeight, ageMonths, weightKg, standard.maxMonths);
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