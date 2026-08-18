import type { Express } from 'express';
import { z } from 'zod';
import { getSessionUser, requireAdmin, requireSuperAdmin } from '../auth.js';
import { testModelConnection } from '../ai.js';
import { generateChatReply } from '../chat.js';
import { generateDailyReportForDate, yesterdayInShanghai } from '../daily-report.js';
import { addMemory, clearMemories, deleteMemory, deleteSession, getAiSettings, getDailyReport, getSession as getChatSession, listMemories, listMessages, listSessions, restoreMemoryById, saveAiSettings, createSession as createChatSession } from '../db/index.js';
import { aiSettingsSchema, chatMessageSchema, memoryInputSchema } from '../schemas.js';
import type { FamilyId } from '../types.js';

function publicAiSettings() {
  const settings = getAiSettings();
  return {
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    configured: Boolean(settings.apiKey),
    keyHint: settings.apiKey ? `••••${settings.apiKey.slice(-4)}` : '',
    updatedAt: settings.updatedAt
  };
}

function modelSettings(input?: z.infer<typeof aiSettingsSchema>) {
  const saved = getAiSettings();
  return {
    baseUrl: input?.baseUrl || saved.baseUrl,
    model: input?.model || saved.model,
    apiKey: input?.apiKey || saved.apiKey
  };
}

function modelError(error: unknown) {
  if (error instanceof z.ZodError) return '模型返回的数据格式不正确';
  if (error instanceof SyntaxError) return '模型返回的内容不是有效数据';
  return error instanceof Error ? error.message : '模型服务暂时不可用';
}

export function registerAiRoutes(app: Express) {
  app.get('/api/ai/settings', requireSuperAdmin, (_req, res) => res.json(publicAiSettings()));

  app.put('/api/ai/settings', requireSuperAdmin, (req, res) => {
    const parsed = aiSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '模型配置格式不正确' });
    saveAiSettings(parsed.data);
    return res.json(publicAiSettings());
  });

  app.post('/api/ai/settings/test', requireSuperAdmin, async (req, res) => {
    const parsed = aiSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '模型配置格式不正确' });
    const settings = modelSettings(parsed.data);
    if (!settings.apiKey) return res.status(400).json({ error: '请先填写 API 密钥' });
    try {
      await testModelConnection(settings);
      return res.json({ ok: true, message: '连接成功，模型可以正常使用' });
    } catch (error) {
      return res.status(502).json({ error: modelError(error) });
    }
  });

  // ----- AI 对话 -----
  app.post('/api/ai/chat', async (req, res) => {
    const user = getSessionUser(req)!;
    const parsed = chatMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '对话内容格式不正确' });
    const settings = getAiSettings();
    if (!settings.apiKey) return res.status(400).json({ error: '服务器尚未配置 AI 模型，请先在设置中配置' });
    const targetUserId = (user.role === 'superadmin' && parsed.data.userId && parsed.data.userId !== user.id) ? parsed.data.userId : user.id;
    try {
      const result = await generateChatReply({ baseUrl: settings.baseUrl, model: settings.model, apiKey: settings.apiKey }, { userId: targetUserId, sessionId: parsed.data.sessionId, message: parsed.data.message, userName: parsed.data.userName || user.name });
      return res.json({ reply: result.reply, sessionId: result.sessionId, title: result.title, extractedMemories: result.extractedMemories, userId: targetUserId });
    } catch (error) {
      return res.status(502).json({ error: modelError(error) });
    }
  });

  app.get('/api/ai/chat/sessions', (req, res) => {
    const user = getSessionUser(req)!;
    const requested = typeof req.query.userId === 'string' ? (req.query.userId as FamilyId) : undefined;
    if (user.role !== 'superadmin' && requested && requested !== user.id) return res.status(403).json({ error: '只能查看自己的对话' });
    const userId = (user.role === 'superadmin' && requested) ? requested : user.id;
    return res.json({ sessions: listSessions(userId) });
  });

  app.post('/api/ai/chat/sessions', (req, res) => {
    const user = getSessionUser(req)!;
    const parsed = z.object({ userId: z.enum(['father', 'mother', 'grandfather', 'grandmother']).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '参数不正确' });
    const targetUserId = (user.role === 'superadmin' && parsed.data.userId) ? parsed.data.userId : user.id;
    const session = createChatSession(targetUserId);
    return res.status(201).json(session);
  });

  app.get('/api/ai/chat/sessions/:id/messages', (req, res) => {
    const user = getSessionUser(req)!;
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '会话编号不正确' });
    const session = getChatSession(parsed.data);
    if (!session) return res.status(404).json({ error: '会话不存在' });
    if (session.userId !== user.id && user.role !== 'superadmin') return res.status(403).json({ error: '只能查看自己的对话' });
    return res.json({ messages: listMessages(parsed.data) });
  });

  app.delete('/api/ai/chat/sessions/:id', (req, res) => {
    const user = getSessionUser(req)!;
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '会话编号不正确' });
    const session = getChatSession(parsed.data);
    if (!session) return res.status(404).json({ error: '会话不存在' });
    if (session.userId !== user.id && user.role !== 'superadmin') return res.status(403).json({ error: '只能删除自己的对话' });
    deleteSession(parsed.data);
    return res.json({ deleted: true });
  });

  app.get('/api/ai/memories', (req, res) => {
    const includeExpired = req.query.includeExpired === '1' || req.query.includeExpired === 'true';
    return res.json({ memories: listMemories(includeExpired) });
  });

  app.post('/api/ai/memories', (req, res) => {
    const parsed = memoryInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '记忆格式不正确' });
    const memory = addMemory(parsed.data.content, parsed.data.category, parsed.data.expiresAt ?? null);
    return res.status(201).json(memory);
  });

  app.delete('/api/ai/memories/:id', requireAdmin, (req, res) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '记忆编号不正确' });
    if (!deleteMemory(parsed.data)) return res.status(404).json({ error: '记忆不存在' });
    return res.json({ deleted: true });
  });

  app.delete('/api/ai/memories', requireAdmin, (_req, res) => {
    clearMemories();
    return res.json({ cleared: true });
  });

  app.post('/api/ai/memories/:id/restore', requireAdmin, (req, res) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: '记忆编号不正确' });
    const memory = restoreMemoryById(parsed.data);
    if (!memory) return res.status(404).json({ error: '记忆不存在' });
    return res.json(memory);
  });

  // ----- 日报 -----
  app.get('/api/daily-report', async (req, res) => {
    const date = typeof req.query.date === 'string' && req.query.date ? req.query.date : yesterdayInShanghai();
    let report = getDailyReport(date);
    if (!report && getAiSettings().apiKey) {
      try { report = await generateDailyReportForDate(date); }
      catch (error) { console.error('[daily-report] 按需生成失败', error); }
    }
    if (!report) return res.json({ date, exists: false });
    return res.json({ date, exists: true, summary: report.summary, suggestions: report.suggestions, model: report.model, generatedAt: report.generatedAt });
  });

  app.post('/api/daily-report/generate', async (req, res) => {
    const date = typeof req.query.date === 'string' && req.query.date ? req.query.date : yesterdayInShanghai();
    try {
      const report = await generateDailyReportForDate(date);
      return res.json({ date: report.reportDate, summary: report.summary, suggestions: report.suggestions, model: report.model, generatedAt: report.generatedAt });
    } catch (error) {
      if (error instanceof Error && error.message === '服务器尚未配置 AI 模型') return res.status(503).json({ error: error.message });
      return res.status(502).json({ error: modelError(error) });
    }
  });
}
