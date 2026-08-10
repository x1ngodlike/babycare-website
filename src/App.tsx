import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { addDays, calculateAge, isoDay, startOfWeek, toLocalInput } from './date';
import { createUuid } from './id';
import { cacheProfile, cacheRecords, clearRememberedUser, getCachedProfile, getCachedRecords, getOutbox, getRememberedUser, queueAction, rememberUser, setOutbox } from './offline';
import type { AuditEntry, AuditIdentity, BowelSize, CareRecord, DraftRecord, FamilyId, Profile, RecordType, SessionUser, Supplement } from './types';
import { parseVoiceRecords } from './voice';

type Tab = 'today' | 'history' | 'trends' | 'settings';
type SpeechEvent = { results: ArrayLike<{ 0: { transcript: string } }> };
type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
};
type ToastState = { message: string; actionLabel?: string; onAction?: () => void | Promise<void> };

const typeNames: Record<RecordType, string> = { feeding: '喂奶', supplement: '用药', bowel: '排便', note: '其他情况' };
const typeIcons: Record<RecordType, string> = { feeding: '/icons/quick-feeding.png', supplement: '/icons/record-supplement.png', bowel: '/icons/quick-bowel.png', note: '/icons/quick-note.png' };
const supplements: Supplement[] = ['AD', 'VD', '益生菌'];
const familyMembers: { id: FamilyId; name: string; role: string; icon: string }[] = [
  { id: 'father', name: '爸爸', role: '管理员', icon: '/icons/father.png' },
  { id: 'mother', name: '妈妈', role: '普通用户', icon: '/icons/mother.png' },
  { id: 'grandfather', name: '爷爷', role: '普通用户', icon: '/icons/grandfather.png' },
  { id: 'grandmother', name: '奶奶', role: '普通用户', icon: '/icons/grandmother.png' }
];
const auditNames: Record<AuditIdentity, string> = { father: '爸爸', mother: '妈妈', grandfather: '爷爷', grandmother: '奶奶', legacy: '历史数据' };
const auditActions: Record<AuditEntry['action'], string> = { create: '创建记录', update: '修改记录', delete: '删除记录', restore: '恢复记录', import: '从备份导入' };

const blankDraft = (type: RecordType = 'feeding'): DraftRecord => ({ id: createUuid(), type, occurredAt: new Date().toISOString(), breastMilkMl: null, formulaMl: null });

function summary(record: CareRecord | DraftRecord) {
  if (record.type === 'feeding') return [record.breastMilkMl ? `母乳 ${record.breastMilkMl} 毫升` : '', record.formulaMl ? `奶粉 ${record.formulaMl} 毫升` : ''].filter(Boolean).join(' · ');
  if (record.type === 'supplement') return `${record.supplement || '营养补充剂'}已服用`;
  if (record.type === 'bowel') return `排便量：${record.bowelSize || '中'}`;
  return record.note || '其他情况';
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

function useDialogFocus(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href]') || [])];
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable(); if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [onClose, ref]);
}

