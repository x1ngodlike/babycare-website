import type { VaccineCatalogItem, VaccineRecord } from './types.js';
import { buildSharedVaccinePlan } from '../shared/vaccine-plan.js';

export type ServerVaccinePlanItem = {
  vaccineName: string;
  dose: number;
  plannedOn: string;
  category: 'program' | 'self_paid';
  record?: VaccineRecord;
};

export function buildServerVaccinePlan(birthDate: string, records: VaccineRecord[], catalog: VaccineCatalogItem[]): ServerVaccinePlanItem[] {
  return buildSharedVaccinePlan(birthDate, records, catalog).map(({ hasSuggestedDate: _hasSuggestedDate, ...item }) => item);
}
