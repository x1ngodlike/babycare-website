// 操作记录与成长记录编辑弹窗（由 App.tsx 抽出，逻辑不变）
import { useEffect, useState } from 'react';
import { api } from '../api';
import { isoDay } from '../date';
import { auditActions, auditNames, summary, typeNames } from '../shared';
import { Modal, useDirtyClose } from '../ui';
import { DateField } from '../DateField';
import type { AuditChange, AuditEntry, CareRecord, DraftGrowthRecord, GrowthRecord, Profile, RecordType } from '../types';

const AUDIT_FIELD_LABELS: Record<string, string> = {
  type: '记录类型', occurredAt: '发生时间', breastMilkMl: '母乳量', formulaMl: '奶粉量',
  supplement: '用药项目', bowelSize: '排便量', subject: '事项', note: '备注'
};

function formatAuditValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '无';
  switch (field) {
    case 'type': return typeNames[value as RecordType] || String(value);
    case 'occurredAt':
      return new Date(String(value)).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    case 'breastMilkMl': case 'formulaMl': return `${value} mL`;
    default: return String(value);
  }
}

function AuditSnapshotContent({ snapshot }: { snapshot: CareRecord | null }) {
  if (!snapshot) return null;
  const rows: { label: string; value: string }[] = [];
  rows.push({ label: AUDIT_FIELD_LABELS.type, value: formatAuditValue('type', snapshot.type) });
  rows.push({ label: AUDIT_FIELD_LABELS.occurredAt, value: formatAuditValue('occurredAt', snapshot.occurredAt) });
  if (snapshot.type === 'feeding') {
    rows.push({ label: AUDIT_FIELD_LABELS.breastMilkMl, value: formatAuditValue('breastMilkMl', snapshot.breastMilkMl) });
    rows.push({ label: AUDIT_FIELD_LABELS.formulaMl, value: formatAuditValue('formulaMl', snapshot.formulaMl) });
  } else if (snapshot.type === 'supplement') {
    rows.push({ label: AUDIT_FIELD_LABELS.supplement, value: formatAuditValue('supplement', snapshot.supplement) });
  } else if (snapshot.type === 'bowel') {
    rows.push({ label: AUDIT_FIELD_LABELS.bowelSize, value: formatAuditValue('bowelSize', snapshot.bowelSize) });
  } else if (snapshot.type === 'note') {
    if (snapshot.subject) rows.push({ label: AUDIT_FIELD_LABELS.subject, value: formatAuditValue('subject', snapshot.subject) });
  }
  if (snapshot.note) rows.push({ label: AUDIT_FIELD_LABELS.note, value: formatAuditValue('note', snapshot.note) });
  return <div className="audit-snapshot">{rows.map((row) => <div key={row.label} className="audit-snapshot-row"><span>{row.label}</span><b>{row.value}</b></div>)}</div>;
}

function AuditChanges({ changes }: { changes: AuditChange[] | null | undefined }) {
  if (!changes || changes.length === 0) return <p className="audit-no-changes">无字段变更详情</p>;
  return <div className="audit-changes">{changes.map((change) => <div key={change.field} className="audit-change-row"><span className="audit-change-field">{AUDIT_FIELD_LABELS[change.field] || change.field}</span><span className="audit-change-old"><s>{formatAuditValue(change.field, change.old)}</s></span><span className="audit-change-arrow">→</span><span className="audit-change-new">{formatAuditValue(change.field, change.new)}</span></div>)}</div>;
}

export function AuditDialog({ record, onClose }: { record: CareRecord; onClose(): void }) {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.audit(record.id).then(setItems).catch(err => setError(err instanceof Error ? err.message : '无法读取操作记录')).finally(() => setLoading(false)); }, [record.id]);
  return <Modal className="audit-dialog" title="操作记录" kicker={summary(record)} onClose={onClose}>
    {error && <p className="error-text" role="alert">{error}</p>}
    {loading && <p className="loading-copy">正在读取…</p>}
    {!loading && !error && !items.length && <p className="loading-copy">这条记录创建于操作历史功能启用前，暂无详细历史。</p>}
    <ol className="audit-list">
      {items.map(item => {
        const time = new Date(item.occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
        const showSnapshot = item.action === 'create' || item.action === 'delete' || item.action === 'restore' || item.action === 'import';
        const showChanges = item.action === 'update' && item.changes && item.changes.length > 0;
        return <li key={item.id} className={`audit-item audit-${item.action}`}>
          <i />
          <div className="audit-item-body">
            <div className="audit-item-head">
              <strong>{auditActions[item.action]}</strong>
              {item.action === 'delete' && <span className="audit-tag audit-tag-delete">已删除</span>}
              {item.action === 'restore' && <span className="audit-tag audit-tag-restore">已恢复</span>}
              {item.action === 'import' && <span className="audit-tag audit-tag-import">数据导入</span>}
            </div>
            <p className="audit-meta">{auditNames[item.actor]} · {time}</p>
            {showChanges && <AuditChanges changes={item.changes} />}
            {showSnapshot && <AuditSnapshotContent snapshot={item.snapshot} />}
            {item.action === 'update' && (!item.changes || item.changes.length === 0) && <p className="audit-no-changes">该次修改无字段差异记录（早期数据）</p>}
          </div>
        </li>;
      })}
    </ol>
    <button type="button" className="btn secondary full" onClick={onClose}>关闭</button>
  </Modal>;
}

export function GrowthEditor({ profile, records, initial, onClose, onSave }: { profile: Profile; records: GrowthRecord[]; initial?: GrowthRecord; onClose(): void; onSave(value: DraftGrowthRecord): Promise<void> }) {
  const [measuredOn, setMeasuredOn] = useState(initial?.measuredOn || isoDay(new Date()));
  const [height, setHeight] = useState(initial ? String(initial.heightCm) : '');
  const [weight, setWeight] = useState(initial ? String(initial.weightKg) : '');
  const previous = records.find(record => record.id !== initial?.id && record.measuredOn < measuredOn);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const dirty = measuredOn !== (initial?.measuredOn || isoDay(new Date())) || height !== (initial ? String(initial.heightCm) : '') || weight !== (initial ? String(initial.weightKg) : '');
  const requestClose = useDirtyClose(dirty, onClose, busy, { description: '当前填写的成长数据不会保存。' });
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSave({ id: initial?.id, measuredOn, heightCm: Number(height), weightKg: Number(weight) }); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败'); setBusy(false); }
  }
  return <Modal className="growth-editor" title={initial ? '修改成长记录' : '记录成长'} kicker="宝宝档案" onClose={() => void requestClose()}><form className="editor-form" onSubmit={submit}><DateField label="测量日期" min={profile.birthDate} max={isoDay(new Date())} value={measuredOn} onChange={setMeasuredOn} /><div className="growth-fields"><label>身高 <small>cm</small><input type="number" inputMode="decimal" min="20" max="150" step="0.1" value={height} onChange={event => setHeight(event.target.value)} placeholder="例如 62.5" required /></label><label>体重 <small>kg</small><input type="number" inputMode="decimal" min="0.5" max="50" step="0.01" value={weight} onChange={event => setWeight(event.target.value)} placeholder="例如 6.35" required /></label></div>{previous && !initial && <p className="growth-reference">上次：{previous.heightCm} cm · {previous.weightKg} kg</p>}{error && <p className="error-text" role="alert">{error}</p>}<footer className="editor-actions"><button type="button" className="btn secondary" onClick={() => void requestClose()}>取消</button><button className="btn primary" disabled={busy || !height || !weight}>{busy ? '保存中…' : '保存记录'}</button></footer></form></Modal>;
}
