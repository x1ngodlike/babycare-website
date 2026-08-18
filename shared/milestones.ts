export type MilestoneCategory = 'gross_motor' | 'fine_motor' | 'language' | 'cognitive' | 'social';

export interface MilestoneDefinition {
  key: string;
  category: MilestoneCategory;
  label: string;
  emoji: string;
  whoMonthsRange: [number, number];
  description: string;
}

export type MilestoneStatus = 'achieved' | 'on_time' | 'late' | 'pending' | 'upcoming';

export const MILESTONE_CATEGORY_LABELS: Record<MilestoneCategory, string> = {
  gross_motor: '大运动',
  fine_motor: '精细动作',
  language: '语言',
  cognitive: '认知',
  social: '社交',
};

export const MILESTONE_CATEGORY_ORDER: MilestoneCategory[] = [
  'gross_motor',
  'fine_motor',
  'language',
  'cognitive',
  'social',
];

export const MILESTONE_CATEGORY_EMOJI: Record<MilestoneCategory, string> = {
  gross_motor: '🏃',
  fine_motor: '✋',
  language: '💬',
  cognitive: '🧠',
  social: '🤝',
};

export const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
  { key: 'lift_head', category: 'gross_motor', label: '抬头', emoji: '🙂', whoMonthsRange: [1, 3], description: '俯卧时能抬起头部' },
  { key: 'roll_over', category: 'gross_motor', label: '翻身', emoji: '🔄', whoMonthsRange: [3, 6], description: '能从仰卧翻到俯卧' },
  { key: 'sit_alone', category: 'gross_motor', label: '独坐', emoji: '🪑', whoMonthsRange: [5, 8], description: '不靠支撑独坐' },
  { key: 'walk_alone', category: 'gross_motor', label: '独走', emoji: '🚶', whoMonthsRange: [10, 15], description: '独立行走' },

  { key: 'grasp', category: 'fine_motor', label: '抓握', emoji: '✋', whoMonthsRange: [3, 5], description: '主动抓握玩具' },
  { key: 'pinch', category: 'fine_motor', label: '捏取', emoji: '🤏', whoMonthsRange: [8, 12], description: '拇指食指捏取小物' },
  { key: 'use_spoon', category: 'fine_motor', label: '使用勺子', emoji: '🥄', whoMonthsRange: [12, 24], description: '用勺子自己吃饭' },

  { key: 'call_mama', category: 'language', label: '叫爸妈', emoji: '🗣️', whoMonthsRange: [6, 10], description: '无意识叫爸妈' },
  { key: 'single_word', category: 'language', label: '说单字', emoji: '👄', whoMonthsRange: [10, 16], description: '有意识说单字' },
  { key: 'short_phrase', category: 'language', label: '说短句', emoji: '💬', whoMonthsRange: [18, 36], description: '说 2-3 个字短句' },

  { key: 'recognize', category: 'cognitive', label: '认人', emoji: '👀', whoMonthsRange: [2, 4], description: '能认出爸妈' },
  { key: 'peekaboo', category: 'cognitive', label: '藏猫猫', emoji: '🙈', whoMonthsRange: [6, 9], description: '玩藏猫猫游戏' },
  { key: 'point', category: 'cognitive', label: '指物', emoji: '👉', whoMonthsRange: [9, 14], description: '用手指指向物品' },

  { key: 'smile', category: 'social', label: '微笑', emoji: '😊', whoMonthsRange: [1, 3], description: '有意识对人微笑' },
  { key: 'wave', category: 'social', label: '挥手', emoji: '👋', whoMonthsRange: [6, 10], description: '挥手再见' },
  { key: 'share', category: 'social', label: '分享', emoji: '🎁', whoMonthsRange: [12, 24], description: '主动分享物品' },
];

export function getMilestoneDefinition(key: string): MilestoneDefinition | undefined {
  return MILESTONE_DEFINITIONS.find(m => m.key === key);
}

export function groupMilestonesByCategory(): Record<MilestoneCategory, MilestoneDefinition[]> {
  const result = {} as Record<MilestoneCategory, MilestoneDefinition[]>;
  for (const cat of MILESTONE_CATEGORY_ORDER) {
    result[cat] = MILESTONE_DEFINITIONS.filter(m => m.category === cat);
  }
  return result;
}

export function computeMilestoneStatus(
  def: MilestoneDefinition,
  achievedOn: string | null,
  currentAgeMonths: number,
): MilestoneStatus {
  if (achievedOn) {
    return 'on_time';
  }
  if (currentAgeMonths > def.whoMonthsRange[1]) return 'late';
  if (currentAgeMonths >= def.whoMonthsRange[0] && currentAgeMonths <= def.whoMonthsRange[1]) return 'pending';
  return 'upcoming';
}

export function formatAgeMonths(months: number): string {
  if (months < 1) return `${Math.round(months * 30)}天`;
  const wholeMonths = Math.floor(months);
  const days = Math.round((months - wholeMonths) * 30);
  if (days === 0) return `${wholeMonths}个月`;
  return `${wholeMonths}个月${days}天`;
}

export function formatWholeMonths(range: [number, number]): string {
  const [min, max] = range;
  if (min === max) return `${min}月龄`;
  return `${min}-${max}月龄`;
}
