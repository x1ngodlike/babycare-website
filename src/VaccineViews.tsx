import { useEffect, useMemo, useRef, useState } from 'react';
import type { DraftVaccineRecord, Profile, VaccineCatalogItem, VaccineRecord } from './types';
import { buildVaccinePlan, catalogGroups, doseOptionLabel, formatVaccineDay, vaccineCategory, vaccineCategoryLabels, type VaccineCategory, type VaccinePlanItem } from './vaccines';
import { ActionMenu, confirmAction, EmptyState, useDialogFocus } from './ui';

export type VaccineEditorState = { mode: 'add' | 'complete' | 'appointment'; item?: VaccinePlanItem; record?: VaccineRecord };

function dayDistance(day: string) {
  const target = new Date(`${day}T12:00:00`).getTime();
  const now = new Date(); now.setHours(12, 0, 0, 0);
  return Math.round((target - now.getTime()) / 86400000);
}

function planStatus(day: string) {
  const distance = dayDistance(day);
  if (distance < 0) return { label: `已超过 ${Math.abs(distance)} 天`, tone: 'overdue' };
  if (distance === 0) return { label: '今日', tone: 'soon' };
  if (distance <= 7) return { label: `${distance} 天后`, tone: 'soon' };
  return { label: `${distance} 天后`, tone: 'normal' };
}

function VaccineKind({ category }: { category: VaccineCategory }) {
  return <span className={`vaccine-kind ${category}`}>{vaccineCategoryLabels[category]}</span>;
}

function UpcomingVaccineActions({ item, onOpenEditor, onCancelAppointment }: { item: VaccinePlanItem; onOpenEditor(state: VaccineEditorState): void; onCancelAppointment(item: VaccinePlanItem): void }) {
  return <ActionMenu label={`${item.vaccineName}第${item.dose}剂操作`} items={[{ label: item.record?.appointmentOn ? '修改预约' : '设置预约', onSelect: () => onOpenEditor({ mode: 'appointment', item }) }, ...(item.record?.appointmentOn ? [{ label: '取消预约', danger: true, onSelect: () => onCancelAppointment(item) }] : []), { label: '记录已接种', onSelect: () => onOpenEditor({ mode: 'complete', item }) }]} />;
}

function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthTitle(month: string) {
  const [year, value] = month.split('-').map(Number);
  return `${year}年${value}月`;
}

function VaccineSchedulePage({ items, onBack, onOpenEditor, onCancelAppointment }: { items: VaccinePlanItem[]; onBack(): void; onOpenEditor(state: VaccineEditorState): void; onCancelAppointment(item: VaccinePlanItem): void }) {
  const today = localDay(new Date());
  const groups = useMemo(() => {
    const result = new Map<string, VaccinePlanItem[]>();
    items.forEach(item => {
      const month = (item.record?.appointmentOn || item.plannedOn).slice(0, 7);
      result.set(month, [...(result.get(month) || []), item]);
    });
    return result;
  }, [items]);
  return <div className="vaccine-schedule-page">
    <button type="button" className="inline-back" onClick={onBack}>← 返回疫苗记录</button>
    <header className="vaccine-schedule-head"><div><p className="kicker">疫苗记录</p><h2>接种安排</h2><p>按日期查看全部安排，门诊预约优先显示。</p></div></header>
    {items.length ? <div className="vaccine-schedule-groups">{[...groups.entries()].map(([month, monthItems]) => <section className="vaccine-schedule-group" key={month} aria-labelledby={`schedule-month-${month}`}><div className="section-title"><h3 id={`schedule-month-${month}`}>{monthTitle(month)}</h3><span>{monthItems.length} 项</span></div><div className="vaccine-agenda-list">{monthItems.map(item => {
      const day = item.record?.appointmentOn || item.plannedOn;
      return <article key={item.key}><time dateTime={day}><b>{Number(day.slice(-2))}</b><small>{Number(day.slice(5, 7))}月</small></time><div className="vaccine-agenda-copy"><div className="vaccine-row-title"><strong>{item.vaccineName} · 第{item.dose}剂</strong><VaccineKind category={item.category} /></div>{item.record?.appointmentOn ? <><p><b>已预约 · {formatVaccineDay(item.record.appointmentOn)}{item.record.appointmentTime ? ` ${item.record.appointmentTime}` : ''}</b></p>{item.hasSuggestedDate && <small>建议接种：{formatVaccineDay(item.plannedOn)}前后</small>}</> : <p className={day < today ? 'overdue' : ''}>{day < today ? '已逾期 · ' : '建议接种 · '}{formatVaccineDay(item.plannedOn)}前后</p>}</div><UpcomingVaccineActions item={item} onOpenEditor={onOpenEditor} onCancelAppointment={onCancelAppointment} /></article>;
    })}</div></section>)}</div> : <EmptyState title="暂无接种安排" description="后续安排会按日期显示在这里。" image="/illustrations/empty-vaccines.webp" />}
    <p className="vaccine-source-note">参考国家免疫规划常规起始年龄生成 · 浙江省杭州市<br />具体接种与补种安排请以接种门诊为准。</p>
  </div>;
}

