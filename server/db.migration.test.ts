import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'baby-care-migration-test-'));
const databasePath = join(directory, 'legacy.db');
const legacy = new Database(databasePath);
legacy.exec(`
  CREATE TABLE care_records (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('feeding', 'supplement', 'bowel', 'note')),
    occurred_at TEXT NOT NULL,
    breast_milk_ml INTEGER,
    formula_ml INTEGER,
    supplement TEXT CHECK (supplement IN ('AD', 'VD', '益生菌')),
    bowel_size TEXT CHECK (bowel_size IN ('大', '中', '小')),
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO care_records VALUES ('99999999-9999-4999-8999-999999999999', 'supplement', '2026-08-09T08:00:00.000Z', NULL, NULL, 'AD', NULL, NULL, '2026-08-09T08:00:00.000Z', '2026-08-09T08:00:00.000Z');
`);
legacy.close();
process.env.DATABASE_PATH = databasePath;
const db = await import('./db.js');

afterAll(() => { db.closeDatabaseForTests(); rmSync(directory, { recursive: true, force: true }); });

describe('legacy database migration', () => {
  it('retains old records and accepts the new massage item', () => {
    expect(db.allRecords(true)[0]?.supplement).toBe('AD');
    expect(db.listCareItems().map(item => item.name)).toContain('推拿');
    expect(() => db.saveRecord({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', type: 'supplement', occurredAt: '2026-08-10T08:00:00.000Z',
      breastMilkMl: null, formulaMl: null, supplement: '推拿', bowelSize: null, note: null,
      createdAt: '2026-08-10T08:00:00.000Z', updatedAt: '2026-08-10T08:00:00.000Z', createdBy: 'father', updatedBy: 'father', deletedAt: null, deletedBy: null
    })).not.toThrow();
  });
});
