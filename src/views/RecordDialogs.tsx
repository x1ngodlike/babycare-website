// 操作记录与成长记录编辑弹窗（由 App.tsx 抽出，逻辑不变）
import { useEffect, useState } from 'react';
import { api } from '../api';
import { isoDay } from '../date';
import { auditActions, auditNames, summary } from '../shared';
import { Modal, useDirtyClose } from '../ui';
import { DateField } from '../DateField';
import type { AuditEntry, CareRecord, DraftGrowthRecord, GrowthRecord, Profile } from '../types';

export function AuditDialog({ record, onClose }: { record: CareRecord; onClose(): void }) {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.audit(record.id).then(setItems).catch(err => setError(err instanceof Error ? err.message : '无法读取操作记录')).finally(() => setLoading(false)); }, [record.id]);
  return <Modal className="audit-dialog" title="操作记录" kicker={summary(record)} onClose={onClose}>
    {error && <p className="error-text" role="alert">{error}</p>}{loading && <p className="loading-copy">正在读取…</p>}{!loading && !error && !items.length && <p className="loading-copy">这条记录创建于操作历史功能启用前，暂无详细历史。</p>}
    <ol className="audit-list">{items.map(item => <li key={item.id}><i /><div><strong>{auditActions[item.action]}</strong><p>{auditNames[item.actor]} · {new Date(item.occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</p></div></li>)}</ol>
    <button className="btn secondary full" onClick={onClose}>关闭</button>
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
