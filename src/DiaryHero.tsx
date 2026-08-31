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
  'hero-dino-museum': 'dino-museum',
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

function DinoMuseumMotion({ period }: { period: DiaryPeriod }) {
  return <svg className={`dino-museum-motion dino-museum-motion-${period}`} viewBox="0 0 1080 432" preserveAspectRatio="xMidYMid slice">
    {period === 'morning' && <>
      <path className="dino-museum-motion-primary" d="M745 -20 L1015 -20 L900 340 L690 340 Z" />
      <g className="dino-museum-motion-secondary"><circle cx="785" cy="105" r="5" /><circle cx="845" cy="164" r="3" /><circle cx="914" cy="91" r="4" /></g>
    </>}
    {period === 'daytime' && <>
      <path className="dino-museum-motion-primary" d="M795 -20 L1005 -20 L918 350 L748 350 Z" />
      <g className="dino-museum-motion-secondary"><circle cx="792" cy="126" r="4" /><circle cx="852" cy="194" r="3" /><circle cx="943" cy="143" r="5" /></g>
    </>}
    {period === 'evening' && <>
      <ellipse className="dino-museum-motion-primary" cx="842" cy="229" rx="174" ry="126" />
      <g className="dino-museum-motion-secondary"><circle cx="770" cy="214" r="4" /><circle cx="857" cy="167" r="3" /><circle cx="938" cy="241" r="5" /></g>
    </>}
    {period === 'night' && <>
      <path className="dino-museum-motion-primary" d="M1055 148 L1055 278 L746 351 L760 83 Z" />
      <g className="dino-museum-motion-secondary"><circle cx="792" cy="118" r="4" /><circle cx="861" cy="175" r="3" /><circle cx="929" cy="107" r="5" /><circle cx="817" cy="268" r="3" /></g>
    </>}
  </svg>;
}

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
      {motionTheme === 'dino-museum' && <DinoMuseumMotion period={period} />}
      {motionTheme && motionTheme !== 'dino-museum' && <div className={`${motionTheme}-motion ${motionTheme}-motion-${period}`}>
        <i className={`${motionTheme}-motion-primary`} />
        <i className={`${motionTheme}-motion-secondary`} />
        {motionTheme === 'shop' && <i className="shop-motion-accent" />}
      </div>}
      <span className="diary-period-mark">{periodMark}</span>
      <span className="diary-day-stamp">TODAY</span>
  </div>;
}
