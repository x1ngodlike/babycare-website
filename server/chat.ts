import { z } from 'zod';
import {
  addMessage, allRecords, createSession, getSession, listCareItems, listGrowthRecords, listMemories,
  listMessages, listVaccineRecords, renameSession,
  upsertMemory, getProfile
} from './db.js';
import { requestCompletion, type ModelSettings } from './ai.js';
import { shanghaiDateString } from './shanghai-date.js';
import { addDaysToDateString } from '../shared/date.js';
import type { AiMemoryCategory, ChatSession, FamilyId } from './types.js';

const SYSTEM_PROMPT = `你是"宝宝照护"家庭的 AI 育儿助手，熟悉这位宝宝从出生到现在的所有录入数据（喂奶、排便、补充剂、生长、疫苗、照护项目），以及这个家庭之前对话沉淀的共享记忆。用温和、专业、像懂医学的家人一样的语气，回答家长关于宝宝养育的问题。

要求：
1. 只基于【宝宝资料与历史数据】和【家庭共享记忆】中提供的信息作答，结合常识与通用育儿知识；不编造数据中不存在的数值或事实。
2. 不做医疗诊断；涉及健康疑虑时用"建议咨询儿科医生"表达，不制造焦虑。
3. 可引用记忆与历史数据让回答更连贯；如果数据不足，坦诚说明并给通用建议。
4. 每次回复同时判断是否需要沉淀新的长期记忆：只记录确实重要、可跨对话复用、且数据或家长表述支持的要点（如过敏史、喂养偏好、作息规律、家长明确交代的事项）；不要记录一次性闲聊。
5. 输出严格为 JSON，不要解释、不要 Markdown 代码块。`;

export const chatSchema = z.object({
  reply: z.string().trim().min(1).max(2000),
  memories: z.array(z.object({
    category: z.enum(['preferences', 'health', 'notes']),
    content: z.string().trim().min(1).max(300)
  })).max(10),
  title: z.string().trim().max(40).optional()
});

function shanghaiHHmm(iso: string): string {
  return new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(11, 16);
}

export function buildDataContext(): string {
  const profile = getProfile();
  const sexLabel = profile.sex === 'male' ? '男' : profile.sex === 'female' ? '女' : '未设置';
  const records = allRecords(false);
  const growth = listGrowthRecords(false);
  const vaccines = listVaccineRecords(false);
  const careItems = listCareItems(true).filter(i => i.active);

  const dayMap = new Map<string, { breast: number; formula: number; feed: number; bowel: number; supplements: Set<string>; notes: string[] }>();
  for (const r of records) {
    const day = shanghaiDateString(new Date(r.occurredAt));
    const agg = dayMap.get(day) || { breast: 0, formula: 0, feed: 0, bowel: 0, supplements: new Set<string>(), notes: [] as string[] };
    if (r.type === 'feeding') {
      agg.breast += r.breastMilkMl || 0;
      agg.formula += r.formulaMl || 0;
      agg.feed += 1;
    } else if (r.type === 'bowel') {
      agg.bowel += 1;
    } else if (r.type === 'supplement' && r.supplement) {
      agg.supplements.add(r.supplement);
    }
    if ((r.note || r.subject) && r.type !== 'bowel') {
      const detail = r.note ? (r.subject ? `${r.subject}（${r.note}）` : r.note) : r.subject!;
      if (detail.trim()) agg.notes.push(`${shanghaiHHmm(r.occurredAt)} ${detail}`);
    }
    dayMap.set(day, agg);
  }

  const days = [...dayMap.keys()].sort();
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  let totalMl = 0, totalFeed = 0, totalBowel = 0;
  for (const agg of dayMap.values()) { totalMl += agg.breast + agg.formula; totalFeed += agg.feed; totalBowel += agg.bowel; }
  const daysWithFeed = [...dayMap.values()].filter(a => a.feed > 0).length;
  const avgDailyMl = daysWithFeed ? Math.round(totalMl / daysWithFeed) : 0;
  const avgDailyFeed = daysWithFeed ? Math.round(totalFeed / daysWithFeed) : 0;

  const recent14 = days.slice(-14).map(day => {
    const a = dayMap.get(day)!;
    return `${day}：奶${a.breast + a.formula}ml/${a.feed}次，排便${a.bowel}，补充[${[...a.supplements].join('、')}]`;
  }).join('\n');

  const since = addDaysToDateString(shanghaiDateString(), -29);
  const raw = records.filter(r => r.occurredAt >= since).slice(-1000).map(r => {
    const t = shanghaiHHmm(r.occurredAt);
    if (r.type === 'feeding') return `${t} 喂奶 母乳${r.breastMilkMl || 0}/奶粉${r.formulaMl || 0}ml`;
    if (r.type === 'supplement') return `${t} 补充 ${r.supplement || ''}`;
    if (r.type === 'bowel') return `${t} 排便 ${r.bowelSize || ''}`;
    return `${t} 笔记 ${r.subject || ''}${r.note ? '：' + r.note : ''}`;
  }).join('\n');

  const growthText = growth.length ? growth.slice(-10).map(g => `${g.measuredOn} 身高${g.heightCm}cm 体重${g.weightKg}kg`).join('\n') : '（暂无生长记录）';
  const vaccineText = vaccines.length ? vaccines.map(v => `${v.vaccineName} 第${v.dose}剂 计划${v.plannedOn}${v.administeredOn ? ' 已接种' + v.administeredOn : (v.appointmentOn ? ' 预约' + v.appointmentOn : '')}`).join('\n') : '（暂无疫苗记录）';
  const careText = careItems.length ? careItems.map(c => `${c.name}(${c.scheduleType})`).join('、') : '（暂无在用照护项目）';

  return [
    `【宝宝资料】姓名：${profile.name}${profile.nickname ? '(' + profile.nickname + ')' : ''}，性别：${sexLabel}，生日：${profile.birthDate}`,
    `【生长记录】\n${growthText}`,
    `【疫苗记录】\n${vaccineText}`,
    `【在用照护项目】${careText}`,
    `【喂养全期统计】记录区间 ${firstDay || '无'} ~ ${lastDay || '无'}，有喂奶记录的天数 ${daysWithFeed} 天，日均奶量 ${avgDailyMl}ml，日均喂奶 ${avgDailyFeed} 次，总排便 ${totalBowel} 次`,
    `【最近 14 天每日汇总】\n${recent14 || '（无）'}`,
    `【最近 30 天原始记录】\n${raw || '（无）'}`
  ].join('\n');
}

