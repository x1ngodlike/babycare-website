import { useEffect, useState } from 'react';
import { Bot, ChevronDown, ChevronUp, Droplets, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import { api, type FeedingPrediction } from './api';
import { predictFeeding, formatTimeShort, formatElapsed, formatDurationFromNow, periodLabels, type FeedingPredictionInput } from '../shared/feeding-prediction';

const alertIcons = {
  pattern_change: <TrendingDown size={14} />,
  low_confidence: <AlertTriangle size={14} />,
  growth_spurt: <TrendingUp size={14} />,
  none: null
};

const alertLabels = {
  pattern_change: '节奏变化',
  low_confidence: '数据不足',
  growth_spurt: '可能猛长期'
};

export function PredictionBanner({ records, online }: { records: { occurredAt: string; breastMilkMl: number | null; formulaMl: number | null; type: string }[]; online: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [aiPrediction, setAiPrediction] = useState<FeedingPrediction | null>(null);
  const aiInsights = aiPrediction?.aiInsights;

  const feedingRecords = records.filter(r => r.type === 'feeding') as FeedingPredictionInput[];
  const prediction = predictFeeding(feedingRecords, new Date(), 7, 3);

  useEffect(() => {
    if (!online) return;
    if (feedingRecords.length < 2) return;
    let cancelled = false;
    api.feedingPrediction().then(data => {
      if (!cancelled) setAiPrediction(data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [online, feedingRecords.length]);

  if (!online) return null;
  if (!prediction.available) return null;
  if (!prediction.nextFeedAt) return null;

  const now = new Date();
  const nextAt = new Date(prediction.nextFeedAt);
  const minutesUntil = Math.round((nextAt.getTime() - now.getTime()) / 60000);
  const overdue = minutesUntil < 0;
  const soon = minutesUntil >= 0 && minutesUntil <= 30;
  const statusClass = overdue ? 'overdue' : soon ? 'soon' : 'upcoming';

  const lastFeedElapsed = prediction.lastFeedAt
    ? formatElapsed(prediction.lastFeedAt, now)
    : null;

  const confidencePercent = Math.round(prediction.confidence * 100);
  const upcomingCount = prediction.upcomingFeeds.length;

  return (
    <section className={`prediction-banner ${statusClass}${aiInsights ? ' has-ai' : ''}`} aria-label="喂奶周期预测">
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
            <span className="prediction-label">
              {lastFeedElapsed ? `距上次 ${lastFeedElapsed} · ` : ''}
              {overdue ? '下次喂奶' : '预计喂奶'}
            </span>
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
            {prediction.volumeMl !== null && <span>约 {prediction.volumeMl} mL</span>}
          </div>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {expanded && (
        <div className="prediction-detail">
          {aiInsights && (
            <div className="prediction-ai-section">
              <div className="prediction-ai-header">
                <Bot size={14} />
                <span>AI 喂养洞察</span>
                {aiInsights.alert && aiInsights.alert !== 'none' && (
                  <span className={`prediction-ai-alert prediction-ai-alert-${aiInsights.alert}`}>
                    {alertIcons[aiInsights.alert]} {alertLabels[aiInsights.alert]}
                  </span>
                )}
              </div>
              <p className="prediction-ai-summary">{aiInsights.summary}</p>
              <ul className="prediction-ai-insights">
                {aiInsights.insights.map((insight, i) => (
                  <li key={i}>{insight}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="prediction-upcoming">
            <h3>接下来 {upcomingCount} 次喂奶</h3>
            <ol>
              {prediction.upcomingFeeds.map(feed => (
                <li key={feed.index}>
                  <span className="feed-index">{feed.index}</span>
                  <span className="feed-info">
                    <span className="feed-time">{formatTimeShort(feed.predictedAt)}</span>
                    <span className="feed-range">
                      {formatTimeShort(feed.earliest)}–{formatTimeShort(feed.latest)}
                    </span>
                    <span className="feed-period">{periodLabels[feed.period]}</span>
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
