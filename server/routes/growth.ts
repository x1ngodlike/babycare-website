import type { Express } from 'express';
import { z } from 'zod';
import { getSessionUser, requireAdmin } from '../auth.js';
import { generateGrowthEvaluation } from '../ai.js';
import { getAiSettings, getProfile, listGrowthRecords, listRecords, purgeGrowthRecord, removeGrowthRecord, restoreGrowthRecord, saveGrowthEvaluation, saveGrowthRecord } from '../db/index.js';
import { assessHeight, assessWeight, milkReferenceRange, GROWTH_STANDARD_MAX_MONTHS } from '../growth-standards.js';
import { normalizeGrowthRecord, calculateAgeText } from '../normalize.js';
import { growthRecordSchema } from '../schemas.js';
import { addDaysToDateString, shanghaiDateString, shanghaiDayUtcRange } from '../shanghai-date.js';
import { validateDateRange } from '../validate.js';
import type { RouteContext } from './context.js';

function validateGrowthDate(measuredOn: string) {
  return validateDateRange(measuredOn, { early: '测量日期不能早于出生日期', late: '测量日期不能晚于今天' });
}

function ageMonthsAt(birthDate: string, onDate: string): number {
  const from = new Date(`${birthDate}T00:00:00Z`).getTime();
  const to = new Date(`${onDate}T00:00:00Z`).getTime();
  return (to - from) / (30.4375 * 86400_000);
}

function parseGrowthEvaluation(raw: string | null, evaluatedAt: string | null): { text: string; evaluatedAt: string | null } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { evaluation?: unknown };
    if (typeof parsed.evaluation === 'string' && parsed.evaluation.trim()) {
      return { text: parsed.evaluation.trim(), evaluatedAt };
    }
  } catch { /* 兼容非 JSON 旧值 */ }
  return { text: raw, evaluatedAt };
}

function recentMilkStats(today: string): { avgDailyMl: number; daysCounted: number } {
  let total = 0; let days = 0;
  for (let offset = 1; offset <= 7; offset += 1) {
    const range = shanghaiDayUtcRange(addDaysToDateString(today, -offset));
    const dayFeedings = listRecords(range.from, range.to).filter(record => record.type === 'feeding');
    if (!dayFeedings.length) continue;
    days += 1;
    total += dayFeedings.reduce((sum, record) => sum + (record.breastMilkMl || 0) + (record.formulaMl || 0), 0);
  }
  return { avgDailyMl: days ? Math.round(total / days) : 0, daysCounted: days };
}

