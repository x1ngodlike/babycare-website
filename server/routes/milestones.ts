import type { Express } from 'express';
import { z } from 'zod';
import { getSessionUser, requireAdmin } from '../auth.js';
import { listMilestoneRecords, purgeMilestoneRecord, removeMilestoneRecord, restoreMilestoneRecord, saveMilestoneRecord } from '../db/index.js';
import { normalizeMilestoneRecord } from '../normalize.js';
import { milestoneRecordSchema } from '../schemas.js';
import { validateDateRange } from '../validate.js';
import type { RouteContext } from './context.js';

function validateMilestoneDate(achievedOn: string) {
  return validateDateRange(achievedOn, { early: '达成日期不能早于出生日期', late: '达成日期不能晚于今天' });
}

export function registerMilestoneRoutes(app: Express, ctx: RouteContext) {
  app.get('/api/milestone-records', (_req, res) => res.json(listMilestoneRecords()));

  app.get('/api/milestone-records/deleted', requireAdmin, (_req, res) => res.json(listMilestoneRecords(true).filter(r => r.deletedAt)));

  app.post('/api/milestone-records', (req, res) => {
    const parsed = milestoneRecordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '里程碑记录格式不正确' });
    const dateError = validateMilestoneDate(parsed.data.achievedOn);
    if (dateError) return res.status(400).json({ error: dateError });
    const record = saveMilestoneRecord(normalizeMilestoneRecord(parsed.data, getSessionUser(req)!.id));
    ctx.changeHub.broadcast('all');
    return res.status(201).json(record);
  });

  app.put('/api/milestone-records/:id', (req, res) => {
    const parsed = milestoneRecordSchema.safeParse({ ...req.body, id: req.params.id });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '里程碑记录格式不正确' });
    const dateError = validateMilestoneDate(parsed.data.achievedOn);
    if (dateError) return res.status(400).json({ error: dateError });
    const record = saveMilestoneRecord(normalizeMilestoneRecord(parsed.data, getSessionUser(req)!.id));
    ctx.changeHub.broadcast('all');
    return res.json(record);
  });

  app.delete('/api/milestone-records/:id', requireAdmin, (req, res) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '里程碑记录编号不正确' });
    const record = removeMilestoneRecord(parsed.data, getSessionUser(req)!.id);
    if (!record) return res.status(404).json({ error: '里程碑记录不存在' });
    ctx.changeHub.broadcast('all');
    return res.json({ deleted: true, record });
  });

  app.post('/api/milestone-records/:id/restore', requireAdmin, (req, res) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '里程碑记录编号不正确' });
    const record = restoreMilestoneRecord(parsed.data, getSessionUser(req)!.id);
    ctx.changeHub.broadcast('all');
    return res.json(record);
  });

  app.delete('/api/milestone-records/:id/permanent', requireAdmin, (req, res) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '里程碑记录编号不正确' });
    if (!purgeMilestoneRecord(parsed.data)) return res.status(404).json({ error: '已删除的里程碑记录不存在' });
    ctx.changeHub.broadcast('all');
    return res.json({ deleted: true });
  });
}
