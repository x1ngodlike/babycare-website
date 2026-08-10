import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getFamilyRole } from './db.js';

export type FamilyId = 'father' | 'mother' | 'grandfather' | 'grandmother';
export type UserRole = 'superadmin' | 'admin' | 'member';
export interface SessionUser { id: FamilyId; name: string; role: UserRole }

const cookieName = 'baby_session';
const secret = process.env.SESSION_SECRET || 'development-only-change-this-secret';
const maxAgeSeconds = 60 * 60 * 24 * 30;

const family: Record<FamilyId, { name: string; password: string }> = {
  father: { name: '爸爸', password: process.env.FATHER_PASSWORD || process.env.ADMIN_PASSWORD || 'qwe123' },
  mother: { name: '妈妈', password: process.env.MOTHER_PASSWORD || '111111' },
  grandfather: { name: '爷爷', password: process.env.GRANDFATHER_PASSWORD || '111111' },
  grandmother: { name: '奶奶', password: process.env.GRANDMOTHER_PASSWORD || '111111' }
};

function sign(value: string) { return createHmac('sha256', secret).update(value).digest('base64url'); }
function safeEqual(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function authenticate(identity: FamilyId, candidate: string): SessionUser | null {
  const account = family[identity];
  return account && safeEqual(candidate, account.password) ? { id: identity, name: account.name, role: getFamilyRole(identity) } : null;
}

export function createSession(res: Response, user: SessionUser) {
  const payload = Buffer.from(JSON.stringify({ ...user, expires: Math.floor(Date.now() / 1000) + maxAgeSeconds })).toString('base64url');
  res.cookie(cookieName, `${payload}.${sign(payload)}`, {
    httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true', maxAge: maxAgeSeconds * 1000, path: '/'
  });
}

export function clearSession(res: Response) { res.clearCookie(cookieName, { path: '/' }); }

export function getSessionUser(req: Request): SessionUser | null {
  const raw = req.cookies?.[cookieName];
  if (!raw || typeof raw !== 'string') return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionUser & { expires: number };
    if (!family[value.id] || value.expires <= Date.now() / 1000) return null;
    const account = family[value.id];
    return { id: value.id, name: account.name, role: getFamilyRole(value.id) };
  } catch { return null; }
}

export function isAuthenticated(req: Request) { return Boolean(getSessionUser(req)); }
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!getSessionUser(req)) return res.status(401).json({ error: '请先登录' });
  next();
}
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = getSessionUser(req)?.role;
  if (role !== 'superadmin' && role !== 'admin') return res.status(403).json({ error: '只有管理员可以进行这项操作' });
  next();
}
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (getSessionUser(req)?.role !== 'superadmin') return res.status(403).json({ error: '只有爸爸可以进行这项操作' });
  next();
}
