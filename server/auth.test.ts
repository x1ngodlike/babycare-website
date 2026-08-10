import { describe, expect, it } from 'vitest';
import { authenticate } from './auth.js';

describe('family authentication', () => {
  it('keeps father as the only administrator', () => {
    expect(authenticate('father', 'qwe123')).toMatchObject({ id: 'father', role: 'admin' });
    expect(authenticate('mother', '111111')).toMatchObject({ id: 'mother', role: 'member' });
    expect(authenticate('grandfather', '111111')).toMatchObject({ id: 'grandfather', role: 'member' });
    expect(authenticate('grandmother', '111111')).toMatchObject({ id: 'grandmother', role: 'member' });
  });

  it('rejects a wrong password', () => {
    expect(authenticate('father', '111111')).toBeNull();
  });
});
