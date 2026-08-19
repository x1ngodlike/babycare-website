// 成长百分位曲线组件：纯 SVG 实现，叠加世界卫生组织（WHO）0–5 岁儿童生长标准参考带
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { auditNames } from '../shared';
import type { GrowthCurveData, GrowthCurveRecord, GrowthReferenceAnchor } from '../types';

const VIEW_W = 340;
const VIEW_H = 260;
const PAD = { top: 14, right: 14, bottom: 30, left: 22 };
const CHART_W = VIEW_W - PAD.left - PAD.right;
const CHART_H = VIEW_H - PAD.top - PAD.bottom;

function niceStep(range: number, targetTicks = 4): number {
  const rough = range / targetTicks;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / pow;
  let step: number;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  return step * pow;
}

function formatAge(months: number): string {
  if (months < 12) return `${months}月`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m === 0 ? `${y}岁` : `${y}岁${m}月`;
}

export function GrowthChart({ data: externalData }: { data?: GrowthCurveData | null }) {
  const [internalData, setInternalData] = useState<GrowthCurveData | null>(null);
  const [loading, setLoading] = useState(externalData === undefined);
  const [error, setError] = useState('');
  const [indicator, setIndicator] = useState<'height' | 'weight'>('height');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const data = externalData !== undefined ? externalData : internalData;

  const load = useCallback(async () => {
    if (externalData !== undefined) return;
    setLoading(true);
    setError('');
    try {
      setInternalData(await api.growthCurve());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [externalData]);

  useEffect(() => { if (externalData !== undefined) { setLoading(false); return; } void load(); }, [externalData, load]);

  const records = (data?.records ?? []) as GrowthCurveRecord[];
  const reference = (indicator === 'height' ? data?.reference?.height : data?.reference?.weight) || [];
  const latest: GrowthCurveRecord | null = records.length ? records[records.length - 1] : null;
  const selected: GrowthCurveRecord | null = records.find(r => r.id === selectedId) || latest || null;

  const { xMin, xMax, yMin, yMax, yTicks, xTicks } = useMemo(() => {
    const xMax = data?.meta?.maxAgeMonths || 12;
    const xMin = 0;
    const values: number[] = [];
    for (const r of reference) { values.push(r.minus2sd); values.push(r.plus2sd); }
    for (const r of records) { values.push(indicator === 'height' ? r.heightCm : r.weightKg); }
    const rawMin = values.length ? Math.min(...values) : 0;
    const rawMax = values.length ? Math.max(...values) : 100;
    const step = niceStep(rawMax - rawMin, 4);
    const yMin = Math.floor(rawMin / step) * step - step;
    const yMax = Math.ceil(rawMax / step) * step + step;
    const yTicks: number[] = [];
    for (let v = yMin; v <= yMax + 0.001; v += step) yTicks.push(Math.round(v * 100) / 100);
    const xTickStep = xMax <= 6 ? 1 : xMax <= 12 ? 3 : xMax <= 24 ? 6 : 12;
    const xTicks: number[] = [];
    for (let m = 0; m <= xMax; m += xTickStep) xTicks.push(m);
    if (xTicks[xTicks.length - 1] !== xMax) xTicks.push(xMax);
    return { xMin, xMax, yMin, yMax, yTicks, xTicks };
  }, [data, reference, records, indicator]);

  const xScale = (m: number) => PAD.left + ((m - xMin) / (xMax - xMin || 1)) * CHART_W;
  const yScale = (v: number) => PAD.top + CHART_H - ((v - yMin) / (yMax - yMin || 1)) * CHART_H;

  const bandPath = (() => {
    if (reference.length < 2) return '';
    const top = reference.map(r => `${xScale(r.ageMonths)},${yScale(r.plus2sd)}`).join(' L ');
    const bottom = [...reference].reverse().map(r => `${xScale(r.ageMonths)},${yScale(r.minus2sd)}`).join(' L ');
    return `M ${top} L ${bottom} Z`;
  })();

  const linePath = (key: keyof GrowthReferenceAnchor) => {
    if (reference.length < 2) return '';
    return reference.map(r => `${xScale(r.ageMonths)},${yScale(r[key] as number)}`).join(' L ');
  };

  const babyPath = (() => {
    if (records.length < 2) return '';
    return records.map(r => `${xScale(r.ageMonths)},${yScale(indicator === 'height' ? r.heightCm : r.weightKg)}`).join(' L ');
  })();

  if (loading) return <section className="growth-curve-card"><div className="section-title"><h2>成长曲线</h2></div><p className="ga-note">正在加载成长曲线…</p></section>;
  if (error) return <section className="growth-curve-card"><div className="section-title"><h2>成长曲线</h2></div><p className="ga-note error">{error}</p></section>;
  if (!data?.available) {
    const hint = data?.reason === 'no_sex' ? '在宝宝资料里设置性别后，这里会展示身高体重百分位曲线。' : data?.reason === 'no_records' ? '记录至少 1 次身高体重后，这里会展示成长趋势。' : '暂无成长曲线数据。';
    return <section className="growth-curve-card"><div className="section-title"><h2>成长曲线</h2></div><p className="ga-note">{hint}</p></section>;
  }

  const unit = indicator === 'height' ? 'cm' : 'kg';
  const latestPercentile = indicator === 'height' ? latest?.heightPercentile : latest?.weightPercentile;
  const latestBand = indicator === 'height' ? latest?.heightBand : latest?.weightBand;

  return (
    <section className="growth-curve-card">
      <div className="section-title">
        <h2>成长曲线</h2>
        <div className="gc-indicator-switch" role="tablist" aria-label="指标切换">
          <button type="button" role="tab" aria-selected={indicator === 'height'} className={indicator === 'height' ? 'active' : ''} onClick={() => setIndicator('height')}>身高</button>
          <button type="button" role="tab" aria-selected={indicator === 'weight'} className={indicator === 'weight' ? 'active' : ''} onClick={() => setIndicator('weight')}>体重</button>
        </div>
      </div>

      <div className="gc-chart-wrap">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="gc-svg" role="img" aria-label={`宝宝${indicator === 'height' ? '身高' : '体重'}百分位成长曲线`}>
          {/* 参考带 -2SD ~ +2SD */}
          {bandPath && <path d={bandPath} className="gc-band" />}
          {/* -1SD / +1SD 线 */}
          {linePath('minus1sd') && <path d={`M ${linePath('minus1sd')}`} className="gc-ref-line gc-ref-1sd" />}
          {linePath('plus1sd') && <path d={`M ${linePath('plus1sd')}`} className="gc-ref-line gc-ref-1sd" />}
          {/* P50 中位线 */}
          {linePath('median') && <path d={`M ${linePath('median')}`} className="gc-ref-line gc-ref-median" />}

          {/* Y 轴网格 + 标签 */}
          {yTicks.map((v: number) => (
            <g key={`y-${v}`}>
              <line x1={PAD.left} y1={yScale(v)} x2={VIEW_W - PAD.right} y2={yScale(v)} className="gc-grid" />
              <text x={PAD.left - 3} y={yScale(v) + 3} className="gc-axis-label gc-y-label">{v}</text>
            </g>
          ))}

          {/* X 轴标签 */}
          {xTicks.map((m: number) => (
            <text key={`x-${m}`} x={xScale(m)} y={VIEW_H - PAD.bottom + 16} className="gc-axis-label gc-x-label">{formatAge(m)}</text>
          ))}

          {/* 宝宝曲线 */}
          {babyPath && <path d={`M ${babyPath}`} className="gc-baby-line" />}

          {/* 宝宝数据点 */}
          {records.map(r => {
            const val = indicator === 'height' ? r.heightCm : r.weightKg;
            const isLatest = r.id === latest?.id;
            const isSelected = r.id === selected?.id;
            return (
              <g key={r.id} className="gc-data-point" role="button" tabIndex={0} onClick={() => setSelectedId(r.id === selectedId ? null : r.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(r.id === selectedId ? null : r.id); } }}>
                <circle cx={xScale(r.ageMonths)} cy={yScale(val)} r={isLatest ? 3.5 : 3.5} className={`gc-dot${isLatest ? ' latest' : ''}${isSelected ? ' selected' : ''}`} />
              </g>
            );
          })}
        </svg>

        {/* 图例 */}
        <div className="gc-legend">
          <span><i className="gc-legend-band" />正常范围 (-2SD~+2SD)</span>
          <span><i className="gc-legend-median" />中位线</span>
          <span><i className="gc-legend-baby" />宝宝记录</span>
        </div>
      </div>

      {/* 详情 / 摘要栏 */}
      <div className="gc-detail">
        {selected ? (
          <>
            <div className="gc-detail-row">
              <span className="gc-detail-date">{new Date(`${selected.measuredOn}T12:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span className="gc-detail-age">{formatAge(selected.ageMonths)}</span>
              <span className="gc-detail-creator">{auditNames[selected.createdBy]}录入</span>
            </div>
            <div className="gc-detail-values">
              <div className="gc-detail-item">
                <span>身高</span>
                <b>{selected.heightCm} cm</b>
                {selected.heightPercentile != null && <em>P{selected.heightPercentile} · {selected.heightBand}</em>}
              </div>
              <div className="gc-detail-item">
                <span>体重</span>
                <b>{selected.weightKg} kg</b>
                {selected.weightPercentile != null && <em>P{selected.weightPercentile} · {selected.weightBand}</em>}
              </div>
            </div>
          </>
        ) : latest ? (
          <div className="gc-detail-latest">
            最新：{formatAge(latest.ageMonths)} · {indicator === 'height' ? latest.heightCm : latest.weightKg} {unit}
            {latestPercentile != null && <span className="gc-percentile"> · P{latestPercentile}（{latestBand}）</span>}
          </div>
        ) : null}
      </div>

      <p className="gc-disclaimer">曲线基于世界卫生组织（WHO）0–5 岁儿童生长标准，仅供家庭参考，不能替代儿保医生评估。</p>
    </section>
  );
}
