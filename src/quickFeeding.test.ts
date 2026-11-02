import { describe, expect, it } from 'vitest';
import { feedingLabel, latestFeeding } from './quickFeeding';
import type { CareRecord } from './types';
const feed = (overrides: Partial<CareRecord>) => ({ type: 'feeding', occurredAt: '2020-01-01T00:00:00Z', breastMilkMl: null, formulaMl: 120, deletedAt: null, ...overrides }) as CareRecord;
describe('快捷奶量', () => {
  it('选择最近实际喂奶，忽略其他、已删除、零量和未来记录', () => {
    const valid = feed({});
    expect(latestFeeding([valid, feed({ type: 'note', occurredAt: '2021-01-01T00:00:00Z' }), feed({ deletedAt: '2021-01-01', occurredAt: '2021-01-01T00:00:00Z' }), feed({ formulaMl: 0 }), feed({ occurredAt: '2099-01-01T00:00:00Z' })])).toBe(valid);
    expect(latestFeeding([])).toBeNull();
  });
  it('混合奶分别展示两种奶量', () => {
    expect(feedingLabel(feed({ breastMilkMl: 30, formulaMl: 90 }))).toBe('母乳 30 + 奶粉 90 mL');
    expect(feedingLabel(feed({}))).toBe('奶粉 120 mL');
  });
});
