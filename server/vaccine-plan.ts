import type { VaccineCatalogItem, VaccineRecord } from './types.js';

export type ServerVaccinePlanItem = {
  vaccineName: string;
  dose: number;
  plannedOn: string;
  category: 'program' | 'self_paid';
  record?: VaccineRecord;
};

type ScheduleItem = { vaccineName: string; dose: number; months: number; category?: 'program' | 'self_paid' };

const schedule: ScheduleItem[] = [
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

function addMonthsFromNextDay(day: string, months: number) {
  const [year, month, date] = day.split('-').map(Number);
  const targetMonth = month - 1 + months;
  const lastDay = new Date(year, targetMonth + 1, 0, 12).getDate();
  const value = new Date(year, targetMonth, Math.min(date, lastDay) + 1, 12);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function alternativeFulfills(record: VaccineRecord, scheduleName: string, scheduleDose: number) {
  const aliases: Record<string, string[]> = {
    '脊灰疫苗': ['脊灰灭活疫苗', '脊灰减毒活疫苗'],
    '乙脑疫苗': ['乙脑减毒活疫苗', '乙脑灭活疫苗'],
    '流脑疫苗': ['A群流脑疫苗', 'A群C群流脑疫苗'],
    '甲肝疫苗': ['甲肝减毒活疫苗', '甲肝灭活疫苗'],
    '百白破疫苗': ['白破疫苗']
  };
  if (aliases[scheduleName]?.includes(record.vaccineName) && record.dose === scheduleDose) return true;
  if (!['五联疫苗（DTaP-IPV-Hib）', '四联疫苗（DTaP-IPV）'].includes(record.vaccineName)) return false;
  return record.dose === scheduleDose && ['脊灰疫苗', '百白破疫苗'].includes(scheduleName);
}

export function buildServerVaccinePlan(birthDate: string, records: VaccineRecord[], catalog: VaccineCatalogItem[]): ServerVaccinePlanItem[] {
  const activeRecords = records.filter(record => !record.deletedAt);
  const remaining = new Map(activeRecords.map(record => [`${record.vaccineName}:${record.dose}`, record]));
  const planned = schedule.flatMap(item => {
    if (!catalog.some(entry => entry.active && entry.name === item.vaccineName)) return [];
    const key = `${item.vaccineName}:${item.dose}`;
    const record = remaining.get(key);
    if (record) remaining.delete(key);
    if (!record && activeRecords.some(candidate => alternativeFulfills(candidate, item.vaccineName, item.dose))) return [];
    return [{
      vaccineName: item.vaccineName,
      dose: item.dose,
      plannedOn: record?.plannedOn || addMonthsFromNextDay(birthDate, item.months),
      category: record?.category || item.category || 'program' as const,
      record
    }];
  });
  return [...planned, ...[...remaining.values()].map(record => ({
    vaccineName: record.vaccineName,
    dose: record.dose,
    plannedOn: record.plannedOn,
    category: record.category,
    record
  }))];
}
