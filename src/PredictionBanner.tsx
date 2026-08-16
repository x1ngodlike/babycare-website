import { useState } from 'react';
import { Clock, ChevronDown, ChevronUp, Droplets } from 'lucide-react';
import { formatTimeShort } from '../shared/feeding-prediction';
import type { FeedingPrediction, FeedingPredictionUpcoming } from './api';

function formatDurationFromNow(targetIso: string, now: Date = new Date()): string {
  const target = new Date(targetIso);
  const diffMs = target.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes <= 0) return '应该已经喂了';
  if (diffMinutes < 60) return `${diffMinutes} 分钟后`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (hours < 24) return minutes > 0 ? `${hours} 小时${minutes} 分后` : `${hours} 小时后`;
  const days = Math.floor(hours / 24);
  return `${days} 天${hours % 24} 小时后`;
}

function predictionFromRecords(records: { occurredAt: string; breastMilkMl: number | null; formulaMl: number | null }[]): FeedingPrediction {
  const feedings = records
    .map(r => ({ ...r, date: new Date(r.occurredAt) }))
    .filter(r => !isNaN(r.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (feedings.length < 2) {
    return {
      available: feedings.length === 1,
      reason: feedings.length === 0 ? 'no_records' : 'insufficient_data',
      lastFeedAt: feedings.length === 1 ? feedings[feedings.length - 1].occurredAt : null,
      nextFeedAt: null, nextFeedEarliest: null, nextFeedLatest: null,
      gapMinutes: null, volumeMl: null, confidence: 0,
      upcomingFeeds: [], periodGaps: [], periodVolumes: [],
      overallMedianGapMinutes: null, dataDays: 0, dataFeeds: feedings.length
    };
  }

  const gaps: number[] = [];
  for (let i = 1; i < feedings.length; i++) {
    const prev = feedings[i - 1];
    const curr = feedings[i];
    const minutes = Math.round((curr.date.getTime() - prev.date.getTime()) / 60000);
    if (minutes > 0 && minutes <= 600) gaps.push(minutes);
  }

  const allVols = feedings.map(f => (f.breastMilkMl || 0) + (f.formulaMl || 0)).filter(v => v > 0);
  const medianGap = gaps.length > 0 ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null;
  const medianVol = allVols.length > 0 ? allVols.sort((a, b) => a - b)[Math.floor(allVols.length / 2)] : null;

  const lastFeed = feedings[feedings.length - 1];
  const gap = medianGap ?? 180;
  const nextFeed = new Date(lastFeed.date.getTime() + gap * 60000);
  const earliest = new Date(lastFeed.date.getTime() + Math.max(30, Math.round(gap * 0.75)) * 60000);
  const latest = new Date(lastFeed.date.getTime() + Math.round(gap * 1.25) * 60000);

  const upcoming: FeedingPredictionUpcoming[] = [];
  let lastPredicted = lastFeed.date;
  for (let i = 0; i < 3; i++) {
    const g = medianGap ?? 180;
    const predictedAt = new Date(lastPredicted.getTime() + g * 60000);
    const e = new Date(lastPredicted.getTime() + Math.max(30, Math.round(g * 0.75)) * 60000);
    const l = new Date(lastPredicted.getTime() + Math.round(g * 1.25) * 60000);
    upcoming.push({
      index: i + 1,
      predictedAt: predictedAt.toISOString(),
      earliest: e.toISOString(),
      latest: l.toISOString(),
      estimatedMl: medianVol,
      period: 'feeding'
    });
    lastPredicted = predictedAt;
  }

  const days = feedings.length > 1
    ? Math.max(1, Math.round((feedings[feedings.length - 1].date.getTime() - feedings[0].date.getTime()) / 86400000))
    : 0;

  return {
    available: true,
    lastFeedAt: lastFeed.occurredAt,
    nextFeedAt: nextFeed.toISOString(),
    nextFeedEarliest: earliest.toISOString(),
    nextFeedLatest: latest.toISOString(),
    gapMinutes: gap,
    volumeMl: medianVol,
    confidence: Math.min(1, gaps.length / 8),
    upcomingFeeds: upcoming,
    periodGaps: [],
    periodVolumes: [],
    overallMedianGapMinutes: medianGap,
    dataDays: days,
    dataFeeds: feedings.length
  };
}

export function PredictionBanner({ records, online }: { records: { occurredAt: string; breastMilkMl: number | null; formulaMl: number | null; type: string }[]; online: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const prediction = predictionFromRecords(records.filter(r => r.type === 'feeding'));

  if (!online) return null;
  if (!prediction.available) return null;
  if (!prediction.nextFeedAt) return null;

  const now = new Date();
  const nextAt = new Date(prediction.nextFeedAt);
  const minutesUntil = Math.round((nextAt.getTime() - now.getTime()) / 60000);
  const overdue = minutesUntil < 0;
  const soon = minutesUntil >= 0 && minutesUntil <= 30;
  const statusClass = overdue ? 'overdue' : soon ? 'soon' : 'upcoming';

  const confidencePercent = Math.round(prediction.confidence * 100);
  const upcomingCount = prediction.upcomingFeeds.length;

  return (
    <section className={`prediction-banner ${statusClass}`} aria-label="喂奶周期预测">
      <button
        type="button"
        className="prediction-main"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <div className="prediction-left">
          <div className="prediction-icon">
            <Droplets size={18} strokeWidth={2} />
          </div>
          <div className="prediction-text">
            <span className="prediction-label">{overdue ? '下次喂奶' : '预计下次喂奶'}</span>
            <strong className="prediction-time">
              {formatTimeShort(prediction.nextFeedAt!)}
              <span className="prediction-duration">
                {formatDurationFromNow(prediction.nextFeedAt!, now)}
              </span>
            </strong>
          </div>
        </div>
        <div className="prediction-right">
          <div className="prediction-stats">
            {prediction.gapMinutes !== null && <span>间隔 {Math.round(prediction.gapMinutes / 60 * 10) / 10}h</span>}
            {prediction.volumeMl !== null && <span>{prediction.volumeMl} mL</span>}
          </div>
          {upcomingCount > 0 && (
            <div className="prediction-upcoming-count" aria-label={`未来 ${upcomingCount} 次喂奶预测`}>
              <Clock size={14} /> {upcomingCount}
            </div>
          )}
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {expanded && (
        <div className="prediction-detail">
          <div className="prediction-upcoming">
            <h3>接下来 {upcomingCount} 次喂奶</h3>
            <ol>
              {prediction.upcomingFeeds.map(feed => (
                <li key={feed.index}>
                  <span className="feed-index">{feed.index}</span>
                  <span className="feed-time">{formatTimeShort(feed.predictedAt)}</span>
                  <span className="feed-range">
                    {formatTimeShort(feed.earliest)}–{formatTimeShort(feed.latest)}
                  </span>
                  {feed.estimatedMl !== null && <span className="feed-vol">约 {feed.estimatedMl} mL</span>}
                  <span className="feed-duration">{formatDurationFromNow(feed.predictedAt, now)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="prediction-meta">
            <span>数据来源：过去 {prediction.dataDays} 天 {prediction.dataFeeds} 次喂奶</span>
            <div className="confidence-bar" aria-label={`预测置信度 ${confidencePercent}%`}>
              <div className="confidence-fill" style={{ width: `${confidencePercent}%` }} />
            </div>
            <span className="confidence-label">置信度 {confidencePercent}%</span>
          </div>
        </div>
      )}
    </section>
  );
}
