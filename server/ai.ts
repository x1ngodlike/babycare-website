import { z } from 'zod';
import type { DraftRecord } from './types.js';

export type ModelSettings = { baseUrl: string; model: string; apiKey: string };

const interpretedRecordSchema = z.object({
  type: z.enum(['feeding', 'supplement', 'bowel', 'note']),
  occurredAt: z.string().datetime({ offset: true }),
  breastMilkMl: z.number().int().min(1).max(500).nullable().optional(),
  formulaMl: z.number().int().min(1).max(500).nullable().optional(),
  supplement: z.string().trim().min(1).max(30).nullable().optional(),
  bowelSize: z.enum(['大', '中', '小']).nullable().optional(),
  note: z.string().trim().max(200).nullable().optional()
}).superRefine((value, ctx) => {
  if (value.type === 'feeding' && !value.breastMilkMl && !value.formulaMl) ctx.addIssue({ code: 'custom', message: '缺少奶量' });
  if (value.type === 'supplement' && !value.supplement) ctx.addIssue({ code: 'custom', message: '缺少用药名称' });
  if (value.type === 'bowel' && !value.bowelSize) ctx.addIssue({ code: 'custom', message: '缺少排便量' });
  if (value.type === 'note' && !value.note) ctx.addIssue({ code: 'custom', message: '缺少情况说明' });
});

const responseSchema = z.object({ records: z.array(interpretedRecordSchema).max(12) });

function completionUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

async function requestCompletion(settings: ModelSettings, messages: { role: 'system' | 'user'; content: string }[]) {
  const response = await fetch(completionUrl(settings.baseUrl), {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.model,
      messages,
      stream: false,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
      max_tokens: 1200
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

export async function interpretTranscript(transcript: string, settings: ModelSettings, now = new Date(), careItems: string[] = ['AD', 'VD', '益生菌', '推拿']): Promise<DraftRecord[]> {
  const content = await requestCompletion(settings, [
    {
      role: 'system',
      content: `你是宝宝照护记录解析器。把家人的一句中文口语转换为 JSON：{"records":[]}。允许类型：feeding（母乳和奶粉毫升数分开）、supplement（仅可使用这些项目：${careItems.join('、')}）、bowel（大、中、小）、note（其他情况）。occurredAt 必须是带时区的 ISO 时间；未说日期时使用今天，未说时间时使用当前时间。不要推测没有说出的数量或事项。当前时间：${now.toISOString()}，家庭时区：Asia/Shanghai。`
    },
    { role: 'user', content: transcript }
  ]);
  const parsedJson = JSON.parse(content) as unknown;
  const parsed = responseSchema.parse(parsedJson);
  if (parsed.records.some(record => record.type === 'supplement' && record.supplement && !careItems.includes(record.supplement))) throw new Error('模型返回了未启用的用药项目');
  return parsed.records.map(record => ({
    ...record,
    breastMilkMl: record.type === 'feeding' ? record.breastMilkMl ?? null : null,
    formulaMl: record.type === 'feeding' ? record.formulaMl ?? null : null,
    supplement: record.type === 'supplement' ? record.supplement ?? null : null,
    bowelSize: record.type === 'bowel' ? record.bowelSize ?? null : null,
    note: record.note ?? null
  }));
}