function Login({ onSuccess }: { onSuccess: (user: SessionUser) => void }) {
  const [identity, setIdentity] = useState<FamilyId>('father');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api.login(identity, password); onSuccess(result.user); }
    catch (err) { setError(err instanceof Error ? err.message : '登录失败'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card">
    <div className="brand-bear"><img src="/bear-bottle.png" alt="小熊抱着奶瓶" /></div>
    <h1>宝宝照护记录</h1>
    <p className="supporting">家人共享同一份喂养、用药和排便记录。</p>
    <form onSubmit={submit}><fieldset className="identity-picker"><legend>选择身份</legend><div>{familyMembers.map(member => <button type="button" key={member.id} aria-pressed={identity === member.id} className={identity === member.id ? 'selected' : ''} onClick={() => { setIdentity(member.id); setPassword(''); }}><img src={member.icon} alt="" /><b>{member.name}</b><small>{member.role}</small></button>)}</div></fieldset>
      <label>{familyMembers.find(member => member.id === identity)?.name}的密码<input autoFocus type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
      {error && <p className="error-text" role="alert">{error}</p>}<button className="btn primary full" disabled={busy || !password}>{busy ? '正在登录…' : '进入记录'}</button>
    </form>
  </section></main>;
}

function hasEnteredContent(value: DraftRecord) {
  return Boolean(value.breastMilkMl || value.formulaMl || value.supplement || value.bowelSize || value.note?.trim());
}

function RecordEditor({ initial, onClose, onSave }: { initial: DraftRecord; onClose(): void; onSave(value: DraftRecord): Promise<void> }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  const requestClose = useCallback(() => { if (!dirty || window.confirm('尚未保存，确定关闭吗？')) onClose(); }, [dirty, onClose]);
  useDialogFocus(dialogRef, requestClose);
  function switchType(type: RecordType) {
    if (type === value.type) return;
    if (hasEnteredContent(value) && !window.confirm('切换类型会清空已填写内容，是否继续？')) return;
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
      <div className="type-switch">{(Object.keys(typeNames) as RecordType[]).map(type => <button type="button" key={type} aria-pressed={value.type === type} className={value.type === type ? 'active' : ''} onClick={() => switchType(type)}>{typeNames[type]}</button>)}</div>
      <form className="editor-form" onSubmit={submit}>
        <label>记录时间<input type="datetime-local" max={toLocalInput(new Date(Date.now() + 10 * 60 * 1000).toISOString())} value={toLocalInput(value.occurredAt)} onChange={e => setValue({ ...value, occurredAt: new Date(e.target.value).toISOString() })} required /></label>
        {value.type === 'feeding' && <div className="input-pair"><label>母乳量 <span>毫升</span><input inputMode="numeric" type="number" min="0" max="500" placeholder="例如 90" value={value.breastMilkMl ?? ''} onChange={e => setValue({ ...value, breastMilkMl: e.target.value ? Number(e.target.value) : null })} /></label><label>奶粉量 <span>毫升</span><input inputMode="numeric" type="number" min="0" max="500" placeholder="例如 120" value={value.formulaMl ?? ''} onChange={e => setValue({ ...value, formulaMl: e.target.value ? Number(e.target.value) : null })} /></label></div>}
        {value.type === 'supplement' && <ChoiceField label="选择营养补充剂" values={supplements} selected={value.supplement} onSelect={supplement => setValue({ ...value, supplement })} />}
        {value.type === 'bowel' && <ChoiceField label="排便量" values={['大', '中', '小'] as BowelSize[]} selected={value.bowelSize} onSelect={bowelSize => setValue({ ...value, bowelSize })} />}
        {(value.type === 'note' || value.type === 'feeding' || value.type === 'bowel') && <label>{value.type === 'note' ? '情况说明' : '补充说明（选填）'}<textarea rows={3} maxLength={200} placeholder={value.type === 'note' ? '例如：今天有点吐奶' : '可留空'} value={value.note ?? ''} onChange={e => setValue({ ...value, note: e.target.value })} /></label>}
        {error && <p className="error-text" role="alert">{error}</p>}
        <footer className="editor-actions"><button type="button" className="btn secondary" onClick={requestClose}>取消</button><button className="btn primary" disabled={busy}>{busy ? '保存中…' : '确认保存'}</button></footer>
      </form>
    </section>
  </div>;
}

function ChoiceField<T extends string>({ label, values, selected, onSelect }: { label: string; values: T[]; selected?: T | null; onSelect(value: T): void }) {
  return <fieldset><legend>{label}</legend><div className="choice-group">{values.map(value => <button type="button" key={value} aria-pressed={selected === value} className={selected === value ? 'selected' : ''} onClick={() => onSelect(value)}>{selected === value && '✓ '}{value}</button>)}</div></fieldset>;
}

function VoiceCapture({ aiAvailable, onDrafts }: { aiAvailable: boolean; onDrafts(drafts: DraftRecord[], transcript: string): void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'processing'>('idle');
  const [message, setMessage] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); recognition.current?.abort(); if (recorder.current?.state === 'recording') recorder.current.stop(); }, []);
  const browserSpeech = () => {
    const source = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Recognition = source.SpeechRecognition || source.webkitSpeechRecognition;
    if (!Recognition) { setMessage('当前浏览器不支持语音，请使用下方快捷记录。'); return; }
    const next = new Recognition(); recognition.current = next; next.lang = 'zh-CN'; next.interimResults = false; next.continuous = false;
    next.onresult = event => { const text = event.results[0]?.[0]?.transcript || ''; const drafts = parseVoiceRecords(text); drafts.length ? onDrafts(drafts, text) : setMessage(`没能理解“${text}”`); };
    next.onerror = () => setMessage('没有识别成功，请检查麦克风权限。');
    next.onend = () => { recognition.current = null; setState('idle'); };
    setState('recording'); next.start();
  };
  async function start() {
    setMessage('');
    if (!aiAvailable || !navigator.mediaDevices || !window.MediaRecorder) return browserSpeech();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(stream); chunks.current = [];
      next.ondataavailable = event => event.data.size && chunks.current.push(event.data);
      next.onstop = async () => {
        stream.getTracks().forEach(track => track.stop()); setState('processing');
        try { const result = await api.transcribe(new Blob(chunks.current, { type: next.mimeType || 'audio/webm' })); const drafts = parseVoiceRecords(result.transcript); drafts.length ? onDrafts(drafts, result.transcript) : setMessage(`识别到“${result.transcript}”，但没有找到可保存的信息。`); }
        catch (err) { setMessage(err instanceof Error ? err.message : 'AI 语音识别失败'); }
        finally { setState('idle'); }
      };
      recorder.current = next; next.start(); setState('recording'); timer.current = window.setTimeout(() => next.state === 'recording' && next.stop(), 20_000);
    } catch { setMessage('无法使用麦克风，请检查浏览器权限。'); }
  }
  function stop() {
    if (timer.current) clearTimeout(timer.current);
    recognition.current?.stop();
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }
  return <section className="voice-panel"><div className="voice-copy"><p className="kicker">{aiAvailable ? 'AI 语音' : '浏览器语音'}</p><h2>说一句，记完整</h2><p>“下午三点母乳九十，AD 吃了，排便中。”</p></div>
    <button className={`voice-orb ${state}`} onClick={state === 'recording' ? stop : start} disabled={state === 'processing'} aria-label={state === 'recording' ? '停止语音记录' : `开始${aiAvailable ? 'AI' : '浏览器'}语音记录`}><span>{state === 'processing' ? '···' : state === 'recording' ? '■' : '●'}</span><b>{state === 'processing' ? '识别中' : state === 'recording' ? '点此结束' : aiAvailable ? 'AI 语音' : '语音记录'}</b></button>
    {message && <p className="voice-status" role="status">{message}</p>}
  </section>;
}

