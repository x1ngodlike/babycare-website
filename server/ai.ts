import { z } from 'zod';
import type { BabySex } from './types.js';
import type { IndicatorAssessment } from './growth-standards.js';

export type ModelSettings = { baseUrl: string; model: string; apiKey: string };

export interface GrowthEvaluationInput {
  babyName: string;
  ageText: string;
  sex: BabySex;
  height: IndicatorAssessment;
  weight: IndicatorAssessment;
  previous: { measuredOn: string; heightCm: number; weightKg: number; daysSince: number } | null;
}

export interface DailyReportInput {
  babyName: string;
  ageText: string;
  sex: BabySex;
  date: string;
  growthContext: { heightCm: number; weightKg: number; measuredOn: string; daysSinceMeasurement: number; recordCount: number; recent: boolean } | null;
  supplementPlan: {
    rule: string;
    previousDay: string[];
    status: string;
  };
  yesterday: {
    breastMl: number;
    formulaMl: number;
    feedCount: number;
    bowelCount: number;
    supplements: string[];
    notes: string[];
    feedTimes: string[];
    nightFeedCount: number;
    maxSingleFeedMl: number;
  };
  last7Days: {
    avgTotalMl: number;
    avgFeedCount: number;
    avgBowelCount: number;
    daysWithRecords: number;
  };
}

const dailyReportSchema = z.object({
  summary: z.string().trim().min(1).max(120),
  suggestions: z.array(z.string().trim().min(1).max(30)).min(1).max(3)
});

const growthEvaluationSchema = z.object({
  evaluation: z.string().trim().min(1).max(80)
});

function completionUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

export async function requestCompletion(settings: ModelSettings, messages: { role: 'system' | 'user'; content: string }[], maxTokens = 1200) {
  const response = await fetch(completionUrl(settings.baseUrl), {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.model,
      messages,
      stream: false,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
      max_tokens: maxTokens
    }),
    signal: AbortSignal.timeout(30_000)
  });
  const body = await response.json().catch(() => ({})) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || `模型服务返回了错误（${response.status}）`);
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('模型没有返回有效内容');
  return content;
}

export async function testModelConnection(settings: ModelSettings) {
  await requestCompletion(settings, [
    { role: 'system', content: '只输出 JSON 对象。' },
    { role: 'user', content: '输出 {"ok":true}。' }
  ]);
}

export function evaluateAdVdPlan(yesterday: string[], previousDay: string[]): string {
  const current = yesterday.filter(item => item === 'AD' || item === 'VD');
  const previous = previousDay.filter(item => item === 'AD' || item === 'VD');
  if (!current.length) return '昨日未记录 AD 或 VD；未记录不等于未服用，只可提醒核对';
  if (current.length > 1) return '昨日同时记录 AD 和 VD，请核对是否符合当前医嘱';
  if (previous.length !== 1) return `昨日已记录 ${current[0]}；缺少明确的前一日记录，无法判断交替情况`;
  return current[0] !== previous[0]
    ? `昨日 ${current[0]} 与前一日 ${previous[0]} 交替，符合计划`
    : `昨日与前一日均记录 ${current[0]}，请核对是否符合当前医嘱`;
}

