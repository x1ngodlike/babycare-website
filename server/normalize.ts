import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getMilestoneDefinition } from '../shared/milestones.js';
import { growthRecordSchema, milestoneRecordSchema, recordSchema, vaccineRecordSchema } from './schemas.js';
import type { CareRecord, FamilyId, GrowthRecord, MilestoneRecord, VaccineRecord } from './types.js';

export function normalizeRecord(input: z.infer<typeof recordSchema>, actor: FamilyId, preserveAudit = false): CareRecord {
  const now = new Date().toISOString();
  return {
    id: input.id || randomUUID(),
    type: input.type,
    occurredAt: input.occurredAt,
    breastMilkMl: input.type === 'feeding' ? input.breastMilkMl ?? null : null,
    formulaMl: input.type === 'feeding' ? input.formulaMl ?? null : null,
    supplement: input.type === 'supplement' ? input.supplement ?? null : null,
    bowelSize: input.type === 'bowel' ? input.bowelSize ?? null : null,
    subject: input.type === 'note' ? input.subject || input.note || null : null,
    note: input.type === 'note' && !input.subject ? null : input.note ?? null,
    createdAt: input.createdAt || now,
    updatedAt: preserveAudit && input.updatedAt ? input.updatedAt : now,
    createdBy: preserveAudit ? input.createdBy || 'legacy' : actor,
    updatedBy: preserveAudit ? input.updatedBy || input.createdBy || 'legacy' : actor,
    deletedAt: preserveAudit ? input.deletedAt || null : null,
    deletedBy: preserveAudit ? input.deletedBy || null : null
  };
}

export function normalizeGrowthRecord(input: z.infer<typeof growthRecordSchema>, actor: FamilyId, preserveAudit = false): GrowthRecord {
  const now = new Date().toISOString();
  return {
    id: input.id || randomUUID(), measuredOn: input.measuredOn,
    heightCm: Math.round(input.heightCm * 10) / 10, weightKg: Math.round(input.weightKg * 100) / 100,
    createdAt: input.createdAt || now, updatedAt: preserveAudit && input.updatedAt ? input.updatedAt : now,
    createdBy: preserveAudit ? input.createdBy || 'legacy' : actor,
    updatedBy: preserveAudit ? input.updatedBy || input.createdBy || 'legacy' : actor,
    deletedAt: preserveAudit ? input.deletedAt || null : null,
    deletedBy: preserveAudit ? input.deletedBy || null : null,
    evaluation: preserveAudit ? input.evaluation || null : null,
    evaluatedAt: preserveAudit ? input.evaluatedAt || null : null
  };
}

export function normalizeVaccineRecord(input: z.infer<typeof vaccineRecordSchema>, actor: FamilyId, preserveAudit = false): VaccineRecord {
  const now = new Date().toISOString();
  return {
    id: input.id || randomUUID(), vaccineName: input.vaccineName, category: input.category || 'program', dose: input.dose,
    plannedOn: input.plannedOn, appointmentOn: input.appointmentOn || null, appointmentTime: input.appointmentOn ? input.appointmentTime || null : null, administeredOn: input.administeredOn, note: input.note || null,
    createdAt: input.createdAt || now, updatedAt: preserveAudit && input.updatedAt ? input.updatedAt : now,
    createdBy: preserveAudit ? input.createdBy || 'legacy' : actor,
    updatedBy: preserveAudit ? input.updatedBy || input.createdBy || 'legacy' : actor,
    deletedAt: preserveAudit ? input.deletedAt || null : null,
    deletedBy: preserveAudit ? input.deletedBy || null : null
  };
}

export function normalizeMilestoneRecord(input: z.infer<typeof milestoneRecordSchema>, actor: FamilyId, preserveAudit = false): MilestoneRecord {
  const now = new Date().toISOString();
  const def = getMilestoneDefinition(input.milestoneKey);
  const category = input.category ?? def?.category ?? 'gross_motor';
  return {
    id: input.id || randomUUID(),
    milestoneKey: input.milestoneKey,
    category,
    achievedOn: input.achievedOn,
    note: input.note || null,
    photo: input.photo || null,
    createdAt: input.createdAt || now,
    updatedAt: preserveAudit && input.updatedAt ? input.updatedAt : now,
    createdBy: preserveAudit ? input.createdBy || 'legacy' : actor,
    updatedBy: preserveAudit ? input.updatedBy || input.createdBy || 'legacy' : actor,
    deletedAt: preserveAudit ? input.deletedAt || null : null,
    deletedBy: preserveAudit ? input.deletedBy || null : null
  };
}

export function calculateAgeText(birthDate: string, onDate: string): string {
  const birth = new Date(`${birthDate}T12:00:00`);
  const at = new Date(`${onDate}T12:00:00`);
  let months = (at.getFullYear() - birth.getFullYear()) * 12 + (at.getMonth() - birth.getMonth());
  if (at.getDate() < birth.getDate()) months -= 1;
  const anniversary = new Date(birth.getFullYear(), birth.getMonth() + months, birth.getDate());
  const days = Math.max(0, Math.floor((at.getTime() - anniversary.getTime()) / 86400_000));
  return `${Math.max(0, months)}个月${days ? `${days}天` : ''}`;
}
