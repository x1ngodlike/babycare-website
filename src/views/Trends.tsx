// 趋势统计视图（由 App.tsx 抽出，React.lazy 按需加载）
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDays, isoDay, startOfWeek } from '../date';
import { formatMilkVolume } from '../format';
import { SegmentedControl } from '../ui';
import FeedingRhythmChart from './FeedingRhythmChart';
import type { CareItem, CareRecord } from '../types';

type TrendMode = 'seven' | 'month' | 'total';

interface TrendBucket { key: string; label: string; axis: string; breast: number; formula: number; feeds: number; bowel: number; supplements: number; careCounts: Record<string, number> }

function summarizeTrendRecords(items: CareRecord[], careNames: string[]) {
  return {
    breast: items.reduce((sum, record) => sum + (record.breastMilkMl || 0), 0),
    formula: items.reduce((sum, record) => sum + (record.formulaMl || 0), 0),
    feeds: items.filter(record => record.type === 'feeding').length,
    bowel: items.filter(record => record.type === 'bowel').length,
    supplements: items.filter(record => record.type === 'supplement').length,
    careCounts: Object.fromEntries(careNames.map(name => [name, items.filter(record => record.type === 'supplement' && record.supplement === name).length]))
  };
}

// 平均喂奶间隔：(末次 − 首次) ÷ (次数 − 1)；不足 2 次返回 null
function avgFeedingGapHours(items: CareRecord[]): number | null {
  const times = items.filter(record => record.type === 'feeding').map(record => new Date(record.occurredAt).getTime()).sort((a, b) => a - b);
  if (times.length < 2) return null;
  return (times[times.length - 1] - times[0]) / (times.length - 1) / 3600000;
}

