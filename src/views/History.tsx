// 历史页视图：按天/七日查看照护记录、疫苗记录与已删除记录（由 App.tsx 抽出，逻辑不变）
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { addDays, isoDay } from '../date';
import { auditNames, careItemCategory, careItemIcon, familyMembers, FeedingSummary, summary, typeNames } from '../shared';
import { ActionMenu, EmptyState, SegmentedControl } from '../ui';
import HistoryOverview from './HistoryOverview';
import { VaccineHistory, type VaccineEditorState } from '../VaccineViews';
import type { VaccinePlanItem } from '../vaccines';
import type { CareItem, CareRecord, FamilyId, Profile, RecordType, VaccineCatalogItem, VaccineRecord } from '../types';

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

export function Timeline({ records, careItems, manager, emptyText = '这一天还没有记录', emptyAction, onEdit, onDelete, onAudit, searchMode = false, compactMetadata = false, hideMetadata = false }: { records: CareRecord[]; careItems: CareItem[]; manager: boolean; emptyText?: string; emptyAction?: ReactNode; onEdit(record: CareRecord): void; onDelete(record: CareRecord): void; onAudit(record: CareRecord): void; searchMode?: boolean; compactMetadata?: boolean; hideMetadata?: boolean }) {
  if (!records.length) return <EmptyState title={emptyText} description="记录后会按时间排列在这里。" image={emptyText.includes('找到') ? '/illustrations/empty-search.webp' : '/illustrations/empty-records.webp'} action={emptyAction} />;
  return <div className="timeline">{records.map(record => {
    const created = auditNames[record.createdBy || 'legacy'];
    const updated = auditNames[record.updatedBy || record.createdBy || 'legacy'];
    const changed = record.updatedBy && record.updatedBy !== record.createdBy;
    const hasHistory = record.updatedAt !== record.createdAt;
    const items = [...(manager ? [{ label: '查看操作记录', onSelect: () => onAudit(record) }] : []), { label: '修改记录', onSelect: () => onEdit(record) }, ...(manager ? [{ label: '删除记录', danger: true, onSelect: () => onDelete(record) }] : [])];
    const occurredAt = new Date(record.occurredAt);
    const time = occurredAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const date = occurredAt.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    const recordTypeName = record.type === 'supplement' ? (careItemCategory(record.supplement, careItems) === 'care' ? '护理' : '用药') : typeNames[record.type];
    const auditLabel = `${created === '历史数据' ? '历史数据' : `${created}录入`}${changed ? ` · ${updated}修改` : ''}`;
    const hasExtraNote = Boolean(record.note);
    const typeWithCreator = <>{recordTypeName}<span className="record-creator">· {created}</span>{hasHistory && !compactMetadata && !hideMetadata && <span className="audit-history-tag">已修改</span>}</>;
    return <article className={`timeline-item ${record.type}${hasExtraNote ? ' has-note' : ''}`} key={record.id}><div className={`time-col${searchMode ? ' search-time' : ''}`}><time>{searchMode && <span className="record-date">{date}</span>}<span>{time}</span></time><i /></div><img className="record-mark" src={careItemIcon(record, careItems)} alt="" /><div className="record-copy">{compactMetadata && !hideMetadata ? <div className="record-meta-row"><small>{typeWithCreator}</small><em>{auditLabel}</em></div> : <small>{typeWithCreator}</small>}<strong><FeedingSummary record={record} careItems={careItems} /></strong>{record.note && <RecordNotePreview note={record.note} />}</div><ActionMenu label={`${summary(record, careItems)}的操作菜单`} items={items} /></article>;
  })}</div>;
}

