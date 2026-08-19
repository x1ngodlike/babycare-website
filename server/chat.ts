import { z } from 'zod';
import {
  addMessage, allRecords, createSession, getSession, listCareItems, listGrowthRecords, listMemories,
  listMessages, listVaccineRecords, renameSession,
  upsertMemory, getProfile, resolveBySupersede
} from './db/index.js';
import { requestCompletion, type ModelSettings } from './ai.js';
import { shanghaiDateString } from './shanghai-date.js';
import { addDaysToDateString } from '../shared/date.js';
import type { AiMemoryCategory, ChatSession, FamilyId } from './types.js';

const SYSTEM_PROMPT = `你是"宝宝照护"家庭的 AI 育儿助手，熟悉这位宝宝从出生到现在的所有录入数据（喂奶、排便、补充剂、生长、疫苗、照护项目），以及这个家庭之前对话沉淀的共享记忆。用温和、专业、像懂医学的家人一样的语气，回答家长关于宝宝养育的问题。

要求：
1. 只基于【宝宝资料与历史数据】和【家庭共享记忆】中提供的信息作答，结合常识与通用育儿知识；不编造数据中不存在的数值或事实。
2. 不给出确诊结论，但可以基于宝宝的症状和已录入数据提供健康预警（如风险等级、可能原因、观察要点）和家庭护理建议（如物理降温、补水、睡姿调整等）；出现红色预警（持续高烧、呼吸困难、抽搐、脱水等）时，明确提示立即就医。
3. 可引用记忆与历史数据让回答更连贯；如果数据不足，坦诚说明并给通用建议。
4. 每次回复同时判断是否需要沉淀新的长期记忆：只记录【家长在消息中明确说出的】、确实重要且可跨对话复用的要点（如过敏史、喂养偏好、作息规律、家长明确交代的事项）；不得记录由数据推断得出的结论，也不得把助手自己的回复当作记忆；不要记录一次性闲聊。记忆须忠实于家长原话，可适度概括，但不得偏移原意或补充推断任何原文没有的信息。
  有效期判定规则（严格执行）：
  - 以下情况【必须】设置 expiresAt（指定预计结束的 ISO 时间，基于"当前上下文"中的日期时间推算）：
    · 症状/疾病类：发烧→3天、腹泻→2天、咳嗽→7天、湿疹/皮疹→14天、呕吐→2天、感冒→7天
    · 治疗/用药类：服药中→疗程结束日（未明确则14天）、住院/就医中→30天
    · 带时间限定的陈述：提到"这两天""今天开始""本周内""正在"等临时状态
  - 以下情况【不要】设置 expiresAt（留空）：
    · 过敏史、喂养偏好、作息规律、家长长期交代的事项
    · 宝宝的固定习惯、性格特点、发育特征
  - 若无法判断是临时还是稳定，默认设为临时，按上述症状类最长时限设置。
5. 矛盾消解：如果本次要记录的要点会推翻或替代一条已有的家庭记忆（例如之前记了「宝宝肚子不舒服」，现在家长说「肚子好了」），请在该 memory 项里填写 supersedes 为那条旧记忆的核心内容（尽量贴近原话、保留关键短语），系统会自动将旧记忆标记为已作废，无需你手动删除；若没有可推翻的旧记忆则不要填 supersedes。
5. 输出严格为 JSON，不要解释、不要 Markdown 代码块。`;

export const chatSchema = z.object({
  reply: z.string().trim().min(1).max(2000),
  memories: z.array(z.object({
    category: z.enum(['preferences', 'health', 'notes']),
    content: z.string().trim().min(1).max(300),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    supersedes: z.string().trim().max(300).optional()
  })).max(10),
  title: z.string().trim().max(40).optional()
});

function shanghaiHHmm(iso: string): string {
  return new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(11, 16);
}

/** 去除所有空白与标点，用于把记忆内容对齐到用户原话（防止 AI 改写/编造）。 */
function normalizeForMatch(s: string): string {
  return s.replace(/[\s\p{P}]/gu, '');
}

/** 判断记忆是否扎根于用户原话：允许 AI 适度概括，但大幅偏移/编造则判否。 */
function memoryGrounded(normalizedMemory: string, userSource: string): boolean {
  if (normalizedMemory.length < 2) return false;
  // 1) 字符重叠率：记忆中能在用户原话里找到的字占比，低于阈值视为偏移过大
  const srcChars = new Set(userSource);
  let matched = 0;
  for (const ch of normalizedMemory) if (srcChars.has(ch)) matched++;
  if (matched / normalizedMemory.length >= 0.6) return true;
  // 2) 或含一段 ≥4 字连续原话锚点
  for (let i = 0; i + 4 <= normalizedMemory.length; i++) {
    if (userSource.includes(normalizedMemory.slice(i, i + 4))) return true;
  }
  return false;
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
  extractedMemories: { category: AiMemoryCategory; content: string; expiresAt: string | null }[];
  resolvedMemories: { id: string; content: string }[];
}

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function buildCurrentContext(userName: string): string {
  const now = new Date();
  const shanghai = new Date(now.getTime() + 8 * 3600_000);
  const date = shanghai.toISOString().slice(0, 10);
  const time = shanghai.toISOString().slice(11, 16);
  const weekday = WEEKDAY_CN[shanghai.getUTCDay()];
  return `【当前上下文】日期：${date}（${weekday}），时间：${time}，提问者：${userName}`;
}