export default function TrendsView({ records, careItems }: { records: CareRecord[]; careItems: CareItem[] }) {
  const [mode, setMode] = useState<TrendMode>('seven');
  const [careBreakdownOpen, setCareBreakdownOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => { const value = new Date(); return new Date(value.getFullYear(), value.getMonth(), 1); });
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const selectedIso = isoDay(selectedDay);
  const now = new Date();
  const todayMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayMonthKey = `${todayMonth.getFullYear()}-${todayMonth.getMonth()}`;
  const todayIso = isoDay(now);
  const careNames = useMemo(() => {
    const configured = [...careItems].sort((a, b) => a.sortOrder - b.sortOrder).map(item => item.name);
    const historical = records.filter(record => record.type === 'supplement' && record.supplement).map(record => record.supplement!);
    return [...new Set([...configured, ...historical])];
  }, [careItems, records]);
  const sevenDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(selectedDay, index - 6)), [selectedIso]);
  const [todayYear, todayMon] = todayMonthKey.split('-').map(Number);
  const aggregated = useMemo(() => {
    // ===== 七日：按天生成图表 buckets =====
    const sevenData: TrendBucket[] = sevenDays.map(day => ({ key: isoDay(day), label: day.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }), axis: day.toLocaleDateString('zh-CN', { weekday: 'short' }), ...summarizeTrendRecords(records.filter(record => isoDay(new Date(record.occurredAt)) === isoDay(day)), careNames) }));

    // ===== 月数据：按周生成图表 buckets（跨月周按完整周展示） =====
    const monthYear = selectedMonth.getFullYear(); const monthIndex = selectedMonth.getMonth();
    const isCurrentMonth = selectedMonth.getFullYear() === todayYear && selectedMonth.getMonth() === todayMon;
    const firstWeek = startOfWeek(new Date(monthYear, monthIndex, 1));
    const lastVisibleDay = isCurrentMonth ? new Date(`${todayIso}T23:59:59.999`) : new Date(monthYear, monthIndex + 1, 0);
    const lastWeek = startOfWeek(lastVisibleDay);
    const weekCount = Math.floor((lastWeek.getTime() - firstWeek.getTime()) / 604800000) + 1;
    const compact = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`;
    const monthData: TrendBucket[] = Array.from({ length: weekCount }, (_, index) => {
      const monday = addDays(firstWeek, index * 7); const sunday = addDays(monday, 6);
      return { key: isoDay(monday), label: `${compact(monday)}–${compact(sunday)}`, axis: compact(monday), ...summarizeTrendRecords(records.filter(record => { const date = new Date(record.occurredAt); return date >= monday && date < addDays(monday, 7); }), careNames) };
    });

    // ===== 总数据：按月生成图表 buckets，图表仅展示最近 6 个月 =====
    const monthKeys = [...new Set(records.map(record => { const date = new Date(record.occurredAt); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }))].sort();
    const totalData: TrendBucket[] = monthKeys.map(key => {
      const [year, month] = key.split('-').map(Number);
      return { key, label: `${year}年${month}月`, axis: `${month}月`, ...summarizeTrendRecords(records.filter(record => { const date = new Date(record.occurredAt); return date.getFullYear() === year && date.getMonth() === month - 1; }), careNames) };
    });

    // ===== 汇总统计：严格按语义化时间范围（与图表 buckets 解耦） =====
    // 日均统计排除今天（今日未完成不可作为完整日均值分母），仅用于汇总行；图表 buckets 仍保留今天的数据条
    // 七日：未切换（锚定日＝今天）时取昨天往前 7 天（共 7 个完整自然日）；翻到历史日则取整个 7 天窗口
    const isSevenToday = selectedIso === todayIso;
    const sevenCompleteIsoSet = new Set(Array.from({ length: 7 }, (_, index) => isoDay(addDays(selectedDay, index - (isSevenToday ? 7 : 6)))));
    const sevenCompleteRecords = records.filter(r => sevenCompleteIsoSet.has(isoDay(new Date(r.occurredAt))));
    const sevenSummary = summarizeTrendRecords(sevenCompleteRecords, careNames);
    const sevenActiveDays = new Set(sevenCompleteRecords.filter(r => r.type === 'feeding').map(r => isoDay(new Date(r.occurredAt)))).size;

    // 月数据：自然月（1 日 → 月末/今日），但日均统计仅取当月里今天之前的完整日
    const naturalMonthStart = new Date(monthYear, monthIndex, 1);
    const naturalMonthEnd = isCurrentMonth
      ? new Date(`${todayIso}T23:59:59.999`)
      : new Date(monthYear, monthIndex + 1, 0, 23, 59, 59, 999);
    const monthCompleteEnd = isCurrentMonth
      ? new Date(`${isoDay(addDays(now, -1))}T23:59:59.999`)
      : naturalMonthEnd;
    const monthRecords = records.filter(r => { const d = new Date(r.occurredAt); return d >= naturalMonthStart && d <= monthCompleteEnd; });
    const monthSummary = summarizeTrendRecords(monthRecords, careNames);
    const monthActiveDays = new Set(monthRecords.filter(r => r.type === 'feeding').map(r => isoDay(new Date(r.occurredAt)))).size;

    // 总数据：全部历史记录（累计），排除今天的记录
    const totalRecords = records.filter(r => isoDay(new Date(r.occurredAt)) !== todayIso);
    const totalSummary = summarizeTrendRecords(totalRecords, careNames);
    const totalActiveDays = new Set(totalRecords.filter(r => r.type === 'feeding').map(r => isoDay(new Date(r.occurredAt)))).size;

    return {
      sevenData, monthData, totalData,
      sevenSummary: { ...sevenSummary, activeDays: sevenActiveDays },
      monthSummary: { ...monthSummary, activeDays: monthActiveDays },
      totalSummary: { ...totalSummary, activeDays: totalActiveDays },
      sevenGap: avgFeedingGapHours(sevenCompleteRecords),
      monthGap: avgFeedingGapHours(monthRecords),
      totalGap: avgFeedingGapHours(totalRecords),
    };
  }, [records, sevenDays, selectedMonth, todayYear, todayMon, todayIso, selectedIso, careNames]);
  const buckets = mode === 'seven' ? aggregated.sevenData : mode === 'month' ? aggregated.monthData : aggregated.totalData.slice(-6);
  // 节奏图时间桶：与奶量图共用 buckets（月=周桶起始；总=月桶起始，节奏图内按整月聚合）
  const weekStarts = mode === 'month' ? aggregated.monthData.map(bucket => new Date(`${bucket.key}T00:00:00`)) : mode === 'total' ? aggregated.totalData.slice(-6).map(bucket => { const [year, month] = bucket.key.split('-').map(Number); return new Date(year, month - 1, 1); }) : [];
  const chartData = buckets;
  const detailData = [...buckets].reverse();
  const countRows = [
    { name: '喂奶', values: buckets.map(item => item.feeds) },
    { name: '排便', values: buckets.map(item => item.bowel) },
    ...careNames.map(name => ({ name, values: buckets.map(item => item.careCounts[name] || 0) }))
  ];
  const maxMilk = Math.max(1, ...chartData.map(item => item.breast + item.formula));
  const scopeSummary = mode === 'seven' ? aggregated.sevenSummary : mode === 'month' ? aggregated.monthSummary : aggregated.totalSummary;
  const scopeGap = mode === 'seven' ? aggregated.sevenGap : mode === 'month' ? aggregated.monthGap : aggregated.totalGap;
  const activeSummary = { breast: scopeSummary.breast, formula: scopeSummary.formula, feeds: scopeSummary.feeds, bowel: scopeSummary.bowel, supplements: scopeSummary.supplements };
  const careBreakdown = careNames.map(name => ({ name, count: scopeSummary.careCounts[name] || 0 }));
  const totalMilk = activeSummary.breast + activeSummary.formula;
  const activeDays = scopeSummary.activeDays;
  const totalMilkDisplay = formatMilkVolume(totalMilk);
  const dailyMilkDisplay = formatMilkVolume(activeDays ? Math.round(totalMilk / activeDays) : 0);
  const breastDisplay = formatMilkVolume(activeSummary.breast);
  const formulaDisplay = formatMilkVolume(activeSummary.formula);
  const chartTitle = mode === 'seven' ? '每日奶量' : mode === 'month' ? '每周奶量' : '最近六个月奶量';
  const detailLabel = mode === 'seven' ? '查看每日数据' : mode === 'month' ? '查看每周数据' : '查看每月数据';
  const totalLabel = mode === 'seven' ? '七日总奶量' : mode === 'month' ? '本月总奶量' : '累计总奶量';
  const description = mode === 'seven' ? '近 7 天喂养趋势。' : mode === 'month' ? '本月喂养趋势。' : '全部喂养数据汇总。';
  const sevenRangeLabel = `${sevenDays[0].toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} – ${sevenDays[6].toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}`;
  const canShiftForward = selectedIso < todayIso;
  const shiftDay = (offset: number) => setSelectedDay(value => addDays(value, offset));
  const shiftMonth = (offset: number) => setSelectedMonth(value => new Date(value.getFullYear(), value.getMonth() + offset, 1));
  return <div className="page-stack trends-page"><header className="page-head"><h1>趋势统计</h1><p>{description}</p></header>
    <SegmentedControl<TrendMode> className="trend-tabs" label="趋势统计范围" value={mode} options={[{ value: 'seven', label: '七日' }, { value: 'month', label: '月数据' }, { value: 'total', label: '总数据' }]} onChange={setMode} />
    {mode === 'seven' && <div className="trend-period-nav"><button type="button" onClick={() => shiftDay(-1)} aria-label="往前一天"><ChevronLeft size={18} strokeWidth={2.2} /></button><strong>{sevenRangeLabel}</strong><button type="button" onClick={() => shiftDay(1)} disabled={!canShiftForward} aria-label="往后一天"><ChevronRight size={18} strokeWidth={2.2} /></button></div>}
    {mode === 'month' && <div className="trend-period-nav"><button onClick={() => shiftMonth(-1)} aria-label="上一个月"><ChevronLeft size={18} strokeWidth={2.2} /></button><strong>{selectedMonth.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</strong><button onClick={() => shiftMonth(1)} disabled={selectedMonth >= todayMonth} aria-label="下一个月"><ChevronRight size={18} strokeWidth={2.2} /></button></div>}
    <section className="trend-summary"><div title={`${totalMilk} mL`}><span>{totalLabel}</span><strong>{totalMilkDisplay.amount}</strong><small>{totalMilkDisplay.unit}</small></div><div><span>喂奶日均</span><strong>{dailyMilkDisplay.amount}</strong><small>{dailyMilkDisplay.unit}</small></div><div><span>喂奶间隔</span><strong>{scopeGap === null ? '—' : scopeGap.toFixed(1)}</strong><small>小时</small></div></section>
    {mode === 'total' && <section className={`trend-total-details${careBreakdownOpen ? ' expanded' : ''}`} aria-label="累计分类数据"><div title={`${activeSummary.breast} mL`}><span>母乳</span><b>{breastDisplay.amount}</b><small>{breastDisplay.unit}</small></div><div title={`${activeSummary.formula} mL`}><span>奶粉</span><b>{formulaDisplay.amount}</b><small>{formulaDisplay.unit}</small></div><div><span>排便</span><b>{activeSummary.bowel}</b><small>次</small></div><button type="button" className="trend-care-total" aria-expanded={careBreakdownOpen} aria-controls="trend-care-breakdown" onClick={() => setCareBreakdownOpen(value => !value)}><span className="trend-care-label">护理<ChevronDown aria-hidden="true" /></span><b>{activeSummary.supplements}</b><small>次</small></button>{careBreakdownOpen && <div className="trend-care-breakdown" id="trend-care-breakdown"><div className="trend-care-breakdown-head"><b>项目明细</b><small>合计 {activeSummary.supplements} 次</small></div>{careBreakdown.length ? <ul>{careBreakdown.map(item => <li key={item.name}><span>{item.name}</span><b>{item.count}<small>次</small></b></li>)}</ul> : <p>暂无护理项目</p>}</div>}</section>}
    <section className="chart-card"><div className="section-title"><h2>{chartTitle}</h2><div className="legend"><i className="breast" />母乳<i className="formula" />奶粉</div></div><div className="bar-chart" style={{ gridTemplateColumns: `repeat(${Math.max(1, chartData.length)}, minmax(30px, 1fr))` }}>{chartData.map(item => { const hasFeedingRecord = item.feeds > 0; const bucketMilk = item.breast + item.formula; const bucketDisplay = formatMilkVolume(bucketMilk); const bucketLabel = bucketDisplay.unit === 'L' ? `${bucketDisplay.amount} L` : `${bucketDisplay.amount}`; return <div className={`bar-day ${hasFeedingRecord ? '' : 'no-data'}`} key={item.key} aria-label={hasFeedingRecord ? `${item.label}，母乳${item.breast} mL，奶粉${item.formula} mL` : `${item.label}，无喂奶记录`}><div className="bar-value" title={hasFeedingRecord ? `${bucketMilk} mL` : undefined}>{hasFeedingRecord ? bucketLabel : '—'}</div><div className="bar-track"><i className="formula" style={{ height: `${item.formula / maxMilk * 100}%` }} /><i className="breast" style={{ height: `${item.breast / maxMilk * 100}%` }} /></div><span>{item.axis}</span></div>; })}</div><details className="chart-details"><summary>{detailLabel}</summary><div className="chart-values">{detailData.map(item => { const breast = formatMilkVolume(item.breast); const formula = formatMilkVolume(item.formula); return <div key={item.key}><time>{item.label}</time><span title={`${item.breast} mL`}>母乳 {breast.amount} {breast.unit}</span><span title={`${item.formula} mL`}>奶粉 {formula.amount} {formula.unit}</span></div>; })}</div></details></section>
    <FeedingRhythmChart records={records} mode={mode} weekStarts={weekStarts} />
    <section className="rhythm-list"><div className="section-title"><h2>{mode === 'seven' ? '次数概览' : mode === 'month' ? '每周次数' : '月度次数'}</h2><span>横向对比</span></div><div className="rhythm-matrix-wrap"><table className="rhythm-matrix"><thead><tr><th scope="col">项目</th>{buckets.map(item => <th scope="col" key={item.key}>{mode === 'seven' ? <><b>{Number(item.key.slice(5, 7))}/{Number(item.key.slice(8, 10))}</b><small>{item.axis}</small></> : item.label}</th>)}</tr></thead><tbody>{countRows.map(row => { const total = row.values.reduce((sum, value) => sum + value, 0); return <tr key={row.name}><th scope="row"><b>{row.name}</b><small>合计 {total}</small></th>{row.values.map((value, index) => <td className={value ? '' : 'zero'} key={buckets[index].key}>{value}</td>)}</tr>; })}</tbody></table></div></section>
  </div>;
}
