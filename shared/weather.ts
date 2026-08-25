export type WeatherKind = 'clear' | 'cloudy' | 'overcast' | 'fog' | 'rain' | 'snow' | 'thunder';
export type DiaryPeriod = 'morning' | 'daytime' | 'evening' | 'night';

export interface WeatherSnapshot {
  location: '浙江省 · 杭州市';
  temperatureC: number;
  weatherCode: number;
  kind: WeatherKind;
  label: string;
  icon: string;
  isDay: boolean;
  updatedAt: string;
  stale: boolean;
}

export function diaryPeriodForHour(hour: number): DiaryPeriod {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 18) return 'daytime';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

export function describeWeatherCode(code: number, isDay = true): Pick<WeatherSnapshot, 'kind' | 'label' | 'icon'> {
  if (code === 0) return { kind: 'clear', label: '晴', icon: isDay ? '☀️' : '🌙' };
  if (code === 1 || code === 2) return { kind: 'cloudy', label: code === 1 ? '晴间多云' : '多云', icon: isDay ? '🌤️' : '☁️' };
  if (code === 3) return { kind: 'overcast', label: '阴', icon: '☁️' };
  if (code === 45 || code === 48) return { kind: 'fog', label: '雾', icon: '🌫️' };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { kind: 'rain', label: code >= 65 || code === 82 ? '大雨' : '雨', icon: '🌧️' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', label: '雪', icon: '🌨️' };
  if (code >= 95) return { kind: 'thunder', label: '雷雨', icon: '⛈️' };
  return { kind: 'cloudy', label: '天气变化中', icon: '🌤️' };
}