export function VaccineReminderCard({ profile, records, catalog, onComplete, onAppointment }: { profile: Profile; records: VaccineRecord[]; catalog: VaccineCatalogItem[]; onComplete(item: VaccinePlanItem): void; onAppointment(item: VaccinePlanItem): void }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  useDialogFocus(dialogRef, () => setOpen(false), open);
  const next = buildVaccinePlan(profile.birthDate, records, catalog.length ? catalog : undefined)
    .filter(item => !item.record?.administeredOn)
    .filter(item => dayDistance(item.record?.appointmentOn || item.plannedOn) > 0)
    .sort((a, b) => (a.record?.appointmentOn || a.plannedOn).localeCompare(b.record?.appointmentOn || b.plannedOn))[0];
  if (!next) return null;
  const reminderOn = next.record?.appointmentOn || next.plannedOn; const status = planStatus(reminderOn);
  if (!next.record?.appointmentOn && dayDistance(next.plannedOn) > 30) return null;
  return <>
    <button type="button" className="vaccine-reminder-card collapsed info-summary-row" aria-label="查看疫苗安排" onClick={() => setOpen(true)}><span className="info-row-label">疫苗安排</span><span className="info-row-value">{next.vaccineName} · 第{next.dose}剂 · {status.label}</span><span className="info-row-chevron" aria-hidden="true">›</span></button>
    {open && <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && setOpen(false)}><section ref={dialogRef} className="editor info-sheet vaccine-info-sheet" role="dialog" aria-modal="true" aria-labelledby="next-vaccine-title"><header className="editor-head"><div><p className="kicker">疫苗安排 · {status.label}</p><div className="vaccine-title-line"><h2 id="next-vaccine-title">{next.vaccineName} · 第{next.dose}剂</h2><VaccineKind category={next.category} /></div></div><button className="close-btn" onClick={() => setOpen(false)} aria-label="关闭">×</button></header><div className="vaccine-sheet-date">{next.record?.appointmentOn ? <p><b>门诊预约：{formatVaccineDay(next.record.appointmentOn)}{next.record.appointmentTime ? ` ${next.record.appointmentTime}` : ''}</b>{next.hasSuggestedDate && <small>建议接种：{formatVaccineDay(next.plannedOn)}前后</small>}</p> : <p>建议接种：{formatVaccineDay(next.plannedOn)}前后</p>}</div><div className="editor-actions"><button type="button" className="btn secondary" onClick={() => { setOpen(false); onAppointment(next); }}>预约</button><button type="button" className="btn primary" onClick={() => { setOpen(false); onComplete(next); }}>记录</button></div><p className="vaccine-safety-note">具体接种与补种安排请以接种门诊为准。</p></section></div>}
  </>;
}

