import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { addDays, calculateAge, isoDay, startOfWeek, toLocalInput } from './date';
import { createUuid } from './id';
import { cacheProfile, cacheRecords, clearRememberedUser, getCachedProfile, getCachedRecords, getOutbox, getRememberedUser, queueAction, rememberUser, setOutbox } from './offline';
import type { AiSettingsPublic, AuditEntry, AuditIdentity, BabySex, BowelSize, Capabilities, CareItem, CareRecord, DraftGrowthRecord, DraftRecord, DraftVaccineCatalogItem, DraftVaccineRecord, FamilyId, FamilyMemberPermission, GrowthRecord, Profile, RecordType, ServerBackupFile, ServerBackupStatus, SessionUser, Supplement, UserRole, VaccineCatalogItem, VaccineRecord } from './types';
import { VaccineArchiveSummary, VaccineEditor, VaccineHistory, VaccineReminderCard, type VaccineEditorState } from './VaccineViews';
import type { VaccinePlanItem } from './vaccines';
import { ActionMenu, confirmAction, EmptyState, SegmentedControl, Switch, useDialogFocus } from './ui';

type Tab = 'today' | 'history' | 'trends' | 'archive' | 'settings';
type TrendMode = 'seven' | 'month' | 'total';
type ToastState = { message: string; actionLabel?: string; onAction?: () => void | Promise<void> };

const typeNames: Record<RecordType, string> = { feeding: '喂奶', supplement: '用药', bowel: '排便', note: '其他情况' };
const recordEditorTypeOrder: RecordType[] = ['feeding', 'bowel', 'supplement', 'note'];
const typeIcons: Record<RecordType, string> = { feeding: '/icons/quick-feeding.png', supplement: '/icons/record-supplement.png', bowel: '/icons/quick-bowel.png', note: '/icons/quick-note.png' };
const familyMembers: { id: FamilyId; name: string; role: string; icon: string }[] = [
  { id: 'father', name: '爸爸', role: '超管', icon: '/icons/father.png' },
  { id: 'mother', name: '妈妈', role: '管理员', icon: '/icons/mother.png' },
  { id: 'grandfather', name: '爷爷', role: '普通用户', icon: '/icons/grandfather.png' },
  { id: 'grandmother', name: '奶奶', role: '普通用户', icon: '/icons/grandmother.png' }
];
const auditNames: Record<AuditIdentity, string> = { father: '爸爸', mother: '妈妈', grandfather: '爷爷', grandmother: '奶奶', legacy: '历史数据' };
const auditActions: Record<AuditEntry['action'], string> = { create: '创建记录', update: '修改记录', delete: '删除记录', restore: '恢复记录', import: '从备份导入' };
const emptyCapabilities: Capabilities = { aiEnabled: false, aiModel: null };
const roleNames: Record<UserRole, string> = { superadmin: '超管', admin: '管理员', member: '普通用户' };
const sexLabels: Record<BabySex, string> = { male: '男宝宝', female: '女宝宝', unspecified: '性别未设置' };
const canManage = (user: SessionUser | null) => user?.role === 'superadmin' || user?.role === 'admin';
const careItemIcon = (value: CareRecord | DraftRecord, items: CareItem[]) => value.type === 'supplement' && items.find(item => item.name === value.supplement)?.icon === 'massage' ? '/icons/record-massage.png' : typeIcons[value.type];
const selectableCareItems = (items: CareItem[], current?: string | null) => [...new Set([...items.filter(item => item.active).map(item => item.name), ...(current ? [current] : [])])];
const weekContains = (record: GrowthRecord, date = new Date()) => {
  const from = isoDay(startOfWeek(date)); const to = isoDay(addDays(startOfWeek(date), 7));
  return record.measuredOn >= from && record.measuredOn < to;
};

const blankDraft = (type: RecordType = 'feeding'): DraftRecord => ({ id: createUuid(), type, occurredAt: new Date().toISOString(), breastMilkMl: null, formulaMl: null });

function summary(record: CareRecord | DraftRecord) {
  if (record.type === 'feeding') return [record.breastMilkMl ? `母乳 ${record.breastMilkMl}ml` : '', record.formulaMl ? `奶粉 ${record.formulaMl}ml` : ''].filter(Boolean).join('，') || '待补充奶量';
  if (record.type === 'supplement') return record.supplement === '推拿' ? '推拿已完成' : `${record.supplement || '用药项目'}已服用`;
  if (record.type === 'bowel') return `排便量：${record.bowelSize || '中'}`;
  return record.note || '其他情况';
}

function FeedingSummary({ record }: { record: CareRecord | DraftRecord }) {
  if (record.type !== 'feeding') return <>{summary(record)}</>;
  const parts = [record.breastMilkMl ? `母乳 ${record.breastMilkMl}ml` : '', record.formulaMl ? `奶粉 ${record.formulaMl}ml` : ''].filter(Boolean);
  return <span className="feeding-summary">{parts.length ? parts.map(part => <span key={part}>{part}</span>) : <span>待补充奶量</span>}</span>;
}

function draftIssue(value: DraftRecord) {
  if (value.type === 'feeding' && !value.breastMilkMl && !value.formulaMl) return '请补充母乳量或奶粉量';
  if (value.type === 'supplement' && !value.supplement) return '请选择用药或照护项目';
  if (value.type === 'bowel' && !value.bowelSize) return '请选择排便量';
  if (value.type === 'note' && !value.note?.trim()) return '请填写情况说明';
  return '';
}

function optimisticRecord(value: DraftRecord, user: SessionUser, previous?: CareRecord): CareRecord {
  const now = new Date().toISOString();
  return {
    id: value.id || createUuid(), type: value.type, occurredAt: value.occurredAt,
    breastMilkMl: value.type === 'feeding' ? value.breastMilkMl ?? null : null,
    formulaMl: value.type === 'feeding' ? value.formulaMl ?? null : null,
    supplement: value.type === 'supplement' ? value.supplement ?? null : null,
    bowelSize: value.type === 'bowel' ? value.bowelSize ?? null : null,
    note: value.note ?? null,
    createdAt: previous?.createdAt || now, updatedAt: now,
    createdBy: previous?.createdBy || user.id, updatedBy: user.id,
    deletedAt: null, deletedBy: null
  };
}

type PullPhase = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'done';

function usePullToRefresh(enabled: boolean, onRefresh: () => Promise<void>) {
  const [distance, setDistance] = useState(0);
  const [phase, setPhase] = useState<PullPhase>('idle');
  const distanceRef = useRef(0);
  const busyRef = useRef(false);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) { busyRef.current = false; distanceRef.current = 0; setDistance(0); setPhase('idle'); return; }
    let startY: number | null = null;
    let doneTimer: number | null = null;
    const updateDistance = (next: number) => { distanceRef.current = next; setDistance(next); setPhase(next >= 64 ? 'ready' : next > 4 ? 'pulling' : 'idle'); };
    const touchStart = (event: TouchEvent) => {
      if (busyRef.current || window.scrollY > 0 || event.touches.length !== 1) return;
      startY = event.touches[0]?.clientY ?? null;
    };
    const touchMove = (event: TouchEvent) => {
      if (startY === null || busyRef.current) return;
      const currentY = event.touches[0]?.clientY ?? startY;
      const next = Math.min(92, Math.max(0, (currentY - startY) * .52));
      if (next > 4) event.preventDefault();
      updateDistance(next);
    };
    const touchEnd = async () => {
      startY = null;
      if (busyRef.current) return;
      if (distanceRef.current < 64) { updateDistance(0); return; }
      busyRef.current = true; setPhase('refreshing'); setDistance(52);
      try { await refreshRef.current(); setPhase('done'); }
      finally {
        doneTimer = window.setTimeout(() => { distanceRef.current = 0; setDistance(0); setPhase('idle'); busyRef.current = false; }, 700);
      }
    };
    window.addEventListener('touchstart', touchStart, { passive: true });
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', touchEnd, { passive: true });
    window.addEventListener('touchcancel', touchEnd, { passive: true });
    return () => {
      if (doneTimer) clearTimeout(doneTimer);
      window.removeEventListener('touchstart', touchStart);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', touchEnd);
      window.removeEventListener('touchcancel', touchEnd);
    };
  }, [enabled]);
  return { distance, phase };
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
  return Boolean(value.breastMilkMl || value.formulaMl || value.supplement || value.bowelSize || value.note?.trim());
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
    event.preventDefault(); setBusy(true); setError('');
    try { await onSave(value); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败'); setBusy(false); }
  }
  return <div className="modal-layer" onMouseDown={e => e.target === e.currentTarget && requestClose()}>
    <section ref={dialogRef} className="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <header className="editor-head"><h2 id="editor-title">{initial.id && 'createdAt' in initial ? '修改记录' : '添加记录'}</h2><button type="button" className="close-btn" onClick={requestClose} aria-label="关闭">×</button></header>
      <SegmentedControl className="type-switch" label="记录类型" value={value.type} options={recordEditorTypeOrder.map(type => ({ value: type, label: typeNames[type] }))} onChange={type => void switchType(type)} />
      <form className="editor-form" onSubmit={submit}>
        <label>记录时间<input type="datetime-local" max={toLocalInput(new Date(Date.now() + 10 * 60 * 1000).toISOString())} value={toLocalInput(value.occurredAt)} onChange={e => setValue({ ...value, occurredAt: new Date(e.target.value).toISOString() })} required /></label>
        {value.type === 'feeding' && <div className="input-pair"><label>母乳量 <span>ml</span><input inputMode="numeric" type="number" min="0" max="500" placeholder="例如 90" value={value.breastMilkMl ?? ''} onChange={e => setValue({ ...value, breastMilkMl: e.target.value ? Number(e.target.value) : null })} /></label><label>奶粉量 <span>ml</span><input inputMode="numeric" type="number" min="0" max="500" placeholder="例如 120" value={value.formulaMl ?? ''} onChange={e => setValue({ ...value, formulaMl: e.target.value ? Number(e.target.value) : null })} /></label></div>}
        {value.type === 'supplement' && <ChoiceField label="选择用药或照护项目" values={selectableCareItems(careItems, value.supplement)} selected={value.supplement} onSelect={supplement => setValue({ ...value, supplement })} />}
        {value.type === 'bowel' && <ChoiceField label="排便量" values={['大', '中', '小'] as BowelSize[]} selected={value.bowelSize} onSelect={bowelSize => setValue({ ...value, bowelSize })} />}
        {(value.type === 'note' || value.type === 'feeding' || value.type === 'bowel') && <label>{value.type === 'note' ? '情况说明' : '补充说明（选填）'}<textarea rows={3} maxLength={200} placeholder={value.type === 'note' ? '例如：今天有点吐奶' : '可留空'} value={value.note ?? ''} onChange={e => setValue({ ...value, note: e.target.value })} /></label>}
        {error && <p className="error-text" role="alert">{error}</p>}
        <footer className="editor-actions"><button type="button" className="btn secondary" onClick={requestClose}>取消</button><button className="btn primary" disabled={busy}>{busy ? '保存中…' : '确认保存'}</button></footer>
      </form>
    </section>
  </div>;
}

