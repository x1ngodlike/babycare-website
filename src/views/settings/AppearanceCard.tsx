// 外观主题设置卡（由 Settings.tsx 抽出，逻辑不变）
import { useState } from 'react';
import { Modal, SegmentedControl } from '../../ui';
import { getGreeting, type ThemeMode } from '../../shared';
import { DiaryHeroLayer } from '../../DiaryHero';
import { diaryPeriodForHour, type WeatherKind, type WeatherSnapshot } from '../../../shared/weather';
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

type HeroBgOption = { value: string; label: string; thumb: string; group: 'living' | 'classic' | 'dream' | 'pony' };

const HERO_BG_OPTIONS: HeroBgOption[] = [
  { value: 'hero-diary', label: '贴纸杂志', thumb: '/hero/diary/thumb.webp', group: 'living' },
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
const DIARY_PERIOD_DETAILS: Record<string, { range: string; weather: Pick<WeatherSnapshot, 'temperatureC' | 'weatherCode' | 'kind' | 'label' | 'icon' | 'isDay'>; sticker?: string }> = {
  morning: { range: '05:00—10:59', weather: { temperatureC: 25, weatherCode: 0, kind: 'clear', label: '晴', icon: '☀️', isDay: true } },
  midday: { range: '11:00—16:59', weather: { temperatureC: 32, weatherCode: 2, kind: 'cloudy', label: '多云', icon: '🌤️', isDay: true }, sticker: '/hero/diary/sticker-feeding.webp' },
  evening: { range: '17:00—19:59', weather: { temperatureC: 28, weatherCode: 63, kind: 'rain', label: '阵雨', icon: '🌧️', isDay: true }, sticker: '/hero/diary/sticker-care.webp' },
  night: { range: '20:00—04:59', weather: { temperatureC: 24, weatherCode: 1, kind: 'clear', label: '晴', icon: '🌙', isDay: false } },
};

function PreviewHero({ profile, userId, periodKey, heroBg, hour, weatherKind }: { profile: Profile; userId: FamilyId; periodKey: string; heroBg: string; hour: number; weatherKind?: WeatherKind }) {
  const { greeting, displayName } = getGreeting(profile, userId, hour);
  const d = new Date();
  const dateStr = heroBg === 'hero-diary'
    ? `${d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} · ${d.toLocaleDateString('zh-CN', { weekday: 'long' })}`
    : `今日 · ${d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} · ${d.toLocaleDateString('zh-CN', { weekday: 'long' })}`;
  const diaryPeriod = diaryPeriodForHour(hour);
  const periodLabel = (heroBg === 'hero-diary' ? DIARY_PERIODS : HERO_PERIODS).find(p => p.key === periodKey)?.label ?? periodKey;
  const diaryDetail = DIARY_PERIOD_DETAILS[periodKey] || DIARY_PERIOD_DETAILS.midday;
  const selectedWeather = DIARY_WEATHER_OPTIONS.find(option => option.kind === weatherKind);
  const previewWeather: WeatherSnapshot = {
    location: '浙江省 · 杭州市',
    ...(selectedWeather || diaryDetail.weather),
    isDay: diaryPeriod !== 'night',
    updatedAt: new Date().toISOString(),
    stale: false,
  };
  const periodClass = `baby-hero ${heroBg !== 'auto' ? heroBg : ''} hero-${periodKey}${heroBg === 'hero-diary' ? ` diary-${diaryPeriod} weather-${previewWeather.kind}` : ''}`;
  return (
    <section className={periodClass} aria-label={`${periodLabel}时段预览`}>
      <div className={heroBg === 'hero-diary' ? 'diary-copy-sticker' : undefined}>
        {heroBg === 'hero-diary' ? <h1 className="hero-greeting-title"><span>{greeting}，</span><strong>{displayName}～</strong></h1> : <h1 className="hero-greeting-title">{greeting}，{displayName}～</h1>}
        <p className="kicker hero-date-line">{dateStr}</p>
        <div className="hero-status"><p>{heroBg === 'hero-diary' ? `上次记录 ${String(hour).padStart(2, '0')}:27 · 喂奶 · 120 mL` : `${periodLabel}时段预览`}</p></div>
      </div>
      {heroBg === 'hero-diary' && <DiaryHeroLayer period={diaryPeriod} weather={previewWeather} showEgg={Boolean(diaryDetail.sticker)} eggIcon={diaryDetail.sticker} />}
    </section>
  );
}

export function AppearanceSettingsCard({ theme, onChange, heroBg, onHeroBgChange, profile, userId }: { theme: ThemeMode; onChange(value: ThemeMode): void; heroBg: string; onHeroBgChange(value: string): void; profile: Profile; userId: FamilyId }) {
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

    <section className="settings-card">
      <h2>首页背景</h2>
      <p>选择首页顶部插画风格。</p>
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
        <p className="hero-preview-hint">{previewTheme === 'hero-diary' ? '选择一种天气，下方同时展示早晨、白天、傍晚和夜晚效果。' : '各时段背景仅作效果预览，首页将根据当前时间自动切换。'}</p>
        {previewTheme === 'hero-diary' && <div className="hero-weather-preview-tabs" role="group" aria-label="天气效果预览">{DIARY_WEATHER_OPTIONS.map(option => <button type="button" key={option.kind} className={previewWeatherKind === option.kind ? 'active' : ''} aria-pressed={previewWeatherKind === option.kind} onClick={() => setPreviewWeatherKind(option.kind)}>{option.label}</button>)}</div>}
        <div className="hero-preview-list">
          {(previewTheme === 'hero-diary' ? DIARY_PERIODS : HERO_PERIODS).map(period => (
            <PreviewHero
              key={`${period.key}:${previewTheme === 'hero-diary' ? previewWeatherKind : 'default'}`}
              profile={profile}
              userId={userId}
              periodKey={period.key}
              heroBg={previewTheme}
              hour={(previewTheme === 'hero-diary' ? DIARY_PERIOD_HOURS : HERO_PERIOD_HOURS)[period.key] ?? currentHour}
              weatherKind={previewTheme === 'hero-diary' ? previewWeatherKind : undefined}
            />
          ))}
        </div>
      </Modal>
    )}
  </>;
}
