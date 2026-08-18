import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api, ApiError } from './api';
import { addDays, isoDay, startOfWeek } from './date';
import { isCareItemDue, getCareItemReminderTimes } from './careSchedule';
import { createUuid } from './id';
import { cacheProfile, cacheRecords, clearRememberedUser, getCachedProfile, getCachedRecords, getOutbox, getRememberedUser, queueAction, rememberUser, setOutbox } from './offline';
import type { AuditEntry, BowelSize, Capabilities, CareItem, CareItemCategory, CareRecord, DraftGrowthRecord, DraftRecord, DraftVaccineRecord, FamilyId, GrowthRecord, Profile, PushStatus, RecordType, SessionUser, Supplement, VaccineCatalogItem, VaccineRecord } from './types';
import { VaccineEditor, VaccineHistory, VaccineReminderCard, type VaccineEditorState } from './VaccineViews';
import HistoryOverview from './views/HistoryOverview';
import { buildVaccinePlan, vaccineTimingStatus, type VaccinePlanItem } from './vaccines';
import { ActionMenu, confirmAction, EmptyState, SegmentedControl, useDialogFocus } from './ui';
import { DateField, DateTimeField } from './DateField';
import { usePullToRefresh } from './usePullToRefresh';
import { syncNativeVaccineReminders } from './native';
import { PredictionBanner } from './PredictionBanner';
import { auditNames, canManage, careItemCategory, careItemIcon, careItemIconSources, familyMembers, isScheduleOver, roleNames, selectableCareItems, summary, type ThemeMode, typeNames } from './shared';
import { formatTimeShort } from '../shared/feeding-prediction';

// 低频页面按需加载，配合 main.tsx 空闲预取与 Service Worker 运行时缓存
const TrendsView = lazy(() => import('./views/Trends'));
const ArchiveView = lazy(() => import('./views/Archive'));
const SettingsView = lazy(() => import('./views/Settings'));
const ChatView = lazy(() => import('./views/Chat'));

type Tab = 'today' | 'history' | 'chat' | 'trends' | 'archive' | 'settings';
type ChangeScope = 'records' | 'profile' | 'all';
type ToastState = { message: string; actionLabel?: string; onAction?: () => void | Promise<void> };

const recordEditorTypeOrder: RecordType[] = ['feeding', 'bowel', 'supplement', 'note'];
const auditActions: Record<AuditEntry['action'], string> = { create: '创建记录', update: '修改记录', delete: '删除记录', restore: '恢复记录', import: '从备份导入' };
const emptyCapabilities: Capabilities = { aiEnabled: false, aiModel: null };
const weekContains = (record: GrowthRecord, date = new Date()) => {
  const from = isoDay(startOfWeek(date)); const to = isoDay(addDays(startOfWeek(date), 7));
  return record.measuredOn >= from && record.measuredOn < to;
};

const blankDraft = (type: RecordType = 'feeding'): DraftRecord => ({ id: createUuid(), type, occurredAt: new Date().toISOString(), breastMilkMl: null, formulaMl: null });

function getAgeProfileLine(birthDate: string, realName: string, now = new Date()): string {
  const birth = new Date(`${birthDate}T12:00:00`);
  const at = new Date(now); at.setHours(12, 0, 0, 0);
  let totalMonths = (at.getFullYear() - birth.getFullYear()) * 12 + at.getMonth() - birth.getMonth();
  const anniversaryFor = (months: number) => {
    const targetMonth = birth.getMonth() + months;
    const lastDay = new Date(birth.getFullYear(), targetMonth + 1, 0, 12).getDate();
    return new Date(birth.getFullYear(), targetMonth, Math.min(birth.getDate(), lastDay), 12);
  };
  if (anniversaryFor(totalMonths) > at) totalMonths -= 1;
  totalMonths = Math.max(0, totalMonths);
  const days = Math.max(0, Math.floor((at.getTime() - anniversaryFor(totalMonths).getTime()) / 86400000));
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const ageText = years
    ? `${years}岁${months ? `${months}个月` : ''}${days ? `${days}天` : ''}`
    : `${totalMonths}个月${days ? `${days}天` : ''}`;
  return `${realName} · ${ageText}`;
}

function FeedingSummary({ record, careItems = [] }: { record: CareRecord | DraftRecord; careItems?: CareItem[] }) {
  if (record.type !== 'feeding') return <>{summary(record, careItems)}</>;
  const parts = [record.breastMilkMl ? `母乳 ${record.breastMilkMl} mL` : '', record.formulaMl ? `奶粉 ${record.formulaMl} mL` : ''].filter(Boolean);
  return <span className="feeding-summary">{parts.length ? parts.map(part => <span key={part}>{part}</span>) : <span>待补充奶量</span>}</span>;
}

function optimisticRecord(value: DraftRecord, user: SessionUser, previous?: CareRecord): CareRecord {
  const now = new Date().toISOString();
  return {
    id: value.id || createUuid(), type: value.type, occurredAt: value.occurredAt,
    breastMilkMl: value.type === 'feeding' ? value.breastMilkMl ?? null : null,
    formulaMl: value.type === 'feeding' ? value.formulaMl ?? null : null,
    supplement: value.type === 'supplement' ? value.supplement ?? null : null,
    bowelSize: value.type === 'bowel' ? value.bowelSize ?? null : null,
    subject: value.type === 'note' ? value.subject?.trim() || null : null,
    note: value.note ?? null,
    createdAt: previous?.createdAt || now, updatedAt: now,
    createdBy: previous?.createdBy || user.id, updatedBy: user.id,
    deletedAt: null, deletedBy: null
  };
}

const caregiverTitles: Record<FamilyId, string> = { father: '爸爸', mother: '妈妈', grandfather: '爷爷', grandmother: '奶奶' };

type HeroPeriod = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

