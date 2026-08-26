// 外观主题设置卡（由 Settings.tsx 抽出，逻辑不变）
import { useState } from 'react';
import { Modal, SegmentedControl } from '../../ui';
import { getGreeting, type ThemeMode } from '../../shared';
import { DiaryHeroLayer, DiaryWeatherBadge } from '../../DiaryHero';
import { diaryPeriodForHour, type WeatherKind, type WeatherSnapshot } from '../../../shared/weather';
import { getWeatherHeroAssets, isWeatherHeroTheme, WEATHER_HERO_ASSETS } from '../../config/weatherThemes';
import type { FamilyId, Profile } from '../../types';

const HERO_PERIODS = [
  { key: 'morning', label: '早晨', icon: '🌅', fileIndex: 1 },
  { key: 'midday', label: '午间', icon: '☀️', fileIndex: 2 },
  { key: 'afternoon', label: '下午', icon: '🌤️', fileIndex: 3 },
  { key: 'evening', label: '傍晚', icon: '🌇', fileIndex: 4 },
  { key: 'night', label: '夜间', icon: '🌙', fileIndex: 5 },
];

const DIARY_PERIODS = [
  { key: 'morning', label: '早晨', icon: '🌅', fileIndex: 1 },
  { key: 'midday', label: '白天', icon: '☀️', fileIndex: 2 },
  { key: 'evening', label: '傍晚', icon: '🌇', fileIndex: 3 },
  { key: 'night', label: '夜晚', icon: '🌙', fileIndex: 4 },
];

type HeroBgOption = { value: string; label: string; thumb: string; group: 'weather' | 'living' | 'classic' | 'dream' | 'pony' };

const HERO_BG_OPTIONS: HeroBgOption[] = [
  { value: 'hero-diary', label: '自然画报', thumb: WEATHER_HERO_ASSETS['hero-diary'].thumb, group: 'weather' },
  { value: 'hero-travel', label: '云端旅志', thumb: WEATHER_HERO_ASSETS['hero-travel'].thumb, group: 'weather' },
  { value: 'hero-garden', label: '动态花园', thumb: '/hero/garden/morning.webp', group: 'living' },
  { value: 'auto', label: '绿野晨光', thumb: '/hero/default/morning.webp', group: 'classic' },
  { value: 'hero-paper', label: '折纸童趣', thumb: '/hero/paper/morning.webp', group: 'classic' },
  { value: 'hero-pixel', label: '像素萌兔', thumb: '/hero/pixel/morning.webp', group: 'classic' },
  { value: 'hero-watercolor', label: '手绘水彩', thumb: '/hero/watercolor/morning.webp', group: 'classic' },
  { value: 'hero-clay', label: '软陶时光', thumb: '/hero/clay/morning.webp', group: 'classic' },
  { value: 'hero-ink', label: '水墨丹青', thumb: '/hero/ink/morning.webp', group: 'classic' },
  { value: 'hero-forest', label: '林间甜梦', thumb: '/hero/forest/morning.webp', group: 'dream' },
  { value: 'hero-cloud', label: '云端甜梦', thumb: '/hero/cloud/morning.webp', group: 'dream' },
  { value: 'hero-cozy', label: '暖房甜梦', thumb: '/hero/cozy/morning.webp', group: 'dream' },
  { value: 'hero-pony', label: '星梦小马', thumb: '/hero/pony/morning.webp', group: 'pony' },
  { value: 'hero-tale', label: '童话小马', thumb: '/hero/tale/morning.webp', group: 'pony' },
  { value: 'hero-cyber', label: '赛博小马', thumb: '/hero/cyber/morning.webp', group: 'pony' },
];

const HERO_BG_GROUP_ORDER = [
  { key: 'living', label: '动态系列' },
  { key: 'classic', label: '经典系列' },
  { key: 'dream', label: '甜梦系列' },
  { key: 'pony', label: '小马系列' },
] as const;

