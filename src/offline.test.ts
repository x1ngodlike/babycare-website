import { beforeEach, describe, expect, it } from 'vitest';
import { createUuid } from './id';
import { clearRememberedUser, getOutbox, getRememberedUser, queueAction, rememberUser } from './offline';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeEach(() => { Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true }); });

describe('offline reliability', () => {
  it('remembers the last successful family identity until explicit logout', () => {
    rememberUser({ id: 'mother', name: '妈妈', role: 'member' });
    expect(getRememberedUser()?.id).toBe('mother');
    clearRememberedUser();
    expect(getRememberedUser()).toBeNull();
  });

  it('merges an offline update into a pending create', () => {
    const id = createUuid();
    queueAction('mother', { action: 'create', payload: { id, type: 'feeding', occurredAt: new Date().toISOString(), breastMilkMl: 60 } });
    queueAction('mother', { action: 'update', recordId: id, payload: { id, type: 'feeding', occurredAt: new Date().toISOString(), breastMilkMl: 90 } });
    expect(getOutbox('mother')).toHaveLength(1);
    expect(getOutbox('mother')[0].payload?.breastMilkMl).toBe(90);
  });

  it('cancels a pending delete when the user restores the record', () => {
    const id = createUuid();
    queueAction('father', { action: 'delete', recordId: id });
    queueAction('father', { action: 'restore', recordId: id });
    expect(getOutbox('father')).toHaveLength(0);
  });
});
