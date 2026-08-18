// 外观主题设置卡（由 Settings.tsx 抽出，逻辑不变）
import { SegmentedControl } from '../../ui';
import type { ThemeMode } from '../../shared';

export function AppearanceSettingsCard({ theme, onChange }: { theme: ThemeMode; onChange(value: ThemeMode): void }) {
  const options: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
    { value: 'system', label: '跟随系统' },
  ];
  return <section className="settings-card">
    <h2>外观主题</h2>
    <p>选择浅色或深色模式，也可以跟随系统自动切换。</p>
    <div style={{ marginTop: 14 }}>
      <SegmentedControl label="主题模式" value={theme} options={options} onChange={onChange} />
    </div>
  </section>;
}
