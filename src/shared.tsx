// 首屏与各懒加载视图共享的常量、辅助函数与基础组件（由 App.tsx 抽出，逻辑不变）
import type { AuditEntry, AuditIdentity, BabySex, Capabilities, CareItem, CareItemCategory, CareItemIcon, CareRecord, DraftRecord, FamilyId, GrowthRecord, Profile, RecordType, SessionUser, UserRole } from './types';
import { addDays, ageParts, isoDay, startOfWeek } from './date';
import { createUuid } from './id';

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

export type PermissionKey =
  | 'view_records'
  | 'edit_records'
  | 'delete_records'
  | 'edit_profile'
  | 'manage_care_items'
  | 'manage_vaccines'
  | 'manage_feeding_settings'
  | 'manage_push'
  | 'manage_family'
  | 'manage_ai'
  | 'manage_backup'
  | 'ai_memory'
  | 'manage_growth'
  | 'clear_cache';

export type PermissionCategory = '照护记录' | '宝宝档案' | '照护管理' | '系统设置' | 'AI 对话';

export interface PermissionItem {
  key: PermissionKey;
  category: PermissionCategory;
  label: string;
  description: string;
}

export const PERMISSION_ITEMS: PermissionItem[] = [
  { key: 'view_records', category: '照护记录', label: '查看照护记录', description: '查看全部喂奶、护理、排便等照护记录' },
  { key: 'edit_records', category: '照护记录', label: '添加/修改记录', description: '添加新记录或修改现有记录' },
  { key: 'delete_records', category: '照护记录', label: '删除/恢复记录', description: '删除记录到回收站或恢复已删除记录' },
  { key: 'edit_profile', category: '宝宝档案', label: '编辑宝宝资料', description: '修改姓名、生日、昵称等基础信息' },
  { key: 'manage_growth', category: '宝宝档案', label: '记录成长数据', description: '测量并记录身高体重，生成 AI 生长评价' },
  { key: 'manage_care_items', category: '照护管理', label: '管理用药护理项目', description: '添加/编辑/停用用药和护理项目' },
  { key: 'manage_vaccines', category: '照护管理', label: '管理疫苗目录', description: '编辑疫苗分类和接种计划' },
  { key: 'manage_feeding_settings', category: '照护管理', label: '喂养预测设置', description: '调整喂奶预测的提前准备时间' },
  { key: 'manage_push', category: '系统设置', label: '消息推送配置', description: '配置推送通道和提醒规则' },
  { key: 'manage_family', category: '系统设置', label: '成员权限管理', description: '修改家庭成员和角色权限' },
  { key: 'manage_ai', category: '系统设置', label: 'AI 模型配置', description: '配置 AI 模型参数和智能功能' },
  { key: 'manage_backup', category: '系统设置', label: '数据备份恢复', description: '数据备份、恢复、导入与导出' },
  { key: 'clear_cache', category: '系统设置', label: '清除缓存', description: '清除本地缓存的静态资源' },
  { key: 'ai_memory', category: 'AI 对话', label: 'AI 记忆管理', description: '在 AI 对话中管理长期记忆' },
];

export const PERMISSION_MATRIX: Record<UserRole, PermissionKey[]> = {
  superadmin: PERMISSION_ITEMS.map(i => i.key),
  admin: ['view_records', 'edit_records', 'delete_records', 'edit_profile', 'manage_growth', 'manage_care_items', 'manage_vaccines', 'manage_feeding_settings', 'manage_push', 'clear_cache', 'ai_memory'],
  member: ['view_records', 'edit_records', 'manage_growth', 'clear_cache'],
};

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

export const selectableCareItems = (items: CareItem[], current?: string | null) => items.filter(item => (item.active && !isScheduleOver(item)) || item.name === current);

export const isScheduleOver = (item: CareItem): boolean => {
  if (!item.scheduleEndDate) return false;
  return isoDay(new Date()) > item.scheduleEndDate;
};

export function summary(record: CareRecord | DraftRecord, careItems: CareItem[] = []) {
  if (record.type === 'feeding') return [record.breastMilkMl ? `母乳 ${record.breastMilkMl} mL` : '', record.formulaMl ? `奶粉 ${record.formulaMl} mL` : ''].filter(Boolean).join('，') || '待补充奶量';
  if (record.type === 'supplement') return careItemCategory(record.supplement, careItems) === 'care' ? `${record.supplement || '护理项目'}已完成` : `${record.supplement || '用药项目'}已服用`;
  if (record.type === 'bowel') return `排便量：${record.bowelSize || '中'}`;
  return record.subject || '其他事项';
}

