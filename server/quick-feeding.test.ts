import { afterAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express, Request, Response } from 'express';
import type { RouteContext } from './routes/context.js';
const directory = mkdtempSync(join(tmpdir(), 'quick-feeding-'));
process.env.DATABASE_PATH = join(directory, 'test.db');
const db = await import('./db/index.js');
const { registerRecordRoutes } = await import('./routes/records.js');
const { createSession } = await import('./auth.js');
const handlers = new Map<string, (req: Request, res: Response) => unknown>();
const app = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map(method => [method, (path: string, ...callbacks: unknown[]) => {
  if (method === 'post') handlers.set(path, callbacks.at(-1) as (req: Request, res: Response) => unknown);
}])) as unknown as Express;
registerRecordRoutes(app, { changeHub: { broadcast: vi.fn() } } as unknown as RouteContext);
function call(path: string, body: unknown, id?: string, identity: 'grandmother' | 'father' = 'grandmother') {
  let cookie = '';
  createSession({ cookie: (_name: string, value: string) => { cookie = value; } } as Response, { id: identity, name: identity, role: 'member' });
  const res = { statusCode: 200, data: null as unknown, status(code: number) { this.statusCode = code; return this; }, json(data: unknown) { this.data = data; return this; } };
  handlers.get(path)!({ body, params: { id }, cookies: { baby_session: cookie } } as unknown as Request, res as unknown as Response);
  return res;
}
function create() {
  const input = { id: crypto.randomUUID(), type: 'feeding', occurredAt: new Date().toISOString(), breastMilkMl: null, formulaMl: 120 };
  expect(call('/api/records', input).statusCode).toBe(201);
  return input;
}
afterAll(() => { db.closeDatabaseForTests(); rmSync(directory, { recursive: true, force: true }); });
describe('快捷喂奶保存与撤销', () => {
  it('重试同一请求只创建一条记录和一条审计', () => {
    const input = create();
    expect(call('/api/records', input).statusCode).toBe(200);
    expect(db.listAudit(input.id)).toHaveLength(1);
    expect(call('/api/records', { ...input, formulaMl: 150 }).statusCode).toBe(409);
    expect(db.getRecord(input.id)?.formulaMl).toBe(120);
  });
  it('普通家人能撤销自己的新记录，重复撤销不重复写入', () => {
    const input = create();
    expect(call('/api/records/:id/undo-feeding', {}, input.id, 'father').statusCode).toBe(403);
    expect(call('/api/records/:id/undo-feeding', {}, input.id).statusCode).toBe(200);
    expect(call('/api/records/:id/undo-feeding', {}, input.id).statusCode).toBe(200);
    expect(db.getRecord(input.id)?.deletedAt).toBeTruthy();
    expect(db.listAudit(input.id)).toHaveLength(2);
  });
  it('拒绝撤销超时或已被修改的记录', () => {
    const input = create();
    const saved = db.getRecord(input.id)!;
    db.saveRecord({ ...saved, updatedAt: new Date(Date.now() + 1000).toISOString(), formulaMl: 90 });
    expect(call('/api/records/:id/undo-feeding', {}, input.id).statusCode).toBe(403);
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(saved.createdAt) + 121_000);
    expect(call('/api/records/:id/undo-feeding', {}, input.id).statusCode).toBe(403);
    vi.restoreAllMocks();
  });
});
