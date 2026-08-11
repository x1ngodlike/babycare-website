import { describe, expect, it } from 'vitest';
import type { VaccineCatalogItem, VaccineRecord } from './types';
import { addMonths, buildVaccinePlan, doseOptionLabel } from './vaccines';

describe('vaccine reminder plan', () => {
  it('clamps month-end birthdays instead of skipping a month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('shows the next-dose interval without adding another field', () => {
    expect(doseOptionLabel('麻腮风疫苗', 1)).toBe('第 1 剂 · 下针10月后');
    expect(doseOptionLabel('乙肝疫苗', 3)).toBe('第 3 剂 · 常规程序完成');
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
    const catalog: VaccineCatalogItem[] = [{ id: 'hepb', name: '乙肝疫苗', category: 'program', shortName: null, description: '', doseCount: 3, intervalSummary: '', active: false, sortOrder: 10 }];
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
});