export function HistoryView({ records, deletedRecords, vaccineRecords, vaccineCatalog, profile, historyMode, setHistoryMode, careItems, manager, selected, setSelected, onEdit, onDelete, onAudit, onLoadDeleted, onRestore, onPurge, onOpenVaccineEditor, onCancelVaccineAppointment, onDeleteVaccine }: { records: CareRecord[]; deletedRecords: CareRecord[]; vaccineRecords: VaccineRecord[]; vaccineCatalog: VaccineCatalogItem[]; profile: Profile; historyMode: 'care' | 'vaccine'; setHistoryMode(value: 'care' | 'vaccine'): void; careItems: CareItem[]; manager: boolean; selected: Date; setSelected(value: Date): void; onEdit(record: CareRecord): void; onDelete(record: CareRecord): void; onAudit(record: CareRecord): void; onLoadDeleted(): Promise<void>; onRestore(record: CareRecord): Promise<void>; onPurge(record: CareRecord): Promise<void>; onOpenVaccineEditor(state: VaccineEditorState): void; onCancelVaccineAppointment(item: VaccinePlanItem): void; onDeleteVaccine(record: VaccineRecord): void }) {
  const [query, setQuery] = useState(''); const [typeFilter, setTypeFilter] = useState<'all' | RecordType>('all'); const [actorFilter, setActorFilter] = useState<'all' | FamilyId>('all'); const [view, setView] = useState<'active' | 'deleted'>('active'); const [layout, setLayout] = useState<'day' | 'overview'>('overview');
  const deletedHistoryPushed = useRef(false);
  const mobileWeekStripRef = useRef<HTMLDivElement | null>(null);
  const selectedKey = isoDay(selected);
  useEffect(() => { if (view === 'deleted' && manager) void onLoadDeleted(); }, [manager, onLoadDeleted, view]);
  useEffect(() => { const pop = () => { deletedHistoryPushed.current = false; setView('active'); }; window.addEventListener('popstate', pop); return () => { window.removeEventListener('popstate', pop); if (deletedHistoryPushed.current) window.history.back(); }; }, []);
  function openDeleted() { window.history.pushState({ babycareCareDeleted: true }, ''); deletedHistoryPushed.current = true; setView('deleted'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function closeDeleted() { if (deletedHistoryPushed.current && window.history.state?.babycareCareDeleted) window.history.back(); else { deletedHistoryPushed.current = false; setView('active'); } }
  const days = Array.from({ length: 7 }, (_, index) => addDays(selected, index - 3));
  const mobileDays = Array.from({ length: 31 }, (_, index) => addDays(selected, index - 15));
  useEffect(() => {
    if (layout !== 'day') return;
    const strip = mobileWeekStripRef.current;
    const active = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!strip || !active) return;
    const left = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
    strip.scrollTo({ left, behavior: 'smooth' });
  }, [layout, selectedKey]);
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
    <section className="calendar-panel"><div className="calendar-nav"><button onClick={() => setSelected(addDays(selected, -1))} aria-label="向前一天"><ChevronLeft size={18} strokeWidth={2.2} /></button><strong>{selected.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</strong><button onClick={() => setSelected(addDays(selected, 1))} aria-label="向后一天"><ChevronRight size={18} strokeWidth={2.2} /></button></div><div className="week-strip desktop-week-strip">{days.map(day => <button key={isoDay(day)} aria-pressed={isoDay(day) === selectedKey} className={`${isoDay(day) === selectedKey ? 'selected' : ''} ${isoDay(day) === isoDay(new Date()) ? 'today' : ''}`} onClick={() => setSelected(day)}><span>{day.toLocaleDateString('zh-CN', { weekday: 'short' })}</span><b>{day.getDate()}</b></button>)}</div><div ref={mobileWeekStripRef} className="week-strip mobile-week-strip" aria-label="滑动浏览日期，点击选择日期">{mobileDays.map(day => <button key={isoDay(day)} aria-pressed={isoDay(day) === selectedKey} className={`${isoDay(day) === selectedKey ? 'selected' : ''} ${isoDay(day) === isoDay(new Date()) ? 'today' : ''}`} onClick={() => setSelected(day)}><span>{day.toLocaleDateString('zh-CN', { weekday: 'short' })}</span><b>{day.getDate()}</b></button>)}</div></section>
    <div className="section-title history-record-heading"><h2>{query.trim() ? '全部搜索结果' : selected.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</h2><div className="section-title-actions"><span>{filtered.length} 条</span>{manager && <button className="deleted-records-link" onClick={openDeleted}>已删除 {deletedRecords.length} 条</button>}</div></div><div className="history-timeline"><Timeline records={filtered} careItems={careItems} manager={manager} emptyText={query.trim() ? '没有找到匹配记录' : undefined} onEdit={onEdit} onDelete={onDelete} onAudit={onAudit} searchMode={!!query.trim()} /></div>
    </> : <HistoryOverview records={overviewFiltered} careItems={careItems} selected={selected} onShiftDay={offset => setSelected(addDays(selected, offset))} />}</>}
  </div>;
}
