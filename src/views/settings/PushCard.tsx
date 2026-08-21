// 消息推送设置卡（全新 UI：可展开的提醒类型列表 + 接收通道 + 运行状态）
import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { ApiError } from '../../api';
import { confirmAction, Switch } from '../../ui';
import { Feedback } from './Feedback';
import type { PushStatus } from '../../types';

export type PushSettingsPatch = { enabled?: boolean; pushplusToken?: string; pushplusTopic?: string; morningDigestEnabled?: boolean; morningDigestTime?: string; feedingGapEnabled?: boolean; feedingGapLevel1Minutes?: number; feedingGapLevel2Minutes?: number; feedPrepEnabled?: boolean; feedPrepMinutes?: number; careItemEnabled?: boolean };

export function PushSettingsCard({ pushStatus, onRefresh, onTestMorning, onTestFeedingGap, onTestCareItem, onSave, onOpenAppNotifications }: { pushStatus: PushStatus | null; onRefresh(): Promise<void>; onTestMorning(): Promise<{ message: string }>; onTestFeedingGap(level: 'level1' | 'level2'): Promise<{ message: string }>; onTestCareItem(): Promise<{ message: string }>; onSave(data: PushSettingsPatch): Promise<PushStatus>; onOpenAppNotifications?(): void }) {
  const [digestTime, setDigestTime] = useState('08:00');
  const [gapLevel1, setGapLevel1] = useState(150);
  const [gapLevel2, setGapLevel2] = useState(180);
  const [token, setToken] = useState('');
  const [topic, setTopic] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const initialized = useRef(false);
  // 默认展开早间日报；微信通道默认折叠（配置项较多，避免首屏过高）
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ digest: true, channel: false });

  useEffect(() => {
    if (!pushStatus || initialized.current) return;
    setDigestTime(pushStatus.morningDigestTime || '08:00');
    setGapLevel1(pushStatus.feedingGapLevel1Minutes || 150);
    setGapLevel2(pushStatus.feedingGapLevel2Minutes || 180);
    initialized.current = true;
  }, [pushStatus]);

  function toggleExpanded(key: string) { setExpanded(value => ({ ...value, [key]: !value[key] })); }

  function minutesLabel(totalMinutes: number): string {
    const m = Math.max(0, Math.trunc(totalMinutes || 0));
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h === 0) return `${m} 分钟`;
    if (r === 0) return `${h} 小时`;
    return `${h} 小时 ${r} 分`;
  }

  async function persist(key: string, patch: PushSettingsPatch, successText = '已保存'): Promise<boolean> {
    setSavingKey(key);
    setMessage(null);
    try {
      await onSave(patch);
      setMessage({ text: successText, error: false });
      return true;
    } catch (error) {
      const text = error instanceof ApiError ? error.message : '保存失败';
      setMessage({ text, error: true });
      return false;
    } finally {
      setSavingKey(null);
    }
  }

  async function saveDigestTime() {
    const value = digestTime.trim();
    if (!/^\d{2}:\d{2}$/.test(value)) {
      setMessage({ text: '发送时间必须为 HH:MM 格式（如 08:00）', error: true });
      return;
    }
    await persist('digest-time', { morningDigestTime: value });
  }

  async function saveGapLevels() {
    const l1 = Number(gapLevel1);
    const l2 = Number(gapLevel2);
    if (!Number.isSafeInteger(l1) || l1 < 30) {
      setMessage({ text: '轻度提醒至少 30 分钟', error: true });
      return;
    }
    if (!Number.isSafeInteger(l2) || l2 < 30) {
      setMessage({ text: '重点提醒至少 30 分钟', error: true });
      return;
    }
    if (l2 <= l1) {
      setMessage({ text: '重点提醒必须大于轻度提醒', error: true });
      return;
    }
    await persist('gap-levels', { feedingGapLevel1Minutes: l1, feedingGapLevel2Minutes: l2 });
  }

  async function saveChannel(clear: boolean) {
    if (clear && !await confirmAction({ title: '清除微信推送配置？', description: 'Token 与话题编码将一并清除，微信将不再收到推送；APP 通知不受影响。', confirmLabel: '清除配置', danger: true })) return;
    const trimmedToken = token.trim();
    const trimmedTopic = topic.trim();
    if (!clear && !trimmedToken && !trimmedTopic) return;
    const saved = await persist('channel', clear
      ? { pushplusToken: '', pushplusTopic: '' }
      : { ...(trimmedToken ? { pushplusToken: trimmedToken } : {}), ...(trimmedTopic ? { pushplusTopic: trimmedTopic } : {}) },
      clear ? '微信推送配置已清除' : '微信推送配置已保存');
    if (saved) {
      setToken('');
      setTopic('');
    }
  }

  async function handleTestMorning() {
    setTestingKey('morning');
    setMessage(null);
    try {
      const result = await onTestMorning();
      const text = result.message || '早报测试消息已发送，请查收';
      setMessage({ text, error: false });
    } catch (error) {
      const text = error instanceof ApiError ? error.message : '发送失败，请检查配置';
      setMessage({ text, error: true });
    } finally {
      setTestingKey(null);
    }
  }

  async function handleTestFeedingGap(level: 'level1' | 'level2') {
    setTestingKey(level);
    setMessage(null);
    try {
      const result = await onTestFeedingGap(level);
      const text = result.message || '喂奶间隔测试消息已发送，请查收';
      setMessage({ text, error: false });
    } catch (error) {
      const text = error instanceof ApiError ? error.message : '发送失败，请检查配置';
      setMessage({ text, error: true });
    } finally {
      setTestingKey(null);
    }
  }

  async function handleTestCareItem() {
    setTestingKey('care-item');
    setMessage(null);
    try {
      const result = await onTestCareItem();
      const text = result.message || '用药护理测试消息已发送，请查收';
      setMessage({ text, error: false });
    } catch (error) {
      const text = error instanceof ApiError ? error.message : '发送失败，请检查配置';
      setMessage({ text, error: true });
    } finally {
      setTestingKey(null);
    }
  }

  async function refresh() {
    setMessage(null);
    try {
      await onRefresh();
      setMessage({ text: '状态已刷新', error: false });
    } catch (error) {
      const text = error instanceof ApiError ? error.message : '刷新失败';
      setMessage({ text, error: true });
    }
  }

  const feedingGapLabel = (() => {
    if (!pushStatus?.lastFeedAt) return '暂无喂奶记录';
    const gap = pushStatus.currentFeedingGapMinutes;
    if (gap === null || typeof gap !== 'number') return '暂无';
    const level = pushStatus.feedingGapLevel;
    const tag = level === 'level1' ? ' · 🟡 一级已提醒' : level === 'level2' ? ' · 🔴 二级已提醒' : '';
    return `${minutesLabel(gap)}（${new Date(pushStatus.lastFeedAt).toLocaleString('zh-CN')}）${tag}`;
  })();

  const digestDirty = digestTime.trim() !== (pushStatus?.morningDigestTime || '08:00');
  const gapDirty = Number(gapLevel1) !== (pushStatus?.feedingGapLevel1Minutes || 150) || Number(gapLevel2) !== (pushStatus?.feedingGapLevel2Minutes || 180);
  const channelDirty = Boolean(token.trim() || topic.trim());

  return <>
    {/* -------- 提醒类型 -------- */}
    <section className="settings-card push-rules-card">
      <div className="setting-status"><div><h2>提醒类型</h2><p>规则对全家生效，每类可独立开关；点击行展开具体设置。</p></div></div>
      <div className="push-type-list">
        {/* 早间日报 */}
        <div className={`push-type-row${expanded.digest ? ' open' : ''}`}>
          <div className="push-type-head">
            <button type="button" className="push-type-toggle" aria-expanded={expanded.digest} onClick={() => toggleExpanded('digest')}>
              <b>早间日报</b><small>昨日汇总与今日计划，每天一条</small><i className="push-type-chevron" aria-hidden="true"><ChevronRight /></i>
            </button>
            <Switch checked={pushStatus?.morningDigestEnabled ?? true} label="早间日报提醒开关" disabled={savingKey !== null} onChange={value => void persist('rule-digest', { morningDigestEnabled: value }, value ? '早间日报已开启' : '早间日报已关闭')} />
          </div>
          {expanded.digest && <div className="push-type-body">
            <form className="push-rule-fields" onSubmit={event => { event.preventDefault(); void saveDigestTime(); }}>
              <label>发送时间<input type="time" value={digestTime} onChange={event => setDigestTime(event.target.value)} /></label>
              <button type="submit" className="btn primary" disabled={savingKey !== null || !digestDirty}>{savingKey === 'digest-time' ? '保存中…' : '保存时间'}</button>
            </form>
            <p className="push-rule-meta">{pushStatus?.morningDigestEnabled ? (pushStatus.morningDigestTodaySent ? '今日早报已发送' : `今日未发送，到 ${pushStatus.morningDigestTime || '08:00'} 自动触发`) : '规则已关闭，时间仅作预设'}</p>
            <footer className="push-rule-actions"><button type="button" className="btn secondary" disabled={testingKey === 'morning'} onClick={handleTestMorning}>{testingKey === 'morning' ? '发送中…' : '发送测试'}</button></footer>
          </div>}
        </div>

        {/* 喂奶间隔 */}
        <div className={`push-type-row${expanded.gap ? ' open' : ''}`}>
          <div className="push-type-head">
            <button type="button" className="push-type-toggle" aria-expanded={expanded.gap} onClick={() => toggleExpanded('gap')}>
              <b>喂奶间隔</b><small>超过轻度先提醒一次，超过重点再提醒一次</small><i className="push-type-chevron" aria-hidden="true"><ChevronRight /></i>
            </button>
            <Switch checked={pushStatus?.feedingGapEnabled ?? true} label="喂奶间隔提醒开关" disabled={savingKey !== null} onChange={value => void persist('rule-gap', { feedingGapEnabled: value }, value ? '喂奶间隔提醒已开启' : '喂奶间隔提醒已关闭')} />
          </div>
          {expanded.gap && <div className="push-type-body">
            <form className="push-rule-fields push-rule-fields-gap" onSubmit={event => { event.preventDefault(); void saveGapLevels(); }}>
              <label>轻度（分钟）<input type="number" min={30} step={1} value={gapLevel1} onChange={event => setGapLevel1(Number(event.target.value))} /></label>
              <label>重点（分钟）<input type="number" min={30} step={1} value={gapLevel2} onChange={event => setGapLevel2(Number(event.target.value))} /></label>
              <button type="submit" className="btn primary" disabled={savingKey !== null || !gapDirty}>{savingKey === 'gap-levels' ? '保存中…' : '保存阈值'}</button>
            </form>
            <p className="push-rule-meta">当前约轻度 {minutesLabel(gapLevel1)}、重点 {minutesLabel(gapLevel2)}；有新喂奶记录会自动重置。{pushStatus?.lastFeedAt ? `距上次喂奶：${feedingGapLabel}。` : '暂无喂奶记录，记录后自动按间隔提醒。'}</p>
            <footer className="push-rule-actions">
              <button type="button" className="btn secondary" disabled={testingKey === 'level1'} onClick={() => handleTestFeedingGap('level1')}>{testingKey === 'level1' ? '发送中…' : '🟡 轻度测试'}</button>
              <button type="button" className="btn secondary" disabled={testingKey === 'level2'} onClick={() => handleTestFeedingGap('level2')}>{testingKey === 'level2' ? '发送中…' : '🔴 重点测试'}</button>
            </footer>
          </div>}
        </div>

        {/* 用药护理 */}
        <div className={`push-type-row${expanded.care ? ' open' : ''}`}>
          <div className="push-type-head">
            <button type="button" className="push-type-toggle" aria-expanded={expanded.care} onClick={() => toggleExpanded('care')}>
              <b>用药护理</b><small>到点提醒吃药、推拿等定时照护</small><i className="push-type-chevron" aria-hidden="true"><ChevronRight /></i>
            </button>
            <Switch checked={pushStatus?.careItemEnabled ?? true} label="用药护理提醒开关" disabled={savingKey !== null} onChange={value => void persist('rule-care', { careItemEnabled: value }, value ? '用药护理提醒已开启' : '用药护理提醒已关闭')} />
          </div>
          {expanded.care && <div className="push-type-body">
            <p className="push-rule-meta">按各项目的提醒时间触发；未设置时间但当天到期的项目，也会在今日计划中展示。</p>
            <footer className="push-rule-actions"><button type="button" className="btn secondary" disabled={testingKey === 'care-item'} onClick={handleTestCareItem}>{testingKey === 'care-item' ? '发送中…' : '发送测试'}</button></footer>
          </div>}
        </div>
      </div>
    </section>

    {/* -------- 接收通道 -------- */}
    <section className="settings-card push-channels-card">
      <div className="setting-status"><div><h2>接收通道</h2><p>提醒触发后按通道送达；各通道独立开关，互不影响。</p></div></div>

      <div className={`push-type-row push-channel-row${expanded.channel ? ' open' : ''}`}>
        <div className="push-type-head">
          <button type="button" className="push-type-toggle" aria-expanded={expanded.channel} onClick={() => toggleExpanded('channel')}>
            <b>微信推送</b><small>PushPlus 服务号消息，需配置 Token</small><i className="push-type-chevron" aria-hidden="true"><ChevronRight /></i>
          </button>
          {!pushStatus?.pushplusConfigured && <span className="status-badge neutral push-channel-badge">未配置</span>}
          {pushStatus?.pushplusConfigured && <Switch checked={pushStatus.enabled} label="微信推送通道开关" disabled={savingKey !== null} onChange={value => void persist('channel-toggle', { enabled: value }, value ? '微信推送已开启' : '微信推送已关闭')} />}
        </div>
        {expanded.channel && <div className="push-type-body">
          <form className="push-channel-fields" onSubmit={event => { event.preventDefault(); void saveChannel(false); }}>
            <label>用户 Token<div className="secret-field"><input type={showToken ? 'text' : 'password'} value={token} onChange={event => setToken(event.target.value)} placeholder={pushStatus?.pushplusConfigured ? `已保存 ${pushStatus.pushplusTokenMasked || 'Token'}，留空不修改` : '从 pushplus.plus 复制的用户 Token'} autoComplete="off" /><button type="button" onClick={() => setShowToken(value => !value)}>{showToken ? '隐藏' : '显示'}</button></div></label>
            <label>话题编码 <span>选填</span><input type="text" value={topic} onChange={event => setTopic(event.target.value)} placeholder={pushStatus?.pushplusTopic ? `已保存：${pushStatus.pushplusTopic}，留空不修改` : '填写后，订阅该话题的家人都会收到'} autoComplete="off" /></label>
            <div className="push-channel-actions"><button type="submit" className="btn primary" disabled={savingKey !== null || !channelDirty}>{savingKey === 'channel' ? '保存中…' : '保存配置'}</button>{pushStatus?.pushplusConfigured && <button type="button" className="btn danger-button" disabled={savingKey !== null} onClick={() => void saveChannel(true)}>清除配置</button>}</div>
          </form>
          <small className="field-help">在 <a href="https://www.pushplus.plus" target="_blank" rel="noreferrer">pushplus.plus</a> 扫码登录拿 Token；进入「一对多消息」新建 topic，家人扫话题二维码加入即可在普通微信里收到提醒。</small>
        </div>}
      </div>

      <div className="push-channel-row">
        <div className="push-channel-head">
          <div><b>APP 通知</b><small>推送到本机通知栏，每类提醒可在每台手机上单独开关</small></div>
          {onOpenAppNotifications ? <button type="button" className="btn secondary" onClick={onOpenAppNotifications}>本机设置</button> : <span className="status-badge neutral push-channel-badge">仅 APP 内</span>}
        </div>
      </div>
    </section>

    {/* -------- 运行状态 -------- */}
    <section className="settings-card push-runtime-card">
      <div className="setting-status">
        <div><h2>运行状态</h2><p>今日已推送 {pushStatus?.todayPushedItems ?? 0} 条。</p></div>
        <span className={`status-badge ${pushStatus?.schedulerRunning ? 'success' : 'neutral'}`}>{!pushStatus ? '读取中' : pushStatus.schedulerRunning ? '调度运行中' : '调度未启动'}</span>
      </div>
      <dl className="push-status-dl">
        <div><dt>上次检查</dt><dd>{pushStatus?.lastCheckAt ? new Date(pushStatus.lastCheckAt).toLocaleString('zh-CN') : '暂无'}</dd></div>
        <div><dt>距上次喂奶</dt><dd>{feedingGapLabel}</dd></div>
        <div><dt>微信通道</dt><dd>{pushStatus?.pushplusConfigured ? (pushStatus.enabled ? '已开启' : '已关闭') : '未配置 Token'}</dd></div>
        <div><dt>最近更新</dt><dd>{pushStatus?.updatedAt ? new Date(pushStatus.updatedAt).toLocaleString('zh-CN') : '未修改过'}</dd></div>
      </dl>
      <div className="push-runtime-actions"><button type="button" className="btn secondary" onClick={refresh}>刷新状态</button></div>
    </section>

    <Feedback message={message?.text || ''} type={message?.error ? 'error' : 'success'} onClose={() => setMessage(null)} />
  </>;
}
