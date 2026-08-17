// 喂奶节奏：七日间隔散点+折线；月/总为平均间隔列表，与喂奶间隔推送同一心智模型
// 像素坐标绘制（ResizeObserver 量宽），避免 viewBox 非均匀拉伸导致线宽/圆点变形
import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, isoDay } from '../date';
import type { CareRecord } from '../types';

const NIGHT_HOURS = [0, 6];
const CHART_HEIGHT = 180;
const PAD_X = 6;
const PAD_Y = 8;
const DOT_RADIUS = 4;

interface RhythmPoint { at: Date; gapHours: number; night: boolean; label: string }

// 取喂奶记录序列，计算相邻间隔；首个喂奶（无前序）不计入
function buildPoints(feedings: CareRecord[]): RhythmPoint[] {
  const sorted = [...feedings].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const points: RhythmPoint[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const prev = new Date(sorted[index - 1].occurredAt);
    const at = new Date(sorted[index].occurredAt);
    const gapHours = (at.getTime() - prev.getTime()) / 3600000;
    points.push({ at, gapHours, night: at.getHours() >= NIGHT_HOURS[0] && at.getHours() < NIGHT_HOURS[1], label: `${at.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} ${at.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}` });
  }
  return points;
}

const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

// 监听容器宽度，SVG 按实际像素绘制
function useChartWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => { for (const entry of entries) setWidth(entry.contentRect.width); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export default function FeedingRhythmChart({ records, mode, weekStarts }: { records: CareRecord[]; mode: 'seven' | 'month' | 'total'; weekStarts: Date[] }) {
  const { ref: chartRef, width } = useChartWidth();
  // 三日：逐次喂奶散点（今天也在内，便于看当下节奏）
  const points = useMemo(() => {
    if (mode !== 'seven') return [];
    const firstDay = isoDay(addDays(new Date(), -2));
    const lastDay = isoDay(new Date());
    return buildPoints(records.filter(record => {
      if (record.type !== 'feeding') return false;
      const day = isoDay(new Date(record.occurredAt));
      return day >= firstDay && day <= lastDay;
    }));
  }, [records, mode]);
  // 月=周桶（7 天），总=月桶（整月）；按天聚合间隔再归桶取均值
  const buckets = useMemo(() => {
    if (mode === 'seven') return [];
    const daily = new Map<string, number[]>();
    for (const point of buildPoints(records.filter(record => record.type === 'feeding'))) {
      daily.set(isoDay(point.at), [...(daily.get(isoDay(point.at)) || []), point.gapHours]);
    }
    return weekStarts.map(start => {
      const end = mode === 'total' ? new Date(start.getFullYear(), start.getMonth() + 1, 1) : addDays(start, 7);
      const gaps: number[] = [];
      for (let cursor = new Date(start); cursor < end; cursor = addDays(cursor, 1)) {
        const dayValues = daily.get(isoDay(cursor));
        if (dayValues) gaps.push(...dayValues);
      }
      const label = mode === 'total' ? `${start.getMonth() + 1}月` : `${start.getMonth() + 1}/${start.getDate()}`;
      return { start, label, value: avg(gaps), count: gaps.length };
    });
  }, [records, mode, weekStarts]);
  const chartTitle = mode === 'seven' ? '喂奶节奏' : mode === 'month' ? '每周平均喂奶间隔' : '每月平均喂奶间隔';
  const hasData = mode === 'seven' ? points.length >= 2 : buckets.some(item => item.count > 0);
  // 七日纵轴动态范围：裁掉下方空白（最小跨度 2h，避免过度放大）；月/总列表模式不涉及
  const gapValues = points.map(point => point.gapHours);
  const avgGapHours = gapValues.length ? avg(gapValues) : 0;
  const yMin = mode === 'seven' && gapValues.length ? Math.max(0, Math.floor(Math.min(...gapValues) - 0.5)) : 0;
  const yMaxRaw = mode === 'seven' && gapValues.length ? Math.ceil(Math.max(...gapValues) + 0.25) : 3;
  const yMax = Math.max(yMin + 2, yMaxRaw);
  // 虚线参考线：取最接近实际平均值的整点网格线
  const refHours = Math.max(0, Math.min(Math.floor(yMax), Math.round(avgGapHours)));
  const hourLines = Array.from({ length: Math.floor(yMax) + 1 }, (_, index) => index).filter(hour => hour >= yMin);
  const nightCount = points.filter(point => point.night).length;
  const height = CHART_HEIGHT;
  const yFor = (hours: number) => PAD_Y + (1 - (Math.min(Math.max(hours, yMin), yMax) - yMin) / (yMax - yMin)) * (height - PAD_Y * 2);
  const span = points.length > 1 ? points[points.length - 1].at.getTime() - points[0].at.getTime() : 1;
  const xFor = (at: Date) => PAD_X + (at.getTime() - points[0].at.getTime()) / span * (width - PAD_X * 2);
  const axisLabels = hourLines.filter(hour => hour % 2 === 0).map(hour => ({ hour, top: yFor(hour) }));
  // 横坐标日期标签：按日期分组，取每日第一个喂奶点的 x 坐标作为标签位置
  const dateLabels = useMemo(() => {
    if (mode !== 'seven' || points.length === 0) return [];
    const seen = new Map<string, { date: Date; x: number }>();
    for (const point of points) {
      const key = isoDay(point.at);
      if (!seen.has(key)) seen.set(key, { date: point.at, x: xFor(point.at) });
    }
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => ({
      key,
      label: value.date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
      x: value.x,
    }));
  }, [points, mode, width]);
  return <section className="chart-card rhythm-card"><div className="section-title"><h2>{chartTitle}</h2>{mode === 'seven' && <div className="legend rhythm-legend"><i className="day-dot" />白天<i className="night-dot" />夜间</div>}</div>
    {mode === 'seven' && hasData && <p className="rhythm-caption">3 天内 {points.length + 1} 次喂奶 · 夜间 {nightCount} 次 · 平均间隔 {avgGapHours.toFixed(1)}h</p>}
    {!hasData ? <div className="rhythm-empty">喂奶记录不足，暂无法计算间隔</div> : mode === 'seven' ? <div className="rhythm-chart" role="img" aria-label={`最近三天喂奶节奏散点图，共 ${points.length} 个间隔点，夜间 ${nightCount} 次`} ref={chartRef}>
      {width >= 20 && <svg width={width} height={height} aria-hidden="true">
        {hourLines.map(hour => <line key={hour} className={`rhythm-grid ${hour === refHours && refHours >= yMin && refHours <= yMax ? 'ref' : ''}`} x1={0} x2={width} y1={yFor(hour)} y2={yFor(hour)} />)}
        <polyline className="rhythm-line" points={points.map(point => `${xFor(point.at)},${yFor(point.gapHours)}`).join(' ')} />
        {points.map((point, index) => <circle key={index} className={`rhythm-dot ${point.night ? 'night' : ''}`} cx={xFor(point.at)} cy={yFor(point.gapHours)} r={DOT_RADIUS} />)}
      </svg>}
      <div className="rhythm-axis">{axisLabels.map(({ hour, top }) => <span key={hour} style={{ top: `${top}px` }}>{hour}h</span>)}</div>
    </div> : <div className="chart-values rhythm-values">{[...buckets].reverse().map(item => <div key={item.start.getTime()}><time>{mode === 'month' ? `${item.label} 起` : item.label}</time><span>{item.count ? `平均间隔 ${item.value.toFixed(1)} 小时（${item.count} 次）` : '无数据'}</span></div>)}</div>}
    {mode === 'seven' && hasData && <div className="rhythm-x-axis" style={{ marginLeft: '18px', marginRight: '12px' }}>{dateLabels.map(label => <span key={label.key} style={{ left: `${label.x}px` }}>{label.label}</span>)}</div>}
  </section>;
}
