import { describe, expect, it } from 'vitest';
import { buildServerVaccinePlan } from '../server/vaccine-plan';
import type { VaccineCatalogItem, VaccineRecord } from './types';
import { buildVaccinePlan } from './vaccines';

const catalog: VaccineCatalogItem[] = [
  { id: 'hepb', name: '乙肝疫苗', category: 'program', shortName: null, description: '', doseCount: 3, intervalSummary: '', active: true, sortOrder: 1, isSystem: true },
  { id: 'polio', name: '脊灰疫苗', category: 'program', shortName: null, description: '', doseCount: 4, intervalSummary: '', active: true, sortOrder: 2, isSystem: true },
  { id: 'dtap', name: '百白破疫苗', category: 'program', shortName: null, description: '', doseCount: 5, intervalSummary: '', active: true, sortOrder: 3, isSystem: true }
];

const combined: VaccineRecord = {
  id: 'a80db415-3971-4d1f-a54b-35f3fcd352a7', vaccineName: '五联疫苗（DTaP-IPV-Hib）', category: 'self_paid', dose: 1,
  plannedOn: '2026-03-14', administeredOn: '2026-03-14', note: null,
  createdAt: '2026-03-14T00:00:00.000Z', updatedAt: '2026-03-14T00:00:00.000Z',
  createdBy: 'father', updatedBy: 'father', deletedAt: null, deletedBy: null
};

describe('vaccine plan consistency', () => {
  it('keeps UI and push plans aligned for dates and combination vaccines', () => {
    const ui = buildVaccinePlan('2026-01-13', [combined], catalog).map(({ vaccineName, dose, plannedOn, category, record }) => ({ vaccineName, dose, plannedOn, category, recordId: record?.id }));
    const push = buildServerVaccinePlan('2026-01-13', [combined], catalog).map(({ vaccineName, dose, plannedOn, category, record }) => ({ vaccineName, dose, plannedOn, category, recordId: record?.id }));
    expect(push).toEqual(ui);
  });
});