export function dailyReportMessages(input: DailyReportInput): { role: 'system' | 'user'; content: string }[] {
  const sexLabel = input.sex === 'male' ? '男宝宝' : input.sex === 'female' ? '女宝宝' : '未设置';
  return [
    {
      role: 'system',
      content: '你是有儿科保健知识的资深育儿助手，每天清晨为一对疲惫的新手父母写「宝宝昨日照护日报」。语气温和专业，像懂医学的家人，不说教、不制造焦虑。\n\n阅读输入中的昨日照护数据，只输出 JSON：{"summary":"…","suggestions":["…"]}。\n\n【summary】≤45字，一句话讲昨日最值得知道的事，按优先级选材：\n1. 明显异常：奶量或喂奶次数与 last7Days 日均偏差约±20%以上、夜间喂养明显增多、排便异常、任一备注里的不适描述\n2. 值得肯定的规律（如“喂奶间隔稳定在4小时”）\n3. 都平常就写“昨天整体平稳”，并带一个具体细节\n禁止出现身高、体重或任何成长变化表述。\n\n【suggestions】1~3条，每条≤30字，是今天就能做的具体行动，按优先级：\n1. 异常观察要点（如有）\n2. 喂养节奏、奶量与月龄匹配、夜间喂养与睡眠安抚\n3. 当日照护小贴士：月龄互动游戏、户外、抚触\n每条尽量引用昨日具体数据，不说空话。备注可能挂在喂养、排便、补充剂任何记录上，每条都值得参考。\n\n【三条红线】\n1. 用药与补充剂由日报「今日用药护理计划」版块负责：不做常规用药或补充剂提醒；仅当 supplementPlan.status 含“请核对”时提醒核对一次。AD 与 VD 每天一种交替属正常，无记录不等于未服用；不建议加量、减量、同服、停用或更换。\n2. 成长数据仅作背景：不输出身高体重数值，不用“比上次”“增长”“下降”“变化”“趋势”等词；单次记录不得推测变化，不评价发育正常与否。此限制仅针对身高体重，奶量与喂养的对比不受限。\n3. 不做医疗诊断；异常用“建议观察，必要时咨询儿科医生”表达；不编造输入中没有的事实。last7Days 仅统计有记录的天（daysWithRecords），漏记天数不影响判断。\n\n【示例】（仅示范写法，数据不同勿照抄）\n5月龄女宝，昨日奶粉720ml/6次、夜奶2次、排便1次、喂养备注“14:30 吐了一部分”：\n{"summary":"昨天奶量和排便正常，白天吐过一次奶，夜奶两次睡得不太稳。","suggestions":["喂奶后竖抱拍嗝15分钟，观察吐奶是否减少","白天多安排趴卧和户外活动，帮夜里睡得更沉"]}\n\n只输出 JSON，不要解释或 Markdown。'
    },
    {
      role: 'user',
      content: JSON.stringify({
        baby: { name: input.babyName, age: input.ageText, sex: sexLabel },
        reportDate: input.date,
        yesterdayCare: input.yesterday,
        last7Days: input.last7Days,
        supplementPlan: input.supplementPlan,
        growthContext: input.growthContext
      })
    }
  ];
}

export async function generateDailyReport(input: DailyReportInput, settings: ModelSettings): Promise<{ summary: string; suggestions: string[] }> {
  const content = await requestCompletion(settings, dailyReportMessages(input), 400);
  const parsedJson = JSON.parse(content) as unknown;
  return dailyReportSchema.parse(parsedJson);
}

export function growthEvaluationMessages(input: GrowthEvaluationInput): { role: 'system' | 'user'; content: string }[] {
  const sexLabel = input.sex === 'male' ? '男宝宝' : input.sex === 'female' ? '女宝宝' : '宝宝';
  return [
    {
      role: 'system',
      content: '你是有儿科保健知识的资深育儿助手，为家长解读宝宝的一次身高体重测量结果。测量位置已按国家卫生行业标准《7岁以下儿童生长标准》（WS/T 423-2022）算好（SD 值与区间），你只负责温和解读，不制造焦虑。只输出 JSON：{"evaluation":"…"}。\n\n【evaluation】50字以内，一句连贯自然的话，不用列表：说清身高、体重各自落在哪个区间（区间分五档：下、中下、中、中上、上，如“身高中、体重中上”），有上次记录时带一句变化是否平稳。语气温和口语化。\n\n【红线】\n1. 不做医疗诊断，不用“发育迟缓”“肥胖”“营养不良”等吓人词汇；区间为“下”或“上”时用“建议儿保评估”表达。\n2. 单次测量有误差，测量间隔太近不解读细微变化。\n3. 不编造输入中没有的事实；月龄、性别、SD 值都以输入为准。\n\n【示例】（仅示范写法，数据不同勿照抄）\n{"evaluation":"这次身高中、体重中上，比上次长得平稳，继续按现在的节奏喂养就好。"}\n\n只输出 JSON，不要解释或 Markdown。'
    },
    {
      role: 'user',
      content: JSON.stringify({
        baby: { name: input.babyName, age: input.ageText, sex: sexLabel },
        height: { valueCm: input.height.value, sd: input.height.z, band: input.height.bandLabel, range: `${input.height.anchors.minus2sd}~${input.height.anchors.plus2sd}cm` },
        weight: { valueKg: input.weight.value, sd: input.weight.z, band: input.weight.bandLabel, range: `${input.weight.anchors.minus2sd}~${input.weight.anchors.plus2sd}kg` },
        previous: input.previous ? { measuredOn: input.previous.measuredOn, daysSince: input.previous.daysSince, heightCm: input.previous.heightCm, weightKg: input.previous.weightKg, heightDeltaCm: Math.round((input.height.value - input.previous.heightCm) * 10) / 10, weightDeltaKg: Math.round((input.weight.value - input.previous.weightKg) * 100) / 100 } : null
      })
    }
  ];
}

