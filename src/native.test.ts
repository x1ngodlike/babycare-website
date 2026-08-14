import { describe, expect, it, vi } from 'vitest';
import type { VaccinePlanItem } from './vaccines';
import { buildVaccineCalendarFile } from './native';

describe('vaccine calendar file', () => {
  it('creates a timed event with a one-day reminder', () => {
    vi.setSystemTime(new Date('2026-08-14T08:00:00Z'));
    const item = {
      key: 'bcg:1', vaccineName: '卡介苗', dose: 1, plannedOn: '2026-08-20', category: 'program', hasSuggestedDate: true,
      record: { id: 'record-1', vaccineName: '卡介苗', dose: 1, plannedOn: '2026-08-20', appointmentOn: '2026-08-22', appointmentTime: '09:30', category: 'program', administeredOn: null, note: null }
    } as VaccinePlanItem;
    const result = buildVaccineCalendarFile(item);
    expect(result).toContain('DTSTART:20260822T093000');
    expect(result).toContain('DTEND:20260822T103000');
    expect(result).toContain('TRIGGER:-P1D');
    expect(result).toContain('SUMMARY:接种疫苗：卡介苗 · 第 1 剂');
    vi.useRealTimers();
  });

  it('creates an all-day event when no appointment time is set', () => {
    const item = {
      key: 'hepb:2', vaccineName: '乙肝疫苗', dose: 2, plannedOn: '2026-08-20', category: 'program', hasSuggestedDate: true,
      record: { id: 'record-2', vaccineName: '乙肝疫苗', dose: 2, plannedOn: '2026-08-20', appointmentOn: '2026-08-31', appointmentTime: null, category: 'program', administeredOn: null, note: null }
    } as VaccinePlanItem;
    const result = buildVaccineCalendarFile(item);
    expect(result).toContain('DTSTART;VALUE=DATE:20260831');
    expect(result).toContain('DTEND;VALUE=DATE:20260901');
  });

  it('moves a late appointment end time to the next day', () => {
    const item = {
      key: 'mmr:1', vaccineName: '麻腮风疫苗', dose: 1, plannedOn: '2026-08-20', category: 'program', hasSuggestedDate: true,
      record: { id: 'record-3', vaccineName: '麻腮风疫苗', dose: 1, plannedOn: '2026-08-20', appointmentOn: '2026-08-31', appointmentTime: '23:30', category: 'program', administeredOn: null, note: null }
    } as VaccinePlanItem;
    expect(buildVaccineCalendarFile(item)).toContain('DTEND:20260901T003000');
  });
});