function ChoiceField<T extends string>({ label, values, selected, onSelect, getLabel = value => value }: { label: string; values: T[]; selected?: T | null; onSelect(value: T): void; getLabel?(value: T): string }) {
  return <fieldset><legend>{label}</legend><div className="choice-group">{values.map(value => <button type="button" key={value} aria-pressed={selected === value} className={selected === value ? 'selected' : ''} onClick={() => onSelect(value)}>{selected === value && '✓ '}{getLabel(value)}</button>)}</div></fieldset>;
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

function Timeline({ records, careItems, manager, emptyText = '这一天还没有记录', onEdit, onDelete, onAudit }: { records: CareRecord[]; careItems: CareItem[]; manager: boolean; emptyText?: string; onEdit(record: CareRecord): void; onDelete(record: CareRecord): void; onAudit(record: CareRecord): void }) {
  if (!records.length) return <EmptyState title={emptyText} description="记录后会按时间排列在这里。" image={emptyText.includes('找到') ? '/illustrations/empty-search.webp' : '/illustrations/empty-records.webp'} />;
  return <div className="timeline">{records.map(record => { const created = auditNames[record.createdBy || 'legacy']; const updated = auditNames[record.updatedBy || record.createdBy || 'legacy']; const changed = record.updatedBy && record.updatedBy !== record.createdBy; const items = [...(manager ? [{ label: '查看操作记录', onSelect: () => onAudit(record) }] : []), { label: '修改记录', onSelect: () => onEdit(record) }, ...(manager ? [{ label: '删除记录', danger: true, onSelect: () => onDelete(record) }] : [])]; return <article className={`timeline-item ${record.type}`} key={record.id}><div className="time-col"><time>{new Date(record.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</time><i /></div><img className="record-mark" src={careItemIcon(record, careItems)} alt="" /><div className="record-copy"><small>{typeNames[record.type]}</small><strong><FeedingSummary record={record} /></strong>{record.note && record.type !== 'note' && <p>{record.note}</p>}<em>{created === '历史数据' ? '历史数据' : `${created}录入`}{changed ? ` · ${updated}修改` : ''}</em></div><ActionMenu label={`${summary(record)}的操作菜单`} items={items} /></article>; })}</div>;
}

function DailyReport({ capabilities, online, onOpenSettings, superadmin }: { capabilities: Capabilities; online: boolean; onOpenSettings(): void; superadmin: boolean }) {
  const [data, setData] = useState<{ date: string; summary: string; suggestions: string[]; model: string; generatedAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const load = useCallback(() => {
    if (!online) { setLoading(false); return; }
    setLoading(true); setError('');
    api.dailyReport().then(result => { if (result.exists) setData({ date: result.date, summary: result.summary!, suggestions: result.suggestions!, model: result.model!, generatedAt: result.generatedAt! }); else setData(null); })
      .catch(err => setError(err instanceof Error ? err.message : '无法读取日报')).finally(() => setLoading(false));
  }, [online]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (data) setDismissed(localStorage.getItem('babycare:dailyReportDismissed') === data.date); }, [data]);
  async function generate() {
    setBusy(true); setError('');
    try { const result = await api.generateDailyReport(); setData({ date: result.date, summary: result.summary, suggestions: result.suggestions, model: result.model, generatedAt: result.generatedAt }); }
    catch (err) { setError(err instanceof Error ? err.message : '日报生成失败'); }
    finally { setBusy(false); }
  }
  function closeReport() { if (!data) return; localStorage.setItem('babycare:dailyReportDismissed', data.date); setDismissed(true); }
  function openReport() { localStorage.removeItem('babycare:dailyReportDismissed'); setDismissed(false); }
  const [year, month, day] = data ? data.date.split('-').map(Number) : [0, 0, 0];
  const weekday = data ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${data.date}T00:00:00`).getDay()] : '';
  if (data && dismissed) {
    return (
      <button type="button" className="daily-report collapsed" aria-label="展开昨日日报" onClick={openReport}>
        <span className="dr-collapsed-label">{`昨日：${data.summary}`}</span>
        <span className="dr-collapsed-action">展开</span>
      </button>
    );
  }
  return (
    <section className="daily-report" aria-label="昨日日报">
      <div className="section-title"><p className="kicker">昨日日报</p><div className="dr-head-right">{superadmin && <button type="button" className={`dr-regen${busy ? ' spinning' : ''}`} aria-label="重新生成日报" title="重新生成日报" disabled={busy || !online} onClick={generate}><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" fill="currentColor" /></svg></button>}{data && <button type="button" className="dr-close" aria-label="收起日报" title="收起日报" onClick={closeReport}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}</div></div>
      {loading && <p className="loading-copy">正在读取昨日日报…</p>}
      {!loading && error && <p className="error-text">{error}{superadmin && '，点击右上角重试。'}</p>}
      {!loading && !error && !online && !data && <p className="dr-note">联网后可查看昨日日报。</p>}
      {!loading && !error && online && !capabilities.aiEnabled && (superadmin ? <div className="dr-empty"><p>还没有配置 AI 模型，无法生成日报。</p><button className="btn secondary" onClick={onOpenSettings}>去设置</button></div> : <p className="dr-note">还没有配置 AI 模型，暂不能生成日报。</p>)}
      {!loading && !error && online && capabilities.aiEnabled && !data && <p className="dr-note">{superadmin ? '点击右上角生成昨日日报。' : '今日日报还没准备好，等待超管生成。'}</p>}
      {!loading && !error && data && <>
        <p className="dr-summary">{data.summary}</p>
        {data.suggestions.length > 0 && <ul className="dr-suggestions">{data.suggestions.map((item, index) => <li key={index}>{item}</li>)}</ul>}
        <div className="dr-footer"><small>{`${year}年${month}月${day}日 · ${weekday}${data.generatedAt ? ` · 生成于 ${new Date(data.generatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}`}</small></div>
      </>}
    </section>
  );
}

function WeeklyGrowthPrompt({ onOpen }: { onOpen(): void }) {
  return <section className="weekly-growth-prompt"><div><p className="kicker">本周成长</p><h2>记录身高和体重</h2><p>每周记录一次，成长变化会保存到档案。</p></div><button className="btn primary" onClick={onOpen}>去记录</button></section>;
}

function TodayView({ profile, records, vaccineRecords, vaccineCatalog, vaccineRemindersEnabled, careItems, capabilities, online, onOpenSettings, onOpenVaccines, onCompleteVaccine, onAppointmentVaccine, manager, superadmin, weeklyGrowth, onAddGrowth, onAdd, onSupplement, onEdit, onDelete, onAudit }: { profile: Profile; records: CareRecord[]; vaccineRecords: VaccineRecord[]; vaccineCatalog: VaccineCatalogItem[]; vaccineRemindersEnabled: boolean; careItems: CareItem[]; capabilities: Capabilities; online: boolean; onOpenSettings(): void; onOpenVaccines(): void; onCompleteVaccine(item: VaccinePlanItem): void; onAppointmentVaccine(item: VaccinePlanItem): void; manager: boolean; superadmin: boolean; weeklyGrowth?: GrowthRecord; onAddGrowth(): void; onAdd(type: RecordType): void; onSupplement(value: Supplement): Promise<void>; onEdit(record: CareRecord): void; onDelete(record: CareRecord): void; onAudit(record: CareRecord): void }) {
  const [savingSupplement, setSavingSupplement] = useState<Supplement | null>(null);
  const feed = records.filter(r => r.type === 'feeding'); const breast = feed.reduce((sum, r) => sum + (r.breastMilkMl || 0), 0); const formula = feed.reduce((sum, r) => sum + (r.formulaMl || 0), 0); const done = new Map(records.filter(r => r.type === 'supplement').map(r => [r.supplement, r])); const lastFeed = feed[0];
  async function addSupplement(item: Supplement) { setSavingSupplement(item); try { await onSupplement(item); } finally { setSavingSupplement(null); } }
  return <div className="today-layout"><div className="today-primary">
    <section className="baby-hero"><div><p className="kicker">今日 · {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</p><h1>{profile.name}</h1><p>{calculateAge(profile.birthDate)}{lastFeed ? ` · 上次喂奶 ${new Date(lastFeed.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ' · 今天还未喂奶'}</p></div><img src="/bear-bottle.png" alt="" /></section>
    <section className="metric-band" aria-label="今日概览"><div><span>母乳</span><strong>{breast}</strong><small>ml</small></div><div><span>奶粉</span><strong>{formula}</strong><small>ml</small></div><div><span>喂奶</span><strong>{feed.length}</strong><small>次</small></div><div><span>排便</span><strong>{records.filter(r => r.type === 'bowel').length}</strong><small>次</small></div></section>
    {vaccineRemindersEnabled && <VaccineReminderCard profile={profile} records={vaccineRecords} catalog={vaccineCatalog} onComplete={onCompleteVaccine} onAppointment={onAppointmentVaccine} />}
    {!weeklyGrowth && <WeeklyGrowthPrompt onOpen={onAddGrowth} />}
    <DailyReport capabilities={capabilities} online={online} onOpenSettings={onOpenSettings} superadmin={superadmin} />
    <section className="quick-section"><div className="section-title"><h2>快捷记录</h2></div><div className="quick-grid"><button onClick={() => onAdd('feeding')}><img className="quick-icon" src="/icons/quick-feeding.png" alt="" /><b>记录喂奶</b><small>母乳、奶粉</small></button><button onClick={() => onAdd('bowel')}><img className="quick-icon" src="/icons/quick-bowel.png" alt="" /><b>记录排便</b><small>大、中、小</small></button><button onClick={() => onAdd('note')}><img className="quick-icon" src="/icons/quick-note.png" alt="" /><b>其他情况</b><small>吐奶、状态</small></button></div></section>
    <section className="medicine-card"><h2>今日用药</h2><div className="medicine-actions">{careItems.filter(item => item.active).map(item => { const record = done.get(item.name); return <button key={item.id} className={record ? 'done' : ''} disabled={Boolean(record) || Boolean(savingSupplement)} onClick={() => addSupplement(item.name)}><span>{record ? '✓' : savingSupplement === item.name ? '···' : '+'}</span><b>{item.name}</b><small>{record ? `${auditNames[record.createdBy]} ${new Date(record.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}` : savingSupplement === item.name ? '记录中' : '点按记录'}</small></button>; })}</div></section>
  </div><div className="today-secondary">
    <div className="today-timeline"><div className="section-title"><h2>今天的记录</h2><span>{records.length} 条</span></div><Timeline records={records} careItems={careItems} manager={manager} onEdit={onEdit} onDelete={onDelete} onAudit={onAudit} /></div>
  </div></div>;
}

function HistoryView({ records, deletedRecords, vaccineRecords, vaccineCatalog, deletedVaccineRecords, profile, historyMode, setHistoryMode, careItems, manager, selected, setSelected, onEdit, onDelete, onAudit, onLoadDeleted, onRestore, onPurge, onOpenVaccineEditor, onCancelVaccineAppointment, onDeleteVaccine, onRestoreVaccine, onLoadDeletedVaccines }: { records: CareRecord[]; deletedRecords: CareRecord[]; vaccineRecords: VaccineRecord[]; vaccineCatalog: VaccineCatalogItem[]; deletedVaccineRecords: VaccineRecord[]; profile: Profile; historyMode: 'care' | 'vaccine'; setHistoryMode(value: 'care' | 'vaccine'): void; careItems: CareItem[]; manager: boolean; selected: Date; setSelected(value: Date): void; onEdit(record: CareRecord): void; onDelete(record: CareRecord): void; onAudit(record: CareRecord): void; onLoadDeleted(): Promise<void>; onRestore(record: CareRecord): Promise<void>; onPurge(record: CareRecord): Promise<void>; onOpenVaccineEditor(state: VaccineEditorState): void; onCancelVaccineAppointment(item: VaccinePlanItem): void; onDeleteVaccine(record: VaccineRecord): void; onRestoreVaccine(record: VaccineRecord): void; onLoadDeletedVaccines(): void }) {
  const [query, setQuery] = useState(''); const [typeFilter, setTypeFilter] = useState<'all' | RecordType>('all'); const [actorFilter, setActorFilter] = useState<'all' | FamilyId>('all'); const [view, setView] = useState<'active' | 'deleted'>('active');
  const deletedHistoryPushed = useRef(false);
  useEffect(() => { if (view === 'deleted' && manager) void onLoadDeleted(); }, [manager, onLoadDeleted, view]);
  useEffect(() => { const pop = () => { deletedHistoryPushed.current = false; setView('active'); }; window.addEventListener('popstate', pop); return () => { window.removeEventListener('popstate', pop); if (deletedHistoryPushed.current) window.history.back(); }; }, []);
  function openDeleted() { window.history.pushState({ babycareCareDeleted: true }, ''); deletedHistoryPushed.current = true; setView('deleted'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function closeDeleted() { if (deletedHistoryPushed.current && window.history.state?.babycareCareDeleted) window.history.back(); else { deletedHistoryPushed.current = false; setView('active'); } }
  const days = Array.from({ length: 7 }, (_, index) => addDays(selected, index - 3));
  const filtered = records.filter(record => {
    const dayMatches = query.trim() ? true : isoDay(new Date(record.occurredAt)) === isoDay(selected);
    const queryMatches = !query.trim() || `${typeNames[record.type]} ${summary(record)} ${record.note || ''} ${auditNames[record.createdBy]}`.toLowerCase().includes(query.trim().toLowerCase());
    return dayMatches && queryMatches && (typeFilter === 'all' || record.type === typeFilter) && (actorFilter === 'all' || record.createdBy === actorFilter);
  });
  return <div className="page-stack"><header className="page-head"><h1>历史记录</h1><p>{historyMode === 'care' ? '按日期查看，或搜索全部照护信息。' : '简单记录接种情况，及时查看下一针。'}</p></header>
    <SegmentedControl className="record-view-tabs" label="记录类型" value={historyMode} options={[{ value: 'care', label: '照护记录' }, { value: 'vaccine', label: '疫苗记录' }]} onChange={value => { setHistoryMode(value); if (value === 'care') setView('active'); }} />
    {historyMode === 'vaccine' ? <VaccineHistory profile={profile} records={vaccineRecords} catalog={vaccineCatalog} deletedRecords={deletedVaccineRecords} manager={manager} onOpenEditor={onOpenVaccineEditor} onCancelAppointment={onCancelVaccineAppointment} onDelete={onDeleteVaccine} onRestore={onRestoreVaccine} onLoadDeleted={onLoadDeletedVaccines} /> :
    view === 'deleted' ? <section className="deleted-records"><button className="inline-back" onClick={closeDeleted}>← 返回照护记录</button><div className="section-title"><h2>已删除记录</h2><span>{deletedRecords.length} 条</span></div>{deletedRecords.length ? deletedRecords.map(record => <article className="deleted-record" key={record.id}><img className="record-mark" src={careItemIcon(record, careItems)} alt="" /><div><small>{new Date(record.occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} · {typeNames[record.type]}</small><strong>{summary(record)}</strong><p>{auditNames[record.deletedBy || 'legacy']}删除 · {record.deletedAt ? new Date(record.deletedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : ''}</p></div><div className="deleted-actions"><button className="btn secondary" onClick={() => onRestore(record)}>恢复</button><button className="btn danger-button" onClick={() => onPurge(record)}>彻底删除</button></div></article>) : <EmptyState title="没有已删除记录" description="管理员删除的记录会暂存在这里。" />}</section> : <>
    <section className="calendar-panel"><div className="calendar-nav"><button onClick={() => setSelected(addDays(selected, -7))} aria-label="向前七天">‹</button><strong>{selected.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</strong><button onClick={() => setSelected(addDays(selected, 7))} aria-label="向后七天">›</button></div><div className="week-strip">{days.map(day => <button key={isoDay(day)} aria-pressed={isoDay(day) === isoDay(selected)} className={`${isoDay(day) === isoDay(selected) ? 'selected' : ''} ${isoDay(day) === isoDay(new Date()) ? 'today' : ''}`} onClick={() => setSelected(day)}><span>{day.toLocaleDateString('zh-CN', { weekday: 'short' })}</span><b>{day.getDate()}</b></button>)}</div></section>
    <div className="record-toolbar"><label className="search-field"><span aria-hidden="true">⌕</span><span className="sr-only">搜索全部记录</span><input aria-label="搜索全部记录" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索记录" /></label><label className="filter-field"><span className="sr-only">记录类型</span><select aria-label="记录类型" value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'all' | RecordType)}><option value="all">类型</option>{(Object.keys(typeNames) as RecordType[]).map(type => <option key={type} value={type}>{typeNames[type]}</option>)}</select></label><label className="filter-field"><span className="sr-only">录入人</span><select aria-label="录入人" value={actorFilter} onChange={e => setActorFilter(e.target.value as 'all' | FamilyId)}><option value="all">家人</option>{familyMembers.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div>
    <div className="section-title"><h2>{query.trim() ? '全部搜索结果' : selected.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</h2><div className="section-title-actions"><span>{filtered.length} 条</span>{manager && <button className="text-button" onClick={openDeleted}>已删除</button>}</div></div><Timeline records={filtered} careItems={careItems} manager={manager} emptyText={query.trim() ? '没有找到匹配记录' : undefined} onEdit={onEdit} onDelete={onDelete} onAudit={onAudit} /></>}
  </div>;
}

interface TrendBucket { key: string; label: string; axis: string; breast: number; formula: number; feeds: number; bowel: number; supplements: number }

function summarizeTrendRecords(items: CareRecord[]) {
  return {
    breast: items.reduce((sum, record) => sum + (record.breastMilkMl || 0), 0),
    formula: items.reduce((sum, record) => sum + (record.formulaMl || 0), 0),
    feeds: items.filter(record => record.type === 'feeding').length,
    bowel: items.filter(record => record.type === 'bowel').length,
    supplements: items.filter(record => record.type === 'supplement').length
  };
}

function TrendsView({ records }: { records: CareRecord[] }) {
  const [mode, setMode] = useState<TrendMode>('seven');
  const [selectedMonth, setSelectedMonth] = useState(() => { const value = new Date(); return new Date(value.getFullYear(), value.getMonth(), 1); });
  const now = new Date();
  const todayMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDays = Array.from({ length: 7 }, (_, index) => addDays(now, index - 6));
  const sevenData: TrendBucket[] = sevenDays.map(day => {
    const summary = summarizeTrendRecords(records.filter(record => isoDay(new Date(record.occurredAt)) === isoDay(day)));
    return { key: isoDay(day), label: day.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }), axis: day.toLocaleDateString('zh-CN', { weekday: 'short' }), ...summary };
  });
  const monthYear = selectedMonth.getFullYear(); const monthIndex = selectedMonth.getMonth();
  const monthRecords = records.filter(record => { const date = new Date(record.occurredAt); return date.getFullYear() === monthYear && date.getMonth() === monthIndex; });
  const firstWeek = startOfWeek(new Date(monthYear, monthIndex, 1));
  const lastVisibleDay = selectedMonth.getTime() === todayMonth.getTime() ? now : new Date(monthYear, monthIndex + 1, 0);
  const lastWeek = startOfWeek(lastVisibleDay);
  const weekCount = Math.floor((lastWeek.getTime() - firstWeek.getTime()) / 604800000) + 1;
  const monthData: TrendBucket[] = Array.from({ length: weekCount }, (_, index) => {
    const monday = addDays(firstWeek, index * 7); const nextMonday = addDays(monday, 7); const sunday = addDays(monday, 6);
    const summary = summarizeTrendRecords(records.filter(record => { const date = new Date(record.occurredAt); return date >= monday && date < nextMonday; }));
    const compact = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`;
    return { key: isoDay(monday), label: `${compact(monday)}–${compact(sunday)}`, axis: compact(monday), ...summary };
  });
  const monthKeys = [...new Set(records.map(record => { const date = new Date(record.occurredAt); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }))].sort();
  const totalData: TrendBucket[] = monthKeys.map(key => {
    const [year, month] = key.split('-').map(Number);
    const items = records.filter(record => { const date = new Date(record.occurredAt); return date.getFullYear() === year && date.getMonth() === month - 1; });
    return { key, label: `${year}年${month}月`, axis: `${month}月`, ...summarizeTrendRecords(items) };
  });
  const activeRecords = mode === 'seven' ? records.filter(record => sevenData.some(item => item.key === isoDay(new Date(record.occurredAt)))) : mode === 'month' ? monthRecords : records;
  const activeSummary = summarizeTrendRecords(activeRecords); const totalMilk = activeSummary.breast + activeSummary.formula;
  const activeDays = new Set(activeRecords.filter(record => record.type === 'feeding').map(record => isoDay(new Date(record.occurredAt)))).size;
  const chartData = mode === 'seven' ? sevenData : mode === 'month' ? monthData : totalData.slice(-6);
  const detailData = [...(mode === 'seven' ? sevenData : mode === 'month' ? monthData : totalData)].reverse();
  const maxMilk = Math.max(1, ...chartData.map(item => item.breast + item.formula));
  const chartTitle = mode === 'seven' ? '每日奶量' : mode === 'month' ? '每周奶量' : '最近六个月奶量';
  const totalLabel = mode === 'seven' ? '七日总奶量' : mode === 'month' ? '本月总奶量' : '累计总奶量';
  const description = mode === 'seven' ? '最近七天数据，图表按时间顺序展示。' : mode === 'month' ? '月度汇总按自然月；每周奶量按周一至周日，跨月周按完整周统计。' : '汇总开始记录至今的全部照护数据。';
  const shiftMonth = (offset: number) => setSelectedMonth(value => new Date(value.getFullYear(), value.getMonth() + offset, 1));
  return <div className="page-stack trends-page"><header className="page-head"><h1>趋势统计</h1><p>{description}</p></header>
    <SegmentedControl<TrendMode> className="trend-tabs" label="趋势统计范围" value={mode} options={[{ value: 'seven', label: '七日' }, { value: 'month', label: '月数据' }, { value: 'total', label: '总数据' }]} onChange={setMode} />
    {mode === 'month' && <div className="trend-period-nav"><button onClick={() => shiftMonth(-1)} aria-label="上一个月">‹</button><strong>{selectedMonth.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</strong><button onClick={() => shiftMonth(1)} disabled={selectedMonth >= todayMonth} aria-label="下一个月">›</button></div>}
    <section className="trend-summary"><div><span>{totalLabel}</span><strong>{totalMilk}</strong><small>ml</small></div><div><span>有记录日均</span><strong>{activeDays ? Math.round(totalMilk / activeDays) : 0}</strong><small>ml</small></div><div><span>喂奶次数</span><strong>{activeSummary.feeds}</strong><small>次</small></div></section>
    {mode === 'total' && <section className="trend-total-details" aria-label="累计分类数据"><div><span>母乳</span><b>{activeSummary.breast}</b><small>ml</small></div><div><span>奶粉</span><b>{activeSummary.formula}</b><small>ml</small></div><div><span>排便</span><b>{activeSummary.bowel}</b><small>次</small></div><div><span>用药</span><b>{activeSummary.supplements}</b><small>次</small></div></section>}
    <section className="chart-card"><div className="section-title"><h2>{chartTitle}</h2><div className="legend"><i className="breast" />母乳<i className="formula" />奶粉</div></div><div className="bar-chart" style={{ gridTemplateColumns: `repeat(${Math.max(1, chartData.length)}, minmax(30px, 1fr))` }}>{chartData.map(item => <div className="bar-day" key={item.key} aria-label={`${item.label}，母乳${item.breast}ml，奶粉${item.formula}ml`}><div className="bar-value">{item.breast + item.formula || ''}</div><div className="bar-track"><i className="formula" style={{ height: `${item.formula / maxMilk * 100}%` }} /><i className="breast" style={{ height: `${item.breast / maxMilk * 100}%` }} /></div><span>{item.axis}</span></div>)}</div><div className="chart-values">{detailData.map(item => <div key={item.key}><time>{item.label}</time><span>母乳 {item.breast}</span><span>奶粉 {item.formula}</span></div>)}</div></section>
    <section className="rhythm-list"><div className="section-title"><h2>{mode === 'seven' ? '次数概览' : mode === 'month' ? '每周次数' : '月度次数'}</h2></div>{detailData.map(item => <div key={item.key}><time>{item.label}</time><span>喂奶 <b>{item.feeds}</b> 次</span><span>排便 <b>{item.bowel}</b> 次</span></div>)}</section>
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
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && !busy && requestClose()}><section ref={dialogRef} className="editor growth-editor" role="dialog" aria-modal="true" aria-labelledby="growth-editor-title"><header className="editor-head"><div><p className="kicker">宝宝档案</p><h2 id="growth-editor-title">{initial ? '修改成长记录' : '记录成长'}</h2></div><button className="close-btn" onClick={requestClose} aria-label="关闭">×</button></header><form className="editor-form" onSubmit={submit}><label>测量日期<input type="date" min={profile.birthDate} max={isoDay(new Date())} value={measuredOn} onChange={event => setMeasuredOn(event.target.value)} required /></label><div className="growth-fields"><label>身高 <small>cm</small><input type="number" inputMode="decimal" min="20" max="150" step="0.1" value={height} onChange={event => setHeight(event.target.value)} placeholder="例如 62.5" required /></label><label>体重 <small>kg</small><input type="number" inputMode="decimal" min="0.5" max="50" step="0.01" value={weight} onChange={event => setWeight(event.target.value)} placeholder="例如 6.35" required /></label></div>{previous && !initial && <p className="growth-reference">上次：{previous.heightCm} cm · {previous.weightKg} kg</p>}{error && <p className="error-text" role="alert">{error}</p>}<footer className="editor-actions"><button type="button" className="btn secondary" onClick={requestClose}>取消</button><button className="btn primary" disabled={busy || !height || !weight}>{busy ? '保存中…' : '保存记录'}</button></footer></form></section></div>;
}

function ProfileEditor({ profile, onClose, onSaved }: { profile: Profile; onClose(): void; onSaved(value: Profile): void }) {
  const [form, setForm] = useState<Profile>({ ...profile, sex: profile.sex || 'unspecified' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const dirty = form.name !== profile.name || form.birthDate !== profile.birthDate || form.sex !== (profile.sex || 'unspecified');
  function requestClose() { void (async () => { if (!dirty || await confirmAction({ title: '放弃未保存的内容？', description: '宝宝资料的修改不会保存。', confirmLabel: '放弃修改', danger: true })) onClose(); })(); }
  const dialogRef = useRef<HTMLElement | null>(null); useDialogFocus(dialogRef, requestClose);
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const next = await api.updateProfile(form); cacheProfile(next); onSaved(next); onClose(); } catch (err) { setError(err instanceof Error ? err.message : '保存失败'); setBusy(false); } }
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && !busy && requestClose()}><section ref={dialogRef} className="editor" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title"><header className="editor-head"><div><p className="kicker">宝宝档案</p><h2 id="profile-editor-title">修改基本资料</h2></div><button className="close-btn" onClick={requestClose} aria-label="关闭">×</button></header><form className="editor-form" onSubmit={submit}><label>宝宝姓名<input value={form.name} maxLength={30} onChange={event => setForm({ ...form, name: event.target.value })} required /></label><ChoiceField label="宝宝性别" values={['male', 'female', 'unspecified'] as BabySex[]} selected={form.sex} onSelect={sex => setForm({ ...form, sex })} getLabel={sex => sex === 'unspecified' ? '未设置' : sexLabels[sex]} /><label>出生日期<input type="date" max={isoDay(new Date())} value={form.birthDate} onChange={event => setForm({ ...form, birthDate: event.target.value })} required /></label>{error && <p className="error-text" role="alert">{error}</p>}<footer className="editor-actions"><button type="button" className="btn secondary" onClick={requestClose}>取消</button><button className="btn primary" disabled={busy}>{busy ? '保存中…' : '保存资料'}</button></footer></form></section></div>;
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange(page: number): void }) {
  if (totalPages <= 1) return null;
  return <nav className="pagination" aria-label="成长记录分页"><button disabled={page <= 1} onClick={() => onChange(page - 1)}>‹ 上一页</button><span>第 {page} / {totalPages} 页</span><button disabled={page >= totalPages} onClick={() => onChange(page + 1)}>下一页 ›</button></nav>;
}

