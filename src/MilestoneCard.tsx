import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { calculateAge, isoDay } from './date';
import { confirmAction, Modal } from './ui';
import { DateField } from './DateField';
import {
  MILESTONE_CATEGORY_EMOJI,
  MILESTONE_CATEGORY_LABELS,
  MILESTONE_CATEGORY_ORDER,
  MILESTONE_DEFINITIONS,
  computeMilestoneStatus,
  formatWholeMonths,
  getMilestoneDefinition,
  type MilestoneCategory,
  type MilestoneDefinition,
  type MilestoneStatus,
} from '../shared/milestones';
import type { MilestoneRecord, Profile } from './types';

function MilestoneBadge({ milestoneKey, size = 32, status = 'pending' }: { milestoneKey: string; size?: number; status?: string }) {
  return (
    <div className={`milestone-badge ms-badge-${status}`} style={{ width: size, height: size }}>
      {/* ?v=2：图片内容更新过（webp 恢复透明背景），加版本号让浏览器/SW 缓存立即失效 */}
      <img
        src={`/milestones/${milestoneKey}.webp?v=2`}
        alt=""
        className="badge-icon"
        loading="lazy"
      />
      <img
        src="/milestones/frames/frame-circle.webp?v=2"
        alt=""
        className="badge-frame"
      />
    </div>
  );
}