export function ChoiceField<T extends string>({ label, values, selected, onSelect, getLabel = value => value }: { label: string; values: T[]; selected?: T | null; onSelect(value: T): void; getLabel?(value: T): string }) {
  return <fieldset><legend>{label}</legend><div className="choice-group">{values.map(value => <button type="button" key={value} aria-pressed={selected === value} className={selected === value ? 'selected' : ''} onClick={() => onSelect(value)}>{selected === value && '✓ '}{getLabel(value)}</button>)}</div></fieldset>;
}

// ----- 以下由 App.tsx 抽出：记录编辑、首页与年龄文案相关辅助 -----

export const recordEditorTypeOrder: RecordType[] = ['feeding', 'bowel', 'supplement', 'note'];

export const auditActions: Record<AuditEntry['action'], string> = { create: '创建记录', update: '修改记录', delete: '删除记录', restore: '恢复记录', import: '从备份导入' };

export const emptyCapabilities: Capabilities = { aiEnabled: false, aiModel: null };

export const blankDraft = (type: RecordType = 'feeding'): DraftRecord => ({ id: createUuid(), type, occurredAt: new Date().toISOString(), breastMilkMl: null, formulaMl: null });

export function hasEnteredContent(value: DraftRecord) {
  return Boolean(value.breastMilkMl || value.formulaMl || value.supplement || value.bowelSize || value.subject?.trim() || value.note?.trim());
}

export function optimisticRecord(value: DraftRecord, user: SessionUser, previous?: CareRecord): CareRecord {
  const now = new Date().toISOString();
  return {
    id: value.id || createUuid(), type: value.type, occurredAt: value.occurredAt,
    breastMilkMl: value.type === 'feeding' ? value.breastMilkMl ?? null : null,
    formulaMl: value.type === 'feeding' ? value.formulaMl ?? null : null,
    supplement: value.type === 'supplement' ? value.supplement ?? null : null,
    bowelSize: value.type === 'bowel' ? value.bowelSize ?? null : null,
    subject: value.type === 'note' ? value.subject?.trim() || null : null,
    note: value.note ?? null,
    createdAt: previous?.createdAt || now, updatedAt: now,
    createdBy: previous?.createdBy || user.id, updatedBy: user.id,
    deletedAt: null, deletedBy: null
  };
}

const caregiverTitles: Record<FamilyId, string> = { father: '爸爸', mother: '妈妈', grandfather: '爷爷', grandmother: '奶奶' };

type HeroPeriod = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

function getHeroPeriod(hour: number): HeroPeriod {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

function getGreeting(profile: Profile, userId: FamilyId, hour = new Date().getHours()): { greeting: string; displayName: string } {
  let greeting: string;
  const period = getHeroPeriod(hour);
  if (period === 'morning') greeting = '早上好';
  else if (period === 'midday') greeting = '中午好';
  else if (period === 'afternoon') greeting = '下午好';
  else if (period === 'evening') greeting = '晚上好';
  else greeting = '夜深了';
  const displayName = profile.nickname?.trim() || profile.name;
  const title = caregiverTitles[userId] || '';
  return { greeting, displayName: title ? `${displayName}${title}` : displayName };
}

function getAgeProfileLine(birthDate: string, realName: string, now = new Date()): string {
  const { years, months, days } = ageParts(birthDate, now);
  const ageText = years
    ? `${years}岁${months ? `${months}个月` : ''}${days ? `${days}天` : ''}`
    : `${years * 12 + months}个月${days ? `${days}天` : ''}`;
  return `${realName} · ${ageText}`;
}

const weekContains = (record: GrowthRecord, date = new Date()) => {
  const from = isoDay(startOfWeek(date)); const to = isoDay(addDays(startOfWeek(date), 7));
  return record.measuredOn >= from && record.measuredOn < to;
};

function FeedingSummary({ record, careItems = [] }: { record: CareRecord | DraftRecord; careItems?: CareItem[] }) {
  if (record.type !== 'feeding') return <>{summary(record, careItems)}</>;
  const parts = [record.breastMilkMl ? `母乳 ${record.breastMilkMl} mL` : '', record.formulaMl ? `奶粉 ${record.formulaMl} mL` : ''].filter(Boolean);
  return <span className="feeding-summary">{parts.length ? parts.map(part => <span key={part}>{part}</span>) : <span>待补充奶量</span>}</span>;
}

export { getHeroPeriod, getGreeting, getAgeProfileLine, weekContains, FeedingSummary };
