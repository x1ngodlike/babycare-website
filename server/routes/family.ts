import type { Express } from 'express';
import { z } from 'zod';
import { requireSuperAdmin } from '../auth.js';
import { listFamilyMembers, setFamilyRole } from '../db/index.js';
import type { RouteContext } from './context.js';

export function registerFamilyRoutes(app: Express, ctx: RouteContext) {
  app.get('/api/family-members', requireSuperAdmin, (_req, res) => res.json(listFamilyMembers()));

  app.put('/api/family-members/:id/role', requireSuperAdmin, (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const parsed = z.object({ role: z.enum(['admin', 'member']) }).safeParse(req.body);
    const parsedId = z.enum(['mother', 'grandfather', 'grandmother']).safeParse(id);
    if (!parsed.success || !parsedId.success) return res.status(400).json({ error: '家庭成员权限格式不正确' });
    const member = setFamilyRole(parsedId.data, parsed.data.role);
    ctx.changeHub.broadcast('all');
    return res.json(member);
  });
}
