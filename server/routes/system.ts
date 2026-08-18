import type { Express } from 'express';
import { getAiSettings } from '../db/index.js';
import type { RouteContext } from './context.js';

// 全局系统接口：SSE 实时通道与能力探测（在 requireAuth 之后注册）
export function registerSystemRoutes(app: Express, ctx: RouteContext) {
  app.get('/api/events', (req, res) => ctx.changeHub.connect(req, res));
  app.get('/api/capabilities', (_req, res) => {
    const settings = getAiSettings();
    res.json({ aiEnabled: Boolean(settings.apiKey), aiModel: settings.apiKey ? settings.model : null });
  });
}
