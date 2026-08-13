import type { VaccineCatalogItem, VaccineRecord } from './types';
import { addMonthsClamped, } from '../shared/date';
import { buildSharedVaccinePlan, vaccineSchedule, type VaccineCategory } from '../shared/vaccine-plan';

export interface VaccinePlanItem {
  key: string;
  vaccineName: string;
  dose: number;
  plannedOn: string;
  category: VaccineCategory;
  source: 'schedule' | 'saved';
  hasSuggestedDate: boolean;
  record?: VaccineRecord;
}

interface StaticVaccineCatalogItem { name: string; category: VaccineCategory; shortName?: string }
export type { VaccineCategory };

const programVaccines: StaticVaccineCatalogItem[] = [
  { name: '乙肝疫苗', category: 'program', shortName: 'HepB' },
  { name: '卡介苗', category: 'program', shortName: 'BCG' },
  { name: '脊灰灭活疫苗', category: 'program', shortName: 'IPV' },
  { name: '脊灰减毒活疫苗', category: 'program', shortName: 'bOPV' },
  { name: '百白破疫苗', category: 'program', shortName: 'DTaP' },
  { name: '白破疫苗', category: 'program', shortName: 'DT' },
  { name: '麻腮风疫苗', category: 'program', shortName: 'MMR' },
  { name: '乙脑减毒活疫苗', category: 'program', shortName: 'JE-L' },
  { name: '乙脑灭活疫苗', category: 'program', shortName: 'JE-I' },
  { name: 'A群流脑疫苗', category: 'program', shortName: 'MPSV-A' },
  { name: 'A群C群流脑疫苗', category: 'program', shortName: 'MPSV-AC' },
  { name: '甲肝减毒活疫苗', category: 'program', shortName: 'HepA-L' },
  { name: '甲肝灭活疫苗', category: 'program', shortName: 'HepA-I' }
];

const selfPaidVaccines: StaticVaccineCatalogItem[] = [
  { name: '五联疫苗（DTaP-IPV-Hib）', category: 'self_paid', shortName: '五联' },
  { name: '四联疫苗（DTaP-IPV）', category: 'self_paid', shortName: '四联' },
  { name: 'b型流感嗜血杆菌结合疫苗', category: 'self_paid', shortName: 'Hib' },
  { name: '13价肺炎球菌多糖结合疫苗', category: 'self_paid', shortName: '13价肺炎' },
  { name: '23价肺炎球菌多糖疫苗', category: 'self_paid', shortName: '23价肺炎' },
  { name: '五价轮状病毒减毒活疫苗', category: 'self_paid', shortName: '五价轮状' },
  { name: '口服轮状病毒活疫苗', category: 'self_paid', shortName: '轮状病毒' },
  { name: '水痘减毒活疫苗', category: 'self_paid', shortName: '水痘' },
  { name: '季节性流感疫苗', category: 'self_paid', shortName: '流感' },
  { name: '鼻喷流感减毒活疫苗', category: 'self_paid', shortName: '鼻喷流感' },
  { name: 'AC群流脑结合疫苗', category: 'self_paid', shortName: 'AC群流脑结合' },
  { name: 'ACYW135群流脑多糖疫苗', category: 'self_paid', shortName: '四价流脑' },
  { name: '流脑多糖结合疫苗', category: 'self_paid', shortName: '流脑结合' },
  { name: '肠道病毒71型灭活疫苗', category: 'self_paid', shortName: 'EV71' },
  { name: '狂犬病疫苗', category: 'self_paid' },
  { name: '戊型肝炎疫苗', category: 'self_paid', shortName: '戊肝' }
];

export const vaccineCatalog = [...programVaccines, ...selfPaidVaccines];
export const vaccineCategoryLabels: Record<VaccineCategory, string> = { program: '规划', self_paid: '自费' };

// 国家卫健委《国家免疫规划疫苗儿童免疫程序及说明（2021年版）》的常规起始年龄。
// 这里只用于生成家庭提醒，不处理补种、联合疫苗或特殊健康情况。
export function vaccineCategory(name: string): VaccineCategory { return vaccineCatalog.find(item => item.name === name)?.category || 'self_paid'; }

export function catalogGroups(items: VaccineCatalogItem[]) {
  const active = items.filter(item => item.active).sort((a, b) => a.sortOrder - b.sortOrder);
  return [
    { category: 'program' as const, label: '规划', items: active.filter(item => item.category === 'program') },
    { category: 'self_paid' as const, label: '自费', items: active.filter(item => item.category === 'self_paid') }
  ].filter(group => group.items.length);
}

export function doseOptionLabel(vaccineName: string, dose: number, catalog?: VaccineCatalogItem[]) {
  const schedule = vaccineSchedule.filter(item => item.vaccineName === vaccineName).sort((a, b) => a.dose - b.dose);
  const current = schedule.find(item => item.dose === dose); const next = schedule.find(item => item.dose === dose + 1);
  if (current && next) {
    const months = next.months - current.months;
    return `第 ${dose} 剂 · 下针 ${months} 月后`;
  }
  if (current && !next) return `第 ${dose} 剂 · 完成全程`;
  const item = catalog?.find(value => value.name === vaccineName);
  if (item?.doseCount && dose >= item.doseCount) return `第 ${dose} 剂 · 完成全程`;
  return `第 ${dose} 剂${item?.doseCount ? ` · 共 ${item.doseCount} 剂` : ' · 后续按接种门诊安排'}`;
}

export function addMonths(day: string, months: number, days = 0) {
  return addMonthsClamped(day, months, days);
}

export function buildVaccinePlan(birthDate: string, records: VaccineRecord[], catalog?: VaccineCatalogItem[]): VaccinePlanItem[] {
  return buildSharedVaccinePlan(birthDate, records, catalog).map(item => ({
    ...item,
    key: item.hasSuggestedDate ? `${item.vaccineName}:${item.dose}` : `${item.vaccineName}:${item.dose}:${item.record!.id}`,
    source: item.record ? 'saved' : 'schedule'
  }));
}

export function formatVaccineDay(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}
