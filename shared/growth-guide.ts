export interface GrowthStage {
  id: string;
  range: [number, number];
  label: string;
  title: string;
  summary: string;
  activities: { title: string; description: string; meta: string; safety?: string }[];
  shopping: { id: string; title: string; level: 'needed' | 'optional' | 'skip'; reason: string; tip: string }[];
}

export interface LocalGuideTask {
  id: string;
  title: string;
  timing: string;
  description: string;
  materials: string;
  sourceLabel: string;
  sourceUrl: string;
  range: [number, number];
  archived?: boolean;
}

export const DEFAULT_GUIDE_REGION = '杭州市';
export const GUIDE_VERIFIED_ON = '2026-08-21';

export const GROWTH_STAGES: GrowthStage[] = [
  {
    id: 'newborn', range: [0, 1], label: '0–1个月', title: '适应与建立安全感',
    summary: '宝宝正在适应光线、声音和喂养节律，稳定的回应比刻意训练更重要。',
    activities: [
      { title: '面对面说话', description: '抱稳宝宝，在约 20–30 厘米处轻声说话，等待表情或声音回应。', meta: '每次 1–2 分钟 · 视觉与社交' },
      { title: '清醒时短暂俯卧', description: '在宝宝清醒、状态良好时，于稳固平面上短暂俯卧并全程看护。', meta: '从短时开始 · 头颈控制', safety: '睡眠时仍应保持仰卧，不留宝宝独处。' },
      { title: '回应宝宝的信号', description: '看到扭动、转头、哭声或安静注视时，先停下来观察，再用抱持、说话或喂养回应。', meta: '融入日常 · 安全感与依恋' },
    ],
    shopping: [
      { id: 'car-seat', title: '后向式儿童安全座椅', level: 'needed', reason: '出院和乘车时使用。', tip: '核对适用身高体重与国家强制性认证，不使用事故史不明的二手座椅。' },
      { id: 'sleep-sack', title: '合身睡袋', level: 'optional', reason: '可替代松散被褥，按室温选择。', tip: '领口不能过大，避免带帽和加重款。' },
      { id: 'pillow', title: '定型枕', level: 'skip', reason: '新生儿睡眠不需要枕头。', tip: '睡眠区域保持平整，不放松软寝具和玩偶。' },
      { id: 'baby-thermometer', title: '家用电子体温计', level: 'needed', reason: '用于宝宝不适时初步测量体温。', tip: '选择读数清晰、便于清洁的款式，异常时及时咨询医疗机构。' },
      { id: 'diaper-basics', title: '少量纸尿裤或尿布', level: 'needed', reason: '新生儿需要频繁更换，先准备少量更容易适配。', tip: '不要大量囤单一尺码，根据皮肤状态和体重调整。' },
      { id: 'feeding-basics', title: '基础喂养用品', level: 'optional', reason: '根据母乳、瓶喂或混合喂养的实际需求准备。', tip: '先准备最小可用数量，奶瓶、奶嘴按说明清洗消毒。' },
      { id: 'baby-bath-support', title: '婴儿浴盆或洗澡支撑', level: 'optional', reason: '可让日常清洁更顺手，但不是每个家庭都需要。', tip: '全程手扶并在旁看护，任何洗澡支撑都不能代替成人。' },
      { id: 'crib-bumper', title: '婴儿床围和床上装饰', level: 'skip', reason: '睡眠区域不需要增加柔软围挡和玩偶。', tip: '床面保持平整、坚实和简洁，降低窒息风险。' },
    ],
  },
  {
    id: 'respond', range: [1, 3], label: '1–3个月', title: '回应、微笑与抬头', summary: '宝宝开始更专注地看人，也会用动作、表情和声音回应。',
    activities: [
      { title: '跟随声音', description: '从宝宝侧前方轻声呼唤，观察是否转眼或转头寻找。', meta: '每次 1–2 分钟 · 听觉与沟通' },
      { title: '俯卧看家人', description: '俯卧时蹲低到宝宝视线前方，用声音和表情吸引抬头。', meta: '少量多次 · 大运动', safety: '全程在旁看护，困倦或哭闹时停止。' },
      { title: '模仿宝宝的声音', description: '重复宝宝发出的“啊”“哦”等声音，停顿几秒，给宝宝继续回应的机会。', meta: '每次 2–3 轮 · 语言与轮流交流' },
      { title: '慢慢移动熟悉的脸', description: '面对宝宝微笑，再缓慢向左右移动，让宝宝自由地用眼睛或头部跟随。', meta: '每次约 1 分钟 · 视觉与社交' },
    ],
    shopping: [
      { id: 'play-mat', title: '易清洁活动垫', level: 'needed', reason: '为清醒时活动提供稳固平面。', tip: '优先平整、无小零件、不过度柔软的产品。' },
      { id: 'contrast-card', title: '高对比图卡', level: 'optional', reason: '用于短时视觉互动。', tip: '少量即可，不需购买整套“早教”用品。' },
      { id: 'walker', title: '学步车', level: 'skip', reason: '当前阶段不适用，后续也应谨慎选择。', tip: '优先给宝宝自由的地面活动时间。' },
      { id: 'washable-rattle', title: '整体式摇铃', level: 'optional', reason: '可用于短时听觉和抓握互动。', tip: '选易清洁、无可脱落小零件、声音不刺耳的款式。' },
      { id: 'cloth-book', title: '可水洗布书', level: 'optional', reason: '适合亲子共读和触摸探索。', tip: '不需要多本，注意缝线、装饰物和绳带是否牢固。' },
      { id: 'baby-carrier', title: '婴儿背带', level: 'optional', reason: '外出或家务场景中可能更便携。', tip: '核对起始体重与使用姿势，保持面部可见、呼吸通畅。' },
      { id: 'tummy-time-pillow', title: '俯卧训练枕', level: 'skip', reason: '俯卧活动可在稳固平面和成人看护下进行。', tip: '不需要为“训练抓头”额外购买定型支撑。' },
      { id: 'sound-light-mobile', title: '长时间声光床铃', level: 'skip', reason: '强声光持续刺激不是发展的必需条件。', tip: '优先家人对话、表情和短时温和互动。' },
    ],
  },
  {
    id: 'grasp', range: [3, 6], label: '3–6个月', title: '抓握、翻身与互动', summary: '宝宝开始主动触碰周围，身体控制和与人的互动也在增加。',
    activities: [
      { title: '伸手够玩具', description: '把易抓握玩具放在胸前稍偏一侧，鼓励主动伸手。', meta: '2–3 分钟 · 手眼协调', safety: '玩具不应有可脱落小零件。' },
      { title: '地面自由活动', description: '给宝宝足够的地面时间，观察踢腿、转身和翻身尝试。', meta: '每天多次 · 全身协调' },
      { title: '你一句、我一句', description: '对宝宝说一句短话后停下来，回应宝宝的表情、动作或声音。', meta: '随时进行 · 语言与社交' },
      { title: '双手探索物品', description: '递给宝宝轻便、易抓握的物品，让宝宝自己触摸、握住或换手。', meta: '2–3 分钟 · 精细动作', safety: '物品应完整、易清洁，并大到无法吞咽。' },
    ],
    shopping: [
      { id: 'floor-toy', title: '易抓握玩具', level: 'needed', reason: '支持主动伸手和双手探索。', tip: '先准备 2–3 件，避免过度声光刺激。' },
      { id: 'teether', title: '整体式牙胶', level: 'optional', reason: '可满足啮咬和口腔探索。', tip: '选易清洁、无液体泄漏风险、无细小附件的款式。' },
      { id: 'sit-device', title: '强制坐姿训练器', level: 'skip', reason: '不需要为了提前坐起而购买。', tip: '优先自由地面活动与自然发展。' },
      { id: 'drool-bibs', title: '少量口水巾', level: 'optional', reason: '出牙和口腔探索增多时便于更换。', tip: '保持颈部干爽，睡眠前取下带系带的口水巾。' },
      { id: 'baby-safe-mirror', title: '婴儿安全镜', level: 'optional', reason: '可用于俯卧时的面孔和动作观察。', tip: '选无易碎玻璃、边缘牢固且无小配件的产品。' },
      { id: 'rolling-toy', title: '慢速滚动玩具', level: 'optional', reason: '可鼓励转身、伸手和移动尝试。', tip: '体积要足够大，表面光滑并便于清洁。' },
      { id: 'first-bowl-spoon', title: '首批辅食小碗与软勺', level: 'optional', reason: '接近 6 月龄时可按医务人员和宝宝状态提前准备。', tip: '只需少量基础餐具，不必购买大套辅食装备。' },
      { id: 'small-part-toy', title: '含小零件玩具', level: 'skip', reason: '宝宝会频繁把物品放入口中探索。', tip: '避免可脱落小件、扣式电池和小磁体。' },
    ],
  },
  {
    id: 'explore', range: [6, 9], label: '6–9个月', title: '坐、移动与主动探索', summary: '宝宝会通过触摸、移动和模仿来认识周围，活动范围正在扩大。',
    activities: [
      { title: '坐着取玩具', description: '把玩具放在宝宝前方稍偏左或右的位置，鼓励转身拿取。', meta: '2–3 分钟 · 平衡与手眼协调', safety: '在地垫上进行，全程在旁保护。' },
      { title: '模仿声音', description: '重复宝宝发出的简单音节，停顿并等待宝宝回应。', meta: '2–3 分钟 · 语言与轮流交流' },
      { title: '藏起来再找到', description: '用布部分遮住玩具，鼓励宝宝主动寻找。', meta: '1–2 分钟 · 认知探索' },
      { title: '两手传递和敲一敲', description: '提供两个轻便物品，让宝宝尝试换手、相互碰撞，家人同步说出动作。', meta: '3–5 分钟 · 精细动作与因果认知' },
      { title: '一起在地面移动', description: '家人在不远处呼唤或放置感兴趣的物品，给宝宝自主转身、腹爬或爬行的空间。', meta: '按宝宝意愿 · 大运动', safety: '清除小物、线绳、台阶和不稳家具等风险。' },
    ],
    shopping: [
      { id: 'high-chair', title: '稳固的儿童餐椅', level: 'needed', reason: '进入辅食阶段后提供稳定进食姿势。', tip: '关注稳定性、安全带、脚踏支撑和易清洁结构。' },
      { id: 'food-maker', title: '辅食机', level: 'optional', reason: '普通蒸锅、研磨或搅拌工具通常也能完成。', tip: '根据厨房空间和实际使用频率选择。' },
      { id: 'mesh-feeder', title: '咬咬乐与果蔬袋', level: 'skip', reason: '不是学习咀嚼和自主进食的必需用品。', tip: '优先提供质地适龄的食物，进食全程看护。' },
      { id: 'feeding-set', title: '少量辅食餐具', level: 'needed', reason: '用于开始辅食和自主尝试。', tip: '先准备 1–2 把勺和一个小碗，不必囤整套。' },
      { id: 'wipeable-bib', title: '易清洁围兜', level: 'needed', reason: '辅食初期可简化餐后清理。', tip: '选颈围可调、无长绳带且便于彻底清洁的款式。' },
      { id: 'training-cup', title: '开口杯或吸管杯', level: 'optional', reason: '可在辅食阶段少量练习喝水。', tip: '选结构简单、能彻底拆洗的款式，不在杯中长时间存放甜饮。' },
      { id: 'outlet-covers', title: '安全型插座防护', level: 'needed', reason: '宝宝开始移动后需检查低处电气风险。', tip: '优先使用符合标准的带保护门插座，防护件不能成为可脱落小件。' },
      { id: 'stair-gate', title: '楼梯安全门', level: 'needed', reason: '家中有楼梯时，爬行前应完成隔离。', tip: '根据楼梯位置选正确安装方式，定期检查松动。' },
      { id: 'floor-seat', title: '长时间固定坐姿椅', level: 'skip', reason: '不应用装备长时间限制宝宝地面自由活动。', tip: '就餐使用餐椅，其他时间优先安全地面活动。' },
    ],
  },
  {
    id: 'move', range: [9, 12], label: '9–12个月', title: '移动、模仿与有意表达', summary: '宝宝开始用更多动作表达需要，并通过移动主动探索家里。',
    activities: [
      { title: '放进去、拿出来', description: '用大口容器和较大物件练习放入和取出。', meta: '3–5 分钟 · 精细动作与认知', safety: '物件必须大于吞咽风险尺寸，全程看护。' },
      { title: '指给宝宝看', description: '日常中指着熟悉的人和物说出名称，等待宝宝观察或回应。', meta: '随时进行 · 语言理解' },
      { title: '模仿简单手势', description: '面对面示范挥手、拍手或指物，看到宝宝尝试时及时回应。', meta: '2–3 分钟 · 模仿与社交' },
      { title: '跟着喜欢的物品移动', description: '把玩具放在安全、可到达的位置，让宝宝自主爬过去或扶着稳固家具移动。', meta: '按宝宝意愿 · 移动与平衡', safety: '固定高柜和电视柜，隔离楼梯、窗边和水源。' },
      { title: '一起翻硬页书', description: '让宝宝自己翻页，家人指着图画说出名称，不要求宝宝跟读。', meta: '3–5 分钟 · 语言与共同注意' },
    ],
    shopping: [
      { id: 'cabinet-lock', title: '柜门和抽屉防护', level: 'needed', reason: '宝宝活动范围扩大后减少夹伤和误食风险。', tip: '同时将药品、清洁剂和小件物品移至高处并锁闭。' },
      { id: 'push-toy', title: '稳定推行玩具', level: 'optional', reason: '仅在宝宝已能扶站后考虑。', tip: '检查防后翻和速度控制，不替代自由地面活动。' },
      { id: 'shoes', title: '大量学步鞋', level: 'skip', reason: '尚未稳定户外行走时不必囤购。', tip: '室内安全环境中可让脚部自由活动。' },
      { id: 'furniture-anchors', title: '家具防倾倒固定件', level: 'needed', reason: '爬行、扶站和攀爬前应固定高柜、电视柜等家具。', tip: '按家具和墙体类型正确安装，搬动后重新检查。' },
      { id: 'corner-protection', title: '尖角家具防护', level: 'optional', reason: '家中存在低矮锐利边角时可针对性使用。', tip: '优先调整家具布局，防护件应牢固且不易被拆下。' },
      { id: 'large-blocks', title: '大颗粒积木', level: 'optional', reason: '支持敲击、叠放和容器游戏。', tip: '核对适用年龄，避免小零件、小磁体和尖锐边缘。' },
      { id: 'simple-toy-bin', title: '低矮开口收纳筐', level: 'optional', reason: '便于宝宝和家人一起取放玩具。', tip: '选稳固、无夹手重盖的结构，不设置可攀爬高度。' },
      { id: 'walking-harness', title: '学步吊带', level: 'skip', reason: '不是学习独立行走的必需用品。', tip: '优先在安全平整环境中自由练习，成人近距离看护。' },
    ],
  },
  {
    id: 'walk', range: [12, 18], label: '12–18个月', title: '行走、指物与主动沟通', summary: '宝宝正在尝试更独立地行动，也会用手势、声音和简单词语表达。',
    activities: [
      { title: '拿一拿、放一放', description: '给出简单单步指令，如“把球放进篮子”，用动作帮助理解。', meta: '3–5 分钟 · 语言与认知' },
      { title: '安全地推拉', description: '提供稳定可推拉的物品，鼓励在平整地面上移动。', meta: '按宝宝意愿 · 平衡与行走', safety: '远离台阶、斜坡和家具尖角。' },
      { title: '指一指、说一说', description: '宝宝指向人或物时，家人说出名称和简单用途，再等待新的手势或声音。', meta: '融入日常 · 语言与共同注意' },
      { title: '叠起再推倒', description: '一起叠放两三个大积木或杯子，再让宝宝推倒并重复。', meta: '3–5 分钟 · 精细动作与因果认知' },
      { title: '让宝宝参与小事', description: '邀请宝宝把袜子放进篮子、递来毛巾或把玩具送回固定位置。', meta: '每天进行 · 模仿与生活参与' },
    ],
    shopping: [
      { id: 'outdoor-shoes', title: '合脚户外鞋', level: 'needed', reason: '已稳定户外行走后用于保护脚部。', tip: '选轻便、可弯折、脚趾有空间的鞋，不囤大尺码。' },
      { id: 'step-stool', title: '防滑脚踏', level: 'optional', reason: '帮助在洗手等固定场景参与日常活动。', tip: '必须由成人看护，不放在窗边或高处附近。' },
      { id: 'flash-cards', title: '大量识字卡', level: 'skip', reason: '这一阶段更需要真实互动和自由游戏。', tip: '用共读、对话和日常场景丰富语言更自然。' },
      { id: 'toddler-cutlery', title: '儿童勺叉', level: 'needed', reason: '支持宝宝尝试自主进食。', tip: '选短柄、易抓握、边缘圆滑且便于清洁的款式。' },
      { id: 'door-stopper', title: '门缝防夹手装置', level: 'needed', reason: '行走和探索增多后减少门缝夹伤风险。', tip: '安装后检查是否牢固，避免本身成为可拆下的小件。' },
      { id: 'board-books', title: '少量硬页图书', level: 'optional', reason: '适合指物、翻页和亲子共读。', tip: '选图像清晰、内容简洁的图书，可重复阅读而不必大量购买。' },
      { id: 'ride-on-toy', title: '低速骑乘玩具', level: 'optional', reason: '在平整安全区域可用于推蹬和平衡游戏。', tip: '核对适用年龄、稳定性和 CCC 标志，远离台阶与道路。' },
      { id: 'personal-screen', title: '个人专用平板或手机', level: 'skip', reason: '不是语言、认知或安抚的必需用品。', tip: '优先共读、对话、户外活动和真实物品探索。' },
    ],
  },
  {
    id: 'independent', range: [18, 24], label: '18–24个月', title: '独立尝试与简单对话', summary: '宝宝开始有更强的自主意愿，会模仿生活动作，并尝试连起词语。',
    activities: [
      { title: '两选一', description: '在穿衣或选书时提供两个可接受的选择，等待宝宝决定。', meta: '日常进行 · 自主性与语言' },
      { title: '模仿家务', description: '一起擦桌子、收玩具或把衣物放进篮子。', meta: '5 分钟左右 · 协调与规则' },
      { title: '看图问一问', description: '共读时问“猫在哪里”等简单问题，允许宝宝用指、看或说来回答。', meta: '5 分钟左右 · 语言与认知' },
      { title: '滚球和踢球', description: '面对面滚球，或在安全空地尝试轻轻踢球，轮流等待。', meta: '5–10 分钟 · 大运动与轮流' },
      { title: '用玩偶演生活', description: '用玩偶做吃饭、睡觉或看医生等熟悉动作，让宝宝自由模仿和补充。', meta: '5–10 分钟 · 想象与社交' },
    ],
    shopping: [
      { id: 'open-cup', title: '儿童开口杯', level: 'needed', reason: '继续练习独立喝水。', tip: '选轻量、易抓握、易清洁款式，少量购买。' },
      { id: 'pretend-play', title: '简单角色游戏物品', level: 'optional', reason: '支持模仿和想象游戏。', tip: '真实安全的日常物品也可以，不必购买大套玩具。' },
      { id: 'learning-tablet', title: '早教平板', level: 'skip', reason: '不是当前阶段必需品。', tip: '优先真实对话、户外活动、共读与自由游戏。' },
      { id: 'toddler-toothbrush', title: '婴幼儿软毛牙刷', level: 'needed', reason: '用于建立每日口腔清洁习惯。', tip: '按适用年龄选小刷头、软刷毛款，由成人协助使用。' },
      { id: 'potty-seat', title: '儿童坐便器或马桶圈', level: 'optional', reason: '宝宝出现如厕意识后可逐步熟悉。', tip: '不以年龄强迫训练，选稳固、脚部有支撑的结构。' },
      { id: 'washable-crayons', title: '可水洗粗杆画笔', level: 'optional', reason: '支持涂画、握笔和自由创作。', tip: '核对适用年龄和安全标识，避免细小、易断或有刺激性气味的产品。' },
      { id: 'first-balance-bike', title: '低座平衡车', level: 'optional', reason: '当宝宝行走稳定且身高适配时可考虑。', tip: '先试骑确认双脚能着地，在封闭平坦区域使用并全程看护。' },
      { id: 'magnetic-small-toy', title: '小磁珠和强磁小件', level: 'skip', reason: '误吞小磁体可能造成严重伤害。', tip: '3 岁以下避免含小磁体和可脱落小件的玩具。' },
    ],
  },
  {
    id: 'social', range: [24, 36], label: '2–3岁', title: '表达、想象与社交练习', summary: '宝宝的语言、想象和自理能力在快速发展，也在学习如何与他人相处。',
    activities: [
      { title: '把故事说完', description: '共读时暂停，让宝宝用词语、动作或想象接下去。', meta: '5–10 分钟 · 语言与想象' },
      { title: '一起收拾', description: '用简单分类指令收玩具，并给出清晰的开始和结束信号。', meta: '每天进行 · 规则与分类' },
      { title: '跳一跳、踢一踢', description: '在平整空地模仿双脚跳、踢大球或绕过软标记物，按宝宝能力自由参与。', meta: '10 分钟左右 · 大运动与协调', safety: '远离车道、台阶和硬质尖角，成人近距离看护。' },
      { title: '扮演熟悉角色', description: '用安全的日常物品玩做饭、照顾玩偶或购物，让宝宝决定故事怎么发展。', meta: '10 分钟左右 · 想象与语言' },
      { title: '说出感受和需要', description: '遇到等待或冲突时，帮宝宝说出“着急”“还想玩”等感受，再给出简单选择。', meta: '真实情境 · 情绪与社交' },
    ],
    shopping: [
      { id: 'helmet', title: '合适尺寸的头盔', level: 'needed', reason: '使用平衡车或骑行时保护头部。', tip: '根据头围试戴，正确调节，发生重大碰撞后更换。' },
      { id: 'art-supplies', title: '可水洗绘画材料', level: 'optional', reason: '支持涂画、握笔和创作。', tip: '核对适用年龄和安全标识，成人在旁使用。' },
      { id: 'workbooks', title: '大量学科练习册', level: 'skip', reason: '不是 2–3 岁日常成长的必需品。', tip: '优先游戏、对话、运动和真实生活参与。' },
      { id: 'picture-books', title: '适龄图画书', level: 'needed', reason: '支持共读、表达和故事想象。', tip: '少量轮换即可，可优先利用图书馆或家庭共享图书。' },
      { id: 'child-scissors', title: '适龄安全剪刀', level: 'optional', reason: '可在成人看护下尝试简单手工。', tip: '选圆头、与手部尺寸适配的款式，使用后收至宝宝无法自取处。' },
      { id: 'dress-up-basics', title: '简单角色装扮物', level: 'optional', reason: '可用于角色游戏和生活模仿。', tip: '避免长绳带、小配件、尖锐饰品和影响视线的面罩。' },
      { id: 'toilet-footrest', title: '如厕脚踏', level: 'optional', reason: '使用成人马桶圈时可提供稳定脚部支撑。', tip: '选防滑、稳固且高度适配的结构，不放在窗边或高处。' },
      { id: 'magnetic-beads', title: '磁力珠和小颗粒磁性玩具', level: 'skip', reason: '小磁体误吞后可能造成严重肠道伤害。', tip: '不给 3 岁以下儿童购买含强磁小部件的玩具。' },
      { id: 'powered-ride-on', title: '高速电动骑乘玩具', level: 'skip', reason: '速度和操控超出幼儿能力时会增加碰撞风险。', tip: '优先低速、人力和双脚可着地的活动方式。' },
    ],
  },
];

