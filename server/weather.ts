import { describeWeatherCode, type WeatherSnapshot } from '../shared/weather.js';

const HANGZHOU_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast?latitude=30.3889&longitude=120.3075&current=temperature_2m,weather_code,is_day&timezone=Asia%2FShanghai';
const FRESH_FOR_MS = 30 * 60 * 1000;
const STALE_FOR_MS = 24 * 60 * 60 * 1000;

let cachedWeather: { fetchedAt: number; value: WeatherSnapshot } | null = null;

interface OpenMeteoCurrentResponse {
  current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
}

export async function getHangzhouWeather(now = Date.now()): Promise<WeatherSnapshot> {
  if (cachedWeather && now - cachedWeather.fetchedAt < FRESH_FOR_MS) return cachedWeather.value;
  try {
    const response = await fetch(HANGZHOU_FORECAST_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4_000) });
    if (!response.ok) throw new Error(`天气服务返回 ${response.status}`);
    const payload = await response.json() as OpenMeteoCurrentResponse;
    const temperatureC = payload.current?.temperature_2m;
    const weatherCode = payload.current?.weather_code;
    const isDay = payload.current?.is_day === 1;
    if (!Number.isFinite(temperatureC) || !Number.isFinite(weatherCode)) throw new Error('天气数据不完整');
    const visual = describeWeatherCode(weatherCode!, isDay);
    const value: WeatherSnapshot = {
      location: '浙江省 · 杭州市余杭区', temperatureC: Math.round(temperatureC!), weatherCode: weatherCode!,
      ...visual, isDay, updatedAt: new Date(now).toISOString(), stale: false
    };
    cachedWeather = { fetchedAt: now, value };
    return value;
  } catch (error) {
    if (cachedWeather && now - cachedWeather.fetchedAt < STALE_FOR_MS) return { ...cachedWeather.value, stale: true };
    throw error;
  }
}