const HERO_PERIOD_HOURS: Record<string, number> = { morning: 7, midday: 12, afternoon: 15, evening: 20, night: 1 };
const DIARY_PERIOD_HOURS: Record<string, number> = { morning: 7, midday: 13, evening: 18, night: 1 };
const DIARY_WEATHER_OPTIONS: Array<{ kind: WeatherKind; label: string; temperatureC: number; weatherCode: number; icon: string }> = [
  { kind: 'clear', label: '晴', temperatureC: 29, weatherCode: 0, icon: '☀️' },
  { kind: 'cloudy', label: '多云', temperatureC: 28, weatherCode: 2, icon: '🌤️' },
  { kind: 'overcast', label: '阴', temperatureC: 26, weatherCode: 3, icon: '☁️' },
  { kind: 'rain', label: '雨', temperatureC: 24, weatherCode: 63, icon: '🌧️' },
  { kind: 'fog', label: '雾', temperatureC: 23, weatherCode: 45, icon: '🌫️' },
  { kind: 'snow', label: '雪', temperatureC: 1, weatherCode: 71, icon: '🌨️' },
  { kind: 'thunder', label: '雷雨', temperatureC: 25, weatherCode: 95, icon: '⛈️' },
];
const DIARY_PERIOD_DETAILS: Record<string, { range: string; weather: Pick<WeatherSnapshot, 'temperatureC' | 'weatherCode' | 'kind' | 'label' | 'icon' | 'isDay'> }> = {
  morning: { range: '05:00—10:59', weather: { temperatureC: 25, weatherCode: 0, kind: 'clear', label: '晴', icon: '☀️', isDay: true } },
  midday: { range: '11:00—17:59', weather: { temperatureC: 32, weatherCode: 2, kind: 'cloudy', label: '多云', icon: '🌤️', isDay: true } },
  evening: { range: '18:00—22:59', weather: { temperatureC: 28, weatherCode: 63, kind: 'rain', label: '阵雨', icon: '🌧️', isDay: true } },
  night: { range: '23:00—04:59', weather: { temperatureC: 24, weatherCode: 1, kind: 'clear', label: '晴', icon: '🌙', isDay: false } },
};

function PreviewHero({ profile, userId, periodKey, heroBg, hour, weatherKind, weatherEffectsEnabled = true }: { profile: Profile; userId: FamilyId; periodKey: string; heroBg: string; hour: number; weatherKind?: WeatherKind; weatherEffectsEnabled?: boolean }) {
  const { greeting, displayName } = getGreeting(profile, userId, hour);
  const d = new Date();
  const magazineTheme = isWeatherHeroTheme(heroBg);
  const dateStr = magazineTheme
    ? `${d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} · ${d.toLocaleDateString('zh-CN', { weekday: 'short' })}`
    : `今日 · ${d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} · ${d.toLocaleDateString('zh-CN', { weekday: 'long' })}`;
  const diaryPeriod = diaryPeriodForHour(hour);
  const periodLabel = (magazineTheme ? DIARY_PERIODS : HERO_PERIODS).find(p => p.key === periodKey)?.label ?? periodKey;
  const diaryDetail = DIARY_PERIOD_DETAILS[periodKey] || DIARY_PERIOD_DETAILS.midday;
  const selectedWeather = DIARY_WEATHER_OPTIONS.find(option => option.kind === weatherKind);
  const previewWeather: WeatherSnapshot = {
    location: '浙江省 · 杭州市',
    ...(selectedWeather || diaryDetail.weather),
    isDay: diaryPeriod !== 'night',
    updatedAt: new Date().toISOString(),
    stale: false,
  };
  const heroThemeClass = heroBg === 'hero-travel' ? 'hero-diary hero-travel' : heroBg !== 'auto' ? heroBg : '';
  const periodClass = `baby-hero ${heroThemeClass} hero-${periodKey}${magazineTheme ? ` diary-${diaryPeriod} weather-${previewWeather.kind}${weatherEffectsEnabled ? '' : ' weather-effects-off'}` : ''}`;
  return (
    <section className={periodClass} aria-label={`${periodLabel}时段预览`}>
      <div className={magazineTheme ? 'diary-copy-sticker' : undefined}>
        {magazineTheme ? <h1 className="hero-greeting-title"><span>{greeting}，</span><strong>{displayName}～</strong></h1> : <h1 className="hero-greeting-title">{greeting}，{displayName}～</h1>}
        {magazineTheme ? <div className="diary-date-weather-row"><p className="kicker hero-date-line">{dateStr}</p><DiaryWeatherBadge weather={previewWeather} /></div> : <p className="kicker hero-date-line">{dateStr}</p>}
        <div className="hero-status"><p>{magazineTheme ? `上次记录 ${String(hour).padStart(2, '0')}:27 · 喂奶 · 120 mL` : `上次记录：${String(hour).padStart(2, '0')}:27 · 喂奶 · 奶粉 120 mL`}</p></div>
      </div>
      {magazineTheme && <DiaryHeroLayer period={diaryPeriod} weather={previewWeather} />}
    </section>
  );
}

