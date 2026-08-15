// 历史记录 · 七日总览（横轴＝日期，纵轴＝0–24 时，记录沿用现有图标体系；密集记录聚合展示，纯查看）
import { useMemo, useState } from 'react';
import { addDays, isoDay } from '../date';
import { careItemIcon, summary, typeNames } from '../shared';
import type { CareItem, CareRecord } from '../types';

const HOUR_LINES = [0, 3, 6, 9, 12, 15, 18, 21, 24];
// 相邻记录小于 60 分钟时聚合为一个标记；图表 720px÷24 时＝30px/时，图标 34px≈68 分，60–68 分的相邻图标允许少量搭接
const CROWD_MINUTES = 60;

interface RecordCluster { records: CareRecord[]; topPct: number; topMinutes: number }

function clusterRecords(list: CareRecord[]): RecordCluster[] {
  const clusters: RecordCluster[] = [];
  for (const record of list) {
    const at = new Date(record.occurredAt);
    const minutes = at.getHours() * 60 + at.getMinutes();
    const last = clusters[clusters.length - 1];
    if (last && minutes - last.topMinutes < CROWD_MINUTES) last.records.push(record);
    else clusters.push({ records: [record], topPct: minutes / 1440 * 100, topMinutes: minutes });
  }
  return clusters;
}

const hhmm = (at: string) => new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

export default function HistoryOverview({ records, careItems, selected, onShiftWeek }: { records: CareRecord[]; careItems: CareItem[]; selected: Date; onShiftWeek(offset: number): void }) {
  const [tipId, setTipId] = useState<string | null>(null);
  const todayKey = isoDay(new Date());
  const yesterdayKey = isoDay(addDays(new Date(), -1));
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(selected, index - 6)), [selected]);
  const byDay = useMemo(() => {
    const map = new Map<string, CareRecord[]>();
    for (const day of days) map.set(isoDay(day), []);
    for (const record of records) {
      const bucket = map.get(isoDay(new Date(record.occurredAt)));
      if (bucket) bucket.push(record);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    return map;
  }, [records, days]);
  const total = days.reduce((sum, day) => sum + (byDay.get(isoDay(day))?.length || 0), 0);
  const activeDays = days.filter(day => (byDay.get(isoDay(day))?.length || 0) > 0).length;
  const rangeLabel = `${days[0].toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} – ${days[6].toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}`;
  // 选中标记的详情（展示在图表下方固定区域，避免浮层遮挡相邻图标与表头）
  const tipCluster = useMemo(() => {
    if (!tipId) return null;
    for (const day of days) {
      const dayLabel = day.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });
      for (const cluster of clusterRecords(byDay.get(isoDay(day)) || [])) {
        if (cluster.records[0].id === tipId) return { dayLabel, records: cluster.records };
      }
    }
    return null;
  }, [tipId, days, byDay]);
  return <section className="overview-panel" aria-label="七日照护总览">
    <div className="calendar-nav"><button onClick={() => onShiftWeek(-7)} aria-label="向前七天">‹</button><strong>{rangeLabel}</strong><button onClick={() => onShiftWeek(7)} aria-label="向后七天">›</button></div>
    <div className="overview-days">
      <span aria-hidden="true" />
      {days.map(day => { const key = isoDay(day); const isToday = key === todayKey; const count = byDay.get(key)?.length || 0; const label = day.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }); return <div key={key} className={`overview-day ${isToday ? 'today' : ''}`} aria-label={`${label}，${count} 条记录`}><b>{isToday ? '今天' : key === yesterdayKey ? '昨天' : day.toLocaleDateString('zh-CN', { weekday: 'short' })}</b><span>{label}</span></div>; })}
    </div>
    <div className="overview-chart" onClick={() => setTipId(null)}>
      <div className="overview-night" aria-hidden="true" />
      {tipCluster && <div className="overview-detail" role="status"><div className="overview-detail-head">{tipCluster.dayLabel}</div>{tipCluster.records.map(record => <div key={record.id} className="overview-detail-row"><span className="overview-detail-time">{hhmm(record.occurredAt)}</span><span>{typeNames[record.type]} · {summary(record, careItems)}</span></div>)}</div>}
      {HOUR_LINES.map(hour => <div key={hour} className="overview-gridline" style={{ top: `calc(${hour / 24 * 100}% - ${hour === 0 ? 1 : hour === 24 ? -1 : 0}px)` }} aria-hidden="true" />)}
      {HOUR_LINES.map(hour => <span key={hour} className={`overview-hour ${hour === 0 ? 'edge-top' : hour === 24 ? 'edge-bottom' : ''}`} style={{ top: `${hour / 24 * 100}%` }}>{hour}时</span>)}
      {days.map((day, index) => {
        const key = isoDay(day);
        const list = byDay.get(key) || [];
        const dayLabel = day.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });
        return <div key={key} className={`overview-col ${key === todayKey ? 'today' : ''} ${index === 0 ? 'edge-start' : ''} ${index >= 5 ? 'edge-end' : ''}`} style={{ left: `calc(var(--overview-axis) + (100% - var(--overview-axis)) / 7 * ${index})`, width: 'calc((100% - var(--overview-axis)) / 7)' }} role="list" aria-label={`${dayLabel}，${list.length} 条记录`}>
          {list.length === 0 && <span className="overview-empty">无记录</span>}
          {clusterRecords(list).map(cluster => {
            const head = cluster.records[0];
            const open = tipId === head.id;
            const label = cluster.records.map(record => `${hhmm(record.occurredAt)} ${typeNames[record.type]} ${summary(record, careItems)}`).join('；');
            return <button type="button" key={head.id} className={`overview-mark-btn ${cluster.topMinutes < 60 || cluster.topMinutes > 1380 ? 'near-edge' : ''} ${open ? 'active' : ''}`} style={{ top: `${cluster.topPct}%`, left: '50%', ['--overview-top' as string]: `${cluster.topPct}%` }} aria-label={label} aria-expanded={open} onClick={event => { event.stopPropagation(); setTipId(open ? null : head.id); }}>
              <img className="overview-mark" src={careItemIcon(head, careItems)} alt="" />
              {cluster.records.length > 1 && <span className="overview-badge">×{cluster.records.length}</span>}
            </button>;
          })}
        </div>;
      })}
    </div>
    <p className="overview-summary">{total ? `共 ${total} 条记录 · ${activeDays} 天有记录` : '这 7 天还没有记录'}</p>
  </section>;
}
