import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { z } from 'zod';
import { getSessionUser, requireAdmin } from '../auth.js';
import { DuplicateVaccineRecordError, RecordNotFoundError, VaccineCatalogConflictError, getProfile, listVaccineCatalog, listVaccineRecords, removeVaccineCatalogItem, removeVaccineRecord, reorderVaccineCatalog, saveVaccineCatalogItem, saveVaccineRecord, setVaccineCatalogActive } from '../db/index.js';
import { normalizeVaccineRecord } from '../normalize.js';
import { vaccineCatalogInputSchema, vaccineRecordSchema } from '../schemas.js';
import { shanghaiDateString } from '../shanghai-date.js';
import type { RouteContext } from './context.js';

export function registerVaccineRoutes(app: Express, ctx: RouteContext) {
  app.get('/api/vaccine-records', (_req, res) => res.json(listVaccineRecords()));

  app.get('/api/vaccine-catalog', (_req, res) => res.json(listVaccineCatalog(true)));

  app.post('/api/vaccine-catalog', requireAdmin, (req, res) => {
    const parsed = vaccineCatalogInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '疫苗信息格式不正确' });
    const current = listVaccineCatalog(true);
    const item = { id: randomUUID(), ...parsed.data, shortName: parsed.data.shortName || null, description: parsed.data.description || '尚未填写。', intervalSummary: parsed.data.intervalSummary || '按接种门诊安排', active: true, sortOrder: (current.at(-1)?.sortOrder || 0) + 10, isSystem: false };
    try { const saved = saveVaccineCatalogItem(item); ctx.changeHub.broadcast('all'); return res.status(201).json(saved); }
    catch (error) { if (error instanceof VaccineCatalogConflictError) return res.status(409).json({ error: error.message }); throw error; }
  });

  app.put('/api/vaccine-catalog/:id', requireAdmin, (req, res) => {
    const parsed = vaccineCatalogInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '疫苗信息格式不正确' });
    const existing = listVaccineCatalog(true).find(item => item.id === req.params.id);
    if (!existing) return res.status(404).json({ error: '疫苗不存在' });
    if (existing.isSystem) return res.status(400).json({ error: '系统默认疫苗只能修改启用状态' });
    try { const saved = saveVaccineCatalogItem({ ...existing, ...parsed.data, shortName: parsed.data.shortName || null, description: parsed.data.description || '尚未填写。', intervalSummary: parsed.data.intervalSummary || '按接种门诊安排' }); ctx.changeHub.broadcast('all'); return res.json(saved); }
    catch (error) { if (error instanceof VaccineCatalogConflictError) return res.status(409).json({ error: error.message }); throw error; }
  });

  app.delete('/api/vaccine-catalog/:id', requireAdmin, (req, res) => {
    const existing = listVaccineCatalog(true).find(item => item.id === req.params.id);
    if (existing?.isSystem) return res.status(400).json({ error: '系统默认疫苗不能删除' });
    if (!removeVaccineCatalogItem(String(req.params.id))) return res.status(404).json({ error: '疫苗不存在' });
    ctx.changeHub.broadcast('all');
    return res.json({ deleted: true });
  });

  app.patch('/api/vaccine-catalog/:id/active', requireAdmin, (req, res) => {
    const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '启用状态格式不正确' });
    try { const item = setVaccineCatalogActive(String(req.params.id), parsed.data.active); ctx.changeHub.broadcast('all'); return res.json(item); }
    catch (error) { if (error instanceof RecordNotFoundError) return res.status(404).json({ error: error.message }); throw error; }
  });

  app.put('/api/vaccine-catalog/order', requireAdmin, (req, res) => {
    const parsed = z.object({ ids: z.array(z.string().min(1).max(50)).min(1).max(100) }).safeParse(req.body);
    if (!parsed.success || new Set(parsed.data.ids).size !== parsed.data.ids.length) return res.status(400).json({ error: '疫苗顺序格式不正确' });
    try { const items = reorderVaccineCatalog(parsed.data.ids); ctx.changeHub.broadcast('all'); return res.json(items); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : '排序失败' }); }
  });

  app.post('/api/vaccine-records', (req, res) => {
    const parsed = vaccineRecordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '疫苗记录格式不正确' });
    const profile = getProfile();
    if (parsed.data.plannedOn < profile.birthDate || (parsed.data.administeredOn && parsed.data.administeredOn < profile.birthDate)) return res.status(400).json({ error: '接种日期不能早于出生日期' });
    if (parsed.data.appointmentOn && parsed.data.appointmentOn < profile.birthDate) return res.status(400).json({ error: '预约日期不能早于出生日期' });
    if (parsed.data.administeredOn && parsed.data.administeredOn > shanghaiDateString()) return res.status(400).json({ error: '接种日期不能晚于今天' });
    try { const record = saveVaccineRecord(normalizeVaccineRecord(parsed.data, getSessionUser(req)!.id)); ctx.changeHub.broadcast('all'); return res.status(201).json(record); }
    catch (error) { if (error instanceof DuplicateVaccineRecordError) return res.status(409).json({ error: error.message, code: 'DUPLICATE_VACCINE_RECORD', existing: error.existing }); throw error; }
  });

  app.put('/api/vaccine-records/:id', (req, res) => {
    const parsed = vaccineRecordSchema.safeParse({ ...req.body, id: req.params.id });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '疫苗记录格式不正确' });
    try { const record = saveVaccineRecord(normalizeVaccineRecord(parsed.data, getSessionUser(req)!.id)); ctx.changeHub.broadcast('all'); return res.json(record); }
    catch (error) { if (error instanceof DuplicateVaccineRecordError) return res.status(409).json({ error: error.message, code: 'DUPLICATE_VACCINE_RECORD', existing: error.existing }); throw error; }
  });

  app.delete('/api/vaccine-records/:id', requireAdmin, (req, res) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '疫苗记录编号不正确' });
    const record = removeVaccineRecord(parsed.data, getSessionUser(req)!.id); ctx.changeHub.broadcast('all');
    return res.json({ deleted: Boolean(record), record });
  });
}
