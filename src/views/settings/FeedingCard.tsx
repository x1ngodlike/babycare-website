import { useState } from 'react';
import { Clock } from 'lucide-react';
import { getFeedPrepEnabled, getFeedPrepMinutes, setFeedPrepEnabled, setFeedPrepMinutes } from '../../feedingPreferences';
import { Switch } from '../../ui';

const PREP_OPTIONS = [10, 15, 20, 30, 45, 60];

export function FeedingSettingsCard() {
  const [prepMinutes, setPrepMinutes] = useState(getFeedPrepMinutes);
  const [prepEnabled, setPrepEnabled] = useState(getFeedPrepEnabled);

  function handlePrepChange(minutes: number) {
    setPrepMinutes(minutes);
    setFeedPrepMinutes(minutes);
  }

  function handlePrepToggle(enabled: boolean) {
    setPrepEnabled(enabled);
    setFeedPrepEnabled(enabled);
  }

  return (
    <>
      <section className="settings-card">
        <div className="setting-status">
          <div>
            <h2>喂养预测</h2>
          </div>
        </div>
        <p>根据历史喂奶记录，预测下一次喂奶时间。</p>

        <div className="feed-prep-setting">
          <div className="feed-prep-toggle">
            <div>
              <b>提前准备喂养</b>
              <small>关闭后，首页显示“下次喂养”，不再提前提醒</small>
            </div>
            <Switch checked={prepEnabled} label={`${prepEnabled ? '关闭' : '开启'}提前准备喂养`} onChange={handlePrepToggle} />
          </div>
          <div className="feed-prep-header">
            <Clock size={16} strokeWidth={1.8} />
            <span className="feed-prep-label">提前准备时间</span>
            <span className={`feed-prep-current${prepEnabled ? '' : ' disabled'}`} aria-live="polite">{prepEnabled ? `${prepMinutes} 分钟` : '已关闭'}</span>
          </div>
          <div className={`feed-prep-options${prepEnabled ? '' : ' disabled'}`} role="radiogroup" aria-label="提前准备时间" aria-disabled={!prepEnabled}>
            {PREP_OPTIONS.map(mins => (
              <label key={mins} className={`feed-prep-item${prepMinutes === mins ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="feed-prep"
                  value={mins}
                  checked={prepMinutes === mins}
                  disabled={!prepEnabled}
                  onChange={() => handlePrepChange(mins)}
                  aria-label={`提前 ${mins} 分钟`}
                />
                <span className="feed-prep-checkmark" aria-hidden="true">
                  {prepMinutes === mins && <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,7 6,10 11,4" /></svg>}
                </span>
                <span className="feed-prep-label">{mins} 分钟</span>
              </label>
            ))}
          </div>
          <p className="feed-prep-hint">{prepEnabled ? `例如设置为 ${prepMinutes} 分钟，首页会提前 ${prepMinutes} 分钟显示“准备喂养”。` : '已保留原提前时间，重新开启后继续使用。'}</p>
        </div>
      </section>
    </>
  );
}