export function VaccineArchiveSummary({ profile, records, catalog, onOpen }: { profile: Profile; records: VaccineRecord[]; catalog: VaccineCatalogItem[]; onOpen(): void }) {
  const plan = buildVaccinePlan(profile.birthDate, records, catalog.length ? catalog : undefined);
  const completed = plan.filter(item => item.record?.administeredOn).length;
  const next = plan.filter(item => !item.record?.administeredOn).sort((a, b) => (a.record?.appointmentOn || a.plannedOn).localeCompare(b.record?.appointmentOn || b.plannedOn))[0];
  return <section className="vaccine-archive-summary"><div className="section-title"><div><p className="kicker">健康记录</p><h2>疫苗记录</h2></div><span>{completed} 针已记录</span></div>{next ? <p>下一针：<b>{next.vaccineName} · 第{next.dose}剂</b><small>{next.record?.appointmentOn ? `已预约 · ${formatVaccineDay(next.record.appointmentOn)}` : `${formatVaccineDay(next.plannedOn)}前后`}</small></p> : <p>当前计划中的疫苗均已记录。</p>}<button className="btn secondary full" onClick={onOpen}>查看疫苗记录</button></section>;
}

export function VaccineEditor({ state, profile, catalog, records, onClose, onSave }: { state: VaccineEditorState; profile: Profile; catalog: VaccineCatalogItem[]; records: VaccineRecord[]; onClose(): void; onSave(value: DraftVaccineRecord): Promise<void> }) {
  const source = state.record || state.item?.record;
  const genericAdd = state.mode === 'add' && !source && !state.item;
  const genericAppointment = state.mode === 'appointment' && !source && !state.item;
  const used = useMemo(() => new Set(records.filter(record => !record.deletedAt && record.id !== source?.id).map(record => `${record.vaccineName}:${record.dose}`)), [records, source?.id]);
  function availableDoses(name: string) { const item = catalog.find(value => value.name === name); return Array.from({ length: item?.doseCount || 5 }, (_, index) => index + 1).filter(value => !(genericAdd || genericAppointment) || !used.has(`${name}:${value}`)); }
  const selectableCatalog = genericAdd || genericAppointment ? catalog.filter(item => item.active && availableDoses(item.name).length > 0) : catalog.map(item => item.name === (source?.vaccineName || state.item?.vaccineName) ? { ...item, active: true } : item);
  const groups = catalogGroups(selectableCatalog); const fallbackName = groups[0]?.items[0]?.name || source?.vaccineName || state.item?.vaccineName || '';
  const initialDose = source?.dose || state.item?.dose || availableDoses(fallbackName)[0] || 1;
  const [vaccineName, setVaccineName] = useState(source?.vaccineName || state.item?.vaccineName || fallbackName);
  const [dose, setDose] = useState(String(initialDose));
  const [plannedOn, setPlannedOn] = useState(source?.plannedOn || state.item?.plannedOn || localDay(new Date()));
  const [administeredOn, setAdministeredOn] = useState(source?.administeredOn || (state.mode === 'complete' || state.mode === 'add' ? localDay(new Date()) : ''));
  const [appointmentOn, setAppointmentOn] = useState(source?.appointmentOn || '');
  const [appointmentTime, setAppointmentTime] = useState(source?.appointmentTime || '');
  const [note, setNote] = useState(source?.note || '');
  const [showNote, setShowNote] = useState(Boolean(source?.note));
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const genericSuggestedItem = genericAppointment ? buildVaccinePlan(profile.birthDate, records, catalog).find(item => item.hasSuggestedDate && item.vaccineName === vaccineName && item.dose === Number(dose)) : undefined;
  const dirty = vaccineName !== (source?.vaccineName || state.item?.vaccineName || fallbackName) || dose !== String(initialDose) || plannedOn !== (source?.plannedOn || state.item?.plannedOn || localDay(new Date())) || administeredOn !== (source?.administeredOn || (state.mode === 'complete' || state.mode === 'add' ? localDay(new Date()) : '')) || appointmentOn !== (source?.appointmentOn || '') || appointmentTime !== (source?.appointmentTime || '') || note !== (source?.note || '');
  function requestClose() { void (async () => { if (!dirty || await confirmAction({ title: '放弃未保存的内容？', description: '当前填写的接种信息不会保存。', confirmLabel: '放弃修改', danger: true })) onClose(); })(); }
  useDialogFocus(dialogRef, requestClose);
  const title = state.mode === 'appointment' ? (genericAppointment ? '添加门诊预约' : source?.appointmentOn ? '修改门诊预约' : '设置门诊预约') : source?.administeredOn ? '修改接种记录' : state.mode === 'complete' ? '确认已接种' : '添加接种记录';
  async function saveAppointment(clear = false) {
    setBusy(true); setError('');
    try { await onSave({ id: source?.id, vaccineName, category: state.item?.category || catalog.find(item => item.name === vaccineName)?.category || vaccineCategory(vaccineName), dose: Number(dose), plannedOn: genericAppointment ? genericSuggestedItem?.plannedOn || appointmentOn : plannedOn, appointmentOn: clear ? null : appointmentOn, appointmentTime: clear ? null : appointmentTime || null, administeredOn: null, note: source?.note || null }); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败'); setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    if (state.mode === 'appointment') { await saveAppointment(); return; }
    try { await onSave({ id: source?.id, vaccineName, category: catalog.find(item => item.name === vaccineName)?.category || vaccineCategory(vaccineName), dose: Number(dose), plannedOn, appointmentOn: source?.appointmentOn || null, appointmentTime: source?.appointmentTime || null, administeredOn, note: note.trim() || null }); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败'); setBusy(false); }
  }
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && !busy && requestClose()}><section ref={dialogRef} className="editor vaccine-editor" role="dialog" aria-modal="true" aria-labelledby="vaccine-editor-title"><header className="editor-head"><div><p className="kicker">疫苗记录</p><h2 id="vaccine-editor-title">{title}</h2></div><button className="close-btn" onClick={requestClose} aria-label="关闭">×</button></header><form className="editor-form" onSubmit={submit}>
    {state.mode === 'appointment' ? <>{genericAppointment ? <>{groups.length ? <><label>疫苗 <VaccineKind category={catalog.find(item => item.name === vaccineName)?.category || vaccineCategory(vaccineName)} /><select value={vaccineName} onChange={event => { const name = event.target.value; setVaccineName(name); setDose(String(availableDoses(name)[0] || 1)); }}>{groups.map(group => <optgroup key={group.category} label={group.label}>{group.items.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</optgroup>)}</select></label><label>剂次<select value={dose} onChange={event => setDose(event.target.value)}>{availableDoses(vaccineName).map(value => <option key={value} value={value}>{doseOptionLabel(vaccineName, value, catalog)}</option>)}</select></label></> : <EmptyState title="没有可预约的疫苗" description="已启用疫苗的剂次均已有记录。" image="/illustrations/empty-vaccines.webp" />}</> : <div className="vaccine-editor-summary"><b>{vaccineName} · 第{dose}剂</b><span>仅在门诊已经给出预约时填写。系统建议日期不会改变。</span></div>}<label>预约日期<input type="date" min={localDay(new Date())} value={appointmentOn} onChange={event => setAppointmentOn(event.target.value)} required /></label><label>预约时间（选填）<input type="time" value={appointmentTime} onChange={event => setAppointmentTime(event.target.value)} /></label>{state.item?.hasSuggestedDate || genericSuggestedItem ? <p className="appointment-reference">建议接种：{formatVaccineDay(genericSuggestedItem?.plannedOn || plannedOn)}前后</p> : <p className="appointment-reference">没有系统建议日期，将按门诊预约时间提醒。</p>}</> : <>
      <label>接种日期<input type="date" min={profile.birthDate} max={localDay(new Date())} value={administeredOn} onChange={event => setAdministeredOn(event.target.value)} required /></label>
      {groups.length ? <><label>疫苗 <VaccineKind category={catalog.find(item => item.name === vaccineName)?.category || vaccineCategory(vaccineName)} /><select value={vaccineName} onChange={event => { const name = event.target.value; setVaccineName(name); setDose(String(availableDoses(name)[0] || 1)); }}>{groups.map(group => <optgroup key={group.category} label={group.label}>{group.items.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</optgroup>)}</select></label>
      <label>剂次<select value={dose} onChange={event => setDose(event.target.value)}>{availableDoses(vaccineName).map(value => <option key={value} value={value}>{doseOptionLabel(vaccineName, value, catalog)}</option>)}</select></label></> : <EmptyState title="已启用疫苗均已记录" description="可在设置中新增疫苗，或修改已有接种记录。" image="/illustrations/empty-vaccines.webp" />}
      {!showNote ? <button type="button" className="add-note-button" onClick={() => setShowNote(true)}>＋ 添加备注（选填）</button> : <label>备注（选填）<textarea rows={2} maxLength={100} placeholder="可留空" value={note} onChange={event => setNote(event.target.value)} /></label>}
    </>}
    {error && <p className="error-text" role="alert">{error}</p>}<p className="vaccine-safety-note">接种时间仅用于家庭提醒，具体安排请以接种门诊为准。</p><footer className="editor-actions">{state.mode === 'appointment' && source?.appointmentOn ? <button type="button" className="btn danger-light" disabled={busy} onClick={() => void saveAppointment(true)}>取消预约</button> : <button type="button" className="btn secondary" onClick={requestClose}>取消</button>}<button className="btn primary" disabled={busy || (!groups.length && (state.mode !== 'appointment' || genericAppointment))}>{busy ? '保存中…' : state.mode === 'complete' ? '确认完成' : state.mode === 'appointment' ? '保存预约' : '保存记录'}</button></footer>
  </form></section></div>;
}

export function VaccineHistory({ profile, records, catalog, deletedRecords, manager, onOpenEditor, onCancelAppointment, onDelete, onRestore, onLoadDeleted }: { profile: Profile; records: VaccineRecord[]; catalog: VaccineCatalogItem[]; deletedRecords: VaccineRecord[]; manager: boolean; onOpenEditor(state: VaccineEditorState): void; onCancelAppointment(item: VaccinePlanItem): void; onDelete(record: VaccineRecord): void; onRestore(record: VaccineRecord): void; onLoadDeleted(): void; }) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const subpageHistory = useRef<'schedule' | 'deleted' | null>(null);
  const plan = useMemo(() => buildVaccinePlan(profile.birthDate, records, catalog.length ? catalog : undefined), [catalog, profile.birthDate, records]);
  const completed = plan.filter(item => item.record?.administeredOn).sort((a, b) => (b.record!.administeredOn || '').localeCompare(a.record!.administeredOn || ''));
  const upcoming = plan.filter(item => !item.record?.administeredOn).sort((a, b) => (a.record?.appointmentOn || a.plannedOn).localeCompare(b.record?.appointmentOn || b.plannedOn));
  const next = upcoming[0];
  useEffect(() => { if (showDeleted) onLoadDeleted(); }, [onLoadDeleted, showDeleted]);
  useEffect(() => {
    const pop = () => { subpageHistory.current = null; setShowSchedule(false); setShowDeleted(false); };
    window.addEventListener('popstate', pop);
    return () => { window.removeEventListener('popstate', pop); if (subpageHistory.current) window.history.back(); };
  }, []);
  function openSchedule() { window.history.pushState({ babycareVaccineSubpage: 'schedule' }, ''); subpageHistory.current = 'schedule'; setShowSchedule(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function openDeleted() { window.history.pushState({ babycareVaccineSubpage: 'deleted' }, ''); subpageHistory.current = 'deleted'; setShowDeleted(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function closeSubpage() { if (subpageHistory.current && window.history.state?.babycareVaccineSubpage) window.history.back(); else { subpageHistory.current = null; setShowSchedule(false); setShowDeleted(false); } }
  if (showDeleted) return <div className="vaccine-deleted-page"><button className="inline-back" onClick={closeSubpage}>← 返回疫苗记录</button><div className="section-title"><h2>已删除记录</h2><span>{deletedRecords.length} 条</span></div>{deletedRecords.length ? <div className="vaccine-list">{deletedRecords.map(record => <article key={record.id}><div className="vaccine-date"><b>{record.administeredOn ? new Date(`${record.administeredOn}T12:00:00`).getDate() : '—'}</b><small>{record.administeredOn ? new Date(`${record.administeredOn}T12:00:00`).toLocaleDateString('zh-CN', { month: 'short' }) : '计划'}</small></div><div><div className="vaccine-row-title"><strong>{record.vaccineName} · 第{record.dose}剂</strong><VaccineKind category={record.category} /></div><p>{record.administeredOn ? formatVaccineDay(record.administeredOn) : formatVaccineDay(record.plannedOn)}</p></div><button className="btn secondary" onClick={() => onRestore(record)}>恢复</button></article>)}</div> : <EmptyState title="没有已删除记录" />}</div>;
  if (showSchedule) return <VaccineSchedulePage items={upcoming} onBack={closeSubpage} onOpenEditor={onOpenEditor} onCancelAppointment={onCancelAppointment} />;
  return <div className="vaccine-history"><section className="vaccine-overview"><div><span>已记录</span><strong>{completed.length}</strong><small>针</small></div><div><span>下一针</span><strong>{next ? formatVaccineDay(next.record?.appointmentOn || next.plannedOn).replace(/\d{4}年/, '') : '—'}</strong><small>{next ? `${next.record?.appointmentOn ? '已预约 · ' : ''}${next.vaccineName} · 第${next.dose}剂` : '当前计划已完成'}</small></div></section>
    <section className="vaccine-next"><div className="section-title"><h2>接下来</h2><button className="btn secondary" onClick={() => onOpenEditor({ mode: 'appointment' })}>＋ 添加预约</button></div>{next ? <><div className="vaccine-upcoming-list is-preview" aria-label="近期接种安排">{upcoming.slice(0, 3).map(item => <article key={item.key}><div><div className="vaccine-row-title"><strong>{item.vaccineName} · 第{item.dose}剂</strong><VaccineKind category={item.category} /></div><small>{item.record?.appointmentOn ? `已预约 · ${formatVaccineDay(item.record.appointmentOn)}` : `建议 ${formatVaccineDay(item.plannedOn)}前后`}</small></div><div className="upcoming-end"><span>{planStatus(item.record?.appointmentOn || item.plannedOn).label}</span><UpcomingVaccineActions item={item} onOpenEditor={onOpenEditor} onCancelAppointment={onCancelAppointment} /></div></article>)}</div>{upcoming.length > 3 && <button type="button" className="upcoming-toggle" onClick={openSchedule}>查看全部安排（{upcoming.length}）<span aria-hidden="true">›</span></button>}</> : <EmptyState title="暂无接种安排" description="门诊给出预约后，可以在这里添加提醒。" image="/illustrations/empty-vaccines.webp" />}</section>
    <section className="vaccine-record-section"><div className="section-title"><h2>已接种</h2><div className="vaccine-head-actions">{manager && <button className="text-button" onClick={openDeleted}>已删除</button>}<button className="btn secondary" onClick={() => onOpenEditor({ mode: 'add' })}>＋ 添加记录</button></div></div>{completed.length ? <div className="vaccine-list">{completed.map(item => <article key={item.key}><div className="vaccine-date"><b>{new Date(`${item.record!.administeredOn}T12:00:00`).getDate()}</b><small>{new Date(`${item.record!.administeredOn}T12:00:00`).toLocaleDateString('zh-CN', { month: 'short' })}</small></div><button className="vaccine-row-main" onClick={() => onOpenEditor({ mode: 'add', item, record: item.record })}><div className="vaccine-row-title"><strong>{item.vaccineName} · 第{item.dose}剂</strong><VaccineKind category={item.category} /></div><p>{formatVaccineDay(item.record!.administeredOn!)}</p></button><ActionMenu label={`${item.vaccineName}第${item.dose}剂操作`} items={[{ label: '修改记录', onSelect: () => onOpenEditor({ mode: 'add', item, record: item.record }) }, ...(manager ? [{ label: '删除记录', danger: true, onSelect: () => onDelete(item.record!) }] : [])]} /></article>)}</div> : <EmptyState title="还没有接种记录" description="接种后只需确认疫苗、剂次和日期。" image="/illustrations/empty-vaccines.webp" />}</section>
    <p className="vaccine-source-note">参考国家免疫规划常规起始年龄生成 · 浙江省杭州市<br />具体接种与补种安排请以接种门诊为准。</p>
  </div>;
}
