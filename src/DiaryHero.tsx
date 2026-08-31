import type { DiaryPeriod, WeatherSnapshot } from '../shared/weather';

export function DiaryWeatherBadge({ weather }: { weather: WeatherSnapshot | null }) {
  const weatherLabel = weather ? `${weather.label} ${weather.temperatureC}°` : '天气更新中';
  const visualWeatherLabel = weather?.label === '晴间多云' ? '多云' : weather?.label;
  const weatherEmoji = weather?.icon || '🌡️';
  return <div className="diary-weather" aria-label={`${weatherLabel}，${weather?.location || '浙江省 · 杭州市余杭区'}`} title={weather?.stale ? '当前显示最近一次天气' : undefined}>
    <span><i className="diary-weather-symbol" aria-hidden="true">{weatherEmoji}</i><b>{weather ? `${visualWeatherLabel} ${weather.temperatureC}°` : '天气更新中'}</b></span>
  </div>;
}

const MOTION_THEME_BY_BACKGROUND: Record<string, string> = {
  'hero-midsummer-dream': 'midsummer-dream',
  'hero-bamboo-court': 'bamboo-court',
  'hero-basic-shapes': 'basic-shapes',
  'hero-block-factory': 'block-factory',
  'hero-immortal-gate': 'immortal-gate',
  'hero-fruit-cake': 'fruit-cake',
  'hero-candy-workshop': 'fruit-cake',
  'hero-forest-press': 'forest-press',
  'hero-shop': 'shop',
  'hero-arcane': 'arcane',
  'hero-ocean': 'ocean',
};

export function DiaryHeroLayer({ period, weather, background }: { period: DiaryPeriod; weather: WeatherSnapshot | null; background: string }) {
  const periodMark = { morning: '晨', daytime: '昼', evening: '暮', night: '夜' }[period];
  const motionTheme = MOTION_THEME_BY_BACKGROUND[background];
  return <div className={`diary-scene diary-${period} weather-${weather?.kind || 'unknown'}`} aria-hidden="true">
      <i className="diary-paper-grain" />
      <i className="diary-washi" />
      <i className="diary-stars" />
      <i className="diary-birds" />
      <i className="diary-sun-moon" />
      <i className="diary-cloud diary-cloud-one" />
      <i className="diary-cloud diary-cloud-two" />
      <i className="diary-hill diary-hill-one" />
      <i className="diary-hill diary-hill-two" />
      <i className="diary-rain" />
      <i className="diary-fog" />
      <i className="diary-snow diary-snow-one" />
      <i className="diary-snow diary-snow-two" />
      {motionTheme && <div className={`${motionTheme}-motion ${motionTheme}-motion-${period}`}>
        <i className={`${motionTheme}-motion-primary`} />
        <i className={`${motionTheme}-motion-secondary`} />
        {motionTheme === 'shop' && <i className="shop-motion-accent" />}
      </div>}
      <span className="diary-period-mark">{periodMark}</span>
      <span className="diary-day-stamp">TODAY</span>
  </div>;
}