export async function generateChatReply(
  settings: ModelSettings,
  opts: { userId: FamilyId; sessionId?: string; message: string; userName?: string }
): Promise<ChatReply> {
  const session: ChatSession = opts.sessionId ? (getSession(opts.sessionId) || createSession(opts.userId)) : createSession(opts.userId);
  const history = listMessages(session.id);
  const dataContext = buildDataContext();
  const memoryContext = buildMemoryContext();
  const historyText = history.length
    ? history.map(m => `${m.role === 'user' ? '家长' : '助手'}：${m.content}`).join('\n')
    : '（新对话，暂无历史）';

  const currentContext = buildCurrentContext(opts.userName || '家长');

  const userContent = [
    currentContext,
    '【宝宝资料与历史数据】\n' + dataContext,
    '【家庭共享记忆（之前对话中沉淀，可参考引用）】\n' + memoryContext,
    '【对话历史】\n' + historyText,
    '【家长最新问题】\n' + opts.message,
    `请仅依据上述数据与家长问题作答，输出 JSON：{"reply":"对家长的回答（自然口语，可引用数据与记忆，不超过 300 字；较长回答可用简短小标题和要点列表让条理更清晰，关键数字用加粗标记）","memories":[{"category":"preferences|health|notes","content":"从【家长最新问题】中提炼家长亲口说出的、值得长期记住的要点（可适度概括，但不得改变原意、不得补充或推断原文没有的信息，例如不能把『吃虾后起红疹』说成『对海鲜过敏』，也不得摘录助手的话）；若家长消息中没有可沉淀的明确要点，则不要返回该项","expiresAt":"按上方『有效期判定规则』填写：临时状态（症状/疾病/治疗/带时间限定）必须填预计结束的 ISO 时间（基于当前上下文日期推算，如 2026-08-22T12:00:00.000Z）；稳定长期要点（过敏/偏好/作息）填 null；不得省略该字段","supersedes":"仅当本条要点会推翻一条已有的家庭记忆时填写，内容为那条旧记忆的核心原文（尽量贴近原话、保留关键短语），系统会自动将其标记为已作废；若无旧记忆被推翻则不返回该项"}],"title":"给本对话起一个简短标题（不超过 20 字），能概括本次对话的核心话题"}。`
  ].join('\n\n');

  const content = await requestCompletion(settings, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent }
  ], 1200);
  const parsed = chatSchema.parse(JSON.parse(content) as unknown);

  addMessage(session.id, 'user', opts.message);
  addMessage(session.id, 'assistant', parsed.reply);

  let title = session.title;
  if (parsed.title && (!session.title || session.title === '新对话')) {
    renameSession(session.id, parsed.title);
    title = parsed.title;
  }

  // 记忆须扎根于家长原话：允许 AI 适度概括，但不得大幅偏移或编造（字符重叠率 / 连续原话锚点双判，见 memoryGrounded）。
  const userSource = normalizeForMatch(
    [...history.filter(m => m.role === 'user').map(m => m.content), opts.message].join('\n')
  );
  const safeMemories = parsed.memories.filter(m => memoryGrounded(normalizeForMatch(m.content), userSource));

  const extractedMemories: { category: AiMemoryCategory; content: string; expiresAt: string | null }[] = [];
  const resolvedMemories: { id: string; content: string }[] = [];
  for (const m of safeMemories) {
    const expiresAt = m.expiresAt ?? null;
    const saved = upsertMemory(m.content, m.category, expiresAt);
    extractedMemories.push({ category: m.category, content: m.content, expiresAt });
    // 矛盾消解：若本条新记忆推翻某条旧记忆，自动将旧记忆标记为已作废（排除刚写入的本条自身）
    if (m.supersedes && m.supersedes.trim()) {
      const resolved = resolveBySupersede(m.supersedes.trim(), saved.id);
      resolvedMemories.push(...resolved.map(r => ({ id: r.id, content: r.content })));
    }
  }

  return { reply: parsed.reply, sessionId: session.id, title, extractedMemories, resolvedMemories };
}
