export type MilestoneCategory = 'gross_motor' | 'fine_motor' | 'language' | 'cognitive' | 'social' | 'self_care';

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
  self_care: '生活自理',
};

export const MILESTONE_CATEGORY_ORDER: MilestoneCategory[] = [
  'gross_motor',
  'fine_motor',
  'language',
  'cognitive',
  'social',
  'self_care',
];

export const MILESTONE_CATEGORY_EMOJI: Record<MilestoneCategory, string> = {
  gross_motor: '🏃',
  fine_motor: '✋',
  language: '💬',
  cognitive: '🧠',
  social: '🤝',
  self_care: '🧼',
};

export const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
  { key: 'turn_head', category: 'gross_motor', label: '转头寻声', emoji: '👂', whoMonthsRange: [0, 2], description: '听到熟悉声音时尝试转头' },
  { key: 'lift_head', category: 'gross_motor', label: '抬头', emoji: '🙂', whoMonthsRange: [1, 3], description: '俯卧时能抬起头部' },
  { key: 'forearm_support', category: 'gross_motor', label: '前臂支撑', emoji: '💪', whoMonthsRange: [2, 4], description: '俯卧时能用前臂撑起上身' },
  { key: 'roll_over', category: 'gross_motor', label: '翻身', emoji: '🔄', whoMonthsRange: [3, 6], description: '能从仰卧翻到俯卧' },
  { key: 'sit_alone', category: 'gross_motor', label: '独坐', emoji: '🪑', whoMonthsRange: [5, 8], description: '不靠支撑独坐' },
  { key: 'crawl', category: 'gross_motor', label: '向前移动', emoji: '👶', whoMonthsRange: [7, 10], description: '用爬、腹部移动等方式向前' },
  { key: 'pull_stand', category: 'gross_motor', label: '扶物站起', emoji: '🧑', whoMonthsRange: [8, 12], description: '拉住稳固家具尝试站起' },
  { key: 'cruise', category: 'gross_motor', label: '扶物横走', emoji: '🚶', whoMonthsRange: [9, 14], description: '扶着稳固家具侧向移动' },
  { key: 'walk_alone', category: 'gross_motor', label: '独走', emoji: '🚶', whoMonthsRange: [10, 15], description: '独立行走' },
  { key: 'squat_stand', category: 'gross_motor', label: '蹲下再站起', emoji: '🦵', whoMonthsRange: [14, 24], description: '从站立姿势蹲下取物后再站起' },
  { key: 'run', category: 'gross_motor', label: '小跑', emoji: '🏃', whoMonthsRange: [18, 30], description: '能小跑并逐渐停下' },
  { key: 'stairs', category: 'gross_motor', label: '扶栏上台阶', emoji: '🪜', whoMonthsRange: [20, 36], description: '在看护下扶着栏杆上台阶' },
  { key: 'jump', category: 'gross_motor', label: '双脚跳', emoji: '🦘', whoMonthsRange: [24, 36], description: '双脚同时离地跳起' },

  { key: 'open_hands', category: 'fine_motor', label: '手掌逐渐张开', emoji: '👐', whoMonthsRange: [1, 3], description: '清醒时手掌不再总是紧握' },
  { key: 'hands_together', category: 'fine_motor', label: '双手碰在一起', emoji: '🤲', whoMonthsRange: [2, 4], description: '会把双手带到身体中线附近' },
  { key: 'grasp', category: 'fine_motor', label: '抓握', emoji: '✋', whoMonthsRange: [3, 5], description: '主动抓握玩具' },
  { key: 'transfer', category: 'fine_motor', label: '双手传递', emoji: '🤲', whoMonthsRange: [5, 8], description: '把玩具从一只手换到另一只手' },
  { key: 'bang_objects', category: 'fine_motor', label: '敲打物品', emoji: '🪇', whoMonthsRange: [6, 9], description: '双手拿物相互敲打或敲打桌面' },
  { key: 'pinch', category: 'fine_motor', label: '捏取', emoji: '🤏', whoMonthsRange: [8, 12], description: '拇指食指捏取小物' },
  { key: 'release_object', category: 'fine_motor', label: '主动放手', emoji: '👋', whoMonthsRange: [9, 13], description: '把手里的物品主动放进容器' },
  { key: 'scribble', category: 'fine_motor', label: '涂画痕迹', emoji: '🖍️', whoMonthsRange: [12, 20], description: '握住笔在纸上留下简单痕迹' },
  { key: 'turn_pages', category: 'fine_motor', label: '翻厚页书', emoji: '📖', whoMonthsRange: [15, 24], description: '能自己翻动硬页或厚页绘本' },
  { key: 'stack_blocks', category: 'fine_motor', label: '叠积木', emoji: '🧱', whoMonthsRange: [18, 30], description: '把两个或更多积木叠起来' },
  { key: 'imitate_circle', category: 'fine_motor', label: '模仿画圆', emoji: '⭕', whoMonthsRange: [30, 36], description: '看过示范后尝试画出圆形' },

  { key: 'react_sound', category: 'language', label: '回应声音', emoji: '👂', whoMonthsRange: [0, 3], description: '对较大或熟悉的声音出现动作反应' },
  { key: 'coo', category: 'language', label: '发出柔和元音', emoji: '💬', whoMonthsRange: [1, 4], description: '清醒愉快时发出“啊”“哦”等声音' },
  { key: 'laugh_sound', category: 'language', label: '笑出声', emoji: '😄', whoMonthsRange: [3, 6], description: '被逗弄时会笑出声' },
  { key: 'babble', category: 'language', label: '咿呀学语', emoji: '🗣️', whoMonthsRange: [5, 9], description: '重复“ba”“ma”等类似音节' },
  { key: 'respond_name', category: 'language', label: '回应名字', emoji: '👂', whoMonthsRange: [6, 10], description: '听到自己的名字时转头或出声回应' },
  { key: 'call_mama', category: 'language', label: '叫爸妈', emoji: '🗣️', whoMonthsRange: [6, 10], description: '无意识叫爸妈' },
  { key: 'gesture_words', category: 'language', label: '手势表达', emoji: '👋', whoMonthsRange: [8, 12], description: '用挥手、伸手或指向表达需要' },
  { key: 'single_word', category: 'language', label: '说单字', emoji: '👄', whoMonthsRange: [10, 16], description: '有意识说单字' },
  { key: 'understand_simple', category: 'language', label: '听懂简单指令', emoji: '👂', whoMonthsRange: [10, 16], description: '能理解配合手势的简单一步指令' },
  { key: 'short_phrase', category: 'language', label: '说短句', emoji: '💬', whoMonthsRange: [18, 36], description: '说 2-3 个字短句' },
  { key: 'name_objects', category: 'language', label: '说出常见物品', emoji: '💬', whoMonthsRange: [18, 24], description: '能说出几个日常物品的名称' },
  { key: 'say_own_name', category: 'language', label: '说自己的名字', emoji: '🙋', whoMonthsRange: [24, 36], description: '被问到时能说出自己的名字' },

  { key: 'track_face', category: 'cognitive', label: '追视人脸', emoji: '👀', whoMonthsRange: [0, 3], description: '用眼睛短暂追随面前缓慢移动的人脸' },
  { key: 'recognize', category: 'cognitive', label: '认人', emoji: '👀', whoMonthsRange: [2, 4], description: '能认出爸妈' },
  { key: 'mouth_explore', category: 'cognitive', label: '用嘴探索', emoji: '👄', whoMonthsRange: [3, 6], description: '会把安全物品放到嘴边探索' },
  { key: 'peekaboo', category: 'cognitive', label: '藏猫猫', emoji: '🙈', whoMonthsRange: [6, 9], description: '玩藏猫猫游戏' },
  { key: 'find_hidden', category: 'cognitive', label: '寻找藏起的物品', emoji: '🔎', whoMonthsRange: [6, 10], description: '会寻找部分遮住的玩具' },
  { key: 'point', category: 'cognitive', label: '指物', emoji: '👉', whoMonthsRange: [9, 14], description: '用手指指向物品' },
  { key: 'container_play', category: 'cognitive', label: '放进取出', emoji: '🪣', whoMonthsRange: [9, 14], description: '反复把物品放进容器再取出' },
  { key: 'imitate_action', category: 'cognitive', label: '模仿日常动作', emoji: '🪞', whoMonthsRange: [10, 18], description: '模仿梳头、擦桌等简单动作' },
  { key: 'sort_shapes', category: 'cognitive', label: '简单配对与分类', emoji: '🔶', whoMonthsRange: [18, 30], description: '尝试按形状或颜色配对物品' },
  { key: 'pretend_play', category: 'cognitive', label: '假想游戏', emoji: '🎭', whoMonthsRange: [24, 36], description: '会把物品当成其他东西进行游戏' },
  { key: 'simple_puzzle', category: 'cognitive', label: '完成简单拼图', emoji: '🧩', whoMonthsRange: [24, 36], description: '尝试完成少量大块的简单拼图' },

  { key: 'eye_contact', category: 'social', label: '注视照护者', emoji: '👀', whoMonthsRange: [0, 3], description: '被抱或喂养时短暂注视照护者' },
  { key: 'smile', category: 'social', label: '微笑', emoji: '😊', whoMonthsRange: [1, 3], description: '有意识对人微笑' },
  { key: 'enjoy_interaction', category: 'social', label: '享受对人互动', emoji: '😄', whoMonthsRange: [3, 6], description: '在熟悉的逗弄中微笑、发声或挥动手脚' },
  { key: 'stranger_awareness', category: 'social', label: '区分生人熟人', emoji: '🧑', whoMonthsRange: [6, 9], description: '对熟悉与不熟悉的人表现出不同反应' },
  { key: 'wave', category: 'social', label: '挥手', emoji: '👋', whoMonthsRange: [6, 10], description: '挥手再见' },
  { key: 'joint_attention', category: 'social', label: '共同关注', emoji: '👉', whoMonthsRange: [9, 15], description: '会跟随大人的指向看同一件东西' },
  { key: 'share', category: 'social', label: '分享', emoji: '🎁', whoMonthsRange: [12, 24], description: '主动分享物品' },
  { key: 'help_housework', category: 'social', label: '参与简单家务', emoji: '🧹', whoMonthsRange: [18, 30], description: '模仿收玩具、擦桌等简单家务' },
  { key: 'parallel_play', category: 'social', label: '在小朋友旁边玩', emoji: '🧒', whoMonthsRange: [18, 30], description: '能在其他孩子旁边各自玩耍' },
  { key: 'take_turns', category: 'social', label: '简单轮流', emoji: '🔄', whoMonthsRange: [24, 36], description: '在成人帮助下等待和轮流进行游戏' },

  { key: 'finger_feed', category: 'self_care', label: '手指取食', emoji: '🥣', whoMonthsRange: [8, 14], description: '用手指拿起合适大小的食物自己吃' },
  { key: 'drink_cup', category: 'self_care', label: '扶杯喝水', emoji: '🥤', whoMonthsRange: [9, 16], description: '在成人帮助下扶住杯子喝水' },
  { key: 'use_spoon', category: 'self_care', label: '使用勺子', emoji: '🥄', whoMonthsRange: [12, 24], description: '用勺子自己吃饭' },
  { key: 'help_dress', category: 'self_care', label: '配合穿衣', emoji: '👕', whoMonthsRange: [12, 24], description: '穿衣时主动伸手、伸腿配合' },
  { key: 'wash_hands', category: 'self_care', label: '在帮助下洗手', emoji: '🧼', whoMonthsRange: [18, 30], description: '在成人帮助下按步骤洗手' },
  { key: 'remove_clothes', category: 'self_care', label: '脱简单衣物', emoji: '🧦', whoMonthsRange: [20, 36], description: '尝试脱袜子、松开的外套等简单衣物' },
  { key: 'toilet_signal', category: 'self_care', label: '表示便意', emoji: '🚽', whoMonthsRange: [24, 36], description: '用语言、动作或表情表示大小便需要' },
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
