import { z } from 'zod';
import type { BabySex } from './types.js';

export type ModelSettings = { baseUrl: string; model: string; apiKey: string };

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
  };
}

const dailyReportSchema = z.object({
  summary: z.string().trim().min(1).max(120),
  suggestions: z.array(z.string().trim().min(1).max(30)).min(1).max(3)
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
      content: '你是「宝宝昨日照护日报」助手。只输出 JSON：{"summary":"…","suggestions":["…"]}。\n1. summary：≤45 字，口语化、温和，只总结昨日喂养（奶量、次数、间隔）、排便或备注中最值得关注的一件事；不要在 summary 中展示身高、体重或成长趋势。\n2. suggestions：1~3 条，每条≤30 字，围绕宝宝健康照护展开：喂养节奏是否规律、奶量与月龄是否匹配、排便与精神状态观察、睡眠安抚、月龄相应的互动与发育活动，结合性别和 recent=true 时的成长背景，给出今天就能做的具体建议。\n3. 用药与补充剂提醒由日报专门的「今日用药护理计划」版块负责：不要输出常规用药或补充剂提醒（如按时服药、记得补 AD/VD）；仅当 supplementPlan.status 中出现“请核对”时，才用一条建议提醒核对医嘱。\n4. 维生素 AD 与维生素 D（VD）按每天一种交替补充；单日只记录其中一种属于正常情况，不要提醒补吃另一种。没有记录不等于没有服用；不得建议自行加量、减量、同服、停用或更换。\n5. 成长数据只用于调整建议，不得输出具体身高体重，不得出现“比上次”“增长”“下降”“变化”“趋势”等表述；只有一次记录也不得推测变化，不评价正常、偏高、偏低或发育异常。\n6. 数据正常时不强行寻找问题，可给当日照护小贴士（如户外活动、互动游戏、抚触）；若昨日记录存在明显异常，温和提醒观察，必要时咨询儿科医生。不给出医疗诊断，不编造输入中没有的事实。\n7. 不输出额外解释或 Markdown。'
    },
    {
      role: 'user',
      content: JSON.stringify({
        baby: { name: input.babyName, age: input.ageText, sex: sexLabel },
        reportDate: input.date,
        yesterdayCare: input.yesterday,
        supplementPlan: input.supplementPlan,
        growthContext: input.growthContext
      })
    }
  ];
}

export async function generateDailyReport(input: DailyReportInput, settings: ModelSettings): Promise<{ summary: string; suggestions: string[] }> {
  const content = await requestCompletion(settings, dailyReportMessages(input), 300);
  const parsedJson = JSON.parse(content) as unknown;
  return dailyReportSchema.parse(parsedJson);
}