function GrowthDelta({ value, digits, unit }: { value: number; digits: number; unit: string }) {
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  return <small className={`growth-delta ${direction}`} aria-label={`较上次${value > 0 ? '增加' : value < 0 ? '减少' : '无变化'}${Math.abs(value).toFixed(digits)}${unit}`}>{value > 0 ? '+' : ''}{value.toFixed(digits)} {unit}</small>;
}

function ArchiveView({ profile, growthRecords, deletedGrowthRecords, vaccineRecords, vaccineCatalog, user, onOpenVaccines, onEditGrowth, onAddGrowth, onDeleteGrowth, onRestoreGrowth, onPurgeGrowth, onProfileSaved }: { profile: Profile; growthRecords: GrowthRecord[]; deletedGrowthRecords: GrowthRecord[]; vaccineRecords: VaccineRecord[]; vaccineCatalog: VaccineCatalogItem[]; user: SessionUser; onOpenVaccines(): void; onEditGrowth(record: GrowthRecord): void; onAddGrowth(): void; onDeleteGrowth(record: GrowthRecord): Promise<void>; onRestoreGrowth(record: GrowthRecord): Promise<void>; onPurgeGrowth(record: GrowthRecord): Promise<void>; onProfileSaved(value: Profile): void }) {
  const [editingProfile, setEditingProfile] = useState(false); const [showDeleted, setShowDeleted] = useState(false);
  const [growthPage, setGrowthPage] = useState(1); const [deletedPage, setDeletedPage] = useState(1);
  const previousGrowthCount = useRef(growthRecords.length);
  const deletedArchivePushed = useRef(false);
  const latest = growthRecords[0];
  const todayGrowth = growthRecords.find(record => record.measuredOn === isoDay(new Date()));
  const growthPages = Math.max(1, Math.ceil(growthRecords.length / 5));
  const deletedPages = Math.max(1, Math.ceil(deletedGrowthRecords.length / 10));
  const visibleGrowthRecords = growthRecords.slice((growthPage - 1) * 5, growthPage * 5);
  const visibleDeletedRecords = deletedGrowthRecords.slice((deletedPage - 1) * 10, deletedPage * 10);
  useEffect(() => {
    setGrowthPage(page => growthRecords.length > previousGrowthCount.current ? 1 : Math.min(page, growthPages));
    previousGrowthCount.current = growthRecords.length;
  }, [growthPages, growthRecords.length]);
  useEffect(() => setDeletedPage(page => Math.min(page, deletedPages)), [deletedPages]);
  useEffect(() => { const pop = () => { deletedArchivePushed.current = false; setShowDeleted(false); }; window.addEventListener('popstate', pop); return () => { window.removeEventListener('popstate', pop); if (deletedArchivePushed.current) window.history.back(); }; }, []);
  function openDeletedArchive() { window.history.pushState({ babycareGrowthDeleted: true }, ''); deletedArchivePushed.current = true; setShowDeleted(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function closeDeletedArchive() { if (deletedArchivePushed.current && window.history.state?.babycareGrowthDeleted) window.history.back(); else { deletedArchivePushed.current = false; setShowDeleted(false); } }
  if (showDeleted && canManage(user)) return <div className="page-stack archive-page"><header className="subpage-head"><button onClick={closeDeletedArchive} aria-label="返回宝宝档案">←</button><div><p className="kicker">宝宝档案</p><h1>已删除的成长记录</h1></div></header><section className="growth-history growth-deleted-page">{deletedGrowthRecords.length ? <div className="growth-deleted-list">{visibleDeletedRecords.map(record => <article key={record.id}><span>{new Date(`${record.measuredOn}T12:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span><b>{record.heightCm} cm · {record.weightKg} kg</b><button className="btn secondary" onClick={() => void onRestoreGrowth(record)}>恢复</button><button className="btn danger-button" onClick={() => void onPurgeGrowth(record)}>彻底删除</button></article>)}</div> : <EmptyState title="没有已删除的成长记录" description="删除的记录会保留在这里。" />}<Pagination page={deletedPage} totalPages={deletedPages} onChange={setDeletedPage} /></section></div>;

  return <div className="page-stack archive-page">
    <header className="page-head"><h1>宝宝档案</h1><p>集中查看基本资料和成长变化。</p></header>
    <section className="archive-profile"><div><p className="kicker">基本资料</p><h2>{profile.name}</h2><p>{sexLabels[profile.sex || 'unspecified']} · {calculateAge(profile.birthDate)} · 出生于 {profile.birthDate.replaceAll('-', '.')}</p></div>{user.role === 'superadmin' && <button className="btn secondary" onClick={() => setEditingProfile(true)}>编辑资料</button>}<div className="archive-metrics"><div><span>最新身高</span><strong>{latest?.heightCm ?? '—'}</strong><small>{latest ? 'cm' : '暂无'}</small></div><div><span>最新体重</span><strong>{latest?.weightKg ?? '—'}</strong><small>{latest ? 'kg' : '暂无'}</small></div></div></section>
    <VaccineArchiveSummary profile={profile} records={vaccineRecords} catalog={vaccineCatalog} onOpen={onOpenVaccines} />
    <section className="growth-history">
      <div className="section-title"><h2>成长记录</h2><div className="growth-head-actions">{canManage(user) && <button className="growth-deleted-toggle" onClick={openDeletedArchive}>已删 {deletedGrowthRecords.length}</button>}<button className="btn secondary" onClick={() => todayGrowth ? onEditGrowth(todayGrowth) : onAddGrowth()}>{todayGrowth ? '修改今日' : '记录今日'}</button></div></div>
      {growthRecords.length ? <div className="growth-list">{visibleGrowthRecords.map(record => { const recordIndex = growthRecords.findIndex(item => item.id === record.id); const previous = growthRecords[recordIndex + 1]; return <article key={record.id}><time>{new Date(`${record.measuredOn}T12:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}<small>{calculateAge(profile.birthDate, new Date(`${record.measuredOn}T12:00:00`))}</small><small>{auditNames[record.createdBy]}录入</small></time><div><span>身高</span><b>{record.heightCm} cm</b>{previous && <GrowthDelta value={record.heightCm - previous.heightCm} digits={1} unit="cm" />}</div><div><span>体重</span><b>{record.weightKg} kg</b>{previous && <GrowthDelta value={record.weightKg - previous.weightKg} digits={2} unit="kg" />}</div><ActionMenu label={`${record.measuredOn}成长记录操作`} items={[{ label: '修改记录', onSelect: () => onEditGrowth(record) }, ...(canManage(user) ? [{ label: '删除记录', danger: true, onSelect: () => onDeleteGrowth(record) }] : [])]} /></article>; })}</div> : <EmptyState title="还没有成长记录" description="可以从今天开始记录身高和体重。" image="/illustrations/empty-records.webp" />}
      <Pagination page={growthPage} totalPages={growthPages} onChange={setGrowthPage} />
    </section>
    {editingProfile && <ProfileEditor profile={profile} onClose={() => setEditingProfile(false)} onSaved={onProfileSaved} />}
  </div>;
}

function AiSettingsCard({ capabilities, onChanged }: { capabilities: Capabilities; onChanged(): Promise<void> }) {
  const [settings, setSettings] = useState<AiSettingsPublic | null>(null);
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('deepseek-v4-flash');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'clear' | ''>('');
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => {
    api.aiSettings().then(value => { setSettings(value); setBaseUrl(value.baseUrl); setModel(value.model); })
      .catch(err => setStatus({ text: err instanceof Error ? err.message : '无法读取模型配置', error: true }));
  }, []);
  const payload = () => ({ baseUrl, model, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) });
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy('save'); setStatus(null);
    try { const next = await api.updateAiSettings(payload()); setSettings(next); setApiKey(''); await onChanged(); setStatus({ text: '模型配置已保存' }); }
    catch (err) { setStatus({ text: err instanceof Error ? err.message : '保存失败', error: true }); }
    finally { setBusy(''); }
  }
  async function test() {
    setBusy('test'); setStatus(null);
    try { const result = await api.testAiSettings(payload()); setStatus({ text: result.message }); }
    catch (err) { setStatus({ text: err instanceof Error ? err.message : '连接测试失败', error: true }); }
    finally { setBusy(''); }
  }
  async function clearKey() {
    if (!await confirmAction({ title: '移除已保存的密钥？', description: '移除后将无法生成宝宝日报，重新配置密钥后才能恢复。', confirmLabel: '确认移除', danger: true })) return;
    setBusy('clear'); setStatus(null);
    try { const next = await api.updateAiSettings({ baseUrl, model, apiKey: '' }); setSettings(next); setApiKey(''); await onChanged(); setStatus({ text: 'API 密钥已移除' }); }
    catch (err) { setStatus({ text: err instanceof Error ? err.message : '移除失败', error: true }); }
    finally { setBusy(''); }
  }
  return <section className="settings-card model-settings"><div className="setting-status"><h2>模型配置</h2><span className={capabilities.aiEnabled ? 'on' : ''}>{capabilities.aiEnabled ? '已启用' : '未配置'}</span></div>
    <p>配置 AI 模型后，应用会每天自动生成「宝宝日报」。</p>
    <form onSubmit={save}>
      <label>服务商<input value="DeepSeek" readOnly aria-readonly="true" /></label>
      <label>接口地址<input type="url" inputMode="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} required /></label>
      <label>模型名称<input value={model} onChange={e => setModel(e.target.value)} required /></label>
      <label>API 密钥<div className="secret-field"><input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" placeholder={settings?.configured ? `已保存 ${settings.keyHint}，留空不修改` : '请输入 DeepSeek API 密钥'} /><button type="button" onClick={() => setShowKey(value => !value)}>{showKey ? '隐藏' : '显示'}</button></div></label>
      <div className="model-actions"><button type="button" className="btn secondary" disabled={Boolean(busy)} onClick={test}>{busy === 'test' ? '正在测试…' : '测试连接'}</button><button className="btn primary" disabled={Boolean(busy)}>{busy === 'save' ? '正在保存…' : '保存配置'}</button></div>
      {settings?.configured && <button type="button" className="text-danger" disabled={Boolean(busy)} onClick={clearKey}>{busy === 'clear' ? '正在移除…' : '移除已保存的密钥'}</button>}
      {status && <p className={status.error ? 'error-text' : 'success-text'} role="status">{status.text}</p>}
    </form>
  </section>;
}