export function buildMemoryContext(): string {
  const memories = listMemories();
  if (!memories.length) return '（暂无可参考的家庭记忆）';
  return memories.map(m => `· [${m.category}] ${m.content}`).join('\n');
}

export interface ChatReply {
  reply: string;
  sessionId: string;
  title: string | null;
  extractedMemories: { category: AiMemoryCategory; content: string }[];
}

export async function generateChatReply(
  settings: ModelSettings,
  opts: { userId: FamilyId; sessionId?: string; message: string }
): Promise<ChatReply> {
  const session: ChatSession = opts.sessionId ? (getSession(opts.sessionId) || createSession(opts.userId)) : createSession(opts.userId);
  const history = listMessages(session.id);
  const dataContext = buildDataContext();
  const memoryContext = buildMemoryContext();
  const historyText = history.length
    ? history.map(m => `${m.role === 'user' ? '家长' : '助手'}：${m.content}`).join('\n')
    : '（新对话，暂无历史）';

  const userContent = [
    '【宝宝资料与历史数据】\n' + dataContext,
    '【家庭共享记忆（之前对话中沉淀，可参考引用）】\n' + memoryContext,
    '【对话历史】\n' + historyText,
    '【家长最新问题】\n' + opts.message,
    '请仅依据上述数据与家长问题作答，输出 JSON：{"reply":"对家长的回答（自然口语，可引用数据与记忆，不超过 300 字）","memories":[{"category":"preferences|health|notes","content":"本次对话中发现值得长期记住的要点，一句话，不超过 60 字"}],"title":"若这是新对话且尚未有标题，给本对话起一个简短标题（不超过 20 字），否则省略"}。'
  ].join('\n\n');

  const content = await requestCompletion(settings, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent }
  ], 1200);
  const parsed = chatSchema.parse(JSON.parse(content) as unknown);

  addMessage(session.id, 'user', opts.message);
  addMessage(session.id, 'assistant', parsed.reply);

  let title = session.title;
  if (parsed.title && !session.title) {
    renameSession(session.id, parsed.title);
    title = parsed.title;
  }

  const extractedMemories: { category: AiMemoryCategory; content: string }[] = [];
  for (const m of parsed.memories) {
    upsertMemory(m.content, m.category);
    extractedMemories.push({ category: m.category, content: m.content });
  }

  return { reply: parsed.reply, sessionId: session.id, title, extractedMemories };
}