function VoiceReview({ initial, transcript, onClose, onSave }: { initial: DraftRecord[]; transcript: string; onClose(): void; onSave(values: DraftRecord[]): Promise<void> }) {
  const [values, setValues] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const dialogRef = useRef<HTMLElement | null>(null); useDialogFocus(dialogRef, onClose);
  async function confirm() { setBusy(true); setError(''); try { await onSave(values); onClose(); } catch (err) { setError(err instanceof Error ? err.message : '保存失败'); setBusy(false); } }
  return <div className="modal-layer"><section ref={dialogRef} className="editor review" role="dialog" aria-modal="true" aria-labelledby="review-title"><header className="editor-head"><div><p className="kicker">语音识别草稿</p><h2 id="review-title">确认 {values.length} 条记录</h2></div><button className="close-btn" onClick={onClose} aria-label="关闭">×</button></header>
    <blockquote>“{transcript}”</blockquote><div className="review-list">{values.map((value, index) => <article key={`${value.type}-${index}`}><img className="record-mark" src={typeIcons[value.type]} alt="" /><div><small>{new Date(value.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} · {typeNames[value.type]}</small><strong>{summary(value)}</strong></div><button onClick={() => setValues(items => items.filter((_, i) => i !== index))} aria-label={`移除${typeNames[value.type]}`}>×</button></article>)}</div>
    <p className="review-hint">请检查时间和数量；识别不准确的项目可以移除后手动添加。</p>{error && <p className="error-text">{error}</p>}<footer className="editor-actions"><button className="btn secondary" onClick={onClose}>取消</button><button className="btn primary" disabled={busy || !values.length} onClick={confirm}>{busy ? '保存中…' : `保存 ${values.length} 条记录`}</button></footer>
  </section></div>;
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

function Timeline({ records, emptyText = '这一天还没有记录', onEdit, onDelete, onAudit }: { records: CareRecord[]; emptyText?: string; onEdit(record: CareRecord): void; onDelete(record: CareRecord): void; onAudit(record: CareRecord): void }) {
  if (!records.length) return <div className="empty-state"><span>○</span><h3>{emptyText}</h3><p>记录后会按时间排列在这里。</p></div>;
  return <div className="timeline">{records.map(record => { const created = auditNames[record.createdBy || 'legacy']; const updated = auditNames[record.updatedBy || record.createdBy || 'legacy']; const changed = record.updatedBy && record.updatedBy !== record.createdBy; return <article className="timeline-item" key={record.id}><div className="time-col"><time>{new Date(record.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</time><i /></div><img className="record-mark" src={typeIcons[record.type]} alt="" /><div className="record-copy"><small>{typeNames[record.type]}</small><strong>{summary(record)}</strong>{record.note && record.type !== 'note' && <p>{record.note}</p>}<em>{created === '历史数据' ? '历史数据' : `${created}录入`}{changed ? ` · ${updated}修改` : ''}</em></div><details><summary aria-label={`${summary(record)}的操作菜单`}>•••</summary><div><button onClick={() => onAudit(record)}>操作记录</button><button onClick={() => onEdit(record)}>编辑</button><button className="danger" onClick={() => onDelete(record)}>删除</button></div></details></article>; })}</div>;
}

function TodayView({ profile, records, aiAvailable, onAdd, onVoice, onSupplement, onEdit, onDelete, onAudit }: { profile: Profile; records: CareRecord[]; aiAvailable: boolean; onAdd(type: RecordType): void; onVoice(drafts: DraftRecord[], transcript: string): void; onSupplement(value: Supplement): Promise<void>; onEdit(record: CareRecord): void; onDelete(record: CareRecord): void; onAudit(record: CareRecord): void }) {
  const [savingSupplement, setSavingSupplement] = useState<Supplement | null>(null);
  const feed = records.filter(r => r.type === 'feeding'); const breast = feed.reduce((sum, r) => sum + (r.breastMilkMl || 0), 0); const formula = feed.reduce((sum, r) => sum + (r.formulaMl || 0), 0); const done = new Map(records.filter(r => r.type === 'supplement').map(r => [r.supplement, r])); const lastFeed = feed[0];
  async function addSupplement(item: Supplement) { setSavingSupplement(item); try { await onSupplement(item); } finally { setSavingSupplement(null); } }
  return <div className="today-layout"><div className="today-primary">
    <section className="baby-hero"><div><p className="kicker">今日照护 · {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</p><h1>{profile.name}</h1><p>{calculateAge(profile.birthDate)}{lastFeed ? ` · 上次喂奶 ${new Date(lastFeed.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ' · 今天还未喂奶'}</p></div><img src="/bear-bottle.png" alt="" /></section>
    <section className="metric-band" aria-label="今日概览"><div><span>母乳</span><strong>{breast}</strong><small>毫升</small></div><div><span>奶粉</span><strong>{formula}</strong><small>毫升</small></div><div><span>喂奶</span><strong>{feed.length}</strong><small>次</small></div><div><span>排便</span><strong>{records.filter(r => r.type === 'bowel').length}</strong><small>次</small></div></section>
    <VoiceCapture aiAvailable={aiAvailable} onDrafts={onVoice} />
    <section className="quick-section"><div className="section-title"><h2>快捷记录</h2></div><div className="quick-grid"><button onClick={() => onAdd('feeding')}><img className="quick-icon" src="/icons/quick-feeding.png" alt="" /><b>记录喂奶</b><small>母乳、奶粉</small></button><button onClick={() => onAdd('bowel')}><img className="quick-icon" src="/icons/quick-bowel.png" alt="" /><b>记录排便</b><small>大、中、小</small></button><button onClick={() => onAdd('note')}><img className="quick-icon" src="/icons/quick-note.png" alt="" /><b>其他情况</b><small>吐奶、状态</small></button></div></section>
    <section className="medicine-card"><h2>今日用药</h2><div className="medicine-actions">{supplements.map(item => { const record = done.get(item); return <button key={item} className={record ? 'done' : ''} disabled={Boolean(record) || Boolean(savingSupplement)} onClick={() => addSupplement(item)}><span>{record ? '✓' : savingSupplement === item ? '···' : '+'}</span><b>{item}</b><small>{record ? `${auditNames[record.createdBy]} ${new Date(record.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}` : savingSupplement === item ? '记录中' : '点按记录'}</small></button>; })}</div></section>
  </div><div className="today-timeline"><div className="section-title"><h2>今天的记录</h2><span>{records.length} 条</span></div><Timeline records={records} onEdit={onEdit} onDelete={onDelete} onAudit={onAudit} /></div></div>;
}

function HistoryView({ records, selected, setSelected, onEdit, onDelete, onAudit }: { records: CareRecord[]; selected: Date; setSelected(value: Date): void; onEdit(record: CareRecord): void; onDelete(record: CareRecord): void; onAudit(record: CareRecord): void }) {
  const [query, setQuery] = useState(''); const [typeFilter, setTypeFilter] = useState<'all' | RecordType>('all'); const [actorFilter, setActorFilter] = useState<'all' | FamilyId>('all');
  const monday = startOfWeek(selected); const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const filtered = records.filter(record => {
    const dayMatches = query.trim() ? true : isoDay(new Date(record.occurredAt)) === isoDay(selected);
    const queryMatches = !query.trim() || `${typeNames[record.type]} ${summary(record)} ${record.note || ''} ${auditNames[record.createdBy]}`.toLowerCase().includes(query.trim().toLowerCase());
    return dayMatches && queryMatches && (typeFilter === 'all' || record.type === typeFilter) && (actorFilter === 'all' || record.createdBy === actorFilter);
  });
  return <div className="page-stack"><header className="page-head"><h1>历史记录</h1><p>按日期查看，或搜索全部照护信息。</p></header>
    <section className="calendar-panel"><div className="calendar-nav"><button onClick={() => setSelected(addDays(selected, -7))} aria-label="上一周">‹</button><strong>{monday.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</strong><button onClick={() => setSelected(addDays(selected, 7))} aria-label="下一周">›</button></div><div className="week-strip">{days.map(day => <button key={isoDay(day)} aria-pressed={isoDay(day) === isoDay(selected)} className={`${isoDay(day) === isoDay(selected) ? 'selected' : ''} ${isoDay(day) === isoDay(new Date()) ? 'today' : ''}`} onClick={() => setSelected(day)}><span>{day.toLocaleDateString('zh-CN', { weekday: 'short' })}</span><b>{day.getDate()}</b></button>)}</div></section>
    <label className="search-field"><span aria-hidden="true">⌕</span><span className="sr-only">搜索全部记录</span><input aria-label="搜索全部记录" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索奶粉、AD、排便、备注或录入人" /></label>
    <div className="record-filters"><label>记录类型<select value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'all' | RecordType)}><option value="all">全部类型</option>{(Object.keys(typeNames) as RecordType[]).map(type => <option key={type} value={type}>{typeNames[type]}</option>)}</select></label><label>录入人<select value={actorFilter} onChange={e => setActorFilter(e.target.value as 'all' | FamilyId)}><option value="all">全部家人</option>{familyMembers.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div>
    <div className="section-title"><h2>{query.trim() ? '全部搜索结果' : selected.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</h2><span>{filtered.length} 条</span></div><Timeline records={filtered} emptyText={query.trim() ? '没有找到匹配记录' : undefined} onEdit={onEdit} onDelete={onDelete} onAudit={onAudit} />
  </div>;
}

function TrendsView({ records }: { records: CareRecord[] }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(new Date(), index - 6));
  const data = days.map(day => { const items = records.filter(r => isoDay(new Date(r.occurredAt)) === isoDay(day)); return { day, breast: items.reduce((s, r) => s + (r.breastMilkMl || 0), 0), formula: items.reduce((s, r) => s + (r.formulaMl || 0), 0), feeds: items.filter(r => r.type === 'feeding').length, bowel: items.filter(r => r.type === 'bowel').length }; });
  const maxMilk = Math.max(1, ...data.map(item => item.breast + item.formula)); const total = data.reduce((s, item) => s + item.breast + item.formula, 0); const feedingDays = data.filter(item => item.feeds > 0).length;
  return <div className="page-stack"><header className="page-head"><h1>七日趋势</h1><p>帮助家人快速观察记录是否连续。</p></header>
    <section className="trend-summary"><div><span>七日总奶量</span><strong>{total}</strong><small>毫升</small></div><div><span>有记录日均</span><strong>{feedingDays ? Math.round(total / feedingDays) : 0}</strong><small>毫升</small></div><div><span>喂奶次数</span><strong>{data.reduce((s, i) => s + i.feeds, 0)}</strong><small>次</small></div></section>
    <section className="chart-card"><div className="section-title"><h2>每日奶量</h2><div className="legend"><i className="breast" />母乳<i className="formula" />奶粉</div></div><div className="bar-chart">{data.map(item => <div className="bar-day" key={isoDay(item.day)} aria-label={`${item.day.toLocaleDateString('zh-CN')}，母乳${item.breast}毫升，奶粉${item.formula}毫升`}><div className="bar-value">{item.breast + item.formula || ''}</div><div className="bar-track"><i className="formula" style={{ height: `${item.formula / maxMilk * 100}%` }} /><i className="breast" style={{ height: `${item.breast / maxMilk * 100}%` }} /></div><span>{item.day.toLocaleDateString('zh-CN', { weekday: 'short' })}</span></div>)}</div><div className="chart-values">{data.map(item => <div key={isoDay(item.day)}><time>{item.day.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</time><span>母乳 {item.breast}</span><span>奶粉 {item.formula}</span></div>)}</div></section>
    <section className="rhythm-list"><div className="section-title"><h2>次数概览</h2></div>{data.map(item => <div key={isoDay(item.day)}><time>{item.day.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })}</time><span>喂奶 <b>{item.feeds}</b> 次</span><span>排便 <b>{item.bowel}</b> 次</span></div>)}</section>
  </div>;
}

function SettingsView({ profile, setProfile, aiAvailable, user, onImported, onLogout }: { profile: Profile; setProfile(value: Profile): void; aiAvailable: boolean; user: SessionUser; onImported(): void; onLogout(): void }) {
  const [form, setForm] = useState(profile); const [message, setMessage] = useState(''); useEffect(() => setForm(profile), [profile]);
  async function save(event: React.FormEvent) { event.preventDefault(); try { const next = await api.updateProfile(form); setProfile(next); cacheProfile(next); setMessage('宝宝资料已保存'); } catch (err) { setMessage(err instanceof Error ? err.message : '保存失败'); } }
  async function importFile(file?: File) { if (!file || !window.confirm('导入会恢复宝宝资料并合并记录，是否继续？')) return; try { const result = await api.importData(JSON.parse(await file.text())); setMessage(`已导入 ${result.imported} 条记录${result.profileRestored ? '，宝宝资料已恢复' : ''}`); onImported(); } catch { setMessage('导入失败，请选择本应用导出的备份文件'); } }
  const member = familyMembers.find(item => item.id === user.id)!;
  return <div className="page-stack"><header className="page-head"><h1>设置</h1><p>{user.role === 'admin' ? '管理宝宝资料、语音服务和数据备份。' : '查看当前身份和应用状态。'}</p></header><section className="account-card"><img src={member.icon} alt="" /><div><span>当前身份</span><h2>{user.name}</h2><p>{user.role === 'admin' ? '管理员' : '普通用户'}</p></div><i>{user.role === 'admin' ? '管理权限' : '记录权限'}</i></section><div className="settings-grid">
    {user.role === 'admin' && <><section className="settings-card"><h2>宝宝资料</h2><form onSubmit={save}><label>宝宝姓名<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>出生日期<input type="date" max={isoDay(new Date())} value={form.birthDate} onChange={e => setForm({ ...form, birthDate: e.target.value })} /></label><button className="btn primary">保存资料</button></form></section>
    <section className="settings-card"><div className="setting-status"><h2>智能语音识别</h2><span className={aiAvailable ? 'on' : ''}>{aiAvailable ? 'AI 已启用' : '使用浏览器语音'}</span></div><p>{aiAvailable ? '短录音由服务器转发给 AI 语音服务，生成草稿后仍需确认。' : '配置服务器语音服务密钥后可启用 AI；目前使用浏览器自带语音识别。'}</p></section>
    <section className="settings-card"><h2>数据备份</h2><p>备份包含宝宝资料、有效及已删除记录和操作历史；导入过程失败时不会写入部分数据。</p><div className="data-buttons"><a className="btn secondary" href="/api/export" download>导出完整备份</a><label className="btn secondary">导入备份<input className="sr-only" type="file" accept="application/json" onChange={e => importFile(e.target.files?.[0])} /></label></div></section></>}
    {user.role === 'member' && <section className="settings-card permission-note"><p className="kicker">普通用户权限</p><h2>可以记录，不能管理</h2><p>你可以查看、添加、修改和删除照护记录，也可以使用语音记录。宝宝资料、AI 服务和数据备份仅爸爸可以操作。</p></section>}
  </div>{message && <p className="success-text" role="status">{message}</p>}<button className="logout" onClick={onLogout}>退出当前身份</button></div>;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<Profile>(getCachedProfile() || { name: '示例宝宝', birthDate: '2026-01-01' });
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [records, setRecords] = useState<CareRecord[]>([]);
  const [tab, setTab] = useState<Tab>('today'); const [selectedDate, setSelectedDate] = useState(new Date());
  const [editor, setEditor] = useState<DraftRecord | null>(null); const [voiceReview, setVoiceReview] = useState<{ drafts: DraftRecord[]; transcript: string } | null>(null); const [auditRecord, setAuditRecord] = useState<CareRecord | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false); const [online, setOnline] = useState(navigator.onLine); const [offlineSession, setOfflineSession] = useState(false); const [pendingCount, setPendingCount] = useState(0); const [toast, setToast] = useState<ToastState | null>(null);

  const updateLocalRecords = useCallback((userId: string, updater: (items: CareRecord[]) => CareRecord[]) => {
    setRecords(items => { const next = updater(items).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)); cacheRecords(userId, next); return next; });
  }, []);

  const loadRecords = useCallback(async () => {
    if (!currentUser) return;
    const from = addDays(new Date(), -730); from.setHours(0, 0, 0, 0); const to = addDays(new Date(), 8); to.setHours(0, 0, 0, 0);
    try { const next = await api.records(from.toISOString(), to.toISOString()); setRecords(next); cacheRecords(currentUser.id, next); setOnline(true); setOfflineSession(false); }
    catch { setRecords(getCachedRecords(currentUser.id)); setOnline(false); }
  }, [currentUser]);

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
    if (queue.length && !remaining.length) { setToast({ message: discarded ? `${discarded} 条离线操作因冲突未同步` : '离线记录已同步' }); await loadRecords(); }
  }, [currentUser, loadRecords]);

  useEffect(() => {
    api.session().then(value => { setAuthenticated(value.authenticated); setCurrentUser(value.user); if (value.user) { rememberUser(value.user); setRecords(getCachedRecords(value.user.id)); } })
      .catch(() => { const remembered = getRememberedUser(); if (remembered) { setCurrentUser(remembered); setAuthenticated(true); setOfflineSession(true); setOnline(false); setRecords(getCachedRecords(remembered.id)); setPendingCount(getOutbox(remembered.id).length); } else { setAuthenticated(false); setCurrentUser(null); } });
  }, []);

  useEffect(() => {
    if (!authenticated || !currentUser) return;
    setPendingCount(getOutbox(currentUser.id).length);
    api.profile().then(value => { setProfile(value); cacheProfile(value); }).catch(() => undefined);
    api.capabilities().then(value => setAiAvailable(value.aiTranscription)).catch(() => setAiAvailable(false));
    loadRecords().then(() => { if (navigator.onLine) syncOutbox(); });
  }, [authenticated, currentUser, loadRecords, syncOutbox]);

  useEffect(() => {
    const onOnline = () => { setOnline(true); syncOutbox(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [syncOutbox]);

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

  async function saveMany(values: DraftRecord[]) {
    if (!currentUser) throw new Error('请先登录');
    let queued = 0;
    for (const input of values) {
      const value = { ...input, id: input.id || createUuid() };
      try { await api.createRecord(value); }
      catch (error) { if (error instanceof ApiError) throw error; queueAction(currentUser.id, { action: 'create', payload: value }); updateLocalRecords(currentUser.id, items => [optimisticRecord(value, currentUser), ...items]); queued += 1; }
    }
    setPendingCount(getOutbox(currentUser.id).length); if (!queued) await loadRecords(); else setOnline(false);
    setToast({ message: queued ? `${queued} 条记录已暂存，联网后同步` : `已保存 ${values.length} 条记录` });
  }

  async function recordSupplement(supplement: Supplement) {
    try { await saveOne({ ...blankDraft('supplement'), supplement }); }
    catch (error) {
      if (error instanceof ApiError && error.code === 'DUPLICATE_SUPPLEMENT') { const existing = (error.details as { existing?: CareRecord })?.existing; setToast({ message: existing ? `${supplement} 已由${auditNames[existing.createdBy]}在 ${new Date(existing.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} 记录` : `${supplement} 今天已经记录` }); await loadRecords(); return; }
      setToast({ message: error instanceof Error ? error.message : '用药记录失败' });
    }
  }

  async function undoDelete(record: CareRecord, wasPendingCreate: boolean) {
    if (!currentUser) return;
    try { if (wasPendingCreate) { queueAction(currentUser.id, { action: 'create', payload: record }); } else if (online) { await api.restoreRecord(record.id); } else { queueAction(currentUser.id, { action: 'restore', recordId: record.id }); } updateLocalRecords(currentUser.id, items => [record, ...items.filter(item => item.id !== record.id)]); setPendingCount(getOutbox(currentUser.id).length); setToast({ message: '记录已恢复' }); }
    catch (error) { setToast({ message: error instanceof Error ? error.message : '恢复失败' }); }
  }

  async function remove(record: CareRecord) {
    if (!currentUser || !window.confirm(`删除“${summary(record)}”吗？删除后可以撤销。`)) return;
    const pendingCreate = getOutbox(currentUser.id).some(item => item.action === 'create' && item.payload?.id === record.id);
    try { await api.deleteRecord(record.id); updateLocalRecords(currentUser.id, items => items.filter(item => item.id !== record.id)); }
    catch (error) {
      if (error instanceof ApiError) { setToast({ message: error.message }); return; }
      queueAction(currentUser.id, { action: 'delete', recordId: record.id }); updateLocalRecords(currentUser.id, items => items.filter(item => item.id !== record.id)); setOnline(false);
    }
    setPendingCount(getOutbox(currentUser.id).length); setToast({ message: '记录已删除', actionLabel: '撤销', onAction: () => undoDelete(record, pendingCreate) });
  }

  const todayRecords = useMemo(() => records.filter(r => isoDay(new Date(r.occurredAt)) === isoDay(new Date())), [records]);

  if (authenticated === null) return <main className="loading-page"><img src="/bear-bottle.png" alt="" /><p>正在打开照护记录…</p></main>;
  if (!authenticated || !currentUser) return <Login onSuccess={user => { rememberUser(user); setCurrentUser(user); setRecords(getCachedRecords(user.id)); setAuthenticated(true); setOfflineSession(false); }} />;
  const currentMember = familyMembers.find(member => member.id === currentUser.id)!;
  return <div className="app"><div className="top-status"><div className="user-pill"><img src={currentMember.icon} alt="" /><b>{currentUser.name}</b><span>{currentUser.role === 'admin' ? '管理员' : '普通用户'}</span></div><div className={`network-pill ${online ? '' : 'offline'}`}>{offlineSession ? '离线身份' : online ? '已同步' : '离线'}{pendingCount ? ` · 待同步 ${pendingCount}` : ''}</div></div>
    {toast && <div className={`toast ${toast.actionLabel ? 'with-action' : ''}`} onAnimationEnd={() => !toast.actionLabel && setToast(null)} role="status"><span>{toast.message}</span>{toast.actionLabel && <button onClick={async () => { await toast.onAction?.(); }}>{toast.actionLabel}</button>}<button className="toast-close" aria-label="关闭提示" onClick={() => setToast(null)}>×</button></div>}
    <main className="main-content">{tab === 'today' && <TodayView profile={profile} records={todayRecords} aiAvailable={aiAvailable} onAdd={type => setEditor(blankDraft(type))} onVoice={(drafts, transcript) => setVoiceReview({ drafts: drafts.map(draft => ({ ...draft, id: createUuid() })), transcript })} onSupplement={recordSupplement} onEdit={setEditor} onDelete={remove} onAudit={setAuditRecord} />}{tab === 'history' && <HistoryView records={records} selected={selectedDate} setSelected={setSelectedDate} onEdit={setEditor} onDelete={remove} onAudit={setAuditRecord} />}{tab === 'trends' && <TrendsView records={records} />}{tab === 'settings' && <SettingsView profile={profile} setProfile={setProfile} aiAvailable={aiAvailable} user={currentUser} onImported={loadRecords} onLogout={async () => { try { await api.logout(); } catch { /* local logout still succeeds */ } clearRememberedUser(); setAuthenticated(false); setCurrentUser(null); setRecords([]); }} />}</main>
    <button className="floating-add" onClick={() => setEditor(blankDraft())} aria-label="添加记录"><span>＋</span><b>记录</b></button>
    <nav className="app-nav" aria-label="主要导航">{([['today', '/icons/nav-today.png', '今日'], ['history', '/icons/nav-records.png', '记录'], ['trends', '/icons/nav-trends.png', '趋势'], ['settings', '/icons/nav-settings.png', '设置']] as [Tab, string, string][]).map(([value, icon, label]) => <button key={value} aria-current={tab === value ? 'page' : undefined} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}><img src={icon} alt="" /><b>{label}</b></button>)}</nav>
    {editor && <RecordEditor initial={editor} onClose={() => setEditor(null)} onSave={saveOne} />}{voiceReview && <VoiceReview initial={voiceReview.drafts} transcript={voiceReview.transcript} onClose={() => setVoiceReview(null)} onSave={saveMany} />}{auditRecord && <AuditDialog record={auditRecord} onClose={() => setAuditRecord(null)} />}
  </div>;
}
