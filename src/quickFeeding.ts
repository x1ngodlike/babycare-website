import type { CareRecord } from './types';

export function latestFeeding(records: CareRecord[]) {
  return records.filter(r => r.type === 'feeding' && !r.deletedAt &&
    new Date(r.occurredAt).getTime() <= Date.now() && ((r.breastMilkMl || 0) + (r.formulaMl || 0)) > 0)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0] ?? null;
}

export function feedingLabel(record: Partial<Pick<CareRecord, 'breastMilkMl' | 'formulaMl'>>) {
  const breast = record.breastMilkMl || 0;
  const formula = record.formulaMl || 0;
  return breast && formula ? `母乳 ${breast} + 奶粉 ${formula} mL` : `${breast ? '母乳' : '奶粉'} ${breast || formula} mL`;
}
