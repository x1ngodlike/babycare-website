import type { VaccineCatalogItem, VaccineRecord } from './types';

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

export type VaccineCategory = 'program' | 'self_paid';
interface StaticVaccineCatalogItem { name: string; category: VaccineCategory; shortName?: string }
type ScheduleItem = { vaccineName: string; dose: number; months: number; days?: number; category?: VaccineCategory };

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
export const vaccineSchedule: ScheduleItem[] = [
  { vaccineName: '乙肝疫苗', dose: 1, months: 0 },
  { vaccineName: '卡介苗', dose: 1, months: 0 },
  { vaccineName: '乙肝疫苗', dose: 2, months: 1 },
  { vaccineName: '脊灰疫苗', dose: 1, months: 2 },
  { vaccineName: '脊灰疫苗', dose: 2, months: 3 },
  { vaccineName: '百白破疫苗', dose: 1, months: 3 },
  { vaccineName: '脊灰疫苗', dose: 3, months: 4 },
  { vaccineName: '百白破疫苗', dose: 2, months: 4 },
  { vaccineName: '百白破疫苗', dose: 3, months: 5 },
  { vaccineName: '乙肝疫苗', dose: 3, months: 6 },
  { vaccineName: '流脑疫苗', dose: 1, months: 6 },
  { vaccineName: '麻腮风疫苗', dose: 1, months: 8 },
  { vaccineName: '乙脑疫苗', dose: 1, months: 8 },
  { vaccineName: '流脑疫苗', dose: 2, months: 9 },
  { vaccineName: '百白破疫苗', dose: 4, months: 18 },
  { vaccineName: '麻腮风疫苗', dose: 2, months: 18 },
  { vaccineName: '甲肝疫苗', dose: 1, months: 18 },
  { vaccineName: '乙脑疫苗', dose: 2, months: 24 },
  { vaccineName: '流脑疫苗', dose: 3, months: 36 },
  { vaccineName: '脊灰疫苗', dose: 4, months: 48 },
  { vaccineName: '百白破疫苗', dose: 5, months: 72 },
  { vaccineName: '流脑疫苗', dose: 4, months: 72 },
  { vaccineName: '13价肺炎疫苗', dose: 1, months: 2, category: 'self_paid' },
  { vaccineName: '13价肺炎疫苗', dose: 2, months: 4, category: 'self_paid' },
  { vaccineName: '13价肺炎疫苗', dose: 3, months: 6, category: 'self_paid' },
  { vaccineName: '13价肺炎疫苗', dose: 4, months: 12, category: 'self_paid' },
  { vaccineName: '五价轮状疫苗', dose: 1, months: 2, category: 'self_paid' },
  { vaccineName: '五价轮状疫苗', dose: 2, months: 4, category: 'self_paid' },
  { vaccineName: '五价轮状疫苗', dose: 3, months: 6, category: 'self_paid' }
];

export const vaccineNames = vaccineCatalog.map(item => item.name);
export const vaccineCatalogGroups = [
  { category: 'program' as const, label: '免疫规划', items: programVaccines },
  { category: 'self_paid' as const, label: '非免疫规划·自费', items: selfPaidVaccines }
];
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
  const [year, month, date] = day.split('-').map(Number);
  const targetMonth = month - 1 + months;
  const lastDay = new Date(year, targetMonth + 1, 0, 12).getDate();
  const value = new Date(year, targetMonth, Math.min(date, lastDay) + days, 12);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function alternativeFulfills(record: VaccineRecord, scheduleName: string, scheduleDose: number) {
  const aliases: Record<string, string[]> = {
    '脊灰疫苗': ['脊灰灭活疫苗', '脊灰减毒活疫苗'], '乙脑疫苗': ['乙脑减毒活疫苗', '乙脑灭活疫苗'],
    '流脑疫苗': ['A群流脑疫苗', 'A群C群流脑疫苗'], '甲肝疫苗': ['甲肝减毒活疫苗', '甲肝灭活疫苗'], '百白破疫苗': ['白破疫苗']
  };
  if (aliases[scheduleName]?.includes(record.vaccineName) && record.dose === scheduleDose) return true;
  if (!['五联疫苗（DTaP-IPV-Hib）', '四联疫苗（DTaP-IPV）'].includes(record.vaccineName)) return false;
  const equivalent = record.dose <= 2
    ? [`脊灰疫苗:${record.dose}`, `百白破疫苗:${record.dose}`]
    : [`脊灰疫苗:${record.dose}`, `百白破疫苗:${record.dose}`];
  return equivalent.includes(`${scheduleName}:${scheduleDose}`);
}

export function buildVaccinePlan(birthDate: string, records: VaccineRecord[], catalog?: VaccineCatalogItem[]): VaccinePlanItem[] {
  const active = records.filter(record => !record.deletedAt);
  const byKey = new Map(active.map(record => [`${record.vaccineName}:${record.dose}`, record]));
  const scheduled = vaccineSchedule.flatMap(item => {
    if (catalog && !catalog.some(entry => entry.active && entry.name === item.vaccineName)) return [];
    const key = `${item.vaccineName}:${item.dose}`;
    const record = byKey.get(key);
    if (record) byKey.delete(key);
    if (!record && active.some(candidate => alternativeFulfills(candidate, item.vaccineName, item.dose))) return [];
    return [{
      key,
      vaccineName: item.vaccineName,
      dose: item.dose,
      plannedOn: record?.plannedOn || addMonths(birthDate, item.months, item.days),
      category: record?.category || item.category || 'program' as const,
      source: record ? 'saved' as const : 'schedule' as const,
      hasSuggestedDate: true,
      record
    }];
  });
  const extras = [...byKey.values()].map(record => ({
    key: `${record.vaccineName}:${record.dose}:${record.id}`,
    vaccineName: record.vaccineName,
    dose: record.dose,
    plannedOn: record.plannedOn,
    category: record.category,
    source: 'saved' as const,
    hasSuggestedDate: false,
    record
  }));
  return [...scheduled, ...extras];
}

export function formatVaccineDay(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}
