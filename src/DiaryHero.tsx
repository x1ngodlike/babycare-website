import type { DiaryPeriod, WeatherSnapshot } from '../shared/weather';

export function DiaryWeatherBadge({ weather }: { weather: WeatherSnapshot | null }) {
  const weatherLabel = weather ? `${weather.label} ${weather.temperatureC}°` : '天气更新中';
  const visualWeatherLabel = weather?.label === '晴间多云' ? '多云' : weather?.label;
  const weatherEmoji = weather?.icon || '🌡️';
  return <div className="diary-weather" aria-label={`${weatherLabel}，${weather?.location || '浙江省 · 杭州市余杭区'}`} title={weather?.stale ? '当前显示最近一次天气' : undefined}>
    <span><i className="diary-weather-symbol" aria-hidden="true">{weatherEmoji}</i><b>{weather ? `${visualWeatherLabel} ${weather.temperatureC}°` : '天气更新中'}</b></span>
  </div>;
}

export function DiaryHeroLayer({ period, weather }: { period: DiaryPeriod; weather: WeatherSnapshot | null }) {
  const periodMark = { morning: '晨', daytime: '昼', evening: '暮', night: '夜' }[period];
  return <>
    <div className={`diary-scene diary-${period} weather-${weather?.kind || 'unknown'}`} aria-hidden="true">
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
      <div className={`midsummer-dream-motion midsummer-dream-motion-${period}`}>
        <i className="midsummer-dream-motion-primary" />
        <i className="midsummer-dream-motion-secondary" />
      </div>
      <div className={`bamboo-court-motion bamboo-court-motion-${period}`}>
        <i className="bamboo-court-motion-primary" />
        <i className="bamboo-court-motion-secondary" />
      </div>
      <div className={`shop-motion shop-motion-${period}`}>
        <i className="shop-motion-primary" />
        <i className="shop-motion-secondary" />
        <i className="shop-motion-accent" />
      </div>
      <div className={`arcane-motion arcane-motion-${period}`}>
        <i className="arcane-motion-primary" />
        <i className="arcane-motion-secondary" />
      </div>
      <div className={`ocean-motion ocean-motion-${period}`}>
        <i className="ocean-motion-primary" />
        <i className="ocean-motion-secondary" />
      </div>
      <div className={`forest-press-motion forest-press-motion-${period}`}>
        <i className="forest-press-motion-primary" />
        <i className="forest-press-motion-secondary" />
      </div>
      <div className={`fruit-cake-motion fruit-cake-motion-${period}`}>
        <i className="fruit-cake-motion-primary" />
        <i className="fruit-cake-motion-secondary" />
      </div>
      <div className={`immortal-gate-motion immortal-gate-motion-${period}`}>
        <i className="immortal-gate-motion-primary" />
        <i className="immortal-gate-motion-secondary" />
      </div>
      <div className={`block-factory-motion block-factory-motion-${period}`}>
        <i className="block-factory-motion-primary" />
        <i className="block-factory-motion-secondary" />
      </div>
      <div className={`basic-shapes-motion basic-shapes-motion-${period}`}>
        <i className="basic-shapes-motion-primary" />
        <i className="basic-shapes-motion-secondary" />
      </div>
      <span className="diary-period-mark">{periodMark}</span>
      <span className="diary-day-stamp">TODAY</span>
    </div>
  </>;
}
