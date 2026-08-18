import type { Express } from 'express';
import { z } from 'zod';
import { authenticate, clearSession, createSession, getSessionUser } from '../auth.js';
import { listFamilyMembers } from '../db/index.js';
import type { RouteContext } from './context.js';

// 必须在 app.use('/api', requireAuth) 之前注册（登录前可访问）
export function registerAuthRoutes(app: Express, ctx: RouteContext) {
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/session', (req, res) => {
    const user = getSessionUser(req);
    res.json({ authenticated: Boolean(user), user });
  });
  app.get('/api/login-options', (_req, res) => res.json(listFamilyMembers()));

  app.post('/api/login', (req, res) => {
    const identity = z.enum(['father', 'mother', 'grandfather', 'grandmother']).safeParse(req.body?.identity);
    if (!identity.success) return res.status(400).json({ error: '请选择登录身份' });
    const ip = `${req.ip || 'unknown'}:${identity.data}`;
    const now = Date.now();
    const state = ctx.loginAttempts.get(ip);
    if (state && state.resetAt > now && state.count >= 8) return res.status(429).json({ error: '尝试次数过多，请 15 分钟后再试' });
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = authenticate(identity.data, password);
    if (!user) {
      const next = state && state.resetAt > now ? { ...state, count: state.count + 1 } : { count: 1, resetAt: now + 15 * 60 * 1000 };
      ctx.loginAttempts.set(ip, next);
      return res.status(401).json({ error: '密码不正确' });
    }
    ctx.loginAttempts.delete(ip);
    createSession(res, user);
    return res.json({ authenticated: true, user });
  });

  app.post('/api/logout', (_req, res) => {
    clearSession(res);
    res.json({ authenticated: false });
  });
}
