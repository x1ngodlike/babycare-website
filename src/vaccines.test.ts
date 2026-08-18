import { describe, expect, it } from 'vitest';
import type { VaccineCatalogItem, VaccineRecord } from './types';
import { addMonthsClamped } from '../shared/date';
import { buildVaccinePlan, doseOptionLabel, vaccineDayDistance, vaccineTimingStatus } from './vaccines';

describe('vaccine reminder plan', () => {
  it('clamps month-end birthdays instead of skipping a month', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('shows the next-dose interval without adding another field', () => {
    expect(doseOptionLabel('麻腮风疫苗', 1)).toBe('第 1 剂 · 下针 10 月后');
    expect(doseOptionLabel('乙肝疫苗', 3)).toBe('第 3 剂 · 完成全程');
  });

  it('adds reference dates for the two default self-paid vaccines', () => {
    const catalog: VaccineCatalogItem[] = [
      { id: 'pcv13', name: '13价肺炎疫苗', category: 'self_paid', shortName: null, description: '', doseCount: 4, intervalSummary: '', active: true, sortOrder: 90, isSystem: true },
      { id: 'rv5', name: '五价轮状疫苗', category: 'self_paid', shortName: null, description: '', doseCount: 3, intervalSummary: '', active: true, sortOrder: 100, isSystem: true }
    ];
    const plan = buildVaccinePlan('2026-01-15', [], catalog);
    expect(plan.filter(item => item.vaccineName === '13价肺炎疫苗').map(item => item.plannedOn)).toEqual(['2026-03-16', '2026-05-16', '2026-07-16', '2027-01-16']);
    expect(plan.filter(item => item.vaccineName === '五价轮状疫苗').map(item => item.plannedOn)).toEqual(['2026-03-16', '2026-05-16', '2026-07-16']);
    expect(plan.every(item => item.category === 'self_paid' && item.hasSuggestedDate)).toBe(true);
  });

  it('uses a saved adjustment and completed status for the same dose', () => {
    const record: VaccineRecord = {
      id: 'f80db415-3971-4d1f-a54b-35f3fcd352a7', vaccineName: '乙肝疫苗', category: 'program', dose: 1,
      plannedOn: '2026-02-02', administeredOn: '2026-02-03', note: null,
      createdAt: '2026-02-03T00:00:00.000Z', updatedAt: '2026-02-03T00:00:00.000Z',
      createdBy: 'father', updatedBy: 'father', deletedAt: null, deletedBy: null
    };
    const item = buildVaccinePlan('2026-01-31', [record]).find(value => value.vaccineName === '乙肝疫苗' && value.dose === 1);
    expect(item?.plannedOn).toBe('2026-02-02');
    expect(item?.record?.administeredOn).toBe('2026-02-03');
  });

  it('does not show replaced polio and DTaP doses after a pentavalent record', () => {
    const combined: VaccineRecord = {
      id: 'a80db415-3971-4d1f-a54b-35f3fcd352a7', vaccineName: '五联疫苗（DTaP-IPV-Hib）', category: 'self_paid', dose: 1,
      plannedOn: '2026-03-31', administeredOn: '2026-03-31', note: null,
      createdAt: '2026-03-31T00:00:00.000Z', updatedAt: '2026-03-31T00:00:00.000Z',
      createdBy: 'father', updatedBy: 'father', deletedAt: null, deletedBy: null
    };
    const plan = buildVaccinePlan('2026-01-31', [combined]);
    expect(plan.some(item => item.vaccineName === '脊灰疫苗' && item.dose === 1)).toBe(false);
    expect(plan.some(item => item.vaccineName === '百白破疫苗' && item.dose === 1)).toBe(false);
    expect(plan.some(item => item.vaccineName === combined.vaccineName && item.record?.id === combined.id)).toBe(true);
  });

  it('removes a disabled vaccine from future plans while preserving its saved history', () => {
    const catalog: VaccineCatalogItem[] = [{ id: 'hepb', name: '乙肝疫苗', category: 'program', shortName: null, description: '', doseCount: 3, intervalSummary: '', active: false, sortOrder: 10, isSystem: true }];
    const record: VaccineRecord = {
      id: 'hepb-record', vaccineName: '乙肝疫苗', category: 'program', dose: 1,
      plannedOn: '2026-01-31', administeredOn: '2026-01-31', note: null,
      createdAt: '2026-01-31T00:00:00.000Z', updatedAt: '2026-01-31T00:00:00.000Z',
      createdBy: 'father', updatedBy: 'father', deletedAt: null, deletedBy: null
    };
    const plan = buildVaccinePlan('2026-01-31', [record], catalog);
    expect(plan.filter(item => item.vaccineName === '乙肝疫苗')).toHaveLength(1);
    expect(plan.find(item => item.vaccineName === '乙肝疫苗')?.record?.id).toBe(record.id);
  });

  it('uses the day after birth as the baseline for every suggested dose', () => {
    const plan = buildVaccinePlan('2026-01-13', []);
    expect(plan.find(item => item.vaccineName === '乙肝疫苗' && item.dose === 1)?.plannedOn).toBe('2026-01-14');
    expect(plan.find(item => item.vaccineName === '乙肝疫苗' && item.dose === 2)?.plannedOn).toBe('2026-02-14');
    expect(plan.find(item => item.vaccineName === '乙肝疫苗' && item.dose === 3)?.plannedOn).toBe('2026-07-14');
  });

  it('uses one concise timing label for overdue, today and future dates', () => {
    const now = new Date('2026-08-13T12:00:00+08:00');
    expect(vaccineDayDistance('2026-08-12', now)).toBe(-1);
    expect(vaccineTimingStatus('2026-08-12', now)).toMatchObject({ label: '已过1天', tone: 'overdue' });
    expect(vaccineTimingStatus('2026-08-13', now)).toMatchObject({ label: '今日', tone: 'soon' });
    expect(vaccineTimingStatus('2026-08-20', now)).toMatchObject({ label: '7天后', tone: 'soon' });
  });
});
