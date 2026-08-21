// 用药护理设置卡：项目列表、拖拽排序、编辑器与依从性统计（由 Settings.tsx 抽出，逻辑不变）
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { getCareItemReminderTimes, isCareItemDue, nextCareItemDueDate } from '../../careSchedule';
import { isoDay } from '../../date';
import { careItemIconSources, isScheduleOver } from '../../shared';
import { confirmAction, Modal, Switch, useDirtyClose } from '../../ui';
import { DateField } from '../../DateField';
import { Feedback } from './Feedback';
import type { CareItem, CareItemCategory, CareItemIcon } from '../../types';

export function PatternDaysEditor({ value, onChange }: { value: boolean[] | null; onChange: (v: boolean[]) => void }) {
  const pattern = value || [true, true, true, false, false];
  const dayLabels = ['1', '2', '3', '4', '5', '6', '7'];

  function toggle(index: number) {
    const next = [...pattern];
    next[index] = !next[index];
    onChange(next);
  }
  function setLength(len: number) {
    const next: boolean[] = [];
    for (let i = 0; i < len; i++) {
      next.push(i < pattern.length ? pattern[i] : i < Math.ceil(len / 2));
    }
    onChange(next);
  }

  return <div className="pattern-days-editor">
    <span className="field-label">循环模式 · 点击切换执行/休息</span>
    <div className="pattern-days-controls">
      <span className="field-label small">周期长度</span>
      <div className="pattern-length-buttons">
        {[3, 5, 7, 10].map(len => <button key={len} type="button" className={pattern.length === len ? 'selected' : ''} onClick={() => setLength(len)}>{len}天</button>)}
      </div>
    </div>
    <div className="pattern-days-row" role="group" aria-label="循环模式日期">
      {pattern.map((active, idx) => (
        <button key={idx} type="button" className={`pattern-day ${active ? 'active' : 'rest'}`} onClick={() => toggle(idx)} aria-pressed={active}>
          <span className="pattern-day-num">{dayLabels[idx]}</span>
          <span className="pattern-day-label">{active ? '执行' : '休息'}</span>
        </button>
      ))}
    </div>
    <p className="field-help">从开始日期起，每天按顺序匹配，执行日会出现在今日计划中。</p>
  </div>;
}

