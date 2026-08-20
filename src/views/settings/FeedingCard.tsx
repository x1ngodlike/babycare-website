import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

const FEED_PREP_KEY = 'babycare-feed-prep-minutes';
const PREP_OPTIONS = [10, 15, 20, 30, 45, 60];

export function FeedingSettingsCard() {
  const [prepMinutes, setPrepMinutes] = useState<number>(30);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FEED_PREP_KEY);
      if (raw) setPrepMinutes(parseInt(raw, 10) || 30);
    } catch { /* ignore */ }
  }, []);

  function handlePrepChange(minutes: number) {
    setPrepMinutes(minutes);
    try { localStorage.setItem(FEED_PREP_KEY, String(minutes)); } catch { /* ignore */ }
  }

  return (
    <>
      <section className="settings-card">
        <div className="setting-status">
          <div>
            <h2>喂养预测</h2>
          </div>
        </div>
        <p>根据历史喂奶记录，预测下一次喂奶时间，并在此时间前提醒你准备奶瓶等。</p>

        <div className="feed-prep-setting">
          <div className="feed-prep-header">
            <Clock size={16} strokeWidth={1.8} />
            <span>提前准备时间</span>
            <em className="feed-prep-current">{prepMinutes} 分钟</em>
          </div>
          <div className="feed-prep-options" role="radiogroup" aria-label="提前准备时间">
            {PREP_OPTIONS.map(mins => (
              <label key={mins} className={`feed-prep-item${prepMinutes === mins ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="feed-prep"
                  value={mins}
                  checked={prepMinutes === mins}
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
          <p className="feed-prep-hint">例如设置为 30 分钟，预测 15:01 喂奶，会在 14:31 开始显示「准备喂奶」提醒。</p>
        </div>
      </section>
    </>
  );
}