export function AppearanceSettingsCard({ theme, onChange, heroBg, onHeroBgChange, heroWeatherEffects, onHeroWeatherEffectsChange, profile, userId }: { theme: ThemeMode; onChange(value: ThemeMode): void; heroBg: string; onHeroBgChange(value: string): void; heroWeatherEffects: Record<string, boolean>; onHeroWeatherEffectsChange(value: string, enabled: boolean): void; profile: Profile; userId: FamilyId }) {
  const [previewTheme, setPreviewTheme] = useState<string | null>(null);
  const [previewWeatherKind, setPreviewWeatherKind] = useState<WeatherKind>('clear');

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
    { value: 'system', label: '跟随系统' },
  ];

  const currentHour = new Date().getHours();

  return <>
    <section className="settings-card">
      <h2>主题模式</h2>
      <p>选择浅色或深色模式，也可以跟随系统自动切换。</p>
      <div style={{ marginTop: 14 }}>
        <SegmentedControl label="主题模式" value={theme} options={themeOptions} onChange={onChange} />
      </div>
    </section>

    <section className="settings-card weather-scene-card">
      <h2>全新主题</h2>
      <p>天气、时段与配套图标会一起改变首页氛围。</p>
      <p className="hero-bg-group-note">天气遮罩开关会同时控制该主题预览与首页。</p>
      <div className="hero-bg-list" role="radiogroup" aria-label="天气画境方案" style={{ marginTop: 14 }}>
        {HERO_BG_OPTIONS.filter(opt => opt.group === 'weather').map(opt => (
          <div key={opt.value} className="hero-bg-row">
            <label className={`hero-bg-item${heroBg === opt.value ? ' selected' : ''}`}>
              <input type="radio" name="hero-bg" value={opt.value} checked={heroBg === opt.value} onChange={() => onHeroBgChange(opt.value)} aria-label={opt.label} />
              <span className="hero-bg-checkmark" aria-hidden="true">
                {heroBg === opt.value && <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,7 6,10 11,4" /></svg>}
              </span>
              <img className="hero-bg-thumb" src={opt.thumb} alt="" />
              <b className="hero-bg-label">{opt.label}</b>
            </label>
            <button type="button" className="text-button hero-bg-preview-btn hero-weather-toggle-btn" aria-label={`${opt.label}天气遮罩：${heroWeatherEffects[opt.value] !== false ? '开启' : '关闭'}`} aria-pressed={heroWeatherEffects[opt.value] !== false} onClick={() => onHeroWeatherEffectsChange(opt.value, heroWeatherEffects[opt.value] === false)}>{heroWeatherEffects[opt.value] !== false ? '开启' : '关闭'}</button>
            <button type="button" className="text-button hero-bg-preview-btn" onClick={() => setPreviewTheme(opt.value)}>预览</button>
          </div>
        ))}
      </div>
    </section>

    <section className="settings-card">
      <h2>首页背景</h2>
      <p>选择不随天气变化的首页顶部插画风格。</p>
      <div className="hero-bg-groups" style={{ marginTop: 14 }}>
        {HERO_BG_GROUP_ORDER.map(group => {
          const items = HERO_BG_OPTIONS.filter(o => o.group === group.key);
          if (!items.length) return null;
          return (
            <div key={group.key} className="hero-bg-group">
              <p className="hero-bg-group-title">{group.label}</p>
              <div className="hero-bg-list" role="radiogroup" aria-label={`${group.label}背景方案`}>
                {items.map(opt => (
                  <div key={opt.value} className="hero-bg-row">
                    <label className={`hero-bg-item${heroBg === opt.value ? ' selected' : ''}`}>
                      <input
                        type="radio"
                        name="hero-bg"
                        value={opt.value}
                        checked={heroBg === opt.value}
                        onChange={() => onHeroBgChange(opt.value)}
                        aria-label={opt.label}
                      />
                        <span className="hero-bg-checkmark" aria-hidden="true">
                          {heroBg === opt.value && <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,7 6,10 11,4" /></svg>}
                        </span>
                        <img className="hero-bg-thumb" src={opt.thumb} alt="" />
                        <b className="hero-bg-label">{opt.label}</b>
                    </label>
                    <button
                      type="button"
                      className="text-button hero-bg-preview-btn"
                      onClick={() => setPreviewTheme(opt.value)}
                    >
                      预览
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>

    {previewTheme !== null && (
      <Modal
        title="首页背景预览"
        kicker={HERO_BG_OPTIONS.find(o => o.value === previewTheme)?.label ?? ''}
        onClose={() => setPreviewTheme(null)}
      >
        <p className="hero-preview-hint">{isWeatherHeroTheme(previewTheme) ? '选择一种天气，下方同时展示早晨、白天、傍晚和夜晚效果。' : '各时段背景仅作效果预览，首页将根据当前时间自动切换。'}</p>
        {isWeatherHeroTheme(previewTheme) && <div className="hero-weather-preview-tabs" role="group" aria-label="天气效果预览">{DIARY_WEATHER_OPTIONS.map(option => <button type="button" key={option.kind} className={previewWeatherKind === option.kind ? 'active' : ''} aria-pressed={previewWeatherKind === option.kind} onClick={() => setPreviewWeatherKind(option.kind)}>{option.label}</button>)}</div>}
        {isWeatherHeroTheme(previewTheme) && (() => {
          const assets = getWeatherHeroAssets(previewTheme);
          if (!assets) return null;
          const groups = [
            { title: '快捷与记录', items: [['喂奶', assets.stickers.feeding], ['排便', assets.stickers.bowel], ['护理', assets.stickers.care], ['其他', assets.stickers.note]] },
            { title: '今日待办', items: [['服药', assets.tasks.medicine], ['推拿', assets.tasks.massage], ['洗澡', assets.tasks.bath], ['护理', assets.tasks.care], ['疫苗', assets.tasks.vaccine], ['成长', assets.tasks.growth]] },
            { title: '底部导航', items: [['今日', assets.nav.today], ['记录', assets.nav.history], ['AI', assets.nav.chat], ['趋势', assets.nav.trends], ['档案', assets.nav.archive]] },
          ];
          return <section className="hero-theme-icons-preview" aria-label="主题图标预览"><h3>配套图标</h3>{groups.map(group => <div className="hero-theme-icon-group" key={group.title}><p>{group.title}</p><div>{group.items.map(([label, src]) => <span key={label}><img src={src} alt="" /><b>{label}</b></span>)}</div></div>)}</section>;
        })()}
        <div className="hero-preview-list">
          {(isWeatherHeroTheme(previewTheme) ? DIARY_PERIODS : HERO_PERIODS).map(period => (
            <PreviewHero
              key={`${period.key}:${isWeatherHeroTheme(previewTheme) ? previewWeatherKind : 'default'}`}
              profile={profile}
              userId={userId}
              periodKey={period.key}
              heroBg={previewTheme}
              hour={(isWeatherHeroTheme(previewTheme) ? DIARY_PERIOD_HOURS : HERO_PERIOD_HOURS)[period.key] ?? currentHour}
              weatherKind={isWeatherHeroTheme(previewTheme) ? previewWeatherKind : undefined}
              weatherEffectsEnabled={heroWeatherEffects[previewTheme] !== false}
            />
          ))}
        </div>
      </Modal>
    )}
  </>;
}