function BackupRestoreDialog({ onClose, onRestored }: { onClose(): void; onRestored(status: ServerBackupStatus, message: string): void | Promise<void> }) {
  const [files, setFiles] = useState<ServerBackupFile[]>([]); const [selected, setSelected] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const dialogRef = useRef<HTMLElement | null>(null); useDialogFocus(dialogRef, onClose);
  useEffect(() => { api.serverBackups().then(items => { setFiles(items); setSelected(items[0]?.name || ''); }).catch(err => setError(err instanceof Error ? err.message : '无法读取服务器备份')).finally(() => setLoading(false)); }, []);
  const formatSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
  async function restore() {
    const file = files.find(item => item.name === selected); if (!file) return;
    const time = new Date(file.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    if (!await confirmAction({ title: `恢复 ${time} 的服务器备份？`, description: '当前宝宝资料、记录和操作历史会被完整替换；恢复前会自动备份当前数据。', confirmLabel: '完整恢复', danger: true })) return;
    setBusy(true); setError('');
    try { const result = await api.restoreServerBackup(file.name); await onRestored(result.status, `已恢复 ${time} 的服务器备份，共 ${result.imported} 条记录`); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : '服务器备份恢复失败'); setBusy(false); }
  }
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}><section ref={dialogRef} className="editor backup-restore-dialog" role="dialog" aria-modal="true" aria-labelledby="restore-title"><header className="editor-head"><div><p className="kicker">完整替换恢复</p><h2 id="restore-title">选择服务器备份</h2></div><button className="close-btn" disabled={busy} onClick={onClose} aria-label="关闭">×</button></header>
    <p className="dialog-description">恢复前会自动备份当前数据。恢复后，宝宝资料、记录和操作历史将与所选备份完全一致。</p>
    {loading && <p className="loading-copy">正在读取备份…</p>}{!loading && !files.length && <div className="empty-state compact"><h3>暂无服务器备份</h3><p>请先返回并立即备份一次。</p></div>}
    <div className="backup-file-list" role="radiogroup" aria-label="服务器备份">{files.map(file => <button type="button" role="radio" aria-checked={selected === file.name} className={selected === file.name ? 'selected' : ''} key={file.name} onClick={() => setSelected(file.name)}><span><b>{new Date(file.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</b><small>{formatSize(file.size)}</small></span><i aria-hidden="true" /></button>)}</div>
    {error && <p className="error-text" role="alert">{error}</p>}<footer className="editor-actions"><button className="btn secondary" disabled={busy} onClick={onClose}>取消</button><button className="btn danger-button" disabled={busy || !selected} onClick={restore}>{busy ? '正在恢复…' : '确认完整恢复'}</button></footer>
  </section></div>;
}

function ServerBackupCard({ onImported }: { onImported(): void | Promise<void> }) {
  const [status, setStatus] = useState<ServerBackupStatus | null>(null); const [busy, setBusy] = useState<'backup' | 'import' | ''>(''); const [message, setMessage] = useState(''); const [showRestore, setShowRestore] = useState(false);
  const loadStatus = useCallback(async () => { const next = await api.backupStatus(); setStatus(next); }, []);
  useEffect(() => { loadStatus().catch(() => setMessage('暂时无法读取服务器备份状态')); }, [loadStatus]);
  const formatTime = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '等待首次备份';
  async function createBackup() {
    setBusy('backup'); setMessage('');
    try { const result = await api.createServerBackup(); setStatus(result.status); setMessage(`服务器备份已完成：${result.name}`); }
    catch (error) { setMessage(error instanceof Error ? error.message : '服务器备份失败'); }
    finally { setBusy(''); }
  }
  async function importFile(file?: File) {
    if (!file || !await confirmAction({ title: '导入这个备份文件？', description: '导入前会先在服务器保存当前数据，随后使用文件中的内容替换当前数据。', confirmLabel: '确认导入', danger: true })) return;
    setBusy('import'); setMessage('');
    try { const result = await api.importData(JSON.parse(await file.text())); await loadStatus(); await onImported(); setMessage(`已导入 ${result.imported} 条记录${result.profileRestored ? '，宝宝资料已恢复' : ''}`); }
    catch (error) { setMessage(error instanceof Error ? error.message : '导入失败，请选择本应用导出的备份文件'); }
    finally { setBusy(''); }
  }
  return <><section className="settings-card backup-card"><div className="setting-status"><h2>备份状态与恢复</h2><span className="on">每 6 小时</span></div>
    <p>自动保存完整照护数据，最多保留最近 {status?.retention ?? 28} 份。可选择服务器备份进行完整恢复，操作前会先保存当前数据。</p>
    <div className="backup-summary"><div><span>最近备份</span><b>{formatTime(status?.lastBackupAt ?? null)}</b></div><div><span>下次预计</span><b>{formatTime(status?.nextBackupAt ?? null)}</b></div><div><span>服务器备份</span><b>{status ? `${status.count} 份` : '读取中…'}</b></div><div><span>保存位置</span><b>{status?.directory || '/data/backups'}</b></div></div>
    <div className="backup-actions"><button className="btn primary wide" disabled={Boolean(busy)} onClick={createBackup}>{busy === 'backup' ? '正在备份…' : '立即备份到服务器'}</button><button className="btn secondary wide" disabled={Boolean(busy) || !status?.count} onClick={() => setShowRestore(true)}>从服务器恢复</button><a className="btn secondary" href="/api/export" download>导出备份文件</a><label className={`btn secondary ${busy ? 'disabled' : ''}`}>导入备份文件<input className="sr-only" type="file" accept="application/json" disabled={Boolean(busy)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; importFile(file); }} /></label></div>
    {message && <p className={message.includes('失败') || message.includes('无法') ? 'error-text' : 'success-text'} role="status">{message}</p>}
  </section>{showRestore && <BackupRestoreDialog onClose={() => setShowRestore(false)} onRestored={async (nextStatus, nextMessage) => { setStatus(nextStatus); await onImported(); setMessage(nextMessage); }} />}</>;
}

