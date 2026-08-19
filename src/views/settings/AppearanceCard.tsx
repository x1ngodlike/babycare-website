// 外观主题设置卡（由 Settings.tsx 抽出，逻辑不变）
import { useState } from 'react';
import { Modal, SegmentedControl } from '../../ui';
import { getGreeting, type ThemeMode } from '../../shared';
import type { FamilyId, Profile } from '../../types';

const HERO_PERIODS = [
  { key: 'morning', label: '早晨', icon: '🌅', fileIndex: 1 },
  { key: 'midday', label: '午间', icon: '☀️', fileIndex: 2 },
  { key: 'afternoon', label: '下午', icon: '🌤️', fileIndex: 3 },
  { key: 'evening', label: '傍晚', icon: '🌇', fileIndex: 4 },
  { key: 'night', label: '夜间', icon: '🌙', fileIndex: 5 },
];

const HERO_BG_OPTIONS = [
  { value: 'auto', label: '绿野晨光', thumb: '/hero/default/morning.webp' },
  { value: 'hero-paper', label: '折纸童趣', thumb: '/hero/paper/morning.webp' },
  { value: 'hero-watercolor', label: '手绘水彩', thumb: '/hero/watercolor/morning.webp' },
  { value: 'hero-clay', label: '软陶时光', thumb: '/hero/clay/morning.webp' },
  { value: 'hero-ink', label: '水墨丹青', thumb: '/hero/ink/morning.webp' },
  { value: 'hero-pixel', label: '像素萌兔', thumb: '/hero/pixel/morning.webp' },
  { value: 'hero-forest', label: '林间甜梦', thumb: '/hero/forest/morning.webp' },
  { value: 'hero-cloud', label: '云端甜梦', thumb: '/hero/cloud/morning.webp' },
  { value: 'hero-cozy', label: '暖房甜梦', thumb: '/hero/cozy/morning.webp' },
  { value: 'hero-pony', label: '星梦小马', thumb: '/hero/pony/morning.webp' },
];

function PreviewHero({ profile, userId, periodKey, heroBg, hour }: { profile: Profile; userId: FamilyId; periodKey: string; heroBg: string; hour: number }) {
  const { greeting, displayName } = getGreeting(profile, userId, hour);
  const d = new Date();
  const dateStr = `今日 · ${d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} · ${d.toLocaleDateString('zh-CN', { weekday: 'long' })}`;
  const periodClass = `baby-hero ${heroBg !== 'auto' ? heroBg : ''} hero-${periodKey}`;
  const periodLabel = HERO_PERIODS.find(p => p.key === periodKey)?.label ?? periodKey;
  return (
    <section className={periodClass} aria-label={`${periodLabel}时段预览`}>
      <div>
        <h1 className="hero-greeting-title">{greeting}，{displayName}～</h1>
        <p className="kicker hero-date-line">{dateStr}</p>
        <div className="hero-status"><p style={{ color: '#fff' }}>{periodLabel}时段预览</p></div>
      </div>
    </section>
  );
}

export function AppearanceSettingsCard({ theme, onChange, heroBg, onHeroBgChange, profile, userId }: { theme: ThemeMode; onChange(value: ThemeMode): void; heroBg: string; onHeroBgChange(value: string): void; profile: Profile; userId: FamilyId }) {
  const [showPreview, setShowPreview] = useState(false);

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
    { value: 'system', label: '跟随系统' },
  ];

  const activeBg = HERO_BG_OPTIONS.find(o => o.value === heroBg) || HERO_BG_OPTIONS[0];
  const currentHour = new Date().getHours();

  return <>
    <section className="settings-card">
      <h2>深色模式</h2>
      <p>选择浅色或深色模式，也可以跟随系统自动切换。</p>
      <div style={{ marginTop: 14 }}>
        <SegmentedControl label="主题模式" value={theme} options={themeOptions} onChange={onChange} />
      </div>
    </section>

    <section className="settings-card">
      <h2>Hero 背景</h2>
      <p>选择首页顶部插画风格。</p>
      <div className="hero-bg-list" role="radiogroup" aria-label="背景方案" style={{ marginTop: 14 }}>
        {HERO_BG_OPTIONS.map(opt => (
          <label key={opt.value} className={`hero-bg-item${heroBg === opt.value ? ' selected' : ''}`}>
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
        ))}
      </div>

      <button type="button" className="text-button" style={{ marginTop: 10, fontSize: 13 }} onClick={() => setShowPreview(true)}>
        预览所有时段 →
      </button>
    </section>

    {showPreview && (
      <Modal
        title="Hero 背景预览"
        kicker={activeBg.label}
        onClose={() => setShowPreview(false)}
      >
        <p className="hero-preview-hint">各时段背景仅作效果预览，首页将根据当前时间自动切换。</p>
        <div className="hero-preview-list">
          {HERO_PERIODS.map(period => (
            <PreviewHero
              key={period.key}
              profile={profile}
              userId={userId}
              periodKey={period.key}
              heroBg={heroBg}
              hour={currentHour}
            />
          ))}
        </div>
      </Modal>
    )}
  </>;
}