export function MilestoneArchiveSummary({ profile, onOpen }: { profile: Profile; onOpen(): void }) {
  const [records, setRecords] = useState<MilestoneRecord[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await api.milestoneRecords();
      setRecords(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const ageMonths = (() => {
    const birth = new Date(`${profile.birthDate}T00:00:00`);
    const now = new Date();
    return (now.getTime() - birth.getTime()) / (30.44 * 24 * 3600 * 1000);
  })();

  const validRecords = records.filter(r => !r.deletedAt);
  const achievedMap = new Map<string, MilestoneRecord>();
  for (const r of validRecords) {
    if (!achievedMap.has(r.milestoneKey)) achievedMap.set(r.milestoneKey, r);
  }

  const total = MILESTONE_DEFINITIONS.length;
  const achieved = achievedMap.size;

  // 最新达成的里程碑
  const latestAchieved = validRecords.length > 0
    ? [...validRecords].sort((a, b) => b.achievedOn.localeCompare(a.achievedOn))[0]
    : null;
  const latestDef = latestAchieved ? getMilestoneDefinition(latestAchieved.milestoneKey) : null;

  // 最近待达成的 2 个
  const upcomingList = MILESTONE_DEFINITIONS
    .filter(d => !achievedMap.has(d.key))
    .map(d => ({ def: d, status: computeMilestoneStatus(d, null, ageMonths) }))
    .filter(i => i.status === 'pending' || i.status === 'upcoming')
    .sort((a, b) => a.def.whoMonthsRange[0] - b.def.whoMonthsRange[0])
    .slice(0, 2);

  const allDone = achieved > 0 && upcomingList.length === 0;

  function formatAchievedDate(dateStr: string) {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  return (
    <section className="vaccine-archive-summary milestone-summary">
      <div className="section-title">
        <h2>发育里程碑</h2>
        <button className="text-button vaccine-archive-link" onClick={onOpen}>
          查看全部 <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="milestone-summary-rows">
        <div className="milestone-summary-row">
          <span className="vaccine-archive-count">已达成 {achieved} / {total} 项</span>
        </div>
        {latestDef && latestAchieved && (
          <div className="milestone-summary-row">
            <MilestoneBadge milestoneKey={latestDef.key} size={36} status="achieved" />
            <span className="ms-summary-label">{latestDef.label}</span>
            <span className="ms-tag ms-tag-achieved">最新达成</span>
            <span className="ms-summary-who">{formatAchievedDate(latestAchieved.achievedOn)}</span>
          </div>
        )}
        {allDone ? (
          <div className="milestone-summary-row milestone-summary-done">
            <span>全部里程碑已达成 🎉</span>
          </div>
        ) : upcomingList.map(({ def, status }, idx) => (
          <div key={def.key} className="milestone-summary-row">
            <MilestoneBadge milestoneKey={def.key} size={36} status={status} />
            <span className="ms-summary-label">{def.label}</span>
            <span className={`ms-tag ms-tag-${status}`}>{idx === 0 ? '下一个' : '待达成'}</span>
            <span className="ms-summary-who">{formatWholeMonths(def.whoMonthsRange)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const STATUS_LABELS: Record<MilestoneStatus, { text: string; cls: string }> = {
  achieved: { text: '已达成', cls: 'ms-achieved' },
  on_time: { text: '已达成', cls: 'ms-achieved' },
  late: { text: '偏晚', cls: 'ms-late' },
  pending: { text: '关注', cls: 'ms-pending' },
  upcoming: { text: '待达成', cls: 'ms-upcoming' },
};

function categoryStatus(cat: MilestoneCategory, records: MilestoneRecord[], ageMonths: number): { def: MilestoneDefinition; status: MilestoneStatus; achievedOn: string | null }[] {
  const defs = MILESTONE_DEFINITIONS.filter(d => d.category === cat);
  const achievedMap = new Map<string, MilestoneRecord>();
  for (const r of records) {
    if (!achievedMap.has(r.milestoneKey)) achievedMap.set(r.milestoneKey, r);
  }
  return defs.map(def => {
    const record = achievedMap.get(def.key);
    const achievedOn = record?.achievedOn ?? null;
    const status = achievedOn ? 'on_time' : computeMilestoneStatus(def, achievedOn, ageMonths);
    return { def, status, achievedOn };
  });
}

function MilestoneEditor({ milestoneKey, record, profile, onClose, onSaved }: {
  milestoneKey: string;
  record: MilestoneRecord | null;
  profile: Profile;
  onClose(): void;
  onSaved(): void;
}) {
  const def = getMilestoneDefinition(milestoneKey);
  const [achievedOn, setAchievedOn] = useState(record?.achievedOn || isoDay(new Date()));
  const [note, setNote] = useState(record?.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!def) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (record) {
        await api.updateMilestoneRecord(record.id, { milestoneKey, achievedOn, note: note || null });
      } else {
        await api.createMilestoneRecord({ milestoneKey, achievedOn, note: note || null });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      setBusy(false);
    }
  }

  const ageAtAchieved = achievedOn ? calculateAge(profile.birthDate, new Date(`${achievedOn}T12:00:00`)) : '';

  return (
    <Modal title={`${def.emoji} ${def.label}`} kicker="发育里程碑" headerExtra={<small className="milestone-def-desc">{def.description} · WHO 建议 {formatWholeMonths(def.whoMonthsRange)}</small>} onClose={onClose} busy={busy}>
        <form className="editor-form" onSubmit={submit}>
          <DateField label="达成日期" value={achievedOn} onChange={setAchievedOn} min={profile.birthDate} max={isoDay(new Date())} required />
          {ageAtAchieved && <small className="field-hint">达成时宝宝 {ageAtAchieved}</small>}
          <label>备注（可选）
            <textarea value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="记录当时的场景、心情等" rows={3} />
          </label>
          {error && <p className="field-error">{error}</p>}
          <footer className="editor-actions">
            <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>取消</button>
            <button type="submit" className="btn" disabled={busy}>{busy ? '保存中…' : (record ? '保存修改' : '标记达成')}</button>
          </footer>
        </form>
    </Modal>
  );
}

export function MilestoneHistory({ profile, manager, onBack }: {
  profile: Profile;
  manager: boolean;
  onBack(): void;
}) {
  const [records, setRecords] = useState<MilestoneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MilestoneCategory | 'all'>('all');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<MilestoneRecord | null>(null);

  const ageMonths = (() => {
    const birth = new Date(`${profile.birthDate}T00:00:00`);
    const now = new Date();
    return (now.getTime() - birth.getTime()) / (30.44 * 24 * 3600 * 1000);
  })();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.milestoneRecords();
      setRecords(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const validRecords = records.filter(r => !r.deletedAt);
  const achievedCount = validRecords.length;

  async function handleDelete(record: MilestoneRecord) {
    if (!await confirmAction({
      title: '删除里程碑记录？',
      description: `将删除「${getMilestoneDefinition(record.milestoneKey)?.label || record.milestoneKey}」的达成记录。`,
      confirmLabel: '删除',
      danger: true,
    })) return;
    try {
      await api.deleteMilestoneRecord(record.id);
      void load();
    } catch { /* ignore */ }
  }

  function openEditor(def: MilestoneDefinition, existing: MilestoneRecord | null) {
    setEditingKey(def.key);
    setEditingRecord(existing);
  }

  function closeEditor() {
    setEditingKey(null);
    setEditingRecord(null);
  }

  const categories = filter === 'all' ? MILESTONE_CATEGORY_ORDER : [filter];

  function findRecord(key: string): MilestoneRecord | null {
    return validRecords.find(r => r.milestoneKey === key) || null;
  }

  return (
    <div className="page-stack milestone-history-page">
      <button type="button" className="inline-back" onClick={onBack}>← 返回档案</button>
      <header className="page-head">
        <h1>发育里程碑</h1>
        <p>按 WHO 儿童发育里程碑参考，追踪宝宝的成长轨迹。</p>
      </header>

      <div className="milestone-progress-bar">
        <div className="milestone-progress-info">
          <span>已达成</span>
          <b>{achievedCount}</b>
          <small>/ {MILESTONE_DEFINITIONS.length}</small>
        </div>
        <div className="milestone-progress-track">
          <div className="milestone-progress-fill" style={{ width: `${(achievedCount / MILESTONE_DEFINITIONS.length) * 100}%` }} />
        </div>
      </div>

      <div className="milestone-filter">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部</button>
        {MILESTONE_CATEGORY_ORDER.map(cat => (
          <button key={cat} className={filter === cat ? 'active' : ''} onClick={() => setFilter(cat)}>
            {MILESTONE_CATEGORY_EMOJI[cat]} {MILESTONE_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="loading-hint">加载中…</p>
      ) : (
        <div className="milestone-groups">
          {categories.map(cat => {
            const items = categoryStatus(cat, validRecords, ageMonths);
            return (
              <div key={cat} className="milestone-group">
                <h3 className="milestone-group-title">
                  <span>{MILESTONE_CATEGORY_EMOJI[cat]}</span>
                  {MILESTONE_CATEGORY_LABELS[cat]}
                </h3>
                <ul className="milestone-list">
                  {items.map(({ def, status, achievedOn }) => {
                    const label = STATUS_LABELS[status];
                    const existingRecord = achievedOn ? findRecord(def.key) : null;
                    const noteText = existingRecord?.note?.trim();
                    return (
                      <li key={def.key} className={`milestone-item ms-${status}`}>
                        <MilestoneBadge milestoneKey={def.key} size={64} status={status} />
                        <span className="ms-label-wrap">
                          <span className="ms-label">{def.label}</span>
                          <span className="ms-who-range">WHO {formatWholeMonths(def.whoMonthsRange)}</span>
                          {noteText && <span className="ms-note">"{noteText}"</span>}
                        </span>
                        {achievedOn ? (
                          <span className="ms-date">
                            {new Date(`${achievedOn}T12:00:00`).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                            <span className="ms-age">{calculateAge(profile.birthDate, new Date(`${achievedOn}T12:00:00`))}</span>
                          </span>
                        ) : (
                          <span className={`ms-status ${label.cls}`}>{label.text}</span>
                        )}
                        {manager && (
                          <span className="ms-actions">
                            {achievedOn ? (
                              <>
                                <button type="button" className="ms-btn" onClick={() => openEditor(def, existingRecord)}>编辑</button>
                                <button type="button" className="ms-btn ms-btn-danger" onClick={() => existingRecord && void handleDelete(existingRecord)}>删除</button>
                              </>
                            ) : (
                              <button type="button" className="ms-btn ms-btn-add" onClick={() => openEditor(def, null)}>
                                <ChevronRight size={14} /> 标记
                              </button>
                            )}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {editingKey && (
        <MilestoneEditor
          milestoneKey={editingKey}
          record={editingRecord}
          profile={profile}
          onClose={closeEditor}
          onSaved={load}
        />
      )}
    </div>
  );
}