export function registerGrowthRoutes(app: Express, ctx: RouteContext) {
  app.get('/api/growth-records', (_req, res) => res.json(listGrowthRecords()));

  app.get('/api/growth-records/deleted', requireAdmin, (_req, res) => res.json(listGrowthRecords(true).filter(record => record.deletedAt)));

  app.post('/api/growth-records', (req, res) => {
    const parsed = growthRecordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '成长记录格式不正确' });
    const dateError = validateGrowthDate(parsed.data.measuredOn);
    if (dateError) return res.status(400).json({ error: dateError });
    const record = saveGrowthRecord(normalizeGrowthRecord(parsed.data, getSessionUser(req)!.id));
    ctx.changeHub.broadcast('all');
    return res.status(201).json(record);
  });

  app.put('/api/growth-records/:id', (req, res) => {
    const parsed = growthRecordSchema.safeParse({ ...req.body, id: req.params.id });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '成长记录格式不正确' });
    const dateError = validateGrowthDate(parsed.data.measuredOn);
    if (dateError) return res.status(400).json({ error: dateError });
    const previous = listGrowthRecords().find(item => item.id === parsed.data.id);
    const record = saveGrowthRecord(normalizeGrowthRecord(parsed.data, getSessionUser(req)!.id));
    if (previous?.evaluation && (previous.heightCm !== record.heightCm || previous.weightKg !== record.weightKg || previous.measuredOn !== record.measuredOn)) saveGrowthEvaluation(record.id, '');
    ctx.changeHub.broadcast('all');
    return res.json(record);
  });

  app.delete('/api/growth-records/:id', requireAdmin, (req, res) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '成长记录编号不正确' });
    const record = removeGrowthRecord(parsed.data, getSessionUser(req)!.id);
    if (!record) return res.status(404).json({ error: '成长记录不存在' });
    ctx.changeHub.broadcast('all');
    return res.json({ deleted: true, record });
  });

  app.post('/api/growth-records/:id/restore', requireAdmin, (req, res) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '成长记录编号不正确' });
    const record = restoreGrowthRecord(parsed.data, getSessionUser(req)!.id);
    ctx.changeHub.broadcast('all');
    return res.json(record);
  });

  app.delete('/api/growth-records/:id/permanent', requireAdmin, (req, res) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '成长记录编号不正确' });
    if (!purgeGrowthRecord(parsed.data)) return res.status(404).json({ error: '已删除的成长记录不存在' });
    ctx.changeHub.broadcast('all');
    return res.json({ deleted: true });
  });

  app.get('/api/growth-assessment', (_req, res) => {
    const profile = getProfile();
    const records = listGrowthRecords();
    const latest = records[0];
    if (profile.sex !== 'male' && profile.sex !== 'female') return res.json({ available: false, reason: 'no_sex' });
    if (!latest) return res.json({ available: false, reason: 'no_records' });
    const ageMonths = ageMonthsAt(profile.birthDate, latest.measuredOn);
    const height = assessHeight(profile.sex, ageMonths, latest.heightCm);
    const weight = assessWeight(profile.sex, ageMonths, latest.weightKg);
    if (!height || !weight) return res.json({ available: false, reason: 'out_of_range', maxMonths: GROWTH_STANDARD_MAX_MONTHS });
    const today = shanghaiDateString();
    const milkRange = milkReferenceRange(ageMonths);
    const milk = milkRange ? { ...recentMilkStats(today), referenceMin: milkRange.min, referenceMax: milkRange.max } : null;
    return res.json({
      available: true,
      latestRecordId: latest.id,
      measuredOn: latest.measuredOn,
      ageMonths: Math.round(ageMonths * 10) / 10,
      height,
      weight,
      milk,
      evaluation: parseGrowthEvaluation(latest.evaluation, latest.evaluatedAt)
    });
  });

  app.post('/api/growth-records/:id/evaluation', requireAdmin, async (req, res) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '成长记录编号不正确' });
    const settings = getAiSettings();
    if (!settings.apiKey) return res.status(503).json({ error: '服务器尚未配置 AI 模型' });
    const records = listGrowthRecords();
    const record = records.find(item => item.id === parsed.data);
    if (!record) return res.status(404).json({ error: '成长记录不存在' });
    const profile = getProfile();
    if (profile.sex !== 'male' && profile.sex !== 'female') return res.status(400).json({ error: '请先在宝宝资料中设置性别' });
    const ageMonths = ageMonthsAt(profile.birthDate, record.measuredOn);
    const height = assessHeight(profile.sex, ageMonths, record.heightCm);
    const weight = assessWeight(profile.sex, ageMonths, record.weightKg);
    if (!height || !weight) return res.status(400).json({ error: `月龄超过 ${GROWTH_STANDARD_MAX_MONTHS} 个月，暂不支持 AI 评价` });
    const previous = records[records.findIndex(item => item.id === record.id) + 1] || null;
    try {
      const result = await generateGrowthEvaluation({
        babyName: profile.name,
        ageText: calculateAgeText(profile.birthDate, record.measuredOn),
        sex: profile.sex,
        height,
        weight,
        previous: previous ? {
          measuredOn: previous.measuredOn,
          heightCm: previous.heightCm,
          weightKg: previous.weightKg,
          daysSince: Math.max(0, Math.round((new Date(`${record.measuredOn}T00:00:00Z`).getTime() - new Date(`${previous.measuredOn}T00:00:00Z`).getTime()) / 86400_000))
        } : null
      }, { baseUrl: settings.baseUrl, model: settings.model, apiKey: settings.apiKey });
      const saved = saveGrowthEvaluation(record.id, JSON.stringify(result));
      if (!saved) return res.status(404).json({ error: '成长记录不存在' });
      return res.json({ evaluation: parseGrowthEvaluation(saved.evaluation, saved.evaluatedAt) });
    } catch (error) {
      console.error('[growth-evaluation] 生成失败', error);
      return res.status(502).json({ error: error instanceof Error ? error.message : 'AI 评价生成失败' });
    }
  });
}