export interface FeedingInsightsInput {
  babyName: string;
  ageText: string;
  sex: BabySex;
  prediction: {
    available: boolean;
    gapMinutes: number | null;
    volumeMl: number | null;
    confidence: number;
    nextFeedAt: string | null;
    upcomingFeeds: { predictedAt: string; earliest: string; latest: string; estimatedMl: number | null; period: string }[];
    periodGaps: { period: string; count: number; medianMinutes: number | null }[];
    periodVolumes: { period: string; count: number; medianMl: number | null }[];
    overallMedianGapMinutes: number | null;
    dataDays: number;
    dataFeeds: number;
  };
  recentFeedings: { occurredAt: string; breastMilkMl: number | null; formulaMl: number | null; note?: string }[];
}

const feedingInsightsSchema = z.object({
  summary: z.string().trim().min(1).max(80),
  insights: z.array(z.string().trim().min(1).max(40)).min(1).max(3),
  alert: z.enum(['none', 'pattern_change', 'low_confidence', 'growth_spurt']).default('none'),
  aiNextFeedAt: z.string().nullable().optional(),
  aiGapMinutes: z.number().int().nullable().optional()
});

function normalizeAiDatetime(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const withZ = /[Zz]$/.test(normalized) ? normalized : normalized.replace(/([+-]\d{2}:?\d{2})$/, 'Z');
    const date = new Date(withZ);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

export function feedingInsightsMessages(input: FeedingInsightsInput): { role: 'system' | 'user'; content: string }[] {
  const sexLabel = input.sex === 'male' ? '男宝宝' : input.sex === 'female' ? '女宝宝' : '宝宝';
  const periodLabelMap: Record<string, string> = { night: '凌晨', earlyMorning: '清晨', morning: '上午', midday: '中午', afternoon: '下午', evening: '晚上' };
  const periodGapsText = input.prediction.periodGaps.map(g => `${periodLabelMap[g.period] || g.period} ${g.count}次 中位${g.medianMinutes ? Math.round(g.medianMinutes) + '分钟' : '无数据'}`).join('；');
  const periodVolsText = input.prediction.periodVolumes.map(v => `${periodLabelMap[v.period] || v.period} ${v.count}次 中位${v.medianMl ? Math.round(v.medianMl) + 'mL' : '无数据'}`).join('；');
  const recentText = input.recentFeedings.slice(-7).map(f => {
    const time = new Date(f.occurredAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
    const ml = (f.breastMilkMl || 0) + (f.formulaMl || 0);
    return `${time} ${ml}mL${f.note ? ' 备注:' + f.note : ''}`;
  }).join('；');
  return [
    {
      role: 'system',
      content: '你是有儿科保健知识的资深育儿助手，根据宝宝的历史喂奶数据和预测结果，为父母提供简明的喂养洞察，并预测下次喂奶时间。只输出 JSON：{"summary":"…","insights":["…"],"alert":"none|pattern_change|low_confidence|growth_spurt","aiNextFeedAt":"ISO时间戳或null","aiGapMinutes":数字或null}。\n\n【summary】≤40字，一句话说清喂奶模式的核心特征，如"喂奶间隔稳定在3小时，节奏良好"或"下午奶量偏少，注意观察"。\n\n【insights】1~3条，每条≤20字，具体行动建议或观察要点，如"下午时段可适当提前喂奶"、"注意监测尿量判断奶量是否充足"。\n\n【alert】可选值：\n- none：无异常\n- pattern_change：近期喂养模式有明显变化\n- low_confidence：数据不足，预测仅供参考\n- growth_spurt：奶量或频率呈增加趋势，可能处于猛长期\n\n【aiNextFeedAt】基于历史数据和当前时间，预测的下次喂奶具体时间（ISO 8601 格式，如 "2026-08-17T15:30:00+08:00"）。如果数据不足以做出可靠预测，填 null。\n\n【aiGapMinutes】从现在到预测下次喂奶的分钟数（整数）。如果无法预测，填 null。\n\n【红线】\n1. 不做医疗诊断，异常时用"建议观察，必要时咨询儿科医生"\n2. 不编造输入中没有的事实\n3. 语气温和，不制造焦虑\n4. 结合月龄给出适龄建议\n5. 预测时间需考虑当前所处时段和近期喂奶规律\n\n只输出 JSON，不要解释或 Markdown。'
    },
    {
      role: 'user',
      content: JSON.stringify({
        baby: { name: input.babyName, age: input.ageText, sex: sexLabel },
        currentTime: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        prediction: {
          gapMinutes: input.prediction.gapMinutes ? Math.round(input.prediction.gapMinutes) : null,
          gapHours: input.prediction.gapMinutes ? Math.round(input.prediction.gapMinutes / 60 * 10) / 10 : null,
          volumeMl: input.prediction.volumeMl ? Math.round(input.prediction.volumeMl) : null,
          confidence: Math.round(input.prediction.confidence * 100) + '%',
          nextFeed: input.prediction.nextFeedAt ? new Date(input.prediction.nextFeedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : null,
          upcomingFeeds: input.prediction.upcomingFeeds.map(f => ({
            at: new Date(f.predictedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            earliest: new Date(f.earliest).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }),
            latest: new Date(f.latest).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }),
            estimatedMl: f.estimatedMl ? Math.round(f.estimatedMl) : null,
            period: periodLabelMap[f.period] || f.period
          })),
          periodGaps: periodGapsText,
          periodVolumes: periodVolsText,
          overallMedianGap: input.prediction.overallMedianGapMinutes ? Math.round(input.prediction.overallMedianGapMinutes / 60 * 10) / 10 + '小时' : null,
          dataDays: input.prediction.dataDays,
          dataFeeds: input.prediction.dataFeeds
        },
        recentFeedings: recentText
      })
    }
  ];
}

export async function generateFeedingInsights(input: FeedingInsightsInput, settings: ModelSettings): Promise<{ summary: string; insights: string[]; alert: 'none' | 'pattern_change' | 'low_confidence' | 'growth_spurt'; aiNextFeedAt: string | null; aiGapMinutes: number | null }> {
  const content = await requestCompletion(settings, feedingInsightsMessages(input), 400);
  const parsedJson = JSON.parse(content) as unknown;
  const parsed = feedingInsightsSchema.parse(parsedJson);
  return {
    summary: parsed.summary,
    insights: parsed.insights,
    alert: parsed.alert,
    aiNextFeedAt: normalizeAiDatetime(parsed.aiNextFeedAt),
    aiGapMinutes: parsed.aiGapMinutes ?? null
  };
}

export async function generateGrowthEvaluation(input: GrowthEvaluationInput, settings: ModelSettings): Promise<{ evaluation: string }> {
  const content = await requestCompletion(settings, growthEvaluationMessages(input), 120);
  const parsedJson = JSON.parse(content) as unknown;
  return growthEvaluationSchema.parse(parsedJson);
}
