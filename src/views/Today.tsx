// 今日页视图：首页总览、快捷记录、今日待办与昨日报告（由 App.tsx 抽出，逻辑不变）
import { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { api } from '../api';
import { getCareItemReminderTimes, isCareItemDue } from '../careSchedule';
import { isoDay } from '../date';
import { formatTimeShort } from '../../shared/feeding-prediction';
import { PredictionBanner } from '../PredictionBanner';
import { careItemCategory, careItemIconSources, getAgeProfileLine, getGreeting, getHeroPeriod, isScheduleOver } from '../shared';
import { Modal } from '../ui';
import { buildVaccinePlan, vaccineTimingStatus, type VaccinePlanItem } from '../vaccines';
import { VaccineReminderCard } from '../VaccineViews';
import { Timeline } from './History';
import type { Capabilities, CareItem, CareRecord, FamilyId, GrowthRecord, Profile, RecordType, Supplement, VaccineCatalogItem, VaccineRecord } from '../types';

function DailyReport({ capabilities, online, onOpenSettings, superadmin, userId, allowAutoOpen }: { capabilities: Capabilities; online: boolean; onOpenSettings(): void; superadmin: boolean; userId: FamilyId; allowAutoOpen: boolean }) {
  const [data, setData] = useState<{ date: string; summary: string; suggestions: string[]; model: string; generatedAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
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
    {open && <Modal className="info-sheet" title="昨日报告" kicker={`${year}年${month}月${day}日 · ${weekday}`} onClose={() => setOpen(false)}><p className="dr-summary">{data.summary}</p>{data.suggestions.length > 0 && <ul className="dr-suggestions">{data.suggestions.map((item, index) => <li key={index}>{item}</li>)}</ul>}<div className="dr-footer"><small>{data.generatedAt ? `生成于 ${new Date(data.generatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}</small></div>{superadmin && <button type="button" className="btn secondary full" disabled={busy || !online} onClick={generate}>{busy ? '重新生成中…' : '重新生成报告'}</button>}</Modal>}
  </>;
  return (
    <section className="daily-report info-summary-static" aria-label="昨日报告"><span className="info-row-label">昨日报告</span><span className="info-row-value">{loading ? '正在读取…' : error || (!online ? '联网后可查看' : !capabilities.aiEnabled ? '尚未配置 AI 模型' : superadmin ? '报告尚未生成' : '报告还没准备好')}</span>{!loading && superadmin && online && (!capabilities.aiEnabled ? <button className="text-button" onClick={onOpenSettings}>去设置</button> : <button className="text-button" disabled={busy} onClick={generate}>{busy ? '生成中…' : '生成报告'}</button>)}</section>
  );
}

export function TodayView({ profile, records, recentRecords, vaccineRecords, vaccineCatalog, careItems, todayPlanStatus, capabilities, online, heroBg, onOpenSettings, onCompleteVaccine, onAppointmentVaccine, manager, superadmin, userId, allowReportAutoOpen, weeklyGrowth, onAddGrowth, onAdd, onSupplement, onEdit, onDelete, onAudit }: { profile: Profile; records: CareRecord[]; recentRecords: CareRecord[]; vaccineRecords: VaccineRecord[]; vaccineCatalog: VaccineCatalogItem[]; careItems: CareItem[]; todayPlanStatus: 'loading' | 'ready' | 'error'; capabilities: Capabilities; online: boolean; heroBg: string; onOpenSettings(): void; onCompleteVaccine(item: VaccinePlanItem): void; onAppointmentVaccine(item: VaccinePlanItem): void; manager: boolean; superadmin: boolean; userId: FamilyId; allowReportAutoOpen: boolean; weeklyGrowth?: GrowthRecord; onAddGrowth(): void; onAdd(type: RecordType): void; onSupplement(value: Supplement): Promise<void>; onEdit(record: CareRecord): void; onDelete(record: CareRecord): void; onAudit(record: CareRecord): void }) {
  const [savingSupplement, setSavingSupplement] = useState<Supplement | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const currentHour = currentTime.getHours();
  const heroPeriod = (() => {
    try { return localStorage.getItem('babycare-hero-preview') || getHeroPeriod(currentHour); } catch { return getHeroPeriod(currentHour); }
  })();
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
      <section className={`baby-hero ${heroBg !== 'auto' ? heroBg : ''} hero-${heroPeriod}`}><div>{(() => { const { greeting, displayName } = getGreeting(profile, userId, currentHour); return <h1 className="hero-greeting-title">{greeting}，{displayName}～</h1>; })()}<p className="kicker hero-date-line">{(() => { const d = new Date(); return `今日 · ${d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} · ${d.toLocaleDateString('zh-CN', { weekday: 'long' })}`; })()}</p><div className="hero-status">{(() => { if (!lastRecord) return <p>今日暂无记录</p>; const time = formatTimeShort(lastRecord.occurredAt); let detail = ''; if (lastRecord.type === 'feeding') { const breast = lastRecord.breastMilkMl ?? 0; const formula = lastRecord.formulaMl ?? 0; const totalMl = breast + formula; let mode = ''; if (breast > 0 && formula > 0) mode = '混合'; else if (breast > 0) mode = '母乳'; else if (formula > 0) mode = '奶粉'; detail = `喂奶${mode ? ' · ' + mode : ''}${totalMl ? ' ' + totalMl + 'ml' : ''}`; } else if (lastRecord.type === 'supplement') { const category = careItemCategory(lastRecord.supplement, careItems); detail = `${category === 'care' ? '护理' : '用药'} · ${lastRecord.supplement || ''}`; } else if (lastRecord.type === 'bowel') { detail = `排便 · ${lastRecord.bowelSize || '中'}`; } else { detail = lastRecord.subject ? `事项 · ${lastRecord.subject}` : '其他'; } const text = `上次记录：${time} · ${detail}`; return <p title={text} aria-label={text}>{text}</p>; })()}</div></div></section>
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