function getHeroPeriod(hour: number): HeroPeriod {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

function getGreeting(profile: Profile, userId: FamilyId, hour = new Date().getHours()): { greeting: string; displayName: string } {
  let greeting: string;
  const period = getHeroPeriod(hour);
  if (period === 'morning') greeting = '早上好';
  else if (period === 'midday') greeting = '中午好';
  else if (period === 'afternoon') greeting = '下午好';
  else if (period === 'evening') greeting = '晚上好';
  else greeting = '夜深了';
  const displayName = profile.nickname?.trim() || profile.name;
  const title = caregiverTitles[userId] || '';
  return { greeting, displayName: title ? `${displayName}${title}` : displayName };
}

function Login({ onSuccess }: { onSuccess: (user: SessionUser) => void }) {
  const [identity, setIdentity] = useState<FamilyId>('father');
  const [loginMembers, setLoginMembers] = useState(familyMembers);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.loginOptions().then(items => setLoginMembers(items.map(item => ({ ...item, role: roleNames[item.role], icon: familyMembers.find(member => member.id === item.id)!.icon })))).catch(() => undefined); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api.login(identity, password); onSuccess(result.user); }
    catch (err) { setError(err instanceof Error ? err.message : '登录失败'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card">
    <div className="brand-bear"><img src="/illustrations/login-family.webp" alt="" /></div>
    <h1>宝宝照护记录</h1>
    <p className="supporting">家人共享同一份喂养、用药和排便记录。</p>
    <form onSubmit={submit}><fieldset className="identity-picker"><legend>选择身份</legend><div>{loginMembers.map(member => <button type="button" key={member.id} aria-pressed={identity === member.id} className={identity === member.id ? 'selected' : ''} onClick={() => { setIdentity(member.id); setPassword(''); }}><img src={member.icon} alt="" /><b>{member.name}</b><small>{member.role}</small></button>)}</div></fieldset>
      <label>{loginMembers.find(member => member.id === identity)?.name}的密码<input autoFocus type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
      {error && <p className="error-text" role="alert">{error}</p>}<button className="btn primary full" disabled={busy || !password}>{busy ? '正在登录…' : '进入记录'}</button>
    </form>
  </section></main>;
}

function hasEnteredContent(value: DraftRecord) {
  return Boolean(value.breastMilkMl || value.formulaMl || value.supplement || value.bowelSize || value.subject?.trim() || value.note?.trim());
}

function RecordEditor({ initial, careItems, onClose, onSave }: { initial: DraftRecord; careItems: CareItem[]; onClose(): void; onSave(value: DraftRecord): Promise<void> }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  const requestClose = useCallback(async () => { if (!dirty || await confirmAction({ title: '放弃未保存的内容？', description: '当前填写内容不会保存。', confirmLabel: '放弃修改', danger: true })) onClose(); }, [dirty, onClose]);
  useDialogFocus(dialogRef, requestClose);
  async function switchType(type: RecordType) {
    if (type === value.type) return;
    if (hasEnteredContent(value) && !await confirmAction({ title: `切换为“${typeNames[type]}”？`, description: '切换后会清空当前已填写的记录内容。', confirmLabel: '继续切换', danger: true })) return;
    setValue({ ...blankDraft(type), id: value.id, occurredAt: value.occurredAt });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (value.type === 'feeding' && !value.breastMilkMl && !value.formulaMl) {
      setError('请填写母乳或奶粉量，至少一项');
      return;
    }
    if (value.type === 'note' && !value.subject?.trim()) {
      setError('请填写事项内容');
      return;
    }
    setBusy(true);
    try { await onSave(value); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败'); setBusy(false); }
  }
  return <div className="modal-layer" onMouseDown={e => e.target === e.currentTarget && requestClose()}>
    <section ref={dialogRef} className="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <header className="editor-head"><h2 id="editor-title">{initial.id && 'createdAt' in initial ? '修改记录' : '添加记录'}</h2><button type="button" className="close-btn" onClick={requestClose} aria-label="关闭">×</button></header>
      <SegmentedControl className="type-switch" label="记录类型" value={value.type} options={recordEditorTypeOrder.map(type => ({ value: type, label: typeNames[type] }))} onChange={type => void switchType(type)} />
      <form className="editor-form" onSubmit={submit}>
        <DateTimeField label="记录时间" max={new Date(Date.now() + 10 * 60 * 1000).toISOString()} value={value.occurredAt} onChange={occurredAt => setValue({ ...value, occurredAt })} />
        {value.type === 'feeding' && <div className="input-pair"><label>母乳量（mL）<input inputMode="numeric" type="number" min="0" max="500" placeholder="例如 90" value={value.breastMilkMl ?? ''} aria-invalid={error.includes('母乳或奶粉量') || undefined} onChange={e => { setError(''); setValue({ ...value, breastMilkMl: e.target.value ? Number(e.target.value) : null }); }} /></label><label>奶粉量（mL）<input inputMode="numeric" type="number" min="0" max="500" placeholder="例如 120" value={value.formulaMl ?? ''} aria-invalid={error.includes('母乳或奶粉量') || undefined} onChange={e => { setError(''); setValue({ ...value, formulaMl: e.target.value ? Number(e.target.value) : null }); }} /></label></div>}
        {value.type === 'supplement' && <CareItemChoiceField items={selectableCareItems(careItems, value.supplement)} selected={value.supplement} onSelect={supplement => setValue({ ...value, supplement })} />}
        {value.type === 'bowel' && <ChoiceField label="排便量" values={['大', '中', '小'] as BowelSize[]} selected={value.bowelSize} onSelect={bowelSize => setValue({ ...value, bowelSize })} />}
        {value.type === 'note' && <label>事项内容<input maxLength={100} placeholder="例如：换床单、剪指甲" value={value.subject ?? ''} aria-invalid={error.includes('事项内容') || undefined} onChange={e => { setError(''); setValue({ ...value, subject: e.target.value }); }} /></label>}
        <label>补充说明（选填）<textarea rows={3} maxLength={200} placeholder={value.type === 'supplement' ? '可记录服用或护理后的情况' : value.type === 'note' ? '可补充事项细节' : '可留空'} value={value.note ?? ''} onChange={e => setValue({ ...value, note: e.target.value })} /></label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <footer className="editor-actions"><button type="button" className="btn secondary" onClick={requestClose}>取消</button><button className="btn primary" disabled={busy}>{busy ? '保存中…' : '确认保存'}</button></footer>
      </form>
    </section>
  </div>;
}

function ChoiceField<T extends string>({ label, values, selected, onSelect, getLabel = value => value }: { label: string; values: T[]; selected?: T | null; onSelect(value: T): void; getLabel?(value: T): string }) {
  return <fieldset><legend>{label}</legend><div className="choice-group">{values.map(value => <button type="button" key={value} aria-pressed={selected === value} className={selected === value ? 'selected' : ''} onClick={() => onSelect(value)}>{selected === value && '✓ '}{getLabel(value)}</button>)}</div></fieldset>;
}

function CareItemChoiceField({ items, selected, onSelect }: { items: CareItem[]; selected?: string | null; onSelect(value: string): void }) {
  const groups: { category: CareItemCategory; label: string }[] = [{ category: 'medication', label: '用药' }, { category: 'care', label: '护理' }];
  return <fieldset className="care-choice-field"><legend>选择护理项目</legend><div className="care-choice-groups">{groups.map(group => { const choices = items.filter(item => item.category === group.category); return choices.length > 0 && <section key={group.category} aria-labelledby={`care-choice-${group.category}`}><h3 id={`care-choice-${group.category}`}>{group.label}</h3><div className="care-choice-grid">{choices.map(item => <button type="button" key={item.id} aria-label={`${group.label} ${item.name}`} aria-pressed={selected === item.name} className={selected === item.name ? 'selected' : ''} onClick={() => onSelect(item.name)}><img src={careItemIconSources[item.icon]} alt="" /><span>{item.name}</span>{selected === item.name && <i aria-hidden="true">✓</i>}</button>)}</div></section>; })}</div></fieldset>;
}


function AuditDialog({ record, onClose }: { record: CareRecord; onClose(): void }) {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const dialogRef = useRef<HTMLElement | null>(null); useDialogFocus(dialogRef, onClose);
  useEffect(() => { api.audit(record.id).then(setItems).catch(err => setError(err instanceof Error ? err.message : '无法读取操作记录')).finally(() => setLoading(false)); }, [record.id]);
  return <div className="modal-layer" onMouseDown={e => e.target === e.currentTarget && onClose()}><section ref={dialogRef} className="editor audit-dialog" role="dialog" aria-modal="true" aria-labelledby="audit-title"><header className="editor-head"><div><p className="kicker">{summary(record)}</p><h2 id="audit-title">操作记录</h2></div><button className="close-btn" onClick={onClose} aria-label="关闭">×</button></header>
    {error && <p className="error-text" role="alert">{error}</p>}{loading && <p className="loading-copy">正在读取…</p>}{!loading && !error && !items.length && <p className="loading-copy">这条记录创建于操作历史功能启用前，暂无详细历史。</p>}
    <ol className="audit-list">{items.map(item => <li key={item.id}><i /><div><strong>{auditActions[item.action]}</strong><p>{auditNames[item.actor]} · {new Date(item.occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</p></div></li>)}</ol>
    <button className="btn secondary full" onClick={onClose}>关闭</button>
  </section></div>;
}

function RecordNotePreview({ note }: { note: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const measureTextRef = useRef<HTMLSpanElement | null>(null);
  const measureButtonRef = useRef<HTMLButtonElement | null>(null);
  const [preview, setPreview] = useState(note);
  const [truncated, setTruncated] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [note]);
  useEffect(() => {
    if (expanded) return;
    const container = containerRef.current;
    const measureBox = measureRef.current;
    const measureText = measureTextRef.current;
    const measureButton = measureButtonRef.current;
    if (!container || !measureBox || !measureText || !measureButton) return;
    const measure = () => {
      const width = container.clientWidth;
      if (!width) return;
      measureBox.style.width = `${width}px`;
      const lineHeight = Number.parseFloat(getComputedStyle(measureBox).lineHeight);
      const twoLines = lineHeight * 2 + 1;
      measureButton.hidden = true;
      measureText.textContent = note;
      if (measureBox.scrollHeight <= twoLines) {
        setPreview(note);
        setTruncated(false);
        return;
      }
      measureButton.hidden = false;
      let low = 0;
      let high = note.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        measureText.textContent = note.slice(0, middle);
        if (measureBox.scrollHeight <= twoLines) low = middle;
        else high = middle - 1;
      }
      const nextPreview = note.slice(0, low).trimEnd();
      setPreview(nextPreview);
      setTruncated(nextPreview.length < note.length);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [expanded, note]);
  return <div ref={containerRef} className={`record-note-preview${expanded ? ' expanded' : ''}`}><span>{expanded ? note : preview}</span>{truncated && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '收起' : '…展开'}</button>}<div ref={measureRef} className="record-note-measure" aria-hidden="true"><span ref={measureTextRef} /><button ref={measureButtonRef} type="button" tabIndex={-1}>…展开</button></div></div>;
}

function Timeline({ records, careItems, manager, emptyText = '这一天还没有记录', emptyAction, onEdit, onDelete, onAudit, searchMode = false, compactMetadata = false, hideMetadata = false }: { records: CareRecord[]; careItems: CareItem[]; manager: boolean; emptyText?: string; emptyAction?: ReactNode; onEdit(record: CareRecord): void; onDelete(record: CareRecord): void; onAudit(record: CareRecord): void; searchMode?: boolean; compactMetadata?: boolean; hideMetadata?: boolean }) {
  if (!records.length) return <EmptyState title={emptyText} description="记录后会按时间排列在这里。" image={emptyText.includes('找到') ? '/illustrations/empty-search.webp' : '/illustrations/empty-records.webp'} action={emptyAction} />;
  return <div className="timeline">{records.map(record => {
    const created = auditNames[record.createdBy || 'legacy'];
    const updated = auditNames[record.updatedBy || record.createdBy || 'legacy'];
    const changed = record.updatedBy && record.updatedBy !== record.createdBy;
    const items = [...(manager ? [{ label: '查看操作记录', onSelect: () => onAudit(record) }] : []), { label: '修改记录', onSelect: () => onEdit(record) }, ...(manager ? [{ label: '删除记录', danger: true, onSelect: () => onDelete(record) }] : [])];
    const occurredAt = new Date(record.occurredAt);
    const time = occurredAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const date = occurredAt.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    const recordTypeName = record.type === 'supplement' ? (careItemCategory(record.supplement, careItems) === 'care' ? '护理' : '用药') : typeNames[record.type];
    const auditLabel = `${created === '历史数据' ? '历史数据' : `${created}录入`}${changed ? ` · ${updated}修改` : ''}`;
    const hasExtraNote = Boolean(record.note);
    const typeWithCreator = <>{recordTypeName}<span className="record-creator"> · {created}</span></>;
    return <article className={`timeline-item ${record.type}${hasExtraNote ? ' has-note' : ''}`} key={record.id}><div className={`time-col${searchMode ? ' search-time' : ''}`}><time>{searchMode && <span className="record-date">{date}</span>}<span>{time}</span></time><i /></div><img className="record-mark" src={careItemIcon(record, careItems)} alt="" /><div className="record-copy">{compactMetadata && !hideMetadata ? <div className="record-meta-row"><small>{typeWithCreator}</small><em>{auditLabel}</em></div> : <small>{typeWithCreator}</small>}<strong><FeedingSummary record={record} careItems={careItems} /></strong>{record.note && <RecordNotePreview note={record.note} />}{!compactMetadata && !hideMetadata && <em>{auditLabel}</em>}</div><ActionMenu label={`${summary(record, careItems)}的操作菜单`} items={items} /></article>;
  })}</div>;
}

function DailyReport({ capabilities, online, onOpenSettings, superadmin, userId, allowAutoOpen }: { capabilities: Capabilities; online: boolean; onOpenSettings(): void; superadmin: boolean; userId: FamilyId; allowAutoOpen: boolean }) {
  const [data, setData] = useState<{ date: string; summary: string; suggestions: string[]; model: string; generatedAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  useDialogFocus(dialogRef, () => setOpen(false), open);
  const load = useCallback(() => {
    if (!online) { setLoading(false); return; }
    setLoading(true); setError('');
    api.dailyReport().then(result => { if (result.exists) setData({ date: result.date, summary: result.summary!, suggestions: result.suggestions!, model: result.model!, generatedAt: result.generatedAt! }); else setData(null); })
      .catch(err => setError(err instanceof Error ? err.message : '无法读取报告')).finally(() => setLoading(false));
  }, [online]);
  useEffect(() => { load(); }, [load]);
  const reportVersion = data ? `${data.date}:${data.generatedAt}` : '';
  const seenStorageKey = `babycare:daily-report-seen:${userId}`;
  const openReport = useCallback(() => {
    if (!data) return;
    localStorage.setItem(seenStorageKey, `${data.date}:${data.generatedAt}`);
    setOpen(true);
  }, [data, seenStorageKey]);
  useEffect(() => {
    if (!data || !allowAutoOpen || localStorage.getItem(seenStorageKey) === reportVersion) return;
    const timer = window.setTimeout(openReport, 500);
    return () => window.clearTimeout(timer);
  }, [allowAutoOpen, data, openReport, reportVersion, seenStorageKey]);
  async function generate() {
    setBusy(true); setError('');
    try { const result = await api.generateDailyReport(); setData({ date: result.date, summary: result.summary, suggestions: result.suggestions, model: result.model, generatedAt: result.generatedAt }); }
    catch (err) { setError(err instanceof Error ? err.message : '报告生成失败'); }
    finally { setBusy(false); }
  }
  const [year, month, day] = data ? data.date.split('-').map(Number) : [0, 0, 0];
  const weekday = data ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${data.date}T00:00:00`).getDay()] : '';
  if (data) return <>
    <button type="button" className="daily-report collapsed info-summary-row" aria-label="查看昨日报告" onClick={openReport}><span className="info-row-label">昨日报告</span><span className="info-row-value">{data.summary}</span><ChevronRight className="info-row-chevron" aria-hidden="true" size={16} strokeWidth={2} /></button>
    {open && <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && setOpen(false)}><section ref={dialogRef} className="editor info-sheet" role="dialog" aria-modal="true" aria-labelledby="daily-report-title"><header className="editor-head"><div><p className="kicker">{`${year}年${month}月${day}日 · ${weekday}`}</p><h2 id="daily-report-title">昨日报告</h2></div><button className="close-btn" onClick={() => setOpen(false)} aria-label="关闭">×</button></header><p className="dr-summary">{data.summary}</p>{data.suggestions.length > 0 && <ul className="dr-suggestions">{data.suggestions.map((item, index) => <li key={index}>{item}</li>)}</ul>}<div className="dr-footer"><small>{data.generatedAt ? `生成于 ${new Date(data.generatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}</small></div>{superadmin && <button type="button" className="btn secondary full" disabled={busy || !online} onClick={generate}>{busy ? '正在重新生成…' : '重新生成报告'}</button>}</section></div>}
  </>;
  return (
    <section className="daily-report info-summary-static" aria-label="昨日报告"><span className="info-row-label">昨日报告</span><span className="info-row-value">{loading ? '正在读取…' : error || (!online ? '联网后可查看' : !capabilities.aiEnabled ? '尚未配置 AI 模型' : superadmin ? '报告尚未生成' : '报告还没准备好')}</span>{!loading && superadmin && online && (!capabilities.aiEnabled ? <button className="text-button" onClick={onOpenSettings}>去设置</button> : <button className="text-button" disabled={busy} onClick={generate}>{busy ? '生成中…' : '生成报告'}</button>)}</section>
  );
}

function TodayView({ profile, records, recentRecords, vaccineRecords, vaccineCatalog, careItems, todayPlanStatus, capabilities, online, onOpenSettings, onCompleteVaccine, onAppointmentVaccine, manager, superadmin, userId, allowReportAutoOpen, weeklyGrowth, onAddGrowth, onAdd, onSupplement, onEdit, onDelete, onAudit }: { profile: Profile; records: CareRecord[]; recentRecords: CareRecord[]; vaccineRecords: VaccineRecord[]; vaccineCatalog: VaccineCatalogItem[]; careItems: CareItem[]; todayPlanStatus: 'loading' | 'ready' | 'error'; capabilities: Capabilities; online: boolean; onOpenSettings(): void; onCompleteVaccine(item: VaccinePlanItem): void; onAppointmentVaccine(item: VaccinePlanItem): void; manager: boolean; superadmin: boolean; userId: FamilyId; allowReportAutoOpen: boolean; weeklyGrowth?: GrowthRecord; onAddGrowth(): void; onAdd(type: RecordType): void; onSupplement(value: Supplement): Promise<void>; onEdit(record: CareRecord): void; onDelete(record: CareRecord): void; onAudit(record: CareRecord): void }) {
  const [savingSupplement, setSavingSupplement] = useState<Supplement | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const currentHour = currentTime.getHours();
  const heroPeriod = getHeroPeriod(currentHour);
  const feed = records.filter(r => r.type === 'feeding'); const breast = feed.reduce((sum, r) => sum + (r.breastMilkMl || 0), 0); const formula = feed.reduce((sum, r) => sum + (r.formulaMl || 0), 0); const done = new Map(records.filter(r => r.type === 'supplement').map(r => [r.supplement, r]));
  const recentSorted = [...recentRecords].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const lastRecord = recentSorted[0] || null;
  const pendingCareItems = todayPlanStatus === 'ready' ? careItems
    .filter(item => item.active && !isScheduleOver(item) && isCareItemDue(item) && !done.has(item.name))
    .sort((a, b) => {
      const aTimes = getCareItemReminderTimes(a);
      const bTimes = getCareItemReminderTimes(b);
      return (aTimes[0] || '').localeCompare(bTimes[0] || '');
    }) : [];
  const today = isoDay(new Date());
  const actionableVaccines = todayPlanStatus === 'ready' ? buildVaccinePlan(profile.birthDate, vaccineRecords, vaccineCatalog)
    .filter(item => !item.record?.administeredOn && (item.record?.appointmentOn || item.plannedOn) <= today)
    .sort((a, b) => (a.record?.appointmentOn || a.plannedOn).localeCompare(b.record?.appointmentOn || b.plannedOn)) : [];
  const overdueVaccines = actionableVaccines.filter(item => (item.record?.appointmentOn || item.plannedOn) < today);
  const todayVaccines = actionableVaccines.filter(item => (item.record?.appointmentOn || item.plannedOn) === today);
  const timedTodayTasks = [
    ...pendingCareItems
      .filter(item => getCareItemReminderTimes(item).length > 0)
      .flatMap(item => getCareItemReminderTimes(item).map(time => ({ kind: 'medicine' as const, time, item }))),
    ...todayVaccines.filter(item => item.record?.appointmentOn === today && item.record.appointmentTime).map(item => ({ kind: 'vaccine' as const, time: item.record!.appointmentTime!, item }))
  ].sort((a, b) => a.time.localeCompare(b.time));
  const untimedCareItems = pendingCareItems.filter(item => getCareItemReminderTimes(item).length === 0);
  const untimedTodayVaccines = todayVaccines.filter(item => !(item.record?.appointmentOn === today && item.record.appointmentTime));
  async function addSupplement(item: Supplement) { setSavingSupplement(item); try { await onSupplement(item); } finally { setSavingSupplement(null); } }
  function renderMedicineTask(item: CareItem, timeLabel?: string) {
    const isCare = item.category === 'care';
    const reminders = getCareItemReminderTimes(item);
    const timeDisplay = timeLabel ? `今日 ${timeLabel}` : reminders.length > 0 ? `今日 ${reminders.join(' · ')}` : '今日';
    return <article key={`medicine:${item.id}${timeLabel ? ':' + timeLabel : ''}`}>
      <img className="task-icon medicine" src={careItemIconSources[item.icon]} alt="" />
      <div><b>{item.name}</b><small>{timeDisplay} · {isCare ? '待完成' : '待记录'}</small></div>
      <div className="today-plan-actions">
        <button className="btn primary" aria-label={`记录${item.name}${isCare ? '已完成' : '已服用'}`} disabled={Boolean(savingSupplement)} onClick={() => void addSupplement(item.name)}>
          {savingSupplement === item.name ? '稍候' : isCare ? '完成' : '服药'}
        </button>
      </div>
    </article>;
  }
  function renderVaccineTask(item: VaccinePlanItem) {
    const effectiveOn = item.record?.appointmentOn || item.plannedOn;
    const timing = vaccineTimingStatus(effectiveOn);
    const overdue = timing.distance < 0;
    const hasTodayAppointment = item.record?.appointmentOn === today;
    const hadAppointmentOverdue = overdue && Boolean(item.record?.appointmentOn);
    const statusLabel = item.record?.appointmentOn
      ? overdue
        ? `预约日${timing.label}`
        : `预约今日${item.record.appointmentTime ? ` ${item.record.appointmentTime}` : ''}`
      : overdue
        ? `建议日${timing.label}`
        : '建议今日';
    const appointmentLabel = hadAppointmentOverdue ? '改约' : '预约';
    return <article className="vaccine-task" key={`vaccine:${item.key}`}><img className="task-icon vaccine" src="/icons/task-vaccine-normalized.png" alt="" /><div><b>{item.vaccineName} · 第{item.dose}剂</b><small>{statusLabel}</small></div><div className="today-plan-actions">{(!hasTodayAppointment || overdue) && <button className="btn secondary" aria-label={`${appointmentLabel}${item.vaccineName}第${item.dose}剂`} onClick={() => onAppointmentVaccine(item)}>{appointmentLabel}</button>}<button className="btn primary" aria-label={`记录${item.vaccineName}第${item.dose}剂已接种`} onClick={() => onCompleteVaccine(item)}>接种</button></div></article>;
  }
  return <div className="today-layout">
    <div className="today-profile-strip" aria-label={`宝宝信息，${getAgeProfileLine(profile.birthDate, profile.name)}`}>
      <div className="today-baby-summary">{profile.avatar ? <img src={profile.avatar} alt="" /> : <img src="/bear-bottle.png" alt="" />}<span>{getAgeProfileLine(profile.birthDate, profile.name)}</span></div>
    </div>
    <div className="today-main-column">
    <div className="today-workbench">
      <section className={`baby-hero hero-${heroPeriod}`}><div>{(() => { const { greeting, displayName } = getGreeting(profile, userId, currentHour); return <h1 className="hero-greeting-title">{greeting}，{displayName}～</h1>; })()}<p className="kicker hero-date-line">{(() => { const d = new Date(); return `今日 · ${d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} · ${d.toLocaleDateString('zh-CN', { weekday: 'long' })}`; })()}</p><div className="hero-status">{(() => { if (!lastRecord) return <p>今日暂无记录</p>; const time = formatTimeShort(lastRecord.occurredAt); let detail = ''; if (lastRecord.type === 'feeding') { const breast = lastRecord.breastMilkMl ?? 0; const formula = lastRecord.formulaMl ?? 0; const totalMl = breast + formula; let mode = ''; if (breast > 0 && formula > 0) mode = '混合'; else if (breast > 0) mode = '母乳'; else if (formula > 0) mode = '奶粉'; detail = `喂奶${mode ? ' · ' + mode : ''}${totalMl ? ' ' + totalMl + 'ml' : ''}`; } else if (lastRecord.type === 'supplement') { const category = careItemCategory(lastRecord.supplement, careItems); detail = `${category === 'care' ? '护理' : '用药'} · ${lastRecord.supplement || ''}`; } else if (lastRecord.type === 'bowel') { detail = `排便 · ${lastRecord.bowelSize || '中'}`; } else { detail = lastRecord.subject ? `事项 · ${lastRecord.subject}` : '其他'; } const text = `上次记录：${time} · ${detail}`; return <p title={text} aria-label={text}>{text}</p>; })()}</div></div></section>
      <section className="metric-band" aria-label="今日概览"><div><span>母乳</span><strong>{breast}</strong><small>mL</small></div><div><span>奶粉</span><strong>{formula}</strong><small>mL</small></div><div><span>喂奶</span><strong>{feed.length}</strong><small>次</small></div><div><span>排便</span><strong>{records.filter(r => r.type === 'bowel').length}</strong><small>次</small></div></section>
      <section className="quick-section" aria-label="快捷记录"><div className="quick-grid"><button onClick={() => onAdd('feeding')}><img className="quick-icon" src="/icons/quick-feeding.png" alt="" /><b>喂奶</b></button><button onClick={() => onAdd('bowel')}><img className="quick-icon" src="/icons/quick-bowel.png" alt="" /><b>排便</b></button><button onClick={() => onAdd('supplement')}><img className="quick-icon" src="/icons/record-care.png" alt="" /><b>护理</b></button><button onClick={() => onAdd('note')}><img className="quick-icon" src="/icons/quick-note.png" alt="" /><b>其他</b></button></div></section>
      <PredictionBanner records={recentRecords} online={online} />
    </div>
    {todayPlanStatus === 'loading' && <section className="today-plan today-plan-loading" aria-label="今日待办正在读取" aria-busy="true"><h2>今日待办</h2><div className="today-plan-skeleton"><i /><div><i /><i /></div><i /></div></section>}
    {todayPlanStatus === 'error' && <section className="today-plan today-plan-error" role="status"><h2>今日待办</h2><p>计划暂时无法读取，请联网后下拉刷新。</p></section>}
    {todayPlanStatus === 'ready' && (pendingCareItems.length > 0 || actionableVaccines.length > 0 || !weeklyGrowth) && <section className="today-plan" aria-labelledby="today-plan-title"><h2 id="today-plan-title">今日待办</h2><div className="today-plan-list">{overdueVaccines.map(renderVaccineTask)}{timedTodayTasks.map(task => task.kind === 'medicine' ? renderMedicineTask(task.item, task.time) : renderVaccineTask(task.item))}{untimedCareItems.map(item => renderMedicineTask(item))}{untimedTodayVaccines.map(renderVaccineTask)}{!weeklyGrowth && <article className="growth-task"><img className="task-icon growth" src="/icons/task-growth-normalized.png" alt="" /><div><b>本周成长记录</b><small>本周 · 待记录</small></div><div className="today-plan-actions"><button className="btn primary" aria-label="记录本周成长" onClick={onAddGrowth}>测量</button></div></article>}</div></section>}
    <div className="today-insights" aria-label="今日信息">
      {todayPlanStatus === 'ready' && <VaccineReminderCard profile={profile} records={vaccineRecords} catalog={vaccineCatalog} onComplete={onCompleteVaccine} onAppointment={onAppointmentVaccine} />}
      <DailyReport capabilities={capabilities} online={online} onOpenSettings={onOpenSettings} superadmin={superadmin} userId={userId} allowAutoOpen={allowReportAutoOpen} />
    </div>
    </div>
    <div className="today-timeline"><div className="section-title"><h2>今日记录</h2><span>{records.length} 条</span></div><Timeline records={[...records].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))} careItems={careItems} manager={manager} emptyText="今日还没有记录" emptyAction={<button className="btn secondary" onClick={() => onAdd('feeding')}>记录喂奶</button>} onEdit={onEdit} onDelete={onDelete} onAudit={onAudit} hideMetadata /></div>
  </div>;
}

function HistoryView({ records, deletedRecords, vaccineRecords, vaccineCatalog, profile, historyMode, setHistoryMode, careItems, manager, selected, setSelected, onEdit, onDelete, onAudit, onLoadDeleted, onRestore, onPurge, onOpenVaccineEditor, onCancelVaccineAppointment, onDeleteVaccine }: { records: CareRecord[]; deletedRecords: CareRecord[]; vaccineRecords: VaccineRecord[]; vaccineCatalog: VaccineCatalogItem[]; profile: Profile; historyMode: 'care' | 'vaccine'; setHistoryMode(value: 'care' | 'vaccine'): void; careItems: CareItem[]; manager: boolean; selected: Date; setSelected(value: Date): void; onEdit(record: CareRecord): void; onDelete(record: CareRecord): void; onAudit(record: CareRecord): void; onLoadDeleted(): Promise<void>; onRestore(record: CareRecord): Promise<void>; onPurge(record: CareRecord): Promise<void>; onOpenVaccineEditor(state: VaccineEditorState): void; onCancelVaccineAppointment(item: VaccinePlanItem): void; onDeleteVaccine(record: VaccineRecord): void }) {
  const [query, setQuery] = useState(''); const [typeFilter, setTypeFilter] = useState<'all' | RecordType>('all'); const [actorFilter, setActorFilter] = useState<'all' | FamilyId>('all'); const [view, setView] = useState<'active' | 'deleted'>('active'); const [layout, setLayout] = useState<'day' | 'overview'>('overview');
  const deletedHistoryPushed = useRef(false);
  useEffect(() => { if (view === 'deleted' && manager) void onLoadDeleted(); }, [manager, onLoadDeleted, view]);
  useEffect(() => { const pop = () => { deletedHistoryPushed.current = false; setView('active'); }; window.addEventListener('popstate', pop); return () => { window.removeEventListener('popstate', pop); if (deletedHistoryPushed.current) window.history.back(); }; }, []);
  function openDeleted() { window.history.pushState({ babycareCareDeleted: true }, ''); deletedHistoryPushed.current = true; setView('deleted'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function closeDeleted() { if (deletedHistoryPushed.current && window.history.state?.babycareCareDeleted) window.history.back(); else { deletedHistoryPushed.current = false; setView('active'); } }
  const days = Array.from({ length: 7 }, (_, index) => addDays(selected, index - 3));
  const filtered = records.filter(record => {
    const dayMatches = query.trim() ? true : isoDay(new Date(record.occurredAt)) === isoDay(selected);
    const queryMatches = !query.trim() || `${typeNames[record.type]} ${summary(record, careItems)} ${record.subject || ''} ${record.note || ''} ${auditNames[record.createdBy]}`.toLowerCase().includes(query.trim().toLowerCase());
    return dayMatches && queryMatches && (typeFilter === 'all' || record.type === typeFilter) && (actorFilter === 'all' || record.createdBy === actorFilter);
  });
  const overviewFiltered = records.filter(record => {
    const key = isoDay(new Date(record.occurredAt));
    const inWindow = key >= isoDay(addDays(selected, -6)) && key <= isoDay(selected);
    const queryMatches = !query.trim() || `${typeNames[record.type]} ${summary(record, careItems)} ${record.subject || ''} ${record.note || ''} ${auditNames[record.createdBy]}`.toLowerCase().includes(query.trim().toLowerCase());
    return inWindow && queryMatches && (typeFilter === 'all' || record.type === typeFilter) && (actorFilter === 'all' || record.createdBy === actorFilter);
  });
  const toolbar = <div className="record-toolbar"><label className="search-field"><span aria-hidden="true"><Search size={16} strokeWidth={2} /></span><span className="sr-only">搜索全部记录</span><input aria-label="搜索全部记录" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索记录" /></label><label className="filter-field"><span className="sr-only">记录类型</span><select aria-label="记录类型" value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'all' | RecordType)}><option value="all">类型</option>{(Object.keys(typeNames) as RecordType[]).map(type => <option key={type} value={type}>{typeNames[type]}</option>)}</select></label><label className="filter-field"><span className="sr-only">录入人</span><select aria-label="录入人" value={actorFilter} onChange={e => setActorFilter(e.target.value as 'all' | FamilyId)}><option value="all">家人</option>{familyMembers.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div>;
  return <div className="page-stack"><header className="page-head"><h1>历史记录</h1><p>{historyMode === 'care' ? '按日期查看，或搜索全部照护信息。' : '简单记录接种情况，及时查看下一针。'}</p></header>
    <div className="record-view-row">
    <SegmentedControl className="record-view-tabs" label="记录类型" value={historyMode} options={[{ value: 'care', label: '照护记录' }, { value: 'vaccine', label: '疫苗记录' }]} onChange={value => { setHistoryMode(value); if (value === 'care') setView('active'); }} />
    {historyMode === 'care' && view === 'active' && <SegmentedControl<'day' | 'overview'> className="record-view-tabs overview-toggle" label="查看方式" value={layout} options={[{ value: 'overview', label: '七日' }, { value: 'day', label: '按天' }]} onChange={setLayout} />}
    </div>
    {historyMode === 'vaccine' ? <VaccineHistory profile={profile} records={vaccineRecords} catalog={vaccineCatalog} manager={manager} onOpenEditor={onOpenVaccineEditor} onCancelAppointment={onCancelVaccineAppointment} onDelete={onDeleteVaccine} /> :
    view === 'deleted' ? <section className="deleted-records"><button className="inline-back" onClick={closeDeleted}>← 返回照护记录</button><div className="section-title"><h2>已删除记录</h2><span>{deletedRecords.length} 条</span></div>{deletedRecords.length ? deletedRecords.map(record => <article className="deleted-record" key={record.id}><img className="record-mark" src={careItemIcon(record, careItems)} alt="" /><div><small>{new Date(record.occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} · {record.type === 'supplement' && careItemCategory(record.supplement, careItems) === 'care' ? '护理' : typeNames[record.type]}</small><strong>{summary(record, careItems)}</strong><p>{auditNames[record.deletedBy || 'legacy']}删除 · {record.deletedAt ? new Date(record.deletedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : ''}</p></div><div className="deleted-actions"><button className="btn secondary" onClick={() => onRestore(record)}>恢复</button><button className="btn danger-button" onClick={() => onPurge(record)}>彻底删除</button></div></article>) : <EmptyState title="没有已删除记录" description="管理身份删除的记录会暂存在这里。" />}</section> : <>
    {toolbar}
    {layout === 'day' ? <>
    <section className="calendar-panel"><div className="calendar-nav"><button onClick={() => setSelected(addDays(selected, -7))} aria-label="向前七天"><ChevronLeft size={18} strokeWidth={2.2} /></button><strong>{selected.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</strong><button onClick={() => setSelected(addDays(selected, 7))} aria-label="向后七天"><ChevronRight size={18} strokeWidth={2.2} /></button></div><div className="week-strip">{days.map(day => <button key={isoDay(day)} aria-pressed={isoDay(day) === isoDay(selected)} className={`${isoDay(day) === isoDay(selected) ? 'selected' : ''} ${isoDay(day) === isoDay(new Date()) ? 'today' : ''}`} onClick={() => setSelected(day)}><span>{day.toLocaleDateString('zh-CN', { weekday: 'short' })}</span><b>{day.getDate()}</b></button>)}</div></section>
    <div className="section-title history-record-heading"><h2>{query.trim() ? '全部搜索结果' : selected.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</h2><div className="section-title-actions"><span>{filtered.length} 条</span>{manager && <button className="text-button" onClick={openDeleted}>已删除</button>}</div></div><div className="history-timeline"><Timeline records={filtered} careItems={careItems} manager={manager} emptyText={query.trim() ? '没有找到匹配记录' : undefined} onEdit={onEdit} onDelete={onDelete} onAudit={onAudit} searchMode={!!query.trim()} /></div>
    </> : <HistoryOverview records={overviewFiltered} careItems={careItems} selected={selected} onShiftWeek={offset => setSelected(addDays(selected, offset))} />}</>}
  </div>;
}

function GrowthEditor({ profile, records, initial, onClose, onSave }: { profile: Profile; records: GrowthRecord[]; initial?: GrowthRecord; onClose(): void; onSave(value: DraftGrowthRecord): Promise<void> }) {
  const [measuredOn, setMeasuredOn] = useState(initial?.measuredOn || isoDay(new Date()));
  const [height, setHeight] = useState(initial ? String(initial.heightCm) : '');
  const [weight, setWeight] = useState(initial ? String(initial.weightKg) : '');
  const previous = records.find(record => record.id !== initial?.id && record.measuredOn < measuredOn);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const dirty = measuredOn !== (initial?.measuredOn || isoDay(new Date())) || height !== (initial ? String(initial.heightCm) : '') || weight !== (initial ? String(initial.weightKg) : '');
  function requestClose() { void (async () => { if (!dirty || await confirmAction({ title: '放弃未保存的内容？', description: '当前填写的成长数据不会保存。', confirmLabel: '放弃修改', danger: true })) onClose(); })(); }
  const dialogRef = useRef<HTMLElement | null>(null); useDialogFocus(dialogRef, requestClose);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSave({ id: initial?.id, measuredOn, heightCm: Number(height), weightKg: Number(weight) }); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败'); setBusy(false); }
  }
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && !busy && requestClose()}><section ref={dialogRef} className="editor growth-editor" role="dialog" aria-modal="true" aria-labelledby="growth-editor-title"><header className="editor-head"><div><p className="kicker">宝宝档案</p><h2 id="growth-editor-title">{initial ? '修改成长记录' : '记录成长'}</h2></div><button className="close-btn" onClick={requestClose} aria-label="关闭">×</button></header><form className="editor-form" onSubmit={submit}><DateField label="测量日期" min={profile.birthDate} max={isoDay(new Date())} value={measuredOn} onChange={setMeasuredOn} /><div className="growth-fields"><label>身高 <small>cm</small><input type="number" inputMode="decimal" min="20" max="150" step="0.1" value={height} onChange={event => setHeight(event.target.value)} placeholder="例如 62.5" required /></label><label>体重 <small>kg</small><input type="number" inputMode="decimal" min="0.5" max="50" step="0.01" value={weight} onChange={event => setWeight(event.target.value)} placeholder="例如 6.35" required /></label></div>{previous && !initial && <p className="growth-reference">上次：{previous.heightCm} cm · {previous.weightKg} kg</p>}{error && <p className="error-text" role="alert">{error}</p>}<footer className="editor-actions"><button type="button" className="btn secondary" onClick={requestClose}>取消</button><button className="btn primary" disabled={busy || !height || !weight}>{busy ? '保存中…' : '保存记录'}</button></footer></form></section></div>;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<Profile>(getCachedProfile() || { name: '示例宝宝', birthDate: '2026-01-01', sex: 'unspecified', nickname: '', caregiverTitle: '妈妈', avatar: null });
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [records, setRecords] = useState<CareRecord[]>([]);
  const tabRef = useRef<Tab>('today');
  const [deletedRecords, setDeletedRecords] = useState<CareRecord[]>([]); const [careItems, setCareItems] = useState<CareItem[]>([]);
  const [growthRecords, setGrowthRecords] = useState<GrowthRecord[]>([]); const [deletedGrowthRecords, setDeletedGrowthRecords] = useState<GrowthRecord[]>([]);
  const [vaccineRecords, setVaccineRecords] = useState<VaccineRecord[]>([]);
  const [vaccineRecordsReady, setVaccineRecordsReady] = useState(false);
  const [vaccineCatalog, setVaccineCatalog] = useState<VaccineCatalogItem[]>([]);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [todayPlanStatus, setTodayPlanStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tab, setTab] = useState<Tab>('today'); const [selectedDate, setSelectedDate] = useState(new Date()); const [historyMode, setHistoryMode] = useState<'care' | 'vaccine'>('care');
  const chatHistoryPushed = useRef(false);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => {
    if (tab === 'chat' && !chatHistoryPushed.current) {
      window.history.pushState({ babycareChat: true }, '');
      chatHistoryPushed.current = true;
    }
  }, [tab]);
  useEffect(() => {
    const pop = () => {
      if (tabRef.current === 'chat' && window.history.state?.babycareChat) {
        chatHistoryPushed.current = false;
        setTab('today');
      }
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {
    (window as Window & { babycareHandleBack?: () => boolean }).babycareHandleBack = () => {
      if (tabRef.current === 'chat') {
        chatHistoryPushed.current = false;
        setTab('today');
        return true;
      }
      return false;
    };
    return () => { delete (window as Window & { babycareHandleBack?: () => boolean }).babycareHandleBack; };
  }, []);
  useEffect(() => {
    const openNotification = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      if (target === 'vaccine') { setHistoryMode('vaccine'); setTab('history'); }
      else setTab('today');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('babycare:native-notification-open', openNotification);
    return () => window.removeEventListener('babycare:native-notification-open', openNotification);
  }, []);
  const [editor, setEditor] = useState<DraftRecord | null>(null); const [auditRecord, setAuditRecord] = useState<CareRecord | null>(null);
  const [growthEditor, setGrowthEditor] = useState<GrowthRecord | 'new' | null>(null);
  const [vaccineEditor, setVaccineEditor] = useState<VaccineEditorState | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities>(emptyCapabilities); const [online, setOnline] = useState(navigator.onLine); const [offlineSession, setOfflineSession] = useState(false); const [pendingCount, setPendingCount] = useState(0); const [refreshing, setRefreshing] = useState(false); const [toast, setToast] = useState<ToastState | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => { try { return (localStorage.getItem('babycare-theme') as ThemeMode) || 'system'; } catch { return 'system'; } });
  const refreshingRef = useRef(false);

  const updateLocalRecords = useCallback((userId: string, updater: (items: CareRecord[]) => CareRecord[]) => {
    setRecords(items => { const next = updater(items).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)); cacheRecords(userId, next); return next; });
  }, []);

  const loadRecords = useCallback(async () => {
    if (!currentUser) return false;
    const from = new Date('2000-01-01T00:00:00'); const to = addDays(new Date(), 8); to.setHours(0, 0, 0, 0);
    try { const next = await api.records(from.toISOString(), to.toISOString()); setRecords(next); cacheRecords(currentUser.id, next); setOnline(true); setOfflineSession(false); return true; }
    catch { setRecords(getCachedRecords(currentUser.id)); setOnline(false); return false; }
  }, [currentUser]);

  const loadRecordsToday = useCallback(async () => {
    if (!currentUser) return false;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = addDays(start, 2);
    // 往前取 7 天（含今天），供今日页"预计喂奶"计算近 7 天平均喂奶间隔
    start.setDate(start.getDate() - 7);
    try { const next = await api.records(start.toISOString(), end.toISOString()); setRecords(next); cacheRecords(currentUser.id, next); setOnline(true); setOfflineSession(false); return true; }
    catch { setRecords(getCachedRecords(currentUser.id)); setOnline(false); return false; }
  }, [currentUser]);

  const reloadRecords = useCallback(async () => {
    if (tabRef.current === 'history' || tabRef.current === 'trends') await loadRecords();
    else await loadRecordsToday();
  }, [loadRecords, loadRecordsToday]);

  const loadProfile = useCallback(async () => {
    try { const next = await api.profile(); setProfile(next); cacheProfile(next); return true; }
    catch { return false; }
  }, []);

  const loadCapabilities = useCallback(async () => {
    try { setCapabilities(await api.capabilities()); }
    catch { setCapabilities(emptyCapabilities); }
  }, []);

  const loadCareItems = useCallback(async () => { try { setCareItems(await api.careItems()); return true; } catch { return false; } }, []);
  const loadDeletedRecords = useCallback(async () => { if (!canManage(currentUser)) return; try { setDeletedRecords(await api.deletedRecords()); } catch { setDeletedRecords([]); } }, [currentUser]);
  const loadGrowthRecords = useCallback(async () => { try { setGrowthRecords(await api.growthRecords()); return true; } catch { return false; } }, []);
  const loadDeletedGrowthRecords = useCallback(async () => { if (!canManage(currentUser)) return; try { setDeletedGrowthRecords(await api.deletedGrowthRecords()); } catch { setDeletedGrowthRecords([]); } }, [currentUser]);
  const loadVaccineRecords = useCallback(async () => { try { const next = await api.vaccineRecords(); setVaccineRecords(next); setVaccineRecordsReady(true); return true; } catch { return false; } }, []);
  const loadVaccineCatalog = useCallback(async () => { try { setVaccineCatalog(await api.vaccineCatalog()); return true; } catch { return false; } }, []);
  const loadPushStatus = useCallback(async () => { try { setPushStatus(await api.pushStatus()); } catch { setPushStatus(null); } }, []);
  const testMorningDigest = useCallback(async () => { const r = await api.testMorningDigestPush(); await loadPushStatus(); return r; }, [loadPushStatus]);
  const testFeedingGap = useCallback(async (level: 'level1' | 'level2') => { const r = await api.testFeedingGapPush(level); await loadPushStatus(); return r; }, [loadPushStatus]);
  const testCareItem = useCallback(async () => { const r = await api.testCareItemPush(); await loadPushStatus(); return r; }, [loadPushStatus]);
  const savePush = useCallback(async (data: { enabled?: boolean; pushplusToken?: string; pushplusTopic?: string; morningDigestEnabled?: boolean; morningDigestTime?: string; feedingGapEnabled?: boolean; feedingGapLevel1Minutes?: number; feedingGapLevel2Minutes?: number; careItemEnabled?: boolean }) => {
    const next = await api.savePushSettings(data);
    setPushStatus(next);
    return next;
  }, []);
  const refreshSession = useCallback(async () => { try { const next = await api.session(); if (!next.authenticated || !next.user) return; setCurrentUser(current => { if (current?.id === next.user!.id && current.role === next.user!.role) return current; rememberUser(next.user!); return next.user; }); } catch { /* keep current session while offline */ } }, []);

  const refreshAll = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true; setRefreshing(true);
    try {
      const planRefresh = Promise.all([loadRecords(), loadProfile(), loadCareItems(), loadGrowthRecords(), loadVaccineRecords(), loadVaccineCatalog()])
        .then(results => setTodayPlanStatus(results[0] ? 'ready' : 'error'));
      await Promise.all([refreshSession(), loadCapabilities(), loadDeletedRecords(), loadDeletedGrowthRecords(), loadPushStatus(), planRefresh]);
    }
    finally { refreshingRef.current = false; setRefreshing(false); }
  }, [loadCapabilities, loadCareItems, loadDeletedGrowthRecords, loadDeletedRecords, loadGrowthRecords, loadProfile, loadPushStatus, loadRecords, loadVaccineCatalog, loadVaccineRecords, refreshSession]);

  const refreshRecords = useCallback(async () => {
    if (!currentUser || refreshingRef.current) return;
    refreshingRef.current = true; setRefreshing(true);
    try {
      if (canManage(currentUser)) await Promise.all([reloadRecords(), loadDeletedRecords()]);
      else await reloadRecords();
    }
    finally { refreshingRef.current = false; setRefreshing(false); }
  }, [currentUser, reloadRecords, loadDeletedRecords]);

  const refreshProfile = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true; setRefreshing(true);
    try { await loadProfile(); }
    finally { refreshingRef.current = false; setRefreshing(false); }
  }, [loadProfile]);

  const syncOutbox = useCallback(async () => {
    if (!currentUser) return;
    const queue = getOutbox(currentUser.id); const remaining = [...queue]; let discarded = 0;
    for (const action of queue) {
      try {
        if (action.action === 'create' && action.payload) await api.createRecord(action.payload);
        if (action.action === 'update' && action.payload && action.recordId) await api.updateRecord(action.recordId, action.payload);
        if (action.action === 'delete' && action.recordId) await api.deleteRecord(action.recordId);
        if (action.action === 'restore' && action.recordId) await api.restoreRecord(action.recordId);
        remaining.shift(); setOutbox(currentUser.id, remaining); setPendingCount(remaining.length);
      } catch (error) {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401) { remaining.shift(); setOutbox(currentUser.id, remaining); discarded += 1; continue; }
        break;
      }
    }
    if (queue.length && !remaining.length) { setToast({ message: discarded ? `${discarded} 条离线操作因冲突未同步` : '离线记录已同步' }); await Promise.all([reloadRecords(), loadDeletedRecords()]); }
  }, [currentUser, reloadRecords]);

  useEffect(() => {
    api.session().then(value => { setAuthenticated(value.authenticated); setCurrentUser(value.user); if (value.user) { rememberUser(value.user); setRecords(getCachedRecords(value.user.id)); } })
      .catch(() => { const remembered = getRememberedUser(); if (remembered) { setCurrentUser(remembered); setAuthenticated(true); setOfflineSession(true); setOnline(false); setRecords(getCachedRecords(remembered.id)); setPendingCount(getOutbox(remembered.id).length); } else { setAuthenticated(false); setCurrentUser(null); } });
  }, []);

  useEffect(() => {
    try { localStorage.setItem('babycare-theme', theme); } catch { /* ignore */ }
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (mql.matches ? 'dark' : 'light') : theme;
      document.documentElement.setAttribute('data-theme', resolved);
    };
    apply();
    if (theme === 'system') {
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    }
    return undefined;
  }, [theme]);

  useEffect(() => {
    if (!authenticated || !currentUser) return;
    setPendingCount(getOutbox(currentUser.id).length);
    setTodayPlanStatus('loading');
    loadCapabilities(); loadDeletedGrowthRecords(); loadPushStatus();
    const recordsLoad = loadRecordsToday();
    Promise.all([recordsLoad, loadProfile(), loadCareItems(), loadGrowthRecords(), loadVaccineRecords(), loadVaccineCatalog()])
      .then(results => setTodayPlanStatus(results[0] ? 'ready' : 'error'));
    recordsLoad.then(() => { if (navigator.onLine) syncOutbox(); });
  }, [authenticated, currentUser, loadCapabilities, loadCareItems, loadDeletedGrowthRecords, loadGrowthRecords, loadProfile, loadPushStatus, loadRecordsToday, loadVaccineCatalog, loadVaccineRecords, syncOutbox]);

  useEffect(() => {
    if (!vaccineRecordsReady || !window.BabyCareNative?.syncVaccineReminders) return;
    syncNativeVaccineReminders(vaccineRecords
      .filter(record => Boolean(record.appointmentOn) && !record.administeredOn && !record.deletedAt)
      .map(record => ({
        id: record.id,
        vaccineName: record.vaccineName,
        dose: record.dose,
        appointmentOn: record.appointmentOn!,
        appointmentTime: record.appointmentTime || ''
      })));
  }, [vaccineRecords, vaccineRecordsReady]);

  useEffect(() => {
    const onOnline = () => { setOnline(true); syncOutbox(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [syncOutbox]);

  useEffect(() => {
    if (!authenticated || !currentUser) return;
    if (tab === 'history' || tab === 'trends') void loadRecords();
  }, [authenticated, currentUser, tab, loadRecords]);

  useEffect(() => {
    if (!authenticated || !currentUser) return;
    let eventTimer: number | null = null;
    const pendingScope: { value: ChangeScope } = { value: 'all' };
    const source = typeof EventSource === 'undefined' ? null : new EventSource('/api/events');
    const scheduleRefresh = (scope: ChangeScope) => {
      pendingScope.value = scope;
      if (eventTimer) clearTimeout(eventTimer);
      eventTimer = window.setTimeout(() => {
        const target = pendingScope.value;
        if (target === 'records') void refreshRecords();
        else if (target === 'profile') void refreshProfile();
        else void refreshAll();
      }, 180);
    };
    if (source) {
      source.onopen = () => setOnline(true);
      source.onmessage = (event) => {
        let scope: ChangeScope = 'all';
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && (parsed.scope === 'records' || parsed.scope === 'profile' || parsed.scope === 'all')) scope = parsed.scope;
        }
        catch { /* 数据格式异常时退化为全量刷新 */ }
        scheduleRefresh(scope);
      };
    }
    const pollTimer = window.setInterval(() => {
      if (!source || source.readyState !== EventSource.OPEN) void refreshAll();
    }, 30_000);
    const visibility = () => { if (document.visibilityState === 'visible') scheduleRefresh('all'); };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      if (eventTimer) clearTimeout(eventTimer);
      clearInterval(pollTimer); source?.close(); document.removeEventListener('visibilitychange', visibility);
    };
  }, [authenticated, currentUser, refreshAll, refreshRecords, refreshProfile]);

  async function saveOne(input: DraftRecord) {
    if (!currentUser) throw new Error('请先登录');
    const value = { ...input, id: input.id || createUuid() };
    try { value.id && records.some(item => item.id === value.id) ? await api.updateRecord(value.id, value) : await api.createRecord(value); await reloadRecords(); setToast({ message: '记录已保存' }); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      const previous = records.find(item => item.id === value.id); const optimistic = optimisticRecord(value, currentUser, previous);
      queueAction(currentUser.id, { action: previous ? 'update' : 'create', recordId: previous?.id, payload: value });
      setPendingCount(getOutbox(currentUser.id).length); updateLocalRecords(currentUser.id, items => [optimistic, ...items.filter(item => item.id !== optimistic.id)]); setOnline(false); setToast({ message: '已暂存，恢复连接后自动同步' });
    }
  }

  async function recordSupplement(supplement: Supplement) {
    try { await saveOne({ ...blankDraft('supplement'), supplement }); }
    catch (error) {
      if (error instanceof ApiError && error.code === 'DUPLICATE_SUPPLEMENT') { const existing = (error.details as { existing?: CareRecord })?.existing; setToast({ message: existing ? `${supplement} 已由${auditNames[existing.createdBy]}在 ${new Date(existing.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} 记录` : `${supplement} 今日已经记录` }); await reloadRecords(); return; }
      setToast({ message: error instanceof Error ? error.message : '用药记录失败' });
    }
  }

  async function undoDelete(record: CareRecord) {
    if (!currentUser || !canManage(currentUser)) return;
    await restoreDeleted(record);
  }

  async function remove(record: CareRecord) {
    if (!currentUser || !canManage(currentUser) || !await confirmAction({ title: `删除“${summary(record)}”？`, description: '记录会移到已删除列表，可以随后恢复。', confirmLabel: '删除记录', danger: true })) return;
    try { await api.deleteRecord(record.id); updateLocalRecords(currentUser.id, items => items.filter(item => item.id !== record.id)); await loadDeletedRecords(); setToast({ message: '记录已移到已删除', actionLabel: '撤销', onAction: () => undoDelete(record) }); }
    catch (error) {
      if (error instanceof ApiError) { setToast({ message: error.message }); return; }
      queueAction(currentUser.id, { action: 'delete', recordId: record.id });
      updateLocalRecords(currentUser.id, items => items.filter(item => item.id !== record.id));
      setPendingCount(getOutbox(currentUser.id).length); setOnline(false);
      setToast({ message: '删除已暂存，联网后自动同步', actionLabel: '撤销', onAction: () => undoDelete(record) });
    }
  }

  async function restoreDeleted(record: CareRecord) {
    if (!currentUser) return;
    try { await api.restoreRecord(record.id); await Promise.all([reloadRecords(), loadDeletedRecords()]); setToast({ message: '记录已恢复' }); }
    catch (error) {
      if (error instanceof ApiError) { setToast({ message: error.message }); return; }
      queueAction(currentUser.id, { action: 'restore', recordId: record.id });
      updateLocalRecords(currentUser.id, items => items.some(item => item.id === record.id) ? items : [record, ...items]);
      setDeletedRecords(items => items.filter(item => item.id !== record.id));
      setPendingCount(getOutbox(currentUser.id).length); setOnline(false);
      setToast({ message: '恢复已暂存，联网后自动同步' });
    }
  }
  async function purgeDeleted(record: CareRecord) { if (!await confirmAction({ title: `彻底删除“${summary(record)}”？`, description: '删除后无法恢复。', confirmLabel: '彻底删除', danger: true })) return; try { await api.purgeRecord(record.id); await loadDeletedRecords(); setToast({ message: '记录已彻底删除' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '彻底删除失败' }); } }

  async function saveGrowth(value: DraftGrowthRecord) {
    try {
      const previous = value.id ? growthRecords.find(item => item.id === value.id) : null;
      const changed = !previous || previous.heightCm !== value.heightCm || previous.weightKg !== value.weightKg || previous.measuredOn !== value.measuredOn;
      const saved = value.id ? await api.updateGrowthRecord(value.id, value) : await api.createGrowthRecord(value);
      await loadGrowthRecords();
      setToast({ message: '成长记录已保存' });
      if (changed && canManage(currentUser) && capabilities.aiEnabled) void autoEvaluateGrowth(saved.id);
    }
    catch (error) { if (error instanceof ApiError && error.code === 'DUPLICATE_GROWTH_DAY') { const existing = (error.details as { existing?: GrowthRecord })?.existing; if (existing) setGrowthEditor(existing); } throw error; }
  }
  async function autoEvaluateGrowth(recordId: string) {
    try { await api.generateGrowthEvaluation(recordId); await loadGrowthRecords(); setToast({ message: '生长 AI 评价已生成，可在档案查看' }); }
    catch { /* AI 未配置或月龄超范围等情况静默跳过，可在档案页手动重试 */ }
  }
  async function removeGrowth(record: GrowthRecord) { if (!await confirmAction({ title: '删除这条成长记录？', description: '记录会移到档案内的已删除列表，可以随后恢复。', confirmLabel: '删除记录', danger: true })) return; try { await api.deleteGrowthRecord(record.id); await Promise.all([loadGrowthRecords(), loadDeletedGrowthRecords()]); setToast({ message: '成长记录已移到已删除' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '删除失败' }); } }
  async function restoreGrowth(record: GrowthRecord) { try { await api.restoreGrowthRecord(record.id); await Promise.all([loadGrowthRecords(), loadDeletedGrowthRecords()]); setToast({ message: '成长记录已恢复' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '恢复失败' }); } }
  async function purgeGrowth(record: GrowthRecord) { if (!await confirmAction({ title: '彻底删除这条成长记录？', description: '删除后无法恢复。', confirmLabel: '彻底删除', danger: true })) return; try { await api.purgeGrowthRecord(record.id); await loadDeletedGrowthRecords(); setToast({ message: '成长记录已彻底删除' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '彻底删除失败' }); } }

  async function saveVaccine(value: DraftVaccineRecord) {
    try { value.id ? await api.updateVaccineRecord(value.id, value) : await api.createVaccineRecord(value); await loadVaccineRecords(); setToast({ message: value.administeredOn ? '接种记录已保存' : value.appointmentOn ? '门诊预约已保存' : '预约已取消' }); }
    catch (error) { if (error instanceof ApiError && error.code === 'DUPLICATE_VACCINE_RECORD') throw new Error('这针疫苗已经记录，可以直接修改已有记录'); throw error; }
  }
  async function removeVaccine(record: VaccineRecord) { if (!await confirmAction({ title: `删除“${record.vaccineName} · 第${record.dose}剂”？`, description: '删除后无法恢复，确定删除这条接种记录吗？', confirmLabel: '确认删除', danger: true })) return; try { await api.deleteVaccineRecord(record.id); await loadVaccineRecords(); setToast({ message: '疫苗记录已删除' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '删除失败' }); } }
  async function cancelVaccineAppointment(item: VaccinePlanItem) { const record = item.record; if (!record?.appointmentOn || !await confirmAction({ title: `取消“${item.vaccineName} · 第${item.dose}剂”的预约？`, description: item.hasSuggestedDate ? '仅清除门诊预约时间，系统建议接种日期仍会保留。' : '这项门诊预约和对应提醒将一起移除。', confirmLabel: '取消预约', danger: true })) return; try { if (item.hasSuggestedDate) await api.updateVaccineRecord(record.id, { id: record.id, vaccineName: record.vaccineName, category: record.category, dose: record.dose, plannedOn: record.plannedOn, appointmentOn: null, appointmentTime: null, administeredOn: record.administeredOn, note: record.note }); else await api.deleteVaccineRecord(record.id); await loadVaccineRecords(); setToast({ message: '门诊预约已取消' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '取消预约失败' }); } }
  function openVaccines() { setHistoryMode('vaccine'); setTab('history'); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  const todayRecords = useMemo(() => records.filter(r => isoDay(new Date(r.occurredAt)) === isoDay(new Date())), [records]);
  const weeklyGrowth = growthRecords.find(record => weekContains(record));
  const isChatPage = tab === 'chat';
  const pull = usePullToRefresh(Boolean(authenticated && currentUser && (tab === 'today' || tab === 'history' || tab === 'archive') && !editor && !growthEditor && !vaccineEditor && !auditRecord), reloadRecords);

  if (authenticated === null) return <main className="loading-page"><img src="/bear-bottle.png" alt="" /><p>正在打开照护记录…</p></main>;
  if (!authenticated || !currentUser) return <Login onSuccess={user => { rememberUser(user); setCurrentUser(user); setRecords(getCachedRecords(user.id)); setAuthenticated(true); setOfflineSession(false); }} />;
  const currentMember = familyMembers.find(member => member.id === currentUser.id)!;
  const connectionLabel = offlineSession ? '离线身份' : !online ? '离线' : pendingCount ? `待同步 ${pendingCount} 条` : refreshing ? '正在更新' : '已连接';
  const pullLabel = pull.phase === 'refreshing' ? '正在更新' : pull.phase === 'done' ? '已更新' : pull.phase === 'ready' ? '松开刷新' : '继续下拉刷新';
  const pullOffset = pull.phase === 'refreshing' || pull.phase === 'done' ? 8 : Math.min(8, pull.distance - 44);
  return <div className="app">{pull.phase !== 'idle' && <div className={`pull-indicator ${pull.phase}`} style={{ transform: `translate(-50%, ${pullOffset}px)` }} role="status"><i aria-hidden="true" />{pullLabel}</div>}{!isChatPage && <div className="top-status"><button className="user-pill" onClick={() => setTab('settings')} aria-label={`打开设置，当前身份${currentUser.name}${roleNames[currentUser.role]}`}><img src={currentMember.icon} alt="" /><b>{currentUser.name}</b><span>{roleNames[currentUser.role]}</span></button>{(!online || pendingCount > 0 || refreshing || offlineSession) && <div className={`network-pill ${online ? refreshing ? 'syncing' : '' : 'offline'}`} role="status" aria-live="polite">{connectionLabel}</div>}</div>}
    {toast && <div className={`toast ${toast.actionLabel ? 'with-action' : ''}`} onAnimationEnd={() => !toast.actionLabel && setToast(null)} role="status"><span>{toast.message}</span>{toast.actionLabel && <button onClick={async () => { await toast.onAction?.(); }}>{toast.actionLabel}</button>}<button className="toast-close" aria-label="关闭提示" onClick={() => setToast(null)}>×</button></div>}
    <main className={`main-content${isChatPage ? ' chat-page-fullscreen' : ''}`}>
      <Suspense fallback={null}>
      {tab === 'today' && <TodayView profile={profile} records={todayRecords} recentRecords={records} vaccineRecords={vaccineRecords} vaccineCatalog={vaccineCatalog} careItems={careItems} todayPlanStatus={todayPlanStatus} capabilities={capabilities} manager={canManage(currentUser)} superadmin={currentUser?.role === 'superadmin'} userId={currentUser.id} allowReportAutoOpen={!editor && !growthEditor && !vaccineEditor && !auditRecord} weeklyGrowth={weeklyGrowth} onAddGrowth={() => setGrowthEditor('new')} onAdd={type => setEditor(blankDraft(type))} online={online} onOpenSettings={() => setTab('settings')} onCompleteVaccine={item => setVaccineEditor({ mode: 'complete', item })} onAppointmentVaccine={item => setVaccineEditor({ mode: 'appointment', item })} onSupplement={recordSupplement} onEdit={setEditor} onDelete={remove} onAudit={setAuditRecord} />}
      {tab === 'history' && <HistoryView records={records} deletedRecords={deletedRecords} vaccineRecords={vaccineRecords} vaccineCatalog={vaccineCatalog} profile={profile} historyMode={historyMode} setHistoryMode={setHistoryMode} careItems={careItems} manager={canManage(currentUser)} selected={selectedDate} setSelected={setSelectedDate} onEdit={setEditor} onDelete={remove} onAudit={setAuditRecord} onLoadDeleted={loadDeletedRecords} onRestore={restoreDeleted} onPurge={purgeDeleted} onOpenVaccineEditor={setVaccineEditor} onCancelVaccineAppointment={item => void cancelVaccineAppointment(item)} onDeleteVaccine={record => void removeVaccine(record)} />}
      {tab === 'chat' && <ChatView user={currentUser} capabilities={capabilities} online={online} onBack={() => setTab('today')} />}
      {tab === 'trends' && <TrendsView records={records} />}
      {tab === 'archive' && <ArchiveView profile={profile} growthRecords={growthRecords} deletedGrowthRecords={deletedGrowthRecords} vaccineRecords={vaccineRecords} vaccineCatalog={vaccineCatalog} user={currentUser} onOpenVaccines={openVaccines} onEditGrowth={setGrowthEditor} onAddGrowth={() => setGrowthEditor('new')} onDeleteGrowth={removeGrowth} onRestoreGrowth={restoreGrowth} onPurgeGrowth={purgeGrowth} onProfileSaved={value => { setProfile(value); setToast({ message: '宝宝资料已保存' }); }} />}
      {tab === 'settings' && <SettingsView profile={profile} careItems={careItems} vaccineCatalog={vaccineCatalog} capabilities={capabilities} user={currentUser} pushStatus={pushStatus} theme={theme} onThemeChange={setTheme} onProfileSaved={value => { setProfile(value); setToast({ message: '宝宝资料已保存' }); }} onVaccineCatalogChanged={async () => { await loadVaccineCatalog(); }} onCapabilitiesChanged={loadCapabilities} onCareItemsChanged={async () => { await loadCareItems(); }} onImported={refreshAll} onLogout={async () => { try { await api.logout(); } catch { /* local logout still succeeds */ } clearRememberedUser(); setAuthenticated(false); setCurrentUser(null); setRecords([]); setDeletedRecords([]); setGrowthRecords([]); setDeletedGrowthRecords([]); setVaccineRecords([]); setVaccineRecordsReady(false); setVaccineCatalog([]); setPushStatus(null); }} onRefreshPush={loadPushStatus} onTestMorning={testMorningDigest} onTestFeedingGap={testFeedingGap} onTestCareItem={testCareItem} onSavePush={savePush} />}
      </Suspense>
    </main>
    {!isChatPage && <nav className="app-nav" aria-label="主要导航">
      {([
        ['today', '/icons/nav-today.png', '今日'],
        ['history', '/icons/nav-records.png', '记录'],
        ['chat', '/icons/nav-chat.png', 'AI 助手'],
        ['trends', '/icons/nav-trends.png', '趋势'],
        ['archive', '/icons/nav-archive.png', '档案']
      ] as [Tab, string, string][]).map(([value, icon, label]) => (
        <button key={value} aria-current={tab === value ? 'page' : undefined} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>
          <img className={value === 'history' ? 'nav-icon-records' : value === 'archive' ? 'nav-icon-archive' : value === 'chat' ? 'nav-icon-chat' : undefined} src={icon} alt="" />
          <b>{label}</b>
        </button>
      ))}
    </nav>}
    {tab === 'today' && !isChatPage && <button type="button" className="floating-add" onClick={() => setEditor(blankDraft())} aria-label="添加照护记录"><span aria-hidden="true">＋</span><b>记录</b></button>}
    {editor && <RecordEditor initial={editor} careItems={careItems} onClose={() => setEditor(null)} onSave={saveOne} />}{growthEditor && <GrowthEditor key={growthEditor === 'new' ? 'new' : growthEditor.id} profile={profile} records={growthRecords} initial={growthEditor === 'new' ? undefined : growthEditor} onClose={() => setGrowthEditor(null)} onSave={saveGrowth} />}{vaccineEditor && <VaccineEditor state={vaccineEditor} profile={profile} catalog={vaccineCatalog} records={vaccineRecords} onClose={() => setVaccineEditor(null)} onSave={saveVaccine} />}{auditRecord && <AuditDialog record={auditRecord} onClose={() => setAuditRecord(null)} />}
  </div>;
}
