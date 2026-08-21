import express, { type Express } from 'express';
import { requireAdmin } from '../auth.js';
import { listAppNotifications, touchAppNotificationClient } from '../db/index.js';
import { getPushStatus, testCareItemPush, testFeedingGapPush, testMorningDigestPush, updatePushSettings } from '../push.js';

export function registerPushRoutes(app: Express) {
  app.get('/api/push/status', (_req, res) => res.json(getPushStatus()));

  app.get('/api/app-notifications', (req, res) => {
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId.trim() : '';
    const after = Number(req.query.after || 0);
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(clientId)) return res.status(400).json({ error: '通知设备编号不正确' });
    if (!Number.isSafeInteger(after) || after < 0) return res.status(400).json({ error: '通知游标不正确' });
    const client = touchAppNotificationClient(clientId);
    if (client.isNew) return res.json({ items: [], cursor: client.cursor });
    return res.json(listAppNotifications(after));
  });

  app.post('/api/push/settings', requireAdmin, express.json(), async (req, res) => {
    const body = req.body || {};
    const { enabled, pushplusToken, pushplusTopic, morningDigestEnabled, morningDigestTime, feedingGapEnabled, feedingGapLevel1Minutes, feedingGapLevel2Minutes, feedPrepEnabled, feedPrepMinutes, careItemEnabled } = body;
    if (enabled !== undefined && typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled 必须为布尔值' });
    if (pushplusToken !== undefined && typeof pushplusToken !== 'string') return res.status(400).json({ error: 'pushplusToken 必须为字符串' });
    if (pushplusTopic !== undefined && typeof pushplusTopic !== 'string') return res.status(400).json({ error: 'pushplusTopic 必须为字符串' });
    if (morningDigestEnabled !== undefined && typeof morningDigestEnabled !== 'boolean') return res.status(400).json({ error: 'morningDigestEnabled 必须为布尔值' });
    if (morningDigestTime !== undefined && (typeof morningDigestTime !== 'string' || !/^\d{2}:\d{2}$/.test(morningDigestTime.trim()))) {
      return res.status(400).json({ error: 'morningDigestTime 必须为 HH:MM 格式（如 08:00）' });
    }
    if (feedingGapEnabled !== undefined && typeof feedingGapEnabled !== 'boolean') return res.status(400).json({ error: 'feedingGapEnabled 必须为布尔值' });
    if (feedingGapLevel1Minutes !== undefined && (!Number.isSafeInteger(feedingGapLevel1Minutes) || feedingGapLevel1Minutes < 30)) {
      return res.status(400).json({ error: 'feedingGapLevel1Minutes 必须为大于等于 30 分钟的整数' });
    }
    if (feedingGapLevel2Minutes !== undefined && (!Number.isSafeInteger(feedingGapLevel2Minutes) || feedingGapLevel2Minutes < 30)) {
      return res.status(400).json({ error: 'feedingGapLevel2Minutes 必须为大于等于 30 分钟的整数' });
    }
    if (feedPrepEnabled !== undefined && typeof feedPrepEnabled !== 'boolean') return res.status(400).json({ error: 'feedPrepEnabled 必须为布尔值' });
    if (feedPrepMinutes !== undefined && (!Number.isSafeInteger(feedPrepMinutes) || feedPrepMinutes < 0 || feedPrepMinutes > 120)) {
      return res.status(400).json({ error: 'feedPrepMinutes 必须为 0 到 120 分钟的整数' });
    }
    if (careItemEnabled !== undefined && typeof careItemEnabled !== 'boolean') return res.status(400).json({ error: 'careItemEnabled 必须为布尔值' });
    if (feedingGapLevel1Minutes !== undefined && feedingGapLevel2Minutes !== undefined && feedingGapLevel2Minutes <= feedingGapLevel1Minutes) {
      return res.status(400).json({ error: '重点提醒分钟数必须大于轻度提醒' });
    }
    try {
      return res.json(await updatePushSettings({
        ...(enabled !== undefined ? { enabled } : {}), ...(pushplusToken !== undefined ? { pushplusToken } : {}),
        ...(pushplusTopic !== undefined ? { pushplusTopic } : {}), ...(morningDigestEnabled !== undefined ? { morningDigestEnabled } : {}),
        ...(morningDigestTime !== undefined ? { morningDigestTime } : {}), ...(feedingGapEnabled !== undefined ? { feedingGapEnabled } : {}),
        ...(feedingGapLevel1Minutes !== undefined ? { feedingGapLevel1Minutes } : {}),
        ...(feedingGapLevel2Minutes !== undefined ? { feedingGapLevel2Minutes } : {}),
        ...(feedPrepEnabled !== undefined ? { feedPrepEnabled } : {}), ...(feedPrepMinutes !== undefined ? { feedPrepMinutes } : {}),
        ...(careItemEnabled !== undefined ? { careItemEnabled } : {})
      }));
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : '保存失败' });
    }
  });

  app.post('/api/push/test/morning-digest', requireAdmin, async (_req, res) => {
    const result = await testMorningDigestPush();
    return result.ok ? res.json({ ok: true, message: '早报测试消息已发送，请在微信中查看。' }) : res.status(502).json({ error: result.error || '早报测试推送失败' });
  });
  app.post('/api/push/test/feeding-gap', requireAdmin, express.json(), async (req, res) => {
    const level = req.body?.level === 'level2' ? 'level2' : 'level1';
    const result = await testFeedingGapPush(level);
    if (!result.ok) return res.status(502).json({ error: result.error || '喂奶间隔测试推送失败' });
    return res.json({ ok: true, message: `喂奶间隔（${level === 'level2' ? '重点' : '轻度'}）测试消息已发送，请在微信中查看。` });
  });
  app.post('/api/push/test/care-item', requireAdmin, async (_req, res) => {
    const result = await testCareItemPush();
    return result.ok ? res.json({ ok: true, message: '用药护理测试消息已发送，请在微信中查看。' }) : res.status(502).json({ error: result.error || '用药护理提醒测试推送失败' });
  });
  app.post('/api/push/enable', requireAdmin, async (_req, res) => res.json(await updatePushSettings({ enabled: true })));
  app.post('/api/push/disable', requireAdmin, async (_req, res) => res.json(await updatePushSettings({ enabled: false })));
}