function CareItemEditor({ item, nextOrder, onClose, onSaved }: { item?: CareItem; nextOrder: number; onClose(): void; onSaved(item: CareItem): void }) {
  const [name, setName] = useState(item?.name || ''); const [icon, setIcon] = useState<CareItem['icon']>(item?.icon || 'medicine'); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const dirty = name !== (item?.name || '') || icon !== (item?.icon || 'medicine');
  async function requestClose() { if (busy) return; if (dirty && !await confirmAction({ title: '放弃未保存的修改？', description: '项目名称或图标的修改尚未保存。', confirmLabel: '放弃修改', danger: true })) return; onClose(); }
  const dialogRef = useRef<HTMLElement | null>(null); useDialogFocus(dialogRef, () => void requestClose());
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const sortOrder = item?.sortOrder ?? nextOrder; const saved = item ? await api.updateCareItem(item.id, { name, icon, sortOrder }) : await api.createCareItem({ name, icon, sortOrder }); onSaved(saved); onClose(); } catch (err) { setError(err instanceof Error ? err.message : '保存失败'); setBusy(false); } }
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && void requestClose()}><section ref={dialogRef} className="editor" role="dialog" aria-modal="true" aria-labelledby="care-item-title"><header className="editor-head"><div><p className="kicker">今日用药项目</p><h2 id="care-item-title">{item ? '修改项目' : '新增项目'}</h2></div><button className="close-btn" disabled={busy} onClick={() => void requestClose()} aria-label="关闭">×</button></header><form className="editor-form" onSubmit={submit}><label>项目名称<input maxLength={12} value={name} onChange={event => setName(event.target.value)} placeholder="例如：抚触" autoFocus required /></label><fieldset><legend>记录图标</legend><div className="choice-group"><button type="button" className={icon === 'medicine' ? 'selected' : ''} onClick={() => setIcon('medicine')}>药瓶</button><button type="button" className={icon === 'massage' ? 'selected' : ''} onClick={() => setIcon('massage')}>推拿</button></div></fieldset>{error && <p className="error-text" role="alert">{error}</p>}<footer className="editor-actions"><button type="button" className="btn secondary" disabled={busy} onClick={() => void requestClose()}>取消</button><button className="btn primary" disabled={busy || !name.trim()}>{busy ? '保存中…' : '保存项目'}</button></footer></form></section></div>;
}

function CareItemsCard({ items, onChanged }: { items: CareItem[]; onChanged(): Promise<void> }) {
  const [editing, setEditing] = useState<CareItem | 'new' | null>(null); const [busyId, setBusyId] = useState(''); const [message, setMessage] = useState(''); const [ordered, setOrdered] = useState(items); const [draggingId, setDraggingId] = useState('');
  const orderedRef = useRef(items); const dragRef = useRef<{ id: string; original: CareItem[] } | null>(null);
  useEffect(() => { if (!draggingId) { setOrdered(items); orderedRef.current = items; } }, [items, draggingId]);
  async function toggle(item: CareItem) { if (item.active && !await confirmAction({ title: `停用“${item.name}”？`, description: '首页将不再显示该项目，历史记录仍会保留。', confirmLabel: '确认停用', danger: true })) return; setBusyId(item.id); setMessage(''); try { await api.setCareItemActive(item.id, !item.active); await onChanged(); setMessage(item.active ? '项目已停用' : '项目已启用'); } catch (err) { setMessage(err instanceof Error ? err.message : '操作失败'); } finally { setBusyId(''); } }
  function reorderLocal(id: string, targetId: string) { const current = orderedRef.current; const from = current.findIndex(item => item.id === id); const to = current.findIndex(item => item.id === targetId); if (from < 0 || to < 0 || from === to) return; const next = [...current]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); orderedRef.current = next; setOrdered(next); }
  async function persistOrder(next: CareItem[], previous: CareItem[]) { if (next.map(item => item.id).join() === previous.map(item => item.id).join()) return; setBusyId('order'); setMessage(''); try { await api.reorderCareItems(next.map(item => item.id)); await onChanged(); setMessage('项目顺序已保存'); } catch (err) { orderedRef.current = previous; setOrdered(previous); setMessage(err instanceof Error ? err.message : '顺序保存失败'); } finally { setBusyId(''); } }
  async function moveByKeyboard(item: CareItem, direction: -1 | 1) { const previous = orderedRef.current; const index = previous.findIndex(entry => entry.id === item.id); const target = previous[index + direction]; if (!target || busyId) return; reorderLocal(item.id, target.id); await persistOrder(orderedRef.current, previous); }
  function startDrag(event: React.PointerEvent<HTMLButtonElement>, item: CareItem) { if (busyId) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { id: item.id, original: orderedRef.current }; setDraggingId(item.id); }
  function drag(event: React.PointerEvent<HTMLButtonElement>) { if (!dragRef.current) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-care-item-id]')?.dataset.careItemId; if (target) reorderLocal(dragRef.current.id, target); }
  function endDrag() { const state = dragRef.current; if (!state) return; dragRef.current = null; setDraggingId(''); void persistOrder(orderedRef.current, state.original); }
  function cancelDrag() { const state = dragRef.current; if (!state) return; orderedRef.current = state.original; setOrdered(state.original); dragRef.current = null; setDraggingId(''); }
  return <><section className="settings-card care-items-card"><div className="setting-status"><h2>显示项目</h2><span className="on">管理员</span></div><p>拖动手柄调整首页显示顺序。停用项目不影响历史记录。</p><div className="care-item-list">{ordered.map(item => <article data-care-item-id={item.id} className={`${item.active ? '' : 'inactive'} ${draggingId === item.id ? 'dragging' : ''}`} key={item.id}><button type="button" className="care-drag-handle" aria-label={`调整${item.name}的顺序，可拖动或按上下方向键`} aria-keyshortcuts="ArrowUp ArrowDown" onPointerDown={event => startDrag(event, item)} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); void moveByKeyboard(item, event.key === 'ArrowUp' ? -1 : 1); } }}><span aria-hidden="true">⠇⠇</span></button><img src={item.icon === 'massage' ? '/icons/record-massage.png' : '/icons/record-supplement.png'} alt="" /><div><b>{item.name}</b><small>{item.active ? '使用中' : '已停用'}</small></div><button className="btn secondary" onClick={() => setEditing(item)}>修改</button><button className={`btn ${item.active ? 'secondary' : 'primary'}`} disabled={Boolean(busyId)} onClick={() => void toggle(item)}>{item.active ? '停用' : '启用'}</button></article>)}</div><button className="btn primary full" disabled={Boolean(busyId)} onClick={() => setEditing('new')}>新增项目</button>{message && <p className={message.includes('失败') || message.includes('变化') ? 'error-text' : 'success-text'} role="status">{message}</p>}</section>{editing && <CareItemEditor item={editing === 'new' ? undefined : editing} nextOrder={Math.max(0, ...items.map(item => item.sortOrder)) + 10} onClose={() => setEditing(null)} onSaved={async () => { await onChanged(); setMessage(editing === 'new' ? '项目已新增' : '项目已修改'); }} />}</>;
}

