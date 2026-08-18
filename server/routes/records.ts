import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { z } from 'zod';
import { getSessionUser, requireAdmin, requireAuth, requireSuperAdmin } from '../auth.js';
import { generateFeedingInsights } from '../ai.js';
import { BackupFileNotFoundError, deleteServerBackup, InvalidBackupNameError, listServerBackups, readServerBackup, serverBackupStatus, writeServerBackup, type BackupType } from '../backup.js';
import {
  computeFeedingRecordsHash, getAiFeedingInsights, getAiSettings, getCareAdherence, getProfile,
  importBackup, listAudit, listCareItems, listDeletedRecords, listRecords, purgeRecord,
  removeRecord, reorderCareItems, replaceBackup, restoreRecord, saveAiFeedingInsights, saveCareItem,
  saveRecord, setCareItemActive
} from '../db/index.js';
import { exportPayload } from '../export-payload.js';
import { calculateAgeText, normalizeGrowthRecord, normalizeMilestoneRecord, normalizeRecord, normalizeVaccineRecord } from '../normalize.js';
import { backupPayloadSchema, careItemInputSchema, recordSchema } from '../schemas.js';
import { shanghaiDateString, shanghaiDayUtcRange } from '../shanghai-date.js';
import { predictFeeding, type FeedingPrediction } from '../../shared/feeding-prediction.js';
import type { AuditEntry, CareItem, CareRecord, FamilyMemberPermission, VaccineCatalogItem } from '../types.js';
import type { RouteContext } from './context.js';