export const LOCAL_GUIDE_TASKS: LocalGuideTask[] = [
  {
    id: 'birth-one-thing', title: '新生儿出生“一件事”', timing: '出生后尽早了解与申请', range: [0, 1],
    description: '浙江已将出生医学证明、预防接种证、户口登记、城乡居民参保登记和社保卡申领等事项纳入联办流程。',
    materials: '建议先准备父母双方身份证、拟落户方户口簿和结婚证；实际材料以浙里办当前页面为准。',
    sourceLabel: '浙江省出生“一件事”联办流程', sourceUrl: 'https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3397/site/attach/0/ef2c7dbf149a4dc8855866a29156a700.pdf',
  },
  {
    id: 'newborn-insurance', title: '确认宝宝医保参保与缴费', timing: '出生后尽早确认', range: [0, 3],
    description: '杭州已实施新生儿“出生即参保”服务。提交出生“一件事”后，仍需留意参保、缴费和医保码状态。',
    materials: '先核对浙里办或医保通知；不同户籍和家庭情况可能需要额外材料。',
    sourceLabel: '国家医保局：杭州“出生即参保”', sourceUrl: 'https://www.nhsa.gov.cn/art/2024/9/24/art_14_13946.html',
  },
  {
    id: 'childcare-subsidy', title: '完成首次育儿补贴申领', timing: '建议在出生后早期核对', range: [0, 3],
    description: '国家育儿补贴面向符合条件的 3 周岁以下婴幼儿。首次申请完成后，后续按当年通知办理，本指南不重复提醒。',
    materials: '通常需要婴幼儿出生医学证明、户口簿及申领人信息；具体以浙里办或“育儿补贴”系统当前要求为准。',
    sourceLabel: '国家卫健委：育儿补贴制度政策问答', sourceUrl: 'https://www.nhc.gov.cn/rkjcyjtfzs/c100147/202507/06cb12b180904128ae7e55620b713ac0.shtml',
  },
  {
    id: 'hangzhou-family-subsidy', title: '核对杭州孕产补助资格', timing: '部分情形需在出生后 180 日内申请', range: [0, 6],
    description: '杭州对符合条件的二孩、三孩家庭设有孕产补助；与国家育儿补贴的衔接、适用资格和金额以当年政策为准。',
    materials: '可先准备夫妻身份证、结婚证、户口簿、出生医学证明及相关社保卡账户信息。',
    sourceLabel: '杭州市人民政府公报：育儿补贴及孕产补助', sourceUrl: 'https://zfgb.hangzhou.gov.cn/upload/default/bigfile/2026/01/23/20260123_ed9a378a14c073f3c98316bd2c4a24cf.pdf',
  },
  {
    id: 'nursery-entry', title: '准备入托检查与接种证查验', timing: '计划入托前按机构要求办理', range: [18, 36],
    description: '正式入托前通常需要完成专项健康检查，并由托育机构查验预防接种证。这是入托节点事项，不是日常体检提醒。',
    materials: '先向拟入托机构确认指定体检机构、时效、预防接种证和其他入托材料。',
    sourceLabel: '杭州市人民政府公报：托育机构入托健康检查', sourceUrl: 'https://zfgb.hangzhou.gov.cn/upload/default/bigfile/2026/01/23/20260123_ed9a378a14c073f3c98316bd2c4a24cf.pdf',
  },
  {
    id: 'child-health', title: '安排本阶段儿童健康检查', timing: '按月龄与属地机构预约', range: [0, 36], archived: true,
    description: '结合出生机构、属地社区卫生服务中心的通知，安排儿童健康检查和生长发育评估。',
    materials: '带上儿童保健记录、近期喂养和成长记录；实际时间以属地机构通知为准。',
    sourceLabel: '国家基本公共卫生服务项目', sourceUrl: 'https://www.nhc.gov.cn/',
  },
  {
    id: 'vaccination', title: '核对下一次预防接种', timing: '按接种证与预约信息', range: [0, 36], archived: true,
    description: '接种安排应以宝宝的预防接种证和属地接种门诊通知为准，本页不替代医疗机构安排。',
    materials: '接种前记录宝宝近期健康状态，携带接种证及机构要求的资料。',
    sourceLabel: '中国疾病预防控制中心', sourceUrl: 'https://www.chinacdc.cn/',
  },
];

