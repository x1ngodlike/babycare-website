import type { CareRecord, GrowthRecord, VaccineRecord } from '../types.js';

export class DuplicateSupplementError extends Error {
  existing: CareRecord;
  constructor(existing: CareRecord) {
    super(`${existing.supplement} 今天已经记录`);
    this.existing = existing;
  }
}

export class RecordNotFoundError extends Error {}
export class CareItemConflictError extends Error {}
export class CareItemInactiveError extends Error {}
export class CareItemOrderError extends Error {}
export class VaccineCatalogConflictError extends Error {}
export class FamilyPermissionError extends Error {}

export class DuplicateGrowthDayError extends Error {
  existing: GrowthRecord;
  constructor(existing: GrowthRecord) { super('当天已经记录身高体重'); this.existing = existing; }
}

export class DuplicateVaccineRecordError extends Error {
  existing: VaccineRecord;
  constructor(existing: VaccineRecord) { super('这针疫苗已经记录'); this.existing = existing; }
}
