// 照护记录编辑器（由 App.tsx 抽出，逻辑不变）
import { useState } from 'react';
import { blankDraft, hasEnteredContent, recordEditorTypeOrder, typeNames, selectableCareItems, careItemIconSources, ChoiceField } from '../shared';
import { confirmAction, Modal, SegmentedControl, useDirtyClose } from '../ui';
import { DateTimeField, minutesAgoIso } from '../DateField';
import type { BowelSize, CareItem, CareItemCategory, DraftRecord, RecordType } from '../types';

function CareItemChoiceField({ items, selected, onSelect }: { items: CareItem[]; selected?: string | null; onSelect(value: string): void }) {
  const groups: { category: CareItemCategory; label: string }[] = [{ category: 'medication', label: '用药' }, { category: 'care', label: '护理' }];
  return <fieldset className="care-choice-field"><legend>选择护理项目</legend><div className="care-choice-groups">{groups.map(group => { const choices = items.filter(item => item.category === group.category); return choices.length > 0 && <section key={group.category} aria-labelledby={`care-choice-${group.category}`}><h3 id={`care-choice-${group.category}`}>{group.label}</h3><div className="care-choice-grid">{choices.map(item => <button type="button" key={item.id} aria-label={`${group.label} ${item.name}`} aria-pressed={selected === item.name} className={selected === item.name ? 'selected' : ''} onClick={() => onSelect(item.name)}><img src={careItemIconSources[item.icon]} alt="" /><span>{item.name}</span>{selected === item.name && <i aria-hidden="true">✓</i>}</button>)}</div></section>; })}</div></fieldset>;
}

export function RecordEditor({ initial, careItems, onClose, onSave }: { initial: DraftRecord; careItems: CareItem[]; onClose(): void; onSave(value: DraftRecord): Promise<void> }) {
  const [value, setValue] = useState(initial);
  const [relativeMinutes, setRelativeMinutes] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  const requestClose = useDirtyClose(dirty, onClose);
  async function switchType(type: RecordType) {
    if (type === value.type) return;
    if (hasEnteredContent(value) && !await confirmAction({ title: `切换为“${typeNames[type]}”？`, description: '切换后会清空当前已填写的记录内容。', confirmLabel: '继续切换', danger: true })) return;
    setRelativeMinutes(null);
    setValue({ ...blankDraft(type), id: value.id, occurredAt: value.occurredAt });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (value.type === 'feeding' && !value.breastMilkMl && !value.formulaMl) {
      setError('请填写母乳或奶粉量，至少一项');
      return;
    }
    if (value.type === 'note' && !value.subject?.trim()) {
      setError('请填写事项内容');
      return;
    }
    setBusy(true);
    try { await onSave(value); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败'); setBusy(false); }
  }
  return <Modal title={initial.id && 'createdAt' in initial ? '修改记录' : '添加记录'} onClose={() => void requestClose()}>
      <SegmentedControl className="type-switch" label="记录类型" value={value.type} options={recordEditorTypeOrder.map(type => ({ value: type, label: typeNames[type] }))} onChange={type => void switchType(type)} />
      <form className="editor-form" onSubmit={submit}>
        <DateTimeField label="记录时间" max={new Date(Date.now() + 10 * 60 * 1000).toISOString()} value={value.occurredAt} onChange={occurredAt => { setRelativeMinutes(null); setValue({ ...value, occurredAt }); }} />
        {value.type === 'feeding' && <div className="record-time-shortcuts">
          <div role="group" aria-label="快速设置记录时间">
            {[10, 15, 20, 25, 30].map(minutes => <button
              type="button"
              key={minutes}
              className={relativeMinutes === minutes ? 'selected' : ''}
              aria-pressed={relativeMinutes === minutes}
              onClick={() => {
                const nextMinutes = relativeMinutes === minutes ? null : minutes;
                setRelativeMinutes(nextMinutes);
                setValue({ ...value, occurredAt: minutesAgoIso(nextMinutes ?? 0) });
              }}
            >{minutes}分前</button>)}
          </div>
        </div>}
        {value.type === 'feeding' && <div className="input-pair"><label>母乳量（mL）<input inputMode="numeric" type="number" min="0" max="500" placeholder="例如 90" value={value.breastMilkMl ?? ''} aria-invalid={error.includes('母乳或奶粉量') || undefined} onChange={e => { setError(''); setValue({ ...value, breastMilkMl: e.target.value ? Number(e.target.value) : null }); }} /></label><label>奶粉量（mL）<input inputMode="numeric" type="number" min="0" max="500" placeholder="例如 120" value={value.formulaMl ?? ''} aria-invalid={error.includes('母乳或奶粉量') || undefined} onChange={e => { setError(''); setValue({ ...value, formulaMl: e.target.value ? Number(e.target.value) : null }); }} /></label></div>}
        {value.type === 'supplement' && <CareItemChoiceField items={selectableCareItems(careItems, value.supplement)} selected={value.supplement} onSelect={supplement => setValue({ ...value, supplement })} />}
        {value.type === 'bowel' && <ChoiceField label="排便量" values={['大', '中', '小'] as BowelSize[]} selected={value.bowelSize} onSelect={bowelSize => setValue({ ...value, bowelSize })} />}
        {value.type === 'note' && <label>事项内容<input maxLength={100} placeholder="例如：换床单、剪指甲" value={value.subject ?? ''} aria-invalid={error.includes('事项内容') || undefined} onChange={e => { setError(''); setValue({ ...value, subject: e.target.value }); }} /></label>}
        <label>补充说明（选填）<textarea rows={3} maxLength={200} placeholder={value.type === 'supplement' ? '可记录服用或护理后的情况' : value.type === 'note' ? '可补充事项细节' : '可留空'} value={value.note ?? ''} onChange={e => setValue({ ...value, note: e.target.value })} /></label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <footer className="editor-actions"><button type="button" className="btn secondary" onClick={() => void requestClose()}>取消</button><button className="btn primary" disabled={busy}>{busy ? '保存中…' : '保存记录'}</button></footer>
      </form>
  </Modal>;
}
