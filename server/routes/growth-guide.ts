import type { Express } from 'express';
import { z } from 'zod';
import { getSessionUser } from '../auth.js';
import { listGrowthGuideEntries, removeGrowthGuideEntry, saveGrowthGuideEntry } from '../db/index.js';
import { growthGuideEntrySchema } from '../schemas.js';
import type { RouteContext } from './context.js';

export function registerGrowthGuideRoutes(app: Express, ctx: RouteContext) {
  app.get('/api/growth-guide-entries', (_req, res) => res.json(listGrowthGuideEntries()));

  app.put('/api/growth-guide-entries/:itemKey', (req, res) => {
    const parsed = growthGuideEntrySchema.safeParse({ ...req.body, itemKey: req.params.itemKey });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '成长指南记录格式不正确' });
    const entry = saveGrowthGuideEntry(parsed.data, getSessionUser(req)!.id);
    ctx.changeHub.broadcast('all');
    return res.json(entry);
  });

  app.delete('/api/growth-guide-entries/:itemKey', (req, res) => {
    const parsed = z.string().trim().min(1).max(100).safeParse(req.params.itemKey);
    if (!parsed.success) return res.status(400).json({ error: '成长指南记录编号不正确' });
    const deleted = removeGrowthGuideEntry(parsed.data);
    if (deleted) ctx.changeHub.broadcast('all');
    return res.json({ deleted });
  });
}