export function stageForAge(ageMonths: number): GrowthStage {
  return GROWTH_STAGES.find(stage => ageMonths >= stage.range[0] && ageMonths < stage.range[1]) ?? GROWTH_STAGES[GROWTH_STAGES.length - 1];
}

export function seasonalAdvice(month: number): { season: string; title: string; description: string; sourceLabel: string; sourceUrl: string }[] {
  if (month >= 6 && month <= 9) return [
    { season: '夏季', title: '避开高温时段外出', description: '婴幼儿对高温更敏感。尽量避免长时间处于高温、高湿环境，使用空调时避免冷风直吹。', sourceLabel: '国家卫健委防中暑提示', sourceUrl: 'https://www.nhc.gov.cn/zwgk/bmts/201406/248651a1bb444160a925062a4341d36a.shtml' },
    { season: '夏季', title: '优先物理防蚊', description: '清理家中积水，使用纱窗、宽松防蚊衣裤和婴儿车蚊帐；使用驱蚊产品时核对适用年龄。', sourceLabel: '中国疾控中心科学防蚊指引', sourceUrl: 'https://icdc.chinacdc.cn/sjd/sjzxxx/sjhydt/202408/t20240807_294254.html' },
    { season: '夏季', title: '辅食现做现吃', description: '选择新鲜食材，制作前后注意手部和器具卫生；高温季节尤其注意储存温度和时间。', sourceLabel: '国家卫健委婴幼儿喂养与营养指南', sourceUrl: 'https://www.nhc.gov.cn/rkjcyjtfzs/c100147/202201/a7d3fc17153f410ea97270814a3e662f.shtml' },
    { season: '汛期', title: '留意暴雨与台风预警', description: '杭州夏秋可能出现强对流和台风影响。预警期间减少非必要出行，不在临水、低洼或树下停留。', sourceLabel: '杭州市人民政府', sourceUrl: 'https://www.hangzhou.gov.cn/' },
  ];
  if (month >= 10 || month <= 2) return [
    { season: '秋冬', title: '按体感分层穿衣', description: '室内外温差较大时分层穿衣，及时增减，避免捂汗后吹风。', sourceLabel: '国家卫健委', sourceUrl: 'https://www.nhc.gov.cn/' },
    { season: '秋冬', title: '定时通风与手部清洁', description: '兼顾保暖与通风，外出回家、处理食物和接触宝宝前清洁双手。', sourceLabel: '中国疾病预防控制中心', sourceUrl: 'https://www.chinacdc.cn/' },
    { season: '秋冬', title: '取暖设备远离宝宝', description: '电暖器、热水袋和加湿设备应放在宝宝无法触及的位置，避免烫伤、倾倒和细菌滋生。', sourceLabel: '中国消防', sourceUrl: 'https://www.119.gov.cn/' },
  ];
  return [
    { season: '春季', title: '通风同时留意花粉', description: '根据空气质量和宝宝状态选择通风时间，户外回家后清洁手脸并更换外层衣物。', sourceLabel: '中国气象局', sourceUrl: 'https://www.cma.gov.cn/' },
    { season: '春季', title: '及时增减衣物', description: '杭州春季温差较大，建议分层穿衣，活动出汗后及时更换。', sourceLabel: '国家卫健委', sourceUrl: 'https://www.nhc.gov.cn/' },
    { season: '春季', title: '户外活动前查看预报', description: '雷雨、大风或空气质量不佳时调整户外安排。', sourceLabel: '杭州市人民政府', sourceUrl: 'https://www.hangzhou.gov.cn/' },
  ];
}
