import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Switch } from '../../ui';
import type { PushStatus } from '../../types';
import { Feedback } from './Feedback';
import type { PushSettingsPatch } from './PushCard';

const PREP_OPTIONS = [10, 15, 20, 30, 45, 60];

export function FeedingSettingsCard({ pushStatus, onSave }: { pushStatus: PushStatus | null; onSave(data: PushSettingsPatch): Promise<PushStatus> }) {
  const [prepMinutes, setPrepMinutes] = useState(30);
  const [prepEnabled, setPrepEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!pushStatus) return;
    setPrepMinutes(pushStatus.feedPrepMinutes);
    setPrepEnabled(pushStatus.feedPrepEnabled);
  }, [pushStatus]);

  async function handlePrepChange(minutes: number) {
    const previous = prepMinutes;
    setPrepMinutes(minutes);
    setBusy(true); setMessage(null);
    try { await onSave({ feedPrepMinutes: minutes }); setMessage({ text: '提前准备时间已保存，全家同步生效', error: false }); }
    catch (error) { setPrepMinutes(previous); setMessage({ text: error instanceof Error ? error.message : '保存失败', error: true }); }
    finally { setBusy(false); }
  }

  async function handlePrepToggle(enabled: boolean) {
    const previous = prepEnabled;
    setPrepEnabled(enabled);
    setBusy(true); setMessage(null);
    try { await onSave({ feedPrepEnabled: enabled }); setMessage({ text: enabled ? '提前准备提醒已开启，全家同步生效' : '提前准备提醒已关闭，全家同步生效', error: false }); }
    catch (error) { setPrepEnabled(previous); setMessage({ text: error instanceof Error ? error.message : '保存失败', error: true }); }
    finally { setBusy(false); }
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
            <Switch checked={prepEnabled} label={`${prepEnabled ? '关闭' : '开启'}提前准备喂养`} disabled={busy || !pushStatus} onChange={value => void handlePrepToggle(value)} />
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
                  disabled={!prepEnabled || busy || !pushStatus}
                  onChange={() => void handlePrepChange(mins)}
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
        <Feedback message={message?.text || ''} type={message?.error ? 'error' : 'success'} onClose={() => setMessage(null)} />
      </section>
    </>
  );
}