export function CareItemEditor({ item, nextOrder, onClose, onSaved }: { item?: CareItem; nextOrder: number; onClose(): void; onSaved(item: CareItem): void }) {
  const defaultStart = isoDay(new Date());
  const initial = {
    name: item?.name || '',
    category: item?.category || 'medication' as CareItemCategory,
    icon: item?.icon || 'medicine' as CareItemIcon,
    scheduleType: item?.scheduleType || 'as_needed' as CareItem['scheduleType'],
    intervalDays: item?.intervalDays ?? 2,
    scheduleStartDate: item?.scheduleStartDate || defaultStart,
    reminderTime: item?.reminderTime || '',
    reminderTimes: item?.reminderTimes && item?.reminderTimes.length > 0 ? item.reminderTimes : (item?.reminderTime ? [item.reminderTime] : []),
    scheduleEndDate: item?.scheduleEndDate || '',
    weekDays: item?.weekDays || [],
    patternDays: item?.patternDays || null as boolean[] | null
  };
  const [draft, setDraft] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const requestClose = useDirtyClose(dirty, onClose, busy, { title: '放弃未保存的修改？', description: '项目与执行计划的修改尚未保存。' });

  const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日'];
  const weekdayDisplayValues = [1, 2, 3, 4, 5, 6, 0];
  function toggleWeekday(day: number) {
    setDraft(v => ({
      ...v,
      weekDays: v.weekDays.includes(day) ? v.weekDays.filter(d => d !== day) : [...v.weekDays, day].sort((a, b) => a - b)
    }));
  }
  function addReminderTime() {
    const last = draft.reminderTimes[draft.reminderTimes.length - 1] || draft.reminderTime || '08:00';
    const [h, m] = last.split(':').map(Number);
    const next = `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    setDraft(v => ({ ...v, reminderTimes: [...v.reminderTimes, next] }));
  }
  function updateReminderTime(index: number, value: string) {
    setDraft(v => ({ ...v, reminderTimes: v.reminderTimes.map((t, i) => i === index ? value : t) }));
  }
  function removeReminderTime(index: number) {
    setDraft(v => ({ ...v, reminderTimes: v.reminderTimes.filter((_, i) => i !== index) }));
  }
  function clearAllTimes() {
    setDraft(v => ({ ...v, reminderTime: '', reminderTimes: [] }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const sortOrder = item?.sortOrder ?? nextOrder;
    const reminderTimes = draft.reminderTimes.length > 0 ? draft.reminderTimes : (draft.reminderTime ? [draft.reminderTime] : null);
    const scheduleStartDate = draft.scheduleType === 'as_needed' ? null : draft.scheduleStartDate;
    const payload = {
      ...draft,
      name: draft.name.trim(),
      sortOrder,
      intervalDays: draft.scheduleType === 'interval' ? Math.max(2, draft.intervalDays) : 1,
      scheduleStartDate,
      reminderTime: draft.reminderTime || null,
      reminderTimes,
      scheduleEndDate: draft.scheduleType === 'as_needed' ? null : draft.scheduleEndDate || null,
      weekDays: draft.scheduleType === 'weekly' ? draft.weekDays : null,
      patternDays: draft.scheduleType === 'pattern' ? draft.patternDays : null
    };
    try {
      const saved = item ? await api.updateCareItem(item.id, payload) : await api.createCareItem(payload);
      onSaved(saved); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败'); setBusy(false);
    }
  }
  const iconOptions: { value: CareItemIcon; label: string }[] = [{ value: 'medicine', label: '药物' }, { value: 'massage', label: '推拿' }, { value: 'bath', label: '洗澡' }, { value: 'care', label: '其他' }];
  const weekDayOptions: { value: number; label: string }[] = weekdayDisplayValues.map((val, idx) => ({ value: val, label: weekdayLabels[idx] }));
  const canSetTime = draft.scheduleType !== 'as_needed';
  const effectiveTimes = draft.reminderTimes.length > 0 ? draft.reminderTimes : (draft.reminderTime ? [draft.reminderTime] : []);
  return <Modal className="care-item-editor" title={item ? '修改项目' : '新增项目'} kicker="用药护理" onClose={() => void requestClose()}><form className="editor-form" onSubmit={submit}>
    <div className="care-item-meta">
      <div className="meta-category-label">{draft.category === 'medication' ? '用药' : '护理'}</div>
      <div className="meta-icon-picker" role="group" aria-label="选择图标">
        {iconOptions.map(option => <button type="button" key={option.value} className={`meta-icon-btn${draft.icon === option.value ? ' selected' : ''}`} onClick={() => setDraft(v => ({ ...v, icon: option.value, category: option.value === 'medicine' ? 'medication' : 'care' }))} aria-label={option.label}><img src={careItemIconSources[option.value]} alt="" /></button>)}
      </div>
    </div>
    <label>项目名称<input maxLength={12} value={draft.name} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} placeholder={draft.category === 'medication' ? '例如：维生素 D' : '例如：洗澡'} autoFocus required /></label>
    <fieldset><legend>执行计划</legend><div className="choice-group schedule-choice">
      <button type="button" className={draft.scheduleType === 'as_needed' ? 'selected' : ''} onClick={() => setDraft(value => ({ ...value, scheduleType: 'as_needed' }))}>按需</button>
      <button type="button" className={draft.scheduleType === 'daily' ? 'selected' : ''} onClick={() => setDraft(value => ({ ...value, scheduleType: 'daily' }))}>每日</button>
      <button type="button" className={draft.scheduleType === 'interval' ? 'selected' : ''} onClick={() => setDraft(value => ({ ...value, scheduleType: 'interval', intervalDays: value.intervalDays < 2 ? 2 : value.intervalDays }))}>间隔</button>
      <button type="button" className={draft.scheduleType === 'weekly' ? 'selected' : ''} onClick={() => setDraft(value => ({ ...value, scheduleType: 'weekly' }))}>指定</button>
      <button type="button" className={draft.scheduleType === 'pattern' ? 'selected' : ''} onClick={() => setDraft(value => ({ ...value, scheduleType: 'pattern', patternDays: value.patternDays || [true, true, true, false, false] }))}>循环</button>
    </div><p className="field-help">按需项目不会自动进入首页今日计划，仍可随时手动记录。</p></fieldset>
    {draft.scheduleType !== 'as_needed' && <>
      <div className="schedule-fields">
        {draft.scheduleType === 'interval' && <label className="compact-field">间隔天数<input type="number" inputMode="numeric" min="2" max="365" value={draft.intervalDays} onChange={event => setDraft(value => ({ ...value, intervalDays: Number(event.target.value) || 2 }))} required /></label>}
        {draft.scheduleType === 'weekly' && <div className="weekday-selector" role="group" aria-label="选择星期"><span className="field-label">选择星期</span><div className="weekday-buttons">{weekDayOptions.map(day => <button type="button" key={day.value} className={draft.weekDays.includes(day.value) ? 'selected' : ''} onClick={() => toggleWeekday(day.value)} aria-pressed={draft.weekDays.includes(day.value)}>{day.label}</button>)}</div></div>}
        {draft.scheduleType === 'pattern' && <PatternDaysEditor value={draft.patternDays} onChange={patternDays => setDraft(v => ({ ...v, patternDays }))} />}
        <div className="date-row">
          <DateField label="开始日期" value={draft.scheduleStartDate} onChange={scheduleStartDate => setDraft(value => ({ ...value, scheduleStartDate }))} />
          <DateField label="结束日期" required={false} min={draft.scheduleStartDate} value={draft.scheduleEndDate} onChange={scheduleEndDate => setDraft(value => ({ ...value, scheduleEndDate }))} />
        </div>
        {canSetTime && <div className="time-unified">
          <div className="time-unified-header">
            <span className="field-label">提醒时间</span>
            {effectiveTimes.length > 0 && <button type="button" className="text-link" onClick={clearAllTimes}>清空</button>}
          </div>
          {effectiveTimes.length === 0 ? (
            <div className="time-empty-state">
              <span className="time-empty-hint">未设置时间</span>
              <button type="button" className="btn secondary small" onClick={addReminderTime}>+ 添加时间</button>
            </div>
          ) : effectiveTimes.map((t, i) => (
            <div key={i} className="reminder-time-row">
              <input type="time" value={t} onChange={e => updateReminderTime(i, e.target.value)} aria-label={`第 ${i + 1} 次提醒时间`} />
              {effectiveTimes.length > 1 && <button type="button" className="btn secondary small" onClick={() => removeReminderTime(i)} aria-label="删除时间">删除</button>}
              {i === effectiveTimes.length - 1 && effectiveTimes.length < 10 && <button type="button" className="btn secondary small" onClick={addReminderTime}>+</button>}
            </div>
          ))}
        </div>}
      </div>
      {canSetTime && effectiveTimes.length === 0 && <p className="field-help">未设置时间仍会进入今日计划，但不会显示具体时间。</p>}
      {draft.scheduleType === 'pattern' && draft.patternDays && <p className="field-help">循环模式：{draft.patternDays.filter(Boolean).length} 天执行 / {draft.patternDays.filter(v => !v).length} 天休息，从开始日期起按序循环。</p>}
    </>}
    {error && <Feedback message={error} type="error" onClose={() => setError('')} />}
    <footer className="editor-actions"><button type="button" className="btn secondary" disabled={busy} onClick={() => void requestClose()}>取消</button><button className="btn primary" disabled={busy || !draft.name.trim()}>{busy ? '保存中…' : '保存项目'}</button></footer>
  </form></Modal>;
}

function careItemHomeStatus(item: CareItem) {
  if (!item.active) return '已停用';
  if (item.scheduleType === 'as_needed') return '按需 · 手动添加';
  if (isScheduleOver(item)) return '已停用';
  const due = isCareItemDue(item);
  const reminders = getCareItemReminderTimes(item);
  const timeLabel = reminders.length > 0 ? reminders.join(' · ') : (item.reminderTime || '');
  const scheduleLabel = item.scheduleType === 'weekly' && item.weekDays
    ? `每 ${[...item.weekDays].sort((a, b) => a === 0 ? 1 : b === 0 ? -1 : a - b).map(d => ['日','一','二','三','四','五','六'][d]).join('、')}`
    : item.scheduleType === 'pattern' && item.patternDays
    ? `循环 ${item.patternDays.filter(Boolean).length}休${item.patternDays.filter(v => !v).length}`
    : item.scheduleType === 'interval' ? `每 ${item.intervalDays} 天`
    : item.scheduleType === 'daily' ? '每天' : '';
  const timePart = timeLabel ? `今日 ${timeLabel}` : '今日';
  if (due) return `${timePart}${scheduleLabel ? ` · ${scheduleLabel}` : ''}`;
  const nextDue = nextCareItemDueDate(item);
  if (!nextDue) return '已停用';
  const dateLabel = new Date(`${nextDue}T12:00:00`).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  return `${dateLabel} ${scheduleLabel ? '· ' + scheduleLabel : ''}`;
}

export function CareAdherenceCard() {
  const [data, setData] = useState<{ items: { name: string; completionRate: number; completedDays: number; totalDays: number; streakDays: number; lastCompletedAt: string | null }[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.careAdherence().then(setData).catch(err => setError(err instanceof Error ? err.message : '无法加载统计'));
  }, []);
  if (error) return <section className="settings-card"><div className="setting-status"><h2>依从性统计</h2><span className="status-badge brand">30 天</span></div><p>{error}</p></section>;
  if (!data || data.items.length === 0) return <section className="settings-card"><div className="setting-status"><h2>依从性统计</h2><span className="status-badge brand">30 天</span></div><p>暂无执行计划数据。添加有执行计划的用药或护理项目后，将在这里显示完成率。</p></section>;
  const avgRate = Math.round(data.items.reduce((sum, item) => sum + item.completionRate, 0) / data.items.length);
  return <section className="settings-card care-adherence-card"><div className="setting-status"><h2>依从性统计</h2><span className="status-badge brand">近 30 天 · 平均 {avgRate}%</span></div><p>完成率基于近 30 天的计划天数和实际记录计算，仅供参考。</p>
    <div className="adherence-list">{data.items.map(item => {
      const rate = item.completionRate;
      const color = rate >= 80 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444';
      return <article key={item.name} className="adherence-item">
        <div className="adherence-header"><b>{item.name}</b><span className="adherence-rate" style={{ color }}>{rate}%</span></div>
        <div className="adherence-bar"><div className="adherence-bar-fill" style={{ width: `${rate}%`, background: color }} /></div>
        <div className="adherence-meta">
          <span>完成 {item.completedDays}/{item.totalDays} 天</span>
          {item.streakDays > 0 && <span>连续 {item.streakDays} 天</span>}
          {item.lastCompletedAt && <span>上次 {item.lastCompletedAt.slice(5)}</span>}
        </div>
      </article>;
    })}</div>
  </section>;
}

export function CareItemsCard({ items, onChanged }: { items: CareItem[]; onChanged(): Promise<void> }) {
  const [editing, setEditing] = useState<CareItem | 'new' | null>(null); const [busyId, setBusyId] = useState(''); const [message, setMessage] = useState(''); const [ordered, setOrdered] = useState(items); const [draggingId, setDraggingId] = useState('');
  const orderedRef = useRef(items); const dragRef = useRef<{ id: string; original: CareItem[] } | null>(null);
  useEffect(() => { if (!draggingId) { setOrdered(items); orderedRef.current = items; } }, [items, draggingId]);
  async function toggle(item: CareItem) { if (item.active && !await confirmAction({ title: `停用“${item.name}”？`, description: '首页将不再显示该项目，历史记录仍会保留。', confirmLabel: '确认停用', danger: true })) return; setBusyId(item.id); setMessage(''); try { await api.setCareItemActive(item.id, !item.active); await onChanged(); setMessage(item.active ? '项目已停用' : '项目已启用'); } catch (err) { setMessage(err instanceof Error ? err.message : '操作失败'); } finally { setBusyId(''); } }
  function reorderLocal(id: string, targetId: string) { const current = orderedRef.current; const movedItem = current.find(item => item.id === id); const targetItem = current.find(item => item.id === targetId); if (!movedItem || !targetItem || movedItem.category !== targetItem.category) return; const from = current.findIndex(item => item.id === id); const to = current.findIndex(item => item.id === targetId); if (from === to) return; const next = [...current]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); orderedRef.current = next; setOrdered(next); }
  async function persistOrder(next: CareItem[], previous: CareItem[]) { if (next.map(item => item.id).join() === previous.map(item => item.id).join()) return; setBusyId('order'); setMessage(''); try { await api.reorderCareItems(next.map(item => item.id)); await onChanged(); setMessage('项目顺序已保存'); } catch (err) { orderedRef.current = previous; setOrdered(previous); setMessage(err instanceof Error ? err.message : '顺序保存失败'); } finally { setBusyId(''); } }
  async function moveByKeyboard(item: CareItem, direction: -1 | 1) { const previous = orderedRef.current; const group = previous.filter(entry => entry.category === item.category); const index = group.findIndex(entry => entry.id === item.id); const target = group[index + direction]; if (!target || busyId) return; reorderLocal(item.id, target.id); await persistOrder(orderedRef.current, previous); }
  function startDrag(event: React.PointerEvent<HTMLButtonElement>, item: CareItem) { if (busyId) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { id: item.id, original: orderedRef.current }; setDraggingId(item.id); }
  function drag(event: React.PointerEvent<HTMLButtonElement>) { if (!dragRef.current) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-care-item-id]')?.dataset.careItemId; if (target) reorderLocal(dragRef.current.id, target); }
  function endDrag() { const state = dragRef.current; if (!state) return; dragRef.current = null; setDraggingId(''); void persistOrder(orderedRef.current, state.original); }
  function cancelDrag() { const state = dragRef.current; if (!state) return; orderedRef.current = state.original; setOrdered(state.original); dragRef.current = null; setDraggingId(''); }
  const groups: { category: CareItemCategory; label: string }[] = [{ category: 'medication', label: '用药' }, { category: 'care', label: '护理' }];
  const renderItem = (item: CareItem) => { const effectiveActive = item.active && !isScheduleOver(item); return <article data-care-item-id={item.id} className={`${effectiveActive ? '' : 'inactive'} ${draggingId === item.id ? 'dragging' : ''}`} key={item.id}><button type="button" className="care-drag-handle" aria-label={`调整${item.name}在${item.category === 'medication' ? '用药' : '护理'}分组中的顺序，可拖动或按上下方向键`} aria-keyshortcuts="ArrowUp ArrowDown" onPointerDown={event => startDrag(event, item)} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); void moveByKeyboard(item, event.key === 'ArrowUp' ? -1 : 1); } }}>≡</button><img src={careItemIconSources[item.icon]} alt="" /><button className="care-item-info" onClick={() => setEditing(item)}><b>{item.name}<span className="care-item-edit-hint"> · 修改</span></b><small>{careItemHomeStatus(item)}</small></button><Switch checked={effectiveActive} label={`${effectiveActive ? '停用' : '启用'}${item.name}`} disabled={Boolean(busyId) || isScheduleOver(item)} onChange={() => void toggle(item)} /></article>; };
  return <><section className="settings-card care-items-card"><div className="setting-status"><h2>用药护理</h2><span className="status-badge brand">管理</span></div><p>定时或间隔项目会进入首页今日计划；护理项目统一用“完成”记录。按需项目仅在手动添加记录时显示。</p>{groups.map(group => <section className="care-item-group" key={group.category}><h3>{group.label}</h3><div className="care-item-list">{ordered.filter(item => item.category === group.category).map(renderItem)}</div></section>)}<button className="btn primary full" disabled={Boolean(busyId)} onClick={() => setEditing('new')}>新增项目</button><Feedback message={message} type={message.includes('失败') || message.includes('变化') ? 'error' : 'success'} onClose={() => setMessage('')} /></section>{editing && <CareItemEditor item={editing === 'new' ? undefined : editing} nextOrder={Math.max(0, ...items.map(item => item.sortOrder)) + 10} onClose={() => setEditing(null)} onSaved={async () => { await onChanged(); setMessage(editing === 'new' ? '项目已新增' : '项目已修改'); }} />}</>;
}
