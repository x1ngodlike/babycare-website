// 外观主题设置卡 —— 合并后的统一主题卡 + 配置/预览 Modal
import { useState } from 'react';
import { Modal, SegmentedControl } from '../../ui';
import { getGreeting, type ThemeMode } from '../../shared';
import { DiaryHeroLayer, DiaryWeatherBadge } from '../../DiaryHero';
import { diaryPeriodForHour, type WeatherKind, type WeatherSnapshot } from '../../../shared/weather';
import {
  THEMES, HERO_BACKGROUNDS, ICON_PACKS,
  resolveThemeConfig, getIconPackAssets, BG_GROUPS_FOR_LAYOUT, DEFAULT_BG_FOR_LAYOUT,
  type ThemeConfig, type ThemePreset, type HeroLayout, type IconPackId,
} from '../../config/weatherThemes';
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

const HERO_PERIOD_HOURS: Record<string, number> = { morning: 7, midday: 12, afternoon: 15, evening: 20, night: 1 };
const DIARY_PERIOD_HOURS: Record<string, number> = { morning: 7, midday: 13, evening: 18, night: 1 };

const WEATHER_OPTIONS: Array<{ kind: WeatherKind; label: string; temperatureC: number; weatherCode: number; icon: string }> = [
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

const LABEL_FOR_LAYOUT: Record<HeroLayout, string> = { diary: '杂志风', classic: '经典风' };
const LABEL_FOR_PACK: Record<IconPackId, string> = { default: '默认图标', 'hero-diary': '自然画报', 'hero-travel': '云端旅志', 'hero-orbit': '星际观测', 'hero-shop': '晴雨商店', 'hero-arcane': '烛光魔塔', 'hero-ocean': '海底世界' };

function findBgLabel(bg: string): string {
  return HERO_BACKGROUNDS.find(o => o.value === bg)?.label ?? bg;
}

function rowSummary(cfg: ThemeConfig): string {
  const layoutLabel = LABEL_FOR_LAYOUT[cfg.layout];
  const weather = cfg.weatherEffects ? '遮罩开' : '遮罩关';
  return `${layoutLabel} · ${weather}`;
}

function PreviewHero({ profile, userId, periodKey, layout, bg, hour, weatherKind, weatherEffectsEnabled = true }: { profile: Profile; userId: FamilyId; periodKey: string; layout: HeroLayout; bg: string; hour: number; weatherKind?: WeatherKind; weatherEffectsEnabled?: boolean }) {
  const { greeting, displayName } = getGreeting(profile, userId, hour);
  const d = new Date();
  const magazineTheme = layout === 'diary';
  const dateStr = magazineTheme
    ? `${d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} · ${d.toLocaleDateString('zh-CN', { weekday: 'short' })}`
    : `今日 · ${d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} · ${d.toLocaleDateString('zh-CN', { weekday: 'long' })}`;
  const diaryPeriod = diaryPeriodForHour(hour);
  const periodLabel = (magazineTheme ? DIARY_PERIODS : HERO_PERIODS).find(p => p.key === periodKey)?.label ?? periodKey;
  const diaryDetail = DIARY_PERIOD_DETAILS[periodKey] || DIARY_PERIOD_DETAILS.midday;
  const selectedWeather = WEATHER_OPTIONS.find(option => option.kind === weatherKind);
  const previewWeather: WeatherSnapshot = {
    location: '浙江省 · 杭州市',
    ...(selectedWeather || diaryDetail.weather),
    isDay: diaryPeriod !== 'night',
    updatedAt: new Date().toISOString(),
    stale: false,
  };
  const themeClass = magazineTheme ? `hero-diary ${bg}` : bg !== 'auto' ? bg : '';
  const periodClass = `baby-hero ${themeClass} hero-${periodKey}${magazineTheme ? ` diary-${diaryPeriod} weather-${previewWeather.kind}${weatherEffectsEnabled ? '' : ' weather-effects-off'}` : ''}`;
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

function ConfigRow({ label, current, children, expanded, onToggle }: { label: string; current: string; children?: React.ReactNode; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="theme-config-row">
      <button type="button" className={`theme-config-row-head${expanded ? ' expanded' : ''}`} onClick={onToggle} aria-expanded={expanded}>
        <span className="theme-config-row-label">{label}</span>
        <span className="theme-config-row-current">{current}</span>
        <span className="theme-config-row-chevron" aria-hidden="true">▶</span>
      </button>
      {expanded && <div className="theme-config-row-body">{children}</div>}
    </div>
  );
}

function IconPackGrid({ value, onChange, recommended }: { value: IconPackId; onChange(value: IconPackId): void; recommended: IconPackId }) {
  const rec = ICON_PACKS.find(p => p.value === recommended);
  const others = ICON_PACKS.filter(p => p.value !== recommended);
  const renderPack = (pack: typeof ICON_PACKS[number]) => {
    const selected = value === pack.value;
    return (
      <button type="button" key={pack.value} className={`theme-pick-item${selected ? ' selected' : ''}`} onClick={() => onChange(pack.value)} aria-label={pack.label} aria-pressed={selected}>
        {pack.thumb ? <img src={pack.thumb} alt="" /> : <span className="theme-default-icon" aria-hidden="true">★</span>}
        <b>{pack.label}</b>
        {selected && <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3,7 6,10 11,4" /></svg>}
      </button>
    );
  };
  return (
    <>
      {rec && (
        <div className="theme-bg-group">
          <p className="theme-bg-group-title">推荐</p>
          <div className="theme-pick-grid theme-icon-grid">{renderPack(rec)}</div>
        </div>
      )}
      {others.length > 0 && (
        <div className="theme-bg-group">
          <p className="theme-bg-group-title">全部方案</p>
          <div className="theme-pick-grid theme-icon-grid">{others.map(renderPack)}</div>
        </div>
      )}
    </>
  );
}

function BackgroundGroupGrid({ label, items, value, onChange }: { label: string; items: typeof HERO_BACKGROUNDS; value: string; onChange(value: string): void }) {
  if (items.length === 0) return null;
  return (
    <div className="theme-bg-group">
      <p className="theme-bg-group-title">{label}</p>
      <div className="theme-pick-grid theme-bg-grid">
        {items.map(opt => {
          const selected = value === opt.value;
          return (
            <button type="button" key={opt.value} className={`theme-pick-item${selected ? ' selected' : ''}`} onClick={() => onChange(opt.value)} aria-label={opt.label} aria-pressed={selected}>
              <img src={opt.thumb} alt="" />
              <b>{opt.label}</b>
              {selected && <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3,7 6,10 11,4" /></svg>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface ModalState {
  preset: ThemePreset;
  config: ThemeConfig;
}

export function AppearanceSettingsCard({
  theme, onChange,
  heroTheme, onHeroThemeChange,
  heroThemeOverrides, onHeroThemeOverridesChange,
  profile, userId,
}: {
  theme: ThemeMode; onChange(value: ThemeMode): void;
  heroTheme: string; onHeroThemeChange(value: string): void;
  heroThemeOverrides: Record<string, Partial<ThemeConfig>>;
  onHeroThemeOverridesChange(value: Record<string, Partial<ThemeConfig>>): void;
  profile: Profile; userId: FamilyId;
}) {
  const [modal, setModal] = useState<ModalState | null>(null);
  const [bgExpanded, setBgExpanded] = useState(false);
  const [packExpanded, setPackExpanded] = useState(false);
  const [previewWeatherKind, setPreviewWeatherKind] = useState<WeatherKind>('clear');

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
    { value: 'system', label: '跟随系统' },
  ];

  const currentHour = new Date().getHours();

  function openModal(preset: ThemePreset) {
    const cfg = resolveThemeConfig(preset.id, heroThemeOverrides[preset.id]);
    setModal({ preset, config: { ...cfg } });
    setBgExpanded(false);
    setPackExpanded(false);
  }

  function applyAndClose() {
    if (!modal) return;
    const { preset, config } = modal;
    // 计算 overrides：只存与默认值不同的项
    const defaults = preset.defaults;
    const overrides: Partial<ThemeConfig> = {};
    if (config.layout !== defaults.layout) overrides.layout = config.layout;
    if (config.bg !== defaults.bg) overrides.bg = config.bg;
    if (config.iconPack !== defaults.iconPack) overrides.iconPack = config.iconPack;
    if (config.weatherEffects !== defaults.weatherEffects) overrides.weatherEffects = config.weatherEffects;
    const next = { ...heroThemeOverrides, [preset.id]: overrides };
    onHeroThemeOverridesChange(next);
    onHeroThemeChange(preset.id);
    setModal(null);
  }

  function clickThemeRow(preset: ThemePreset) {
    onHeroThemeChange(preset.id);
  }

  return <>
    <section className="settings-card">
      <h2>主题模式</h2>
      <p>选择浅色或深色模式，也可以跟随系统自动切换。</p>
      <div style={{ marginTop: 14 }}>
        <SegmentedControl label="主题模式" value={theme} options={themeOptions} onChange={onChange} />
      </div>
    </section>

    <section className="settings-card">
      <h2>主题</h2>
      <p>背景、图标方案与天气效果一整套切换，点 [自定义] 可逐项微调。</p>
      <div className="hero-bg-list theme-list" role="radiogroup" aria-label="主题方案" style={{ marginTop: 14 }}>
        {THEMES.map(preset => {
          const isActive = heroTheme === preset.id;
          const cfg = resolveThemeConfig(preset.id, heroThemeOverrides[preset.id]);
          return (
            <div key={preset.id} className="hero-bg-row theme-row">
              <label className={`hero-bg-item theme-item${isActive ? ' selected' : ''}`}>
                <input type="radio" name="hero-theme" value={preset.id} checked={isActive} onChange={() => clickThemeRow(preset)} aria-label={preset.label} />
                <span className="hero-bg-checkmark" aria-hidden="true">
                  {isActive && <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,7 6,10 11,4" /></svg>}
                </span>
                <img className="hero-bg-thumb" src={preset.thumb} alt="" />
                <div className="theme-item-copy">
                  <b className="hero-bg-label">{preset.label}</b>
                  <span className="theme-item-summary">{rowSummary(cfg)}</span>
                </div>
              </label>
              <button type="button" className="text-button hero-bg-preview-btn" onClick={() => openModal(preset)}>自定义</button>
            </div>
          );
        })}
      </div>
    </section>

    {modal && (() => {
      const { preset, config } = modal;
      const magazineTheme = config.layout === 'diary';
      const periods = magazineTheme ? DIARY_PERIODS : HERO_PERIODS;
      const periodHours = magazineTheme ? DIARY_PERIOD_HOURS : HERO_PERIOD_HOURS;
      const iconPackAssets = getIconPackAssets(config.iconPack);
      const isWeatherTheme = config.layout === 'diary'; // 只有杂志风才有天气遮罩资源
      const themeOptions: Array<{ value: HeroLayout; label: string; desc: string }> = [
        { value: 'diary', label: '杂志风', desc: '天气徽章 + 动态云层' },
        { value: 'classic', label: '经典风', desc: '简洁日期 + 无动态' },
      ];

      return (
        <Modal
          title="自定义主题"
          kicker={preset.label}
          className="theme-modal"
          onClose={() => setModal(null)}
        >
          <section className="theme-config-area" aria-label="主题配置">
            <div className="theme-config-block">
              <p className="theme-config-block-title">排版风格</p>
              <div className="theme-layout-picker">
                {themeOptions.map(opt => {
                  const selected = config.layout === opt.value;
                  return (
                    <button type="button" key={opt.value} className={`theme-layout-card${selected ? ' selected' : ''}`} onClick={() => {
                      const newLayout = opt.value;
                      const allowedGroups = BG_GROUPS_FOR_LAYOUT[newLayout];
                      const currentGroup = HERO_BACKGROUNDS.find(b => b.value === config.bg)?.group;
                      const safeBg = currentGroup && allowedGroups.includes(currentGroup) ? config.bg : DEFAULT_BG_FOR_LAYOUT[newLayout];
                      setModal({ ...modal, config: { ...config, layout: newLayout, bg: safeBg } });
                    }} aria-pressed={selected}>
                      <b>{opt.label}</b>
                      <small>{opt.desc}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <ConfigRow
              label="背景方案"
              current={findBgLabel(config.bg)}
              expanded={bgExpanded}
              onToggle={() => setBgExpanded(!bgExpanded)}
            >
              {(() => {
                const recBg = preset.defaults.bg;
                const recOpt = HERO_BACKGROUNDS.find(o => o.value === recBg);
                const recValid = recOpt ? BG_GROUPS_FOR_LAYOUT[config.layout].includes(recOpt.group) : false;
                const selected = config.bg === recBg;
                const otherBgs = HERO_BACKGROUNDS.filter(o => BG_GROUPS_FOR_LAYOUT[config.layout].includes(o.group) && o.value !== recBg);
                return (
                  <>
                    {recOpt && recValid && (
                      <div className="theme-bg-group">
                        <p className="theme-bg-group-title">推荐</p>
                        <div className="theme-pick-grid theme-bg-grid">
                          <button type="button" className={`theme-pick-item${selected ? ' selected' : ''}`} onClick={() => setModal({ ...modal, config: { ...config, bg: recBg } })} aria-label={recOpt.label} aria-pressed={selected}>
                            <img src={recOpt.thumb} alt="" />
                            <b>{recOpt.label}</b>
                            {selected && <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3,7 6,10 11,4" /></svg>}
                          </button>
                        </div>
                      </div>
                    )}
                    <BackgroundGroupGrid
                      label={recValid ? '其他背景' : '背景方案'}
                      items={otherBgs}
                      value={config.bg}
                      onChange={value => setModal({ ...modal, config: { ...config, bg: value } })}
                    />
                  </>
                );
              })()}
            </ConfigRow>

            <ConfigRow
              label="图标方案"
              current={LABEL_FOR_PACK[config.iconPack]}
              expanded={packExpanded}
              onToggle={() => setPackExpanded(!packExpanded)}
            >
              <IconPackGrid
                value={config.iconPack}
                onChange={value => setModal({ ...modal, config: { ...config, iconPack: value } })}
                recommended={preset.defaults.iconPack}
              />
            </ConfigRow>

            <div className="theme-effect-row">
              <span className="theme-effect-label">天气效果</span>
              <span className="theme-effect-desc">动态遮罩（云层 / 雨 / 雪 / 雾）</span>
              {isWeatherTheme ? (
                <button
                  type="button"
                  className={`theme-effect-toggle${config.weatherEffects ? ' on' : ' off'}`}
                  aria-pressed={config.weatherEffects}
                  onClick={() => setModal({ ...modal, config: { ...config, weatherEffects: !config.weatherEffects } })}
                >
                  <i aria-hidden="true">{config.weatherEffects ? '☀️' : '☁️'}</i>
                  <span>{config.weatherEffects ? '已开启' : '已关闭'}</span>
                </button>
              ) : (
                <span className="theme-effect-disabled">无遮罩</span>
              )}
            </div>
          </section>

          <div className="theme-preview-section" aria-label="实时预览">
            {iconPackAssets && (
              <section className="hero-theme-icons-preview" aria-label="配套图标预览">
                <h3>配套图标</h3>
                {[
                  { title: '快捷与记录', items: [['喂奶', iconPackAssets.stickers.feeding], ['排便', iconPackAssets.stickers.bowel], ['护理', iconPackAssets.stickers.care], ['其他', iconPackAssets.stickers.note]] },
                  { title: '今日待办', items: [['服药', iconPackAssets.tasks.medicine], ['推拿', iconPackAssets.tasks.massage], ['洗澡', iconPackAssets.tasks.bath], ['护理', iconPackAssets.tasks.care], ['疫苗', iconPackAssets.tasks.vaccine], ['成长', iconPackAssets.tasks.growth]] },
                  { title: '底部导航', items: [['今日', iconPackAssets.nav.today], ['记录', iconPackAssets.nav.history], ['AI', iconPackAssets.nav.chat], ['趋势', iconPackAssets.nav.trends], ['档案', iconPackAssets.nav.archive]] },
                ].map(group => (
                  <div className="hero-theme-icon-group" key={group.title}>
                    <p>{group.title}</p>
                    <div>{group.items.map(([label, src]) => (
                      <span key={label}><img src={src} alt="" /><b>{label}</b></span>
                    ))}</div>
                  </div>
                ))}
              </section>
            )}

            {isWeatherTheme && (
              <>
                <p className="hero-preview-hint">选择一种天气，下方同时展示早晨、白天、傍晚和夜晚效果。</p>
                <div className="hero-weather-preview-tabs" role="group" aria-label="天气效果预览">
                  {WEATHER_OPTIONS.map(option => (
                    <button type="button" key={option.kind} className={previewWeatherKind === option.kind ? 'active' : ''} aria-pressed={previewWeatherKind === option.kind} onClick={() => setPreviewWeatherKind(option.kind)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="hero-preview-list">
              {periods.map(period => (
                <PreviewHero
                  key={`${period.key}:${isWeatherTheme ? previewWeatherKind : 'default'}`}
                  profile={profile}
                  userId={userId}
                  periodKey={period.key}
                  layout={config.layout}
                  bg={config.bg}
                  hour={periodHours[period.key] ?? currentHour}
                  weatherKind={isWeatherTheme ? previewWeatherKind : undefined}
                  weatherEffectsEnabled={isWeatherTheme ? config.weatherEffects : false}
                />
              ))}
            </div>
          </div>

          <footer className="theme-modal-footer">
            <button type="button" className="btn secondary" onClick={() => setModal(null)}>取消</button>
            <button type="button" className="btn primary" onClick={applyAndClose}>保存并应用</button>
          </footer>
        </Modal>
      );
    })()}
  </>;
}
