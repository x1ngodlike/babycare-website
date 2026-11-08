import { afterAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express, Request, RequestHandler, Response } from 'express';
import type { FamilyId } from './types.js';
import type { RouteContext } from './routes/context.js';
const directory = mkdtempSync(join(tmpdir(), 'record-permissions-'));
process.env.DATABASE_PATH = join(directory, 'test.db');
const db = await import('./db/index.js');
const { registerRecordRoutes } = await import('./routes/records.js');
const { createSession } = await import('./auth.js');
const handlers = new Map<string, RequestHandler[]>();
const app = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map(method => [method, (path: string, ...callbacks: RequestHandler[]) => {
  handlers.set(`${method} ${path}`, callbacks);
}])) as unknown as Express;
registerRecordRoutes(app, { changeHub: { broadcast: vi.fn() } } as unknown as RouteContext);

function call(route: string, body: unknown, id?: string, identity: FamilyId | null = 'grandmother') {
  let cookie = '';
  if (identity) createSession({ cookie: (_name: string, value: string) => { cookie = value; } } as Response, { id: identity, name: identity, role: db.getFamilyRole(identity) });
  const req = { body, params: { id }, cookies: { baby_session: cookie } } as unknown as Request;
  const res = { statusCode: 200, data: null as unknown, status(code: number) { this.statusCode = code; return this; }, json(data: unknown) { this.data = data; return this; } };
  const chain = handlers.get(route)!;
  let index = 0;
  const next = () => chain[index++](req, res as unknown as Response, next);
  next();
  return res;
}
function create() {
  const input = { id: crypto.randomUUID(), type: 'feeding', occurredAt: new Date().toISOString(), breastMilkMl: null, formulaMl: 120 };
  expect(call('post /api/records', input, undefined, 'father').statusCode).toBe(201);
  return input;
}
afterAll(() => { db.closeDatabaseForTests(); rmSync(directory, { recursive: true, force: true }); });
describe('照护记录接口', () => {
  it('重试同一请求只创建一条记录和一条审计', () => {
    const input = create();
    expect(call('post /api/records', input, undefined, 'father').statusCode).toBe(200);
    expect(db.listAudit(input.id)).toHaveLength(1);
    expect(call('post /api/records', { ...input, formulaMl: 150 }, undefined, 'father').statusCode).toBe(409);
    expect(db.getRecord(input.id)?.formulaMl).toBe(120);
  });
  it.each(['grandfather', 'grandmother'] as const)('%s 可软删除家庭照护记录，由管理员恢复', identity => {
    const input = create();
    expect(call('delete /api/records/:id', {}, input.id, identity)).toMatchObject({ statusCode: 200, data: { deleted: true } });
    expect(db.getRecord(input.id)?.deletedBy).toBe(identity);
    expect(call('get /api/records/deleted', {}, undefined, identity).statusCode).toBe(403);
    expect(call('post /api/records/:id/restore', {}, input.id, identity).statusCode).toBe(403);
    expect(call('delete /api/records/:id/permanent', {}, input.id, identity).statusCode).toBe(403);
    expect(call('post /api/records/:id/restore', {}, input.id, 'father').statusCode).toBe(200);
    expect(db.getRecord(input.id)?.deletedAt).toBeNull();
  });
  it('未登录和普通身份的妈妈不能删除', () => {
    const input = create();
    db.setFamilyRole('mother', 'member');
    expect(call('delete /api/records/:id', {}, input.id, null).statusCode).toBe(401);
    expect(call('delete /api/records/:id', {}, input.id, 'mother').statusCode).toBe(403);
    expect(db.getRecord(input.id)?.deletedAt).toBeNull();
  });
});
