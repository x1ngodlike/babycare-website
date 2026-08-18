import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'baby-care-auth-test-'));
process.env.DATABASE_PATH = join(directory, 'test.db');
const { authenticate } = await import('./auth.js');
const database = await import('./db/index.js');
afterAll(() => { database.closeDatabaseForTests(); rmSync(directory, { recursive: true, force: true }); });

describe('family authentication', () => {
  it('assigns father as super administrator and mother as administrator', () => {
    expect(authenticate('father', 'qwe123')).toMatchObject({ id: 'father', role: 'superadmin' });
    expect(authenticate('mother', '111111')).toMatchObject({ id: 'mother', role: 'admin' });
    expect(authenticate('grandfather', '111111')).toMatchObject({ id: 'grandfather', role: 'member' });
    expect(authenticate('grandmother', '111111')).toMatchObject({ id: 'grandmother', role: 'member' });
  });

  it('rejects a wrong password', () => {
    expect(authenticate('father', '111111')).toBeNull();
  });
});
