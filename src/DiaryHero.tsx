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
  'hero-moon-camp': 'moon-camp',
  'hero-jiangnan-market': 'jiangnan-market',
  'hero-desert-oasis': 'desert-oasis',
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

function DesertOasisMotion({ period }: { period: DiaryPeriod }) {
  return <svg className={`desert-oasis-motion desert-oasis-motion-${period}`} viewBox="0 0 1080 432" preserveAspectRatio="xMidYMid slice">
    {period === 'morning' && <>
      <path className="desert-oasis-motion-primary" d="M720 333 C790 318 866 350 944 329 C986 318 1022 321 1060 333" />
      <g className="desert-oasis-motion-secondary"><path d="M899 116 C916 99 930 88 943 67" /><path d="M958 149 C978 133 991 117 998 94" /></g>
    </>}
    {period === 'daytime' && <>
      <path className="desert-oasis-motion-primary" d="M707 338 C786 317 866 339 944 322 C995 311 1035 317 1070 326" />
      <g className="desert-oasis-motion-secondary"><circle cx="824" cy="304" r="4" /><circle cx="887" cy="287" r="3" /><circle cx="954" cy="310" r="5" /></g>
    </>}
    {period === 'evening' && <>
      <ellipse className="desert-oasis-motion-primary" cx="908" cy="256" rx="105" ry="88" />
      <g className="desert-oasis-motion-secondary"><circle cx="832" cy="179" r="3" /><circle cx="954" cy="154" r="4" /></g>
    </>}
    {period === 'night' && <>
      <ellipse className="desert-oasis-motion-primary" cx="899" cy="246" rx="96" ry="80" />
      <g className="desert-oasis-motion-secondary"><path d="M755 345 C820 330 883 354 944 337 C982 326 1017 330 1055 342" /><circle cx="994" cy="109" r="3" /></g>
    </>}
  </svg>;
}

function JiangnanMarketMotion({ period }: { period: DiaryPeriod }) {
  return <svg className={`jiangnan-market-motion jiangnan-market-motion-${period}`} viewBox="0 0 1080 432" preserveAspectRatio="xMidYMid slice">
    {period === 'morning' && <>
      <path className="jiangnan-market-motion-primary" d="M706 351 C782 333 852 361 926 341 C977 327 1021 333 1064 347" />
      <g className="jiangnan-market-motion-secondary"><path d="M914 77 L916 137" /><path d="M978 61 L980 128" /></g>
    </>}
    {period === 'daytime' && <>
      <path className="jiangnan-market-motion-primary" d="M699 342 C777 326 846 350 916 334 C969 322 1019 327 1068 340" />
      <g className="jiangnan-market-motion-secondary"><path d="M927 71 C943 62 961 63 977 73" /><path d="M988 89 C1004 79 1020 81 1035 91" /></g>
    </>}
    {period === 'evening' && <>
      <g className="jiangnan-market-motion-primary"><ellipse cx="893" cy="195" rx="68" ry="62" /><ellipse cx="1010" cy="169" rx="50" ry="47" /></g>
      <path className="jiangnan-market-motion-secondary" d="M760 350 C827 333 883 359 944 340 C985 328 1025 333 1065 347" />
    </>}
    {period === 'night' && <>
      <g className="jiangnan-market-motion-primary"><ellipse cx="773" cy="202" rx="104" ry="86" /><ellipse cx="932" cy="185" rx="72" ry="64" /></g>
      <path className="jiangnan-market-motion-secondary" d="M670 354 C746 333 818 363 891 341 C951 323 1006 331 1064 348" />
    </>}
  </svg>;
}

function MoonCampMotion({ period }: { period: DiaryPeriod }) {
  return <svg className={`moon-camp-motion moon-camp-motion-${period}`} viewBox="0 0 1080 432" preserveAspectRatio="xMidYMid slice">
    {period === 'morning' && <>
      <path className="moon-camp-motion-primary" d="M590 174 L590 258 M590 185 L632 199 L590 213 Z" />
      <circle className="moon-camp-motion-secondary" cx="758" cy="391" r="11" />
    </>}
    {period === 'daytime' && <>
      <g className="moon-camp-motion-primary"><circle cx="626" cy="405" r="27" /><circle cx="722" cy="405" r="27" /></g>
      <path className="moon-camp-motion-secondary" d="M932 256 L982 213 L1012 256" />
    </>}
    {period === 'evening' && <>
      <g className="moon-camp-motion-primary"><circle cx="490" cy="350" r="8" /><circle cx="780" cy="347" r="8" /><circle cx="1058" cy="350" r="8" /></g>
      <path className="moon-camp-motion-secondary" d="M630 294 C664 286 706 288 744 300" />
    </>}
    {period === 'night' && <>
      <g className="moon-camp-motion-primary"><circle cx="577" cy="218" r="20" /><circle cx="577" cy="218" r="33" /></g>
      <ellipse className="moon-camp-motion-secondary" cx="824" cy="319" rx="96" ry="63" />
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
      {motionTheme === 'moon-camp' && <MoonCampMotion period={period} />}
      {motionTheme === 'dino-museum' && <DinoMuseumMotion period={period} />}
      {motionTheme === 'desert-oasis' && <DesertOasisMotion period={period} />}
      {motionTheme === 'jiangnan-market' && <JiangnanMarketMotion period={period} />}
      {motionTheme && !['moon-camp', 'dino-museum', 'desert-oasis', 'jiangnan-market'].includes(motionTheme) && <div className={`${motionTheme}-motion ${motionTheme}-motion-${period}`}>
        <i className={`${motionTheme}-motion-primary`} />
        <i className={`${motionTheme}-motion-secondary`} />
        {motionTheme === 'shop' && <i className="shop-motion-accent" />}
      </div>}
      <span className="diary-period-mark">{periodMark}</span>
      <span className="diary-day-stamp">TODAY</span>
  </div>;
}
