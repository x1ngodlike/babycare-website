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

async function requestCompletion(settings: ModelSettings, messages: { role: 'system' | 'user'; content: string }[], maxTokens = 1200) {
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

export async function generateGrowthEvaluation(input: GrowthEvaluationInput, settings: ModelSettings): Promise<{ evaluation: string }> {
  const content = await requestCompletion(settings, growthEvaluationMessages(input), 120);
  const parsedJson = JSON.parse(content) as unknown;
  return growthEvaluationSchema.parse(parsedJson);
}