function FamilyPermissionsCard() {
  const [members, setMembers] = useState<FamilyMemberPermission[]>([]); const [busyId, setBusyId] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { api.familyMembers().then(setMembers).catch(err => setMessage(err instanceof Error ? err.message : '无法读取家庭成员')); }, []);
  async function changeRole(member: FamilyMemberPermission, role: 'admin' | 'member') { if (member.role === role || !await confirmAction({ title: `将${member.name}设为“${roleNames[role]}”？`, description: role === 'admin' ? '管理员可以管理用药项目和已删除记录。' : '普通用户可以查看、添加和修改照护记录。', confirmLabel: '确认修改' })) return; setBusyId(member.id); setMessage(''); try { const updated = await api.updateFamilyRole(member.id as Exclude<FamilyId, 'father'>, role); setMembers(items => items.map(item => item.id === updated.id ? updated : item)); setMessage(`${member.name}已设为${roleNames[role]}`); } catch (err) { setMessage(err instanceof Error ? err.message : '权限修改失败'); } finally { setBusyId(''); } }
  return <section className="settings-card family-permissions-card"><div className="setting-status"><h2>成员与权限</h2><span className="on">超管</span></div><p>管理员可管理用药项目和回收站；普通用户可记录和修改照护信息。</p><div className="family-permission-list">{members.map(member => { const visual = familyMembers.find(item => item.id === member.id)!; return <article key={member.id}><img src={visual.icon} alt="" /><div><b>{member.name}</b><small>{member.id === 'father' ? '最高管理权限' : roleNames[member.role]}</small></div>{member.id === 'father' ? <span className="fixed-role">超管·不可修改</span> : <div className="role-switch" role="group" aria-label={`${member.name}的权限`}><button type="button" aria-pressed={member.role === 'admin'} className={member.role === 'admin' ? 'active' : ''} disabled={Boolean(busyId)} onClick={() => void changeRole(member, 'admin')}>管理员</button><button type="button" aria-pressed={member.role === 'member'} className={member.role === 'member' ? 'active' : ''} disabled={Boolean(busyId)} onClick={() => void changeRole(member, 'member')}>普通用户</button></div>}</article>; })}</div>{message && <p className={message.includes('失败') || message.includes('无法') ? 'error-text' : 'success-text'} role="status">{message}</p>}</section>;
}

function VaccineCatalogEditor({ item, onClose, onSaved }: { item?: VaccineCatalogItem; onClose(): void; onSaved(item: VaccineCatalogItem): void }) {
  const initial: DraftVaccineCatalogItem = { name: item?.name || '', category: item?.category || 'program', shortName: item?.shortName ?? null, description: item?.description || '', doseCount: item?.doseCount ?? 1, intervalSummary: item?.intervalSummary || '' };
  const [draft, setDraft] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const dialogRef = useRef<HTMLElement | null>(null);
  async function requestClose() { if (busy) return; if (dirty && !await confirmAction({ title: '放弃未保存的修改？', description: '疫苗信息尚未保存。', confirmLabel: '放弃修改', danger: true })) return; onClose(); }
  useDialogFocus(dialogRef, () => void requestClose());
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const payload = { ...draft, name: draft.name.trim(), description: draft.description.trim(), intervalSummary: draft.intervalSummary.trim() };
    try { const saved = item ? await api.updateVaccineCatalogItem(item.id, payload) : await api.createVaccineCatalogItem(payload); onSaved(saved); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : '保存疫苗失败'); setBusy(false); }
  }
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && void requestClose()}><section ref={dialogRef} className="editor vaccine-catalog-editor" role="dialog" aria-modal="true" aria-labelledby="vaccine-catalog-editor-title"><header className="editor-head"><div><p className="kicker">疫苗目录</p><h2 id="vaccine-catalog-editor-title">{item ? '修改疫苗' : '新增疫苗'}</h2></div><button type="button" className="close-btn" disabled={busy} onClick={() => void requestClose()} aria-label="关闭">×</button></header><form className="editor-form" onSubmit={submit}><label>疫苗名称<input value={draft.name} maxLength={50} required autoFocus placeholder="例如：水痘疫苗" onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} /></label><fieldset><legend>疫苗类型</legend><SegmentedControl label="疫苗类型" value={draft.category} options={[{ value: 'program', label: '规划' }, { value: 'self_paid', label: '自费' }]} onChange={category => setDraft(value => ({ ...value, category }))} /></fieldset><label>常规剂次<select value={draft.doseCount ?? ''} onChange={event => setDraft(value => ({ ...value, doseCount: event.target.value ? Number(event.target.value) : null }))}><option value="">按门诊程序</option>{Array.from({ length: 9 }, (_, index) => <option value={index + 1} key={index + 1}>{index + 1} 剂</option>)}</select></label><label>疫苗作用 <span>选填</span><textarea rows={3} maxLength={300} value={draft.description} placeholder="简要说明预防什么疾病" onChange={event => setDraft(value => ({ ...value, description: event.target.value }))} /></label><label>接种间隔 <span>选填</span><textarea rows={2} maxLength={200} value={draft.intervalSummary} placeholder="例如：第2剂在第1剂后至少1个月" onChange={event => setDraft(value => ({ ...value, intervalSummary: event.target.value }))} /></label>{error && <p className="error-text" role="alert">{error}</p>}<footer className="editor-actions"><button type="button" className="btn secondary" disabled={busy} onClick={() => void requestClose()}>取消</button><button className="btn primary" disabled={busy || !draft.name.trim()}>{busy ? '保存中…' : '保存疫苗'}</button></footer></form></section></div>;
}

function VaccineSettingsCard({ enabled, catalog, manager, onChange, onCatalogChanged }: { enabled: boolean; catalog: VaccineCatalogItem[]; manager: boolean; onChange(value: boolean): void; onCatalogChanged(): Promise<void> }) {
  const [busy, setBusy] = useState(''); const [expanded, setExpanded] = useState(''); const [editing, setEditing] = useState<VaccineCatalogItem | 'new' | null>(null); const [ordered, setOrdered] = useState(catalog); const [draggingId, setDraggingId] = useState(''); const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const orderedRef = useRef(catalog); const dragRef = useRef<{ id: string; original: VaccineCatalogItem[] } | null>(null);
  useEffect(() => { if (!draggingId) { setOrdered(catalog); orderedRef.current = catalog; } }, [catalog, draggingId]);
  async function toggle(item: VaccineCatalogItem) { setBusy(item.id); setMessage(null); try { await api.setVaccineCatalogActive(item.id, !item.active); await onCatalogChanged(); setMessage({ text: item.active ? `${item.name}已停用` : `${item.name}已启用` }); } catch (error) { setMessage({ text: error instanceof Error ? error.message : '更新疫苗目录失败', error: true }); } finally { setBusy(''); } }
  function reorderLocal(id: string, targetId: string) { const current = orderedRef.current; const from = current.findIndex(item => item.id === id); const to = current.findIndex(item => item.id === targetId); if (from < 0 || to < 0 || from === to) return; const next = [...current]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); orderedRef.current = next; setOrdered(next); }
  async function persistOrder(next: VaccineCatalogItem[], previous: VaccineCatalogItem[]) { if (next.map(item => item.id).join() === previous.map(item => item.id).join()) return; setBusy('order'); setMessage(null); try { await api.reorderVaccineCatalog(next.map(item => item.id)); await onCatalogChanged(); setMessage({ text: '疫苗顺序已保存' }); } catch (error) { orderedRef.current = previous; setOrdered(previous); setMessage({ text: error instanceof Error ? error.message : '顺序保存失败，已恢复原顺序', error: true }); } finally { setBusy(''); } }
  async function moveByKeyboard(item: VaccineCatalogItem, direction: -1 | 1) { const previous = orderedRef.current; const index = previous.findIndex(entry => entry.id === item.id); const target = previous[index + direction]; if (!target || busy) return; reorderLocal(item.id, target.id); await persistOrder(orderedRef.current, previous); }
  function startDrag(event: React.PointerEvent<HTMLButtonElement>, item: VaccineCatalogItem) { if (busy) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { id: item.id, original: orderedRef.current }; setDraggingId(item.id); }
  function drag(event: React.PointerEvent<HTMLButtonElement>) { if (!dragRef.current) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-vaccine-id]')?.dataset.vaccineId; if (target) reorderLocal(dragRef.current.id, target); }
  function endDrag() { const state = dragRef.current; if (!state) return; dragRef.current = null; setDraggingId(''); void persistOrder(orderedRef.current, state.original); }
  function cancelDrag() { const state = dragRef.current; if (!state) return; orderedRef.current = state.original; setOrdered(state.original); dragRef.current = null; setDraggingId(''); }
  async function remove(item: VaccineCatalogItem) { if (!await confirmAction({ title: `删除“${item.name}”？`, description: '将从疫苗目录和未来接种安排中移除；已接种历史记录仍会保留。', confirmLabel: '删除疫苗', danger: true })) return; setBusy(item.id); setMessage(null); try { await api.deleteVaccineCatalogItem(item.id); await onCatalogChanged(); setExpanded(current => current === item.id ? '' : current); setMessage({ text: `${item.name}已删除` }); } catch (error) { setMessage({ text: error instanceof Error ? error.message : '删除疫苗失败', error: true }); } finally { setBusy(''); } }
  return <><section className="settings-card vaccine-settings-card"><div className="setting-status"><div><h2>疫苗提醒</h2><p>首页优先提醒真实门诊预约；未预约时显示系统建议。</p></div><Switch checked={enabled} label="首页疫苗提醒" onChange={onChange} /></div><dl><div><dt>接种地区</dt><dd>浙江省杭州市</dd></div><div><dt>提醒依据</dt><dd>预约日期优先</dd></div><div><dt>参考规则</dt><dd>国家免疫规划（2021年版）</dd></div></dl><p className="vaccine-safety-note">门诊没有给出预约时无需设置。系统建议日期仅供参考。</p></section>
  <section className="settings-card vaccine-catalog-card"><div className="section-title"><div><p className="kicker">疫苗目录</p><h2>显示与顺序</h2></div><div className="catalog-head-actions"><span>{catalog.filter(item => item.active).length} 项启用</span>{manager && <button type="button" className="btn secondary" disabled={Boolean(busy)} onClick={() => setEditing('new')}>＋ 新增疫苗</button>}</div></div><p>{manager ? '拖动手柄调整记录时的显示顺序。' : '记录时只显示启用项目。'}默认按疫苗本的8类规划疫苗，以及五价轮状、13价肺炎设置。</p><div className="vaccine-catalog-list">{ordered.map(item => <article data-vaccine-id={item.id} key={item.id} className={`${item.active ? '' : 'inactive'} ${draggingId === item.id ? 'dragging' : ''}`}>{manager && <button type="button" className="catalog-drag-handle" aria-label={`调整${item.name}的顺序，可拖动或按上下方向键`} aria-keyshortcuts="ArrowUp ArrowDown" onPointerDown={event => startDrag(event, item)} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); void moveByKeyboard(item, event.key === 'ArrowUp' ? -1 : 1); } }}><span aria-hidden="true">⠇⠇</span></button>}<div className="catalog-copy"><div className="catalog-title"><b>{item.name}</b><i className={`vaccine-kind ${item.category}`}>{item.category === 'program' ? '规划' : '自费'}</i></div><small>{item.doseCount ? `${item.doseCount}剂` : '按门诊程序'}</small></div>{manager ? <ActionMenu label={`管理${item.name}`} items={[{ label: expanded === item.id ? '收起详情' : '查看详情', onSelect: () => setExpanded(expanded === item.id ? '' : item.id) }, { label: '修改', onSelect: () => setEditing(item) }, { label: '删除', danger: true, onSelect: () => remove(item) }]} /> : <button type="button" className="catalog-detail-toggle" aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? '' : item.id)}>{expanded === item.id ? '收起' : '详情'}</button>}{manager && <Switch checked={item.active} label={`${item.active ? '停用' : '启用'}${item.name}`} disabled={Boolean(busy)} onChange={() => void toggle(item)} />}{expanded === item.id && <div className="catalog-detail"><p>{item.description || '尚未填写疫苗作用。'}</p><dl><dt>常规程序</dt><dd>{item.intervalSummary || (item.doseCount ? `共 ${item.doseCount} 剂` : '按门诊程序')}</dd></dl></div>}</article>)}</div>{message && <p className={message.error ? 'error-text' : 'success-text'} role="status">{message.text}</p>}</section>{editing && <VaccineCatalogEditor item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={async saved => { await onCatalogChanged(); setMessage({ text: editing === 'new' ? `${saved.name}已新增` : `${saved.name}已修改` }); }} />}</>;
}