export function registerRecordRoutes(app: Express, ctx: RouteContext) {
  app.get('/api/records', (req, res) => {
    const parsed = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: '日期范围格式不正确' });
    return res.json(listRecords(parsed.data.from, parsed.data.to));
  });

  app.get('/api/feeding-prediction', async (_req, res) => {
    const today = shanghaiDateString();
    const range = shanghaiDayUtcRange(today);
    const lookbackFrom = new Date(new Date(range.from).getTime() - 14 * 86400000).toISOString();
    const records = listRecords(lookbackFrom, range.to).filter(r => r.type === 'feeding');
    const prediction: FeedingPrediction = predictFeeding(records.map(r => ({
      occurredAt: r.occurredAt,
      breastMilkMl: r.breastMilkMl,
      formulaMl: r.formulaMl
    })));

    const settings = getAiSettings();
    const feedingRecords = records.filter(r => r.type === 'feeding');

    if (!settings.apiKey || !prediction.available || feedingRecords.length < 2) {
      return res.json(prediction);
    }

    const recordsHash = computeFeedingRecordsHash(records);
    const cached = getAiFeedingInsights();
    const now = Date.now();
    const cacheFresh = cached &&
      cached.recordsHash === recordsHash &&
      (now - new Date(cached.updatedAt).getTime()) < 3600_000;

    if (cacheFresh && cached) {
      return res.json({
        ...prediction,
        aiInsights: {
          summary: cached.summary,
          insights: cached.insights,
          alert: cached.alert
        },
        cached: true
      });
    }

    try {
      const profile = getProfile();
      const ageText = calculateAgeText(profile.birthDate, today);
      const insights = await generateFeedingInsights({
        babyName: profile.name || '宝宝',
        ageText,
        sex: profile.sex,
        prediction: {
          available: prediction.available,
          gapMinutes: prediction.gapMinutes,
          volumeMl: prediction.volumeMl,
          confidence: prediction.confidence,
          nextFeedAt: prediction.nextFeedAt,
          upcomingFeeds: prediction.upcomingFeeds.map(f => ({
            predictedAt: f.predictedAt,
            earliest: f.earliest,
            latest: f.latest,
            estimatedMl: f.estimatedMl,
            period: f.period
          })),
          periodGaps: prediction.periodGaps.map(g => ({ period: g.period, count: g.count, medianMinutes: g.medianMinutes })),
          periodVolumes: prediction.periodVolumes.map(v => ({ period: v.period, count: v.count, medianMl: v.medianMl })),
          overallMedianGapMinutes: prediction.overallMedianGapMinutes,
          dataDays: prediction.dataDays,
          dataFeeds: prediction.dataFeeds
        },
        recentFeedings: records.slice(-7).map(r => ({
          occurredAt: r.occurredAt,
          breastMilkMl: r.breastMilkMl,
          formulaMl: r.formulaMl,
          note: r.note || undefined
        }))
      }, settings);

      saveAiFeedingInsights({
        summary: insights.summary,
        insights: insights.insights,
        alert: insights.alert,
        gapMinutes: null,
        nextFeedAt: null,
        recordsHash
      });

      return res.json({
        ...prediction,
        aiInsights: {
          summary: insights.summary,
          insights: insights.insights,
          alert: insights.alert
        }
      });
    } catch (e) {
      console.error('[feeding-prediction] AI error:', e instanceof Error ? e.message : e);
      return res.json(prediction);
    }
  });

  app.get('/api/care-items', (_req, res) => {
    return res.json(listCareItems(true));
  });

  app.post('/api/care-items', requireAdmin, (req, res) => {
    const parsed = careItemInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '照护项目格式不正确' });
    const item = saveCareItem({ id: randomUUID(), ...parsed.data });
    ctx.changeHub.broadcast('all');
    return res.status(201).json(item);
  });

  app.put('/api/care-items/order', requireAdmin, (req, res) => {
    const parsed = z.object({ ids: z.array(z.string().min(1).max(50)).min(1).max(100).refine(ids => new Set(ids).size === ids.length, '项目顺序不能重复') }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '项目顺序格式不正确' });
    const items = reorderCareItems(parsed.data.ids);
    ctx.changeHub.broadcast('all');
    return res.json(items);
  });

  app.put('/api/care-items/:id', requireAdmin, (req, res) => {
    const parsed = careItemInputSchema.safeParse(req.body);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!parsed.success || !id) return res.status(400).json({ error: parsed.success ? '照护项目格式不正确' : parsed.error.issues[0]?.message || '照护项目格式不正确' });
    const item = saveCareItem({ id, ...parsed.data });
    ctx.changeHub.broadcast('all');
    return res.json(item);
  });

  app.patch('/api/care-items/:id/active', requireAdmin, (req, res) => {
    const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!parsed.success || !id) return res.status(400).json({ error: '照护项目状态不正确' });
    const item = setCareItemActive(id, parsed.data.active);
    ctx.changeHub.broadcast('all');
    return res.json(item);
  });

  app.get('/api/care-items/adherence', requireAuth, (_req, res) => {
    const items = getCareAdherence(30);
    return res.json({ items });
  });

  app.post('/api/records', (req, res) => {
    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '记录格式不正确' });
    if (new Date(parsed.data.occurredAt).getTime() > Date.now() + 10 * 60 * 1000) return res.status(400).json({ error: '记录时间不能晚于当前时间' });
    const record = saveRecord(normalizeRecord(parsed.data, getSessionUser(req)!.id));
    ctx.changeHub.broadcast('records');
    return res.status(201).json(record);
  });

  app.put('/api/records/:id', (req, res) => {
    const parsed = recordSchema.safeParse({ ...req.body, id: req.params.id });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '记录格式不正确' });
    if (new Date(parsed.data.occurredAt).getTime() > Date.now() + 10 * 60 * 1000) return res.status(400).json({ error: '记录时间不能晚于当前时间' });
    const record = saveRecord(normalizeRecord(parsed.data, getSessionUser(req)!.id));
    ctx.changeHub.broadcast('records');
    return res.json(record);
  });

  app.get('/api/records/deleted', requireAdmin, (_req, res) => res.json(listDeletedRecords()));

  app.delete('/api/records/:id', requireAdmin, (req, res) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '记录编号不正确' });
    const record = removeRecord(parsed.data, getSessionUser(req)!.id);
    if (record) ctx.changeHub.broadcast('records');
    return res.json({ deleted: Boolean(record), record });
  });

  app.post('/api/records/:id/restore', requireAdmin, (req, res) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '记录编号不正确' });
    const record = restoreRecord(parsed.data, getSessionUser(req)!.id);
    ctx.changeHub.broadcast('records');
    return res.json(record);
  });

  app.delete('/api/records/:id/permanent', requireAdmin, (req, res) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '记录编号不正确' });
    const deleted = purgeRecord(parsed.data);
    if (!deleted) return res.status(404).json({ error: '已删除记录不存在' });
    ctx.changeHub.broadcast('records');
    return res.json({ deleted: true });
  });

  app.get('/api/records/:id/audit', requireAdmin, (req, res) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '记录编号不正确' });
    return res.json(listAudit(parsed.data));
  });

  app.get('/api/export', requireSuperAdmin, (_req, res) => {
    res.setHeader('Content-Disposition', `attachment; filename="babycare-backup-${shanghaiDateString()}.json"`);
    res.json(exportPayload());
  });

  app.get('/api/backups/status', requireSuperAdmin, (_req, res) => res.json(serverBackupStatus(ctx.backupDirectory)));
  app.get('/api/backups', requireSuperAdmin, (_req, res) => res.json(listServerBackups(ctx.backupDirectory)));

  app.post('/api/backups', requireSuperAdmin, (req, res) => {
    const type = (req.body?.type === 'manual' || req.body?.type === 'auto') ? req.body.type : 'manual';
    const result = writeServerBackup(exportPayload(), { directory: ctx.backupDirectory, type: type as BackupType });
    res.status(201).json(result);
  });

  app.delete('/api/backups/:name', requireSuperAdmin, (req, res) => {
    const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
    try {
      deleteServerBackup(name, ctx.backupDirectory);
      res.json({ deleted: true, status: serverBackupStatus(ctx.backupDirectory) });
    } catch (error) {
      if (error instanceof InvalidBackupNameError) return res.status(400).json({ error: error.message });
      if (error instanceof BackupFileNotFoundError) return res.status(404).json({ error: error.message });
      res.status(500).json({ error: '删除备份失败' });
    }
  });

  app.post('/api/backups/:name/restore', requireSuperAdmin, (req, res) => {
    const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
    const parsed = backupPayloadSchema.safeParse(readServerBackup(name, ctx.backupDirectory));
    if (!parsed.success || !parsed.data.profile) return res.status(400).json({ error: '服务器备份内容不完整，无法恢复' });
    writeServerBackup(exportPayload(), { directory: ctx.backupDirectory });
    const records = parsed.data.records.map(item => normalizeRecord(item, 'father', true));
    const audits = parsed.data.audits?.map(item => ({ ...item, id: item.id || 0, snapshot: item.snapshot as CareRecord | null })) as AuditEntry[] | undefined;
    const growthRecords = parsed.data.growthRecords?.map(item => normalizeGrowthRecord(item, 'father', true));
    const vaccineRecords = parsed.data.vaccineRecords?.map(item => normalizeVaccineRecord(item, 'father', true));
    const result = replaceBackup({ profile: parsed.data.profile, records, audits, careItems: parsed.data.careItems as CareItem[] | undefined, familyMembers: parsed.data.familyMembers as FamilyMemberPermission[] | undefined, growthRecords, vaccineRecords, vaccineCatalog: parsed.data.vaccineCatalog as VaccineCatalogItem[] | undefined, dailyReports: parsed.data.dailyReports });
    ctx.changeHub.broadcast('all');
    res.json({ ...result, restoredFrom: name, status: serverBackupStatus(ctx.backupDirectory) });
  });

  app.post('/api/import', requireSuperAdmin, (req, res) => {
    const mode = req.body.mode === 'replace' ? 'replace' : 'merge';
    const { mode: _ignored, ...payload } = req.body;
    const parsed = backupPayloadSchema.safeParse(payload);
    if (!parsed.success) return res.status(400).json({ error: '导入文件格式不正确' });
    writeServerBackup(exportPayload(), { directory: ctx.backupDirectory });
    const records = parsed.data.records.map(item => normalizeRecord(item, 'father', true));
    const audits = parsed.data.audits?.map(item => ({ ...item, id: item.id || 0, snapshot: item.snapshot as CareRecord | null })) as AuditEntry[] | undefined;
    const growthRecords = parsed.data.growthRecords?.map(item => normalizeGrowthRecord(item, 'father', true));
    const vaccineRecords = parsed.data.vaccineRecords?.map(item => normalizeVaccineRecord(item, 'father', true));
    const milestoneRecords = parsed.data.milestoneRecords?.map(item => normalizeMilestoneRecord(item, 'father', true));
    const defaultProfile = { name: '宝宝', birthDate: new Date().toISOString().slice(0, 10), birthTime: null, sex: 'unspecified' as const, nickname: '', caregiverTitle: '', avatar: null };
    const importPayload = { profile: parsed.data.profile || defaultProfile, records, audits, careItems: parsed.data.careItems as CareItem[] | undefined, familyMembers: parsed.data.familyMembers as FamilyMemberPermission[] | undefined, growthRecords, vaccineRecords, milestoneRecords, vaccineCatalog: parsed.data.vaccineCatalog as VaccineCatalogItem[] | undefined, dailyReports: parsed.data.dailyReports };
    const result = mode === 'replace' ? replaceBackup(importPayload) : importBackup(importPayload);
    ctx.changeHub.broadcast('all');
    res.json({ ...result, mode });
  });
}
