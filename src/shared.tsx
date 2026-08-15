// 首屏与各懒加载视图共享的常量、辅助函数与基础组件（由 App.tsx 抽出，逻辑不变）
import type { AuditIdentity, BabySex, CareItem, CareItemCategory, CareItemIcon, CareRecord, DraftRecord, FamilyId, RecordType, SessionUser, UserRole } from './types';

export type ThemeMode = 'light' | 'dark' | 'system';

export const typeNames: Record<RecordType, string> = { feeding: '喂奶', supplement: '护理', bowel: '排便', note: '其他' };

export const typeIcons: Record<RecordType, string> = {
  feeding: '/icons/quick-feeding.png',
  supplement: '/icons/record-care.png',
  bowel: '/icons/quick-bowel.png',
  note: '/icons/quick-note.png'
};

export const familyMembers: { id: FamilyId; name: string; role: string; icon: string }[] = [
  { id: 'father', name: '爸爸', role: '超管', icon: '/icons/father.png' },
  { id: 'mother', name: '妈妈', role: '管理', icon: '/icons/mother.png' },
  { id: 'grandfather', name: '爷爷', role: '普通', icon: '/icons/grandfather.png' },
  { id: 'grandmother', name: '奶奶', role: '普通', icon: '/icons/grandmother.png' }
];

export const auditNames: Record<AuditIdentity, string> = { father: '爸爸', mother: '妈妈', grandfather: '爷爷', grandmother: '奶奶', legacy: '历史数据' };

export const roleNames: Record<UserRole, string> = { superadmin: '超管', admin: '管理', member: '普通' };

export const sexLabels: Record<BabySex, string> = { male: '男宝宝', female: '女宝宝', unspecified: '性别未设置' };

export const canManage = (user: SessionUser | null) => user?.role === 'superadmin' || user?.role === 'admin';

export const careItemIconSources: Record<CareItemIcon, string> = {
  medicine: '/icons/record-medicine.png',
  massage: '/icons/record-massage.png',
  bath: '/icons/record-bath.png',
  care: '/icons/record-care.png'
};

export const careItemFor = (name: string | null | undefined, items: CareItem[]) => items.find(item => item.name === name);

export const careItemCategory = (name: string | null | undefined, items: CareItem[]): CareItemCategory => careItemFor(name, items)?.category || (name === '推拿' ? 'care' : 'medication');

export const careItemIcon = (value: CareRecord | DraftRecord, items: CareItem[]) => value.type === 'supplement' ? careItemIconSources[careItemFor(value.supplement, items)?.icon || (value.supplement === '推拿' ? 'massage' : 'medicine')] : typeIcons[value.type];

export const selectableCareItems = (items: CareItem[], current?: string | null) => items.filter(item => item.active || item.name === current);

export function ChoiceField<T extends string>({ label, values, selected, onSelect, getLabel = value => value }: { label: string; values: T[]; selected?: T | null; onSelect(value: T): void; getLabel?(value: T): string }) {
  return <fieldset><legend>{label}</legend><div className="choice-group">{values.map(value => <button type="button" key={value} aria-pressed={selected === value} className={selected === value ? 'selected' : ''} onClick={() => onSelect(value)}>{selected === value && '✓ '}{getLabel(value)}</button>)}</div></fieldset>;
}