type SettingsSection = 'root' | 'family' | 'care-items' | 'vaccines' | 'ai' | 'backup';
function SettingsEntry({ icon, title, description, status, onClick }: { icon: string; title: string; description: string; status: string; onClick(): void }) {
  return <button type="button" className="settings-entry" onClick={onClick}><span className="settings-entry-icon" aria-hidden="true">{icon}</span><span><b>{title}</b><small>{description}</small></span><em>{status}</em><i aria-hidden="true">›</i></button>;
}

function SettingsView({ careItems, vaccineCatalog, capabilities, user, vaccineRemindersEnabled, onVaccineRemindersChanged, onVaccineCatalogChanged, onCapabilitiesChanged, onCareItemsChanged, onImported, onLogout }: { careItems: CareItem[]; vaccineCatalog: VaccineCatalogItem[]; capabilities: Capabilities; user: SessionUser; vaccineRemindersEnabled: boolean; onVaccineRemindersChanged(value: boolean): void; onVaccineCatalogChanged(): Promise<void>; onCapabilitiesChanged(): Promise<void>; onCareItemsChanged(): Promise<void>; onImported(): void | Promise<void>; onLogout(): void }) {
  const [section, setSection] = useState<SettingsSection>('root'); const pushedRef = useRef(false);
  useEffect(() => { const pop = () => { pushedRef.current = false; setSection('root'); }; window.addEventListener('popstate', pop); return () => { window.removeEventListener('popstate', pop); if (pushedRef.current) window.history.back(); }; }, []);
  const member = familyMembers.find(item => item.id === user.id)!;
  function open(next: Exclude<SettingsSection, 'root'>) { window.history.pushState({ babycareSettings: next }, ''); pushedRef.current = true; setSection(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function back() { if (pushedRef.current) window.history.back(); else setSection('root'); }
  if (section !== 'root') return <div className="page-stack settings-subpage"><header className="subpage-head"><button type="button" onClick={back} aria-label="返回设置">←</button><div><p className="kicker">设置</p><h1>{{ family: '家庭成员权限', 'care-items': '今日用药项目', vaccines: '疫苗与接种', ai: '指令理解模型', backup: '服务器数据备份' }[section]}</h1></div></header><div className="settings-grid">
    {section === 'family' && <FamilyPermissionsCard />}
    {section === 'care-items' && <CareItemsCard items={careItems} onChanged={onCareItemsChanged} />}
    {section === 'vaccines' && <VaccineSettingsCard enabled={vaccineRemindersEnabled} catalog={vaccineCatalog} manager={canManage(user)} onChange={onVaccineRemindersChanged} onCatalogChanged={onVaccineCatalogChanged} />}
    {section === 'ai' && <AiSettingsCard capabilities={capabilities} onChanged={onCapabilitiesChanged} />}
    {section === 'backup' && <ServerBackupCard onImported={onImported} />}
  </div></div>;
  return <div className="page-stack settings-home"><header className="page-head"><h1>设置</h1><p>{user.role === 'superadmin' ? '管理家庭成员、照护项目和服务器。' : user.role === 'admin' ? '管理用药项目和已删除记录。' : '查看当前身份和权限。'}</p></header><section className="account-card"><img src={member.icon} alt="" /><div><span>当前身份与权限</span><h2>{user.name}</h2><p>{roleNames[user.role]}</p></div><i>{canManage(user) ? '管理权限' : '记录权限'}</i></section>
    {user.role === 'admin' && <section className="settings-card permission-note"><p className="kicker">管理员权限</p><h2>管理日常照护</h2><p>可管理用药项目和回收站。宝宝资料、家庭权限、AI 服务和备份仅超管可操作。</p></section>}
    {user.role === 'member' && <section className="settings-card permission-note"><p className="kicker">普通用户权限</p><h2>可以记录和修改</h2><p>可查看、添加和修改照护记录；不能删除记录或查看操作历史。</p></section>}
    <section className="settings-menu" aria-label="设置项目"><SettingsEntry icon="疫苗" title="疫苗与接种" description="杭州地区与首页提醒" status={vaccineRemindersEnabled ? '已开启' : '已关闭'} onClick={() => open('vaccines')} />{user.role === 'superadmin' && <SettingsEntry icon="成员" title="家庭成员权限" description="设置管理员与普通用户" status="4 位家人" onClick={() => open('family')} />}{canManage(user) && <SettingsEntry icon="用药" title="今日用药项目" description="新增、停用与排序" status={`${careItems.filter(item => item.active).length} 项使用中`} onClick={() => open('care-items')} />}{user.role === 'superadmin' && <><SettingsEntry icon="模型" title="指令理解模型" description="DeepSeek 接口与模型配置" status={capabilities.aiEnabled ? '已启用' : '未配置'} onClick={() => open('ai')} /><SettingsEntry icon="备份" title="服务器数据备份" description="自动备份、导入与恢复" status="每 6 小时" onClick={() => open('backup')} /></>}</section>
    <button className="logout" onClick={onLogout}>退出当前身份</button></div>;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<Profile>(getCachedProfile() || { name: '示例宝宝', birthDate: '2026-01-01', sex: 'unspecified' });
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [records, setRecords] = useState<CareRecord[]>([]);
  const [deletedRecords, setDeletedRecords] = useState<CareRecord[]>([]); const [careItems, setCareItems] = useState<CareItem[]>([]);
  const [growthRecords, setGrowthRecords] = useState<GrowthRecord[]>([]); const [deletedGrowthRecords, setDeletedGrowthRecords] = useState<GrowthRecord[]>([]);
  const [vaccineRecords, setVaccineRecords] = useState<VaccineRecord[]>([]); const [deletedVaccineRecords, setDeletedVaccineRecords] = useState<VaccineRecord[]>([]);
  const [vaccineCatalog, setVaccineCatalog] = useState<VaccineCatalogItem[]>([]);
  const [vaccineRemindersEnabled, setVaccineRemindersEnabled] = useState(() => localStorage.getItem('babycare-vaccine-reminders') !== 'off');
  const [tab, setTab] = useState<Tab>('today'); const [selectedDate, setSelectedDate] = useState(new Date()); const [historyMode, setHistoryMode] = useState<'care' | 'vaccine'>('care');
  const [editor, setEditor] = useState<DraftRecord | null>(null); const [auditRecord, setAuditRecord] = useState<CareRecord | null>(null);
  const [growthEditor, setGrowthEditor] = useState<GrowthRecord | 'new' | null>(null);
  const [vaccineEditor, setVaccineEditor] = useState<VaccineEditorState | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities>(emptyCapabilities); const [online, setOnline] = useState(navigator.onLine); const [offlineSession, setOfflineSession] = useState(false); const [pendingCount, setPendingCount] = useState(0); const [refreshing, setRefreshing] = useState(false); const [toast, setToast] = useState<ToastState | null>(null);
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

  const loadProfile = useCallback(async () => {
    try { const next = await api.profile(); setProfile(next); cacheProfile(next); return true; }
    catch { return false; }
  }, []);

  const loadCapabilities = useCallback(async () => {
    try { setCapabilities(await api.capabilities()); }
    catch { setCapabilities(emptyCapabilities); }
  }, []);

  const loadCareItems = useCallback(async () => { try { setCareItems(await api.careItems()); } catch { /* keep current items while offline */ } }, []);
  const loadDeletedRecords = useCallback(async () => { if (!canManage(currentUser)) return; try { setDeletedRecords(await api.deletedRecords()); } catch { setDeletedRecords([]); } }, [currentUser]);
  const loadGrowthRecords = useCallback(async () => { try { setGrowthRecords(await api.growthRecords()); } catch { /* keep current items while offline */ } }, []);
  const loadDeletedGrowthRecords = useCallback(async () => { if (!canManage(currentUser)) return; try { setDeletedGrowthRecords(await api.deletedGrowthRecords()); } catch { setDeletedGrowthRecords([]); } }, [currentUser]);
  const loadVaccineRecords = useCallback(async () => { try { setVaccineRecords(await api.vaccineRecords()); } catch { /* keep current items while offline */ } }, []);
  const loadVaccineCatalog = useCallback(async () => { try { setVaccineCatalog(await api.vaccineCatalog()); } catch { /* keep current catalog while offline */ } }, []);
  const loadDeletedVaccineRecords = useCallback(async () => { if (!canManage(currentUser)) return; try { setDeletedVaccineRecords(await api.deletedVaccineRecords()); } catch { setDeletedVaccineRecords([]); } }, [currentUser]);
  const refreshSession = useCallback(async () => { try { const next = await api.session(); if (!next.authenticated || !next.user) return; setCurrentUser(current => { if (current?.id === next.user!.id && current.role === next.user!.role) return current; rememberUser(next.user!); return next.user; }); } catch { /* keep current session while offline */ } }, []);

  const refreshAll = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true; setRefreshing(true);
    try { await Promise.all([refreshSession(), loadRecords(), loadProfile(), loadCapabilities(), loadCareItems(), loadDeletedRecords(), loadGrowthRecords(), loadDeletedGrowthRecords(), loadVaccineRecords(), loadVaccineCatalog(), loadDeletedVaccineRecords()]); }
    finally { refreshingRef.current = false; setRefreshing(false); }
  }, [loadCapabilities, loadCareItems, loadDeletedGrowthRecords, loadDeletedRecords, loadDeletedVaccineRecords, loadGrowthRecords, loadProfile, loadRecords, loadVaccineCatalog, loadVaccineRecords, refreshSession]);

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
    if (queue.length && !remaining.length) { setToast({ message: discarded ? `${discarded} 条离线操作因冲突未同步` : '离线记录已同步' }); await Promise.all([loadRecords(), loadDeletedRecords()]); }
  }, [currentUser, loadRecords]);

  useEffect(() => {
    api.session().then(value => { setAuthenticated(value.authenticated); setCurrentUser(value.user); if (value.user) { rememberUser(value.user); setRecords(getCachedRecords(value.user.id)); } })
      .catch(() => { const remembered = getRememberedUser(); if (remembered) { setCurrentUser(remembered); setAuthenticated(true); setOfflineSession(true); setOnline(false); setRecords(getCachedRecords(remembered.id)); setPendingCount(getOutbox(remembered.id).length); } else { setAuthenticated(false); setCurrentUser(null); } });
  }, []);

  useEffect(() => {
    if (!authenticated || !currentUser) return;
    setPendingCount(getOutbox(currentUser.id).length);
    loadProfile(); loadCapabilities(); loadCareItems(); loadGrowthRecords(); loadDeletedGrowthRecords(); loadVaccineRecords(); loadVaccineCatalog(); loadDeletedVaccineRecords();
    loadRecords().then(() => { if (navigator.onLine) syncOutbox(); });
  }, [authenticated, currentUser, loadCapabilities, loadCareItems, loadDeletedGrowthRecords, loadDeletedVaccineRecords, loadGrowthRecords, loadProfile, loadRecords, loadVaccineCatalog, loadVaccineRecords, syncOutbox]);

  useEffect(() => {
    const onOnline = () => { setOnline(true); syncOutbox(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [syncOutbox]);

  useEffect(() => {
    if (!authenticated || !currentUser) return;
    let eventTimer: number | null = null;
    const source = typeof EventSource === 'undefined' ? null : new EventSource('/api/events');
    const scheduleRefresh = () => {
      if (eventTimer) clearTimeout(eventTimer);
      eventTimer = window.setTimeout(() => { void refreshAll(); }, 180);
    };
    if (source) {
      source.onopen = () => setOnline(true);
      source.onmessage = scheduleRefresh;
    }
    const pollTimer = window.setInterval(() => {
      if (!source || source.readyState !== EventSource.OPEN) void refreshAll();
    }, 30_000);
    const visibility = () => { if (document.visibilityState === 'visible') scheduleRefresh(); };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      if (eventTimer) clearTimeout(eventTimer);
      clearInterval(pollTimer); source?.close(); document.removeEventListener('visibilitychange', visibility);
    };
  }, [authenticated, currentUser, refreshAll]);

  async function saveOne(input: DraftRecord) {
    if (!currentUser) throw new Error('请先登录');
    const value = { ...input, id: input.id || createUuid() };
    try { value.id && records.some(item => item.id === value.id) ? await api.updateRecord(value.id, value) : await api.createRecord(value); await loadRecords(); setToast({ message: '记录已保存' }); }
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
      if (error instanceof ApiError && error.code === 'DUPLICATE_SUPPLEMENT') { const existing = (error.details as { existing?: CareRecord })?.existing; setToast({ message: existing ? `${supplement} 已由${auditNames[existing.createdBy]}在 ${new Date(existing.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} 记录` : `${supplement} 今天已经记录` }); await loadRecords(); return; }
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
    try { await api.restoreRecord(record.id); await Promise.all([loadRecords(), loadDeletedRecords()]); setToast({ message: '记录已恢复' }); }
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
    try { value.id ? await api.updateGrowthRecord(value.id, value) : await api.createGrowthRecord(value); await loadGrowthRecords(); setToast({ message: '成长记录已保存' }); }
    catch (error) { if (error instanceof ApiError && error.code === 'DUPLICATE_GROWTH_DAY') { const existing = (error.details as { existing?: GrowthRecord })?.existing; if (existing) setGrowthEditor(existing); } throw error; }
  }
  async function removeGrowth(record: GrowthRecord) { if (!await confirmAction({ title: '删除这条成长记录？', description: '记录会移到档案内的已删除列表，可以随后恢复。', confirmLabel: '删除记录', danger: true })) return; try { await api.deleteGrowthRecord(record.id); await Promise.all([loadGrowthRecords(), loadDeletedGrowthRecords()]); setToast({ message: '成长记录已移到已删除' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '删除失败' }); } }
  async function restoreGrowth(record: GrowthRecord) { try { await api.restoreGrowthRecord(record.id); await Promise.all([loadGrowthRecords(), loadDeletedGrowthRecords()]); setToast({ message: '成长记录已恢复' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '恢复失败' }); } }
  async function purgeGrowth(record: GrowthRecord) { if (!await confirmAction({ title: '彻底删除这条成长记录？', description: '删除后无法恢复。', confirmLabel: '彻底删除', danger: true })) return; try { await api.purgeGrowthRecord(record.id); await loadDeletedGrowthRecords(); setToast({ message: '成长记录已彻底删除' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '彻底删除失败' }); } }

  async function saveVaccine(value: DraftVaccineRecord) {
    try { value.id ? await api.updateVaccineRecord(value.id, value) : await api.createVaccineRecord(value); await loadVaccineRecords(); setToast({ message: value.administeredOn ? '接种记录已保存' : value.appointmentOn ? '门诊预约已保存' : '预约已取消' }); }
    catch (error) { if (error instanceof ApiError && error.code === 'DUPLICATE_VACCINE_RECORD') throw new Error('这针疫苗已经记录，可以直接修改已有记录'); throw error; }
  }
  async function removeVaccine(record: VaccineRecord) { if (!await confirmAction({ title: `删除“${record.vaccineName} · 第${record.dose}剂”？`, description: '记录会移到已删除列表，可以随后恢复。', confirmLabel: '删除记录', danger: true })) return; try { await api.deleteVaccineRecord(record.id); await Promise.all([loadVaccineRecords(), loadDeletedVaccineRecords()]); setToast({ message: '疫苗记录已移到已删除' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '删除失败' }); } }
  async function restoreVaccine(record: VaccineRecord) { try { await api.restoreVaccineRecord(record.id); await Promise.all([loadVaccineRecords(), loadDeletedVaccineRecords()]); setToast({ message: '疫苗记录已恢复' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '恢复失败' }); } }
  async function cancelVaccineAppointment(item: VaccinePlanItem) { const record = item.record; if (!record?.appointmentOn || !await confirmAction({ title: `取消“${item.vaccineName} · 第${item.dose}剂”的预约？`, description: '仅清除门诊预约时间，系统建议接种日期仍会保留。', confirmLabel: '取消预约', danger: true })) return; try { await api.updateVaccineRecord(record.id, { id: record.id, vaccineName: record.vaccineName, category: record.category, dose: record.dose, plannedOn: record.plannedOn, appointmentOn: null, appointmentTime: null, administeredOn: record.administeredOn, note: record.note }); await loadVaccineRecords(); setToast({ message: '门诊预约已取消' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '取消预约失败' }); } }
  function openVaccines() { setHistoryMode('vaccine'); setTab('history'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function changeVaccineReminders(value: boolean) { setVaccineRemindersEnabled(value); localStorage.setItem('babycare-vaccine-reminders', value ? 'on' : 'off'); setToast({ message: value ? '首页疫苗提醒已开启' : '首页疫苗提醒已关闭' }); }

  const todayRecords = useMemo(() => records.filter(r => isoDay(new Date(r.occurredAt)) === isoDay(new Date())), [records]);
  const weeklyGrowth = growthRecords.find(record => weekContains(record));
  const pull = usePullToRefresh(Boolean(authenticated && currentUser && (tab === 'today' || tab === 'history' || tab === 'archive') && !editor && !growthEditor && !vaccineEditor && !auditRecord), refreshAll);

  if (authenticated === null) return <main className="loading-page"><img src="/bear-bottle.png" alt="" /><p>正在打开照护记录…</p></main>;
  if (!authenticated || !currentUser) return <Login onSuccess={user => { rememberUser(user); setCurrentUser(user); setRecords(getCachedRecords(user.id)); setAuthenticated(true); setOfflineSession(false); }} />;
  const currentMember = familyMembers.find(member => member.id === currentUser.id)!;
  const connectionLabel = offlineSession ? '离线身份' : !online ? '离线' : pendingCount ? `待同步 ${pendingCount} 条` : refreshing ? '正在更新' : '已连接';
  const pullLabel = pull.phase === 'refreshing' ? '正在更新' : pull.phase === 'done' ? '已更新' : pull.phase === 'ready' ? '松开刷新' : '继续下拉刷新';
  const pullOffset = pull.phase === 'refreshing' || pull.phase === 'done' ? 8 : Math.min(8, pull.distance - 44);
  return <div className="app">{pull.phase !== 'idle' && <div className={`pull-indicator ${pull.phase}`} style={{ transform: `translate(-50%, ${pullOffset}px)` }} role="status"><i aria-hidden="true" />{pullLabel}</div>}<div className="top-status"><button className="user-pill" onClick={() => setTab('settings')} aria-label={`打开设置，当前身份${currentUser.name}${roleNames[currentUser.role]}`}><img src={currentMember.icon} alt="" /><b>{currentUser.name}</b><span>{roleNames[currentUser.role]}</span></button><div className={`network-pill ${online ? refreshing ? 'syncing' : '' : 'offline'}`} role="status" aria-live="polite">{connectionLabel}</div></div>
    {toast && <div className={`toast ${toast.actionLabel ? 'with-action' : ''}`} onAnimationEnd={() => !toast.actionLabel && setToast(null)} role="status"><span>{toast.message}</span>{toast.actionLabel && <button onClick={async () => { await toast.onAction?.(); }}>{toast.actionLabel}</button>}<button className="toast-close" aria-label="关闭提示" onClick={() => setToast(null)}>×</button></div>}
    <main className="main-content">
      {tab === 'today' && <TodayView profile={profile} records={todayRecords} vaccineRecords={vaccineRecords} vaccineCatalog={vaccineCatalog} vaccineRemindersEnabled={vaccineRemindersEnabled} careItems={careItems} capabilities={capabilities} manager={canManage(currentUser)} superadmin={currentUser?.role === 'superadmin'} weeklyGrowth={weeklyGrowth} onAddGrowth={() => setGrowthEditor('new')} onAdd={type => setEditor(blankDraft(type))} online={online} onOpenSettings={() => setTab('settings')} onOpenVaccines={openVaccines} onCompleteVaccine={item => setVaccineEditor({ mode: 'complete', item })} onAppointmentVaccine={item => setVaccineEditor({ mode: 'appointment', item })} onSupplement={recordSupplement} onEdit={setEditor} onDelete={remove} onAudit={setAuditRecord} />}
      {tab === 'history' && <HistoryView records={records} deletedRecords={deletedRecords} vaccineRecords={vaccineRecords} vaccineCatalog={vaccineCatalog} deletedVaccineRecords={deletedVaccineRecords} profile={profile} historyMode={historyMode} setHistoryMode={setHistoryMode} careItems={careItems} manager={canManage(currentUser)} selected={selectedDate} setSelected={setSelectedDate} onEdit={setEditor} onDelete={remove} onAudit={setAuditRecord} onLoadDeleted={loadDeletedRecords} onRestore={restoreDeleted} onPurge={purgeDeleted} onOpenVaccineEditor={setVaccineEditor} onCancelVaccineAppointment={item => void cancelVaccineAppointment(item)} onDeleteVaccine={record => void removeVaccine(record)} onRestoreVaccine={record => void restoreVaccine(record)} onLoadDeletedVaccines={() => void loadDeletedVaccineRecords()} />}
      {tab === 'trends' && <TrendsView records={records} />}
      {tab === 'archive' && <ArchiveView profile={profile} growthRecords={growthRecords} deletedGrowthRecords={deletedGrowthRecords} vaccineRecords={vaccineRecords} vaccineCatalog={vaccineCatalog} user={currentUser} onOpenVaccines={openVaccines} onEditGrowth={setGrowthEditor} onAddGrowth={() => setGrowthEditor('new')} onDeleteGrowth={removeGrowth} onRestoreGrowth={restoreGrowth} onPurgeGrowth={purgeGrowth} onProfileSaved={value => { setProfile(value); setToast({ message: '宝宝资料已保存' }); }} />}
      {tab === 'settings' && <SettingsView careItems={careItems} vaccineCatalog={vaccineCatalog} capabilities={capabilities} user={currentUser} vaccineRemindersEnabled={vaccineRemindersEnabled} onVaccineRemindersChanged={changeVaccineReminders} onVaccineCatalogChanged={loadVaccineCatalog} onCapabilitiesChanged={loadCapabilities} onCareItemsChanged={loadCareItems} onImported={refreshAll} onLogout={async () => { try { await api.logout(); } catch { /* local logout still succeeds */ } clearRememberedUser(); setAuthenticated(false); setCurrentUser(null); setRecords([]); setDeletedRecords([]); setGrowthRecords([]); setDeletedGrowthRecords([]); setVaccineRecords([]); setDeletedVaccineRecords([]); setVaccineCatalog([]); }} />}
    </main>
    {(tab === 'today' || tab === 'history') && <button className="floating-add" onClick={() => historyMode === 'vaccine' && tab === 'history' ? setVaccineEditor({ mode: 'add' }) : setEditor(blankDraft())} aria-label={historyMode === 'vaccine' && tab === 'history' ? '添加疫苗记录' : '添加照护记录'}><span>＋</span><b>记录</b></button>}
    <nav className="app-nav" aria-label="主要导航">{([['today', '/icons/nav-today.png', '今日'], ['history', '/icons/nav-records.png', '记录'], ['trends', '/icons/nav-trends.png', '趋势'], ['archive', '/icons/nav-archive.png', '档案']] as [Tab, string, string][]).map(([value, icon, label]) => <button key={value} aria-current={tab === value ? 'page' : undefined} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}><img src={icon} alt="" /><b>{label}</b></button>)}</nav>
    {editor && <RecordEditor initial={editor} careItems={careItems} onClose={() => setEditor(null)} onSave={saveOne} />}{growthEditor && <GrowthEditor key={growthEditor === 'new' ? 'new' : growthEditor.id} profile={profile} records={growthRecords} initial={growthEditor === 'new' ? undefined : growthEditor} onClose={() => setGrowthEditor(null)} onSave={saveGrowth} />}{vaccineEditor && <VaccineEditor state={vaccineEditor} profile={profile} catalog={vaccineCatalog} records={vaccineRecords} onClose={() => setVaccineEditor(null)} onSave={saveVaccine} />}{auditRecord && <AuditDialog record={auditRecord} onClose={() => setAuditRecord(null)} />}
  </div>;
}
