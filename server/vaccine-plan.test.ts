import { describe, expect, it } from 'vitest';
import { buildServerVaccinePlan } from './vaccine-plan.js';
import type { VaccineCatalogItem } from './types.js';

const catalog: VaccineCatalogItem[] = [
  { id: 'hepb', name: '乙肝疫苗', category: 'program', shortName: null, description: '', doseCount: 3, intervalSummary: '', active: true, sortOrder: 1, isSystem: true }
];

describe('server vaccine plan', () => {
  it('uses the day after birth for the push plan', () => {
    const plan = buildServerVaccinePlan('2026-01-13', [], catalog);
    expect(plan.map(item => item.plannedOn)).toEqual(['2026-01-14', '2026-02-14', '2026-07-14']);
  });
});
