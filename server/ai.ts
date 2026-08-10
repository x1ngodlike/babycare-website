import { z } from 'zod';

export type ModelSettings = { baseUrl: string; model: string; apiKey: string };

export interface DailyReportInput {
  babyName: string;
  ageText: string;
  date: string;
  growth: { heightCm: number; weightKg: number; measuredOn: string } | null;
  prevGrowth: { heightCm: number; weightKg: number; measuredOn: string } | null;
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
  summary: z.string().trim().min(1).max(300),
  suggestions: z.array(z.string().trim().min(1).max(60)).min(1).max(5)
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

export async function generateDailyReport(input: DailyReportInput, settings: ModelSettings): Promise<{ summary: string; suggestions: string[] }> {
  const growthLine = input.growth
    ? `最新成长（${input.growth.measuredOn}）：身高 ${input.growth.heightCm}cm、体重 ${input.growth.weightKg}kg${input.prevGrowth ? `；上次（${input.prevGrowth.measuredOn}）身高 ${input.prevGrowth.heightCm}cm、体重 ${input.prevGrowth.weightKg}kg` : ''}`
    : '暂无成长记录';
  const content = await requestCompletion(settings, [
    {
      role: 'system',
      content: '你是宝宝照护日报助手。基于给定的结构化数据，生成一段简短的昨日总结（≤60 字）与 1~3 条简短建议（每条≤30 字）。只输出 JSON：{"summary":"…","suggestions":["…","…"]}，不要任何额外解释或 Markdown。语气温和、口语化，像有经验的家人给的建议。'
    },
    {
      role: 'user',
      content: `宝宝：${input.babyName}（${input.ageText}）。日期：${input.date}。${growthLine}。昨日照护：母乳 ${input.yesterday.breastMl}ml、奶粉 ${input.yesterday.formulaMl}ml、喂奶 ${input.yesterday.feedCount} 次、排便 ${input.yesterday.bowelCount} 次；营养补充：${input.yesterday.supplements.length ? input.yesterday.supplements.join('、') : '无'}；备注：${input.yesterday.notes.length ? input.yesterday.notes.join('；') : '无'}。`
    }
  ], 400);
  const parsedJson = JSON.parse(content) as unknown;
  return dailyReportSchema.parse(parsedJson);
}
