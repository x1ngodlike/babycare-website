import type { Express } from 'express';
import { getHangzhouWeather } from '../weather.js';

export function registerWeatherRoutes(app: Express) {
  app.get('/api/weather', async (_req, res) => {
    try {
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.json(await getHangzhouWeather());
    } catch (error) {
      console.error('[weather] 获取杭州天气失败:', error);
      return res.status(502).json({ error: '天气暂时无法更新' });
    }
  });
}
