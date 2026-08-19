import { randomUUID } from 'node:crypto';
import { db } from './connection.js';
import type { AiMemory, AiMemoryCategory, ChatMessage, ChatSession, FamilyId } from '../types.js';

// ----- AI 对话：家庭共享记忆 -----
export function listMemories(includeExpired = false): AiMemory[] {
  const nowIso = new Date().toISOString();
  const base = 'SELECT id, content, category, created_at AS createdAt, updated_at AS updatedAt, expires_at AS expiresAt, status, resolved_at AS resolvedAt FROM ai_memories';
  const sql = includeExpired
    ? `${base} ORDER BY updated_at DESC`
    : `${base} WHERE (expires_at IS NULL OR expires_at > ?) AND status = 'active' ORDER BY updated_at DESC`;
  return (includeExpired ? db.prepare(sql).all() : db.prepare(sql).all(nowIso)) as AiMemory[];
}

export function addMemory(content: string, category: AiMemoryCategory, expiresAt: string | null = null, sourceMessageId: string | null = null): AiMemory {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare("INSERT INTO ai_memories (id, content, category, created_at, updated_at, expires_at, status, resolved_at, source_message_id) VALUES (?, ?, ?, ?, ?, ?, 'active', NULL, ?)").run(id, content, category, now, now, expiresAt, sourceMessageId);
  return { id, content, category, createdAt: now, updatedAt: now, expiresAt, status: 'active', resolvedAt: null };
}

/** 去重合并：同分类下内容（去空格后）已存在则只刷新 updated_at（并采纳新的过期时间、恢复为 active），否则新增。 */
export function upsertMemory(content: string, category: AiMemoryCategory, expiresAt: string | null = null, sourceMessageId: string | null = null): AiMemory {
  const normalized = content.trim();
  const existing = db.prepare('SELECT id, content, category, created_at AS createdAt, updated_at AS updatedAt, expires_at AS expiresAt, status, resolved_at AS resolvedAt FROM ai_memories WHERE category = ? AND TRIM(content) = ?').get(category, normalized) as AiMemory | undefined;
  const now = new Date().toISOString();
  if (existing) {
    const nextExpiry = expiresAt !== null ? expiresAt : existing.expiresAt;
    db.prepare("UPDATE ai_memories SET updated_at = ?, expires_at = ?, status = 'active', resolved_at = NULL, source_message_id = COALESCE(?, source_message_id) WHERE id = ?").run(now, nextExpiry, sourceMessageId, existing.id);
    return { ...existing, updatedAt: now, expiresAt: nextExpiry, status: 'active', resolvedAt: null };
  }
  return addMemory(normalized, category, expiresAt, sourceMessageId);
}

/** 备份恢复：按原字段（含 status / expiresAt / resolvedAt / 时间）完整写回，避免恢复后记忆被误判为 active。 */
export function restoreMemory(m: AiMemory): void {
  db.prepare(`INSERT INTO ai_memories (id, content, category, created_at, updated_at, expires_at, status, resolved_at)
    VALUES (@id, @content, @category, @createdAt, @updatedAt, @expiresAt, @status, @resolvedAt)
    ON CONFLICT(id) DO UPDATE SET
      content=excluded.content, category=excluded.category, created_at=excluded.created_at,
      updated_at=excluded.updated_at, expires_at=excluded.expires_at, status=excluded.status, resolved_at=excluded.resolved_at`)
    .run({
      id: m.id, content: m.content, category: m.category,
      createdAt: m.createdAt, updatedAt: m.updatedAt, expiresAt: m.expiresAt,
      status: m.status || 'active', resolvedAt: m.resolvedAt ?? null
    });
}

/** 一键恢复已作废的记忆：撤销 resolved 状态、重置为 active，并清除过期时间（被矛盾消解时 expires_at 已被设为当下，恢复后应为永久有效）。返回恢复后的记忆；记忆不存在则返回 null。 */
export function restoreMemoryById(id: string): AiMemory | null {
  const existing = db.prepare('SELECT id, content, category, created_at AS createdAt, updated_at AS updatedAt, expires_at AS expiresAt, status, resolved_at AS resolvedAt FROM ai_memories WHERE id = ?').get(id) as AiMemory | undefined;
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare("UPDATE ai_memories SET status = 'active', resolved_at = NULL, expires_at = NULL, updated_at = ? WHERE id = ?").run(now, id);
  return { ...existing, status: 'active', resolvedAt: null, expiresAt: null, updatedAt: now };
}

/** 去除所有空白与标点，用于把两段记忆内容对齐比较（矛盾消解匹配用）。 */
function normalizeForMatch(s: string): string {
  return s.replace(/[\s\p{P}]/gu, '');
}

/** 最长公共子串长度（基于归一化文本）。 */
function longestCommonSubstringLength(a: string, b: string): number {
  if (!a || !b) return 0;
  let dp = 0;
  let best = 0;
  const prev = new Array(b.length + 1).fill(0);
  const cur = new Array(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (a[i] === b[j]) {
        dp = prev[j] + 1;
        cur[j + 1] = dp;
        if (dp > best) best = dp;
      } else {
        cur[j + 1] = 0;
      }
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return best;
}

/**
 * 矛盾消解：把与 supersedes 文本高度重合的 active 记忆标记为「已作废」，返回被作废的记忆列表。
 * 匹配规则：归一化后最长公共子串 ≥ max(4, 较短者长度的 40%)，视为同一条被推翻的记忆。
 */
export function resolveBySupersede(supersedes: string, excludeId?: string, sourceMessageId?: string): AiMemory[] {
  const phrase = normalizeForMatch(supersedes);
  if (phrase.length < 4) return [];
  const now = new Date().toISOString();
  const baseSql = "SELECT id, content, category, created_at AS createdAt, updated_at AS updatedAt, expires_at AS expiresAt, status, resolved_at AS resolvedAt FROM ai_memories WHERE status = 'active' AND (expires_at IS NULL OR expires_at > ?)";
  const active = excludeId
    ? db.prepare(`${baseSql} AND id != ?`).all(now, excludeId) as AiMemory[]
    : db.prepare(baseSql).all(now) as AiMemory[];
  const resolved: AiMemory[] = [];
  for (const m of active) {
    const norm = normalizeForMatch(m.content);
    if (norm.length < 4) continue;
    const lcs = longestCommonSubstringLength(phrase, norm);
    const threshold = Math.max(4, Math.ceil(Math.min(phrase.length, norm.length) * 0.4));
    if (lcs >= threshold) {
      db.prepare("UPDATE ai_memories SET status = 'resolved', expires_at = ?, resolved_at = ?, updated_at = ?, source_message_id = COALESCE(?, source_message_id) WHERE id = ?").run(now, now, now, sourceMessageId, m.id);
      resolved.push({ ...m, status: 'resolved', resolvedAt: now, expiresAt: now, updatedAt: now });
    }
  }
  return resolved;
}

export function deleteMemory(id: string): boolean {
  return db.prepare('DELETE FROM ai_memories WHERE id = ?').run(id).changes > 0;
}

export function clearMemories(): void {
  db.prepare('DELETE FROM ai_memories').run();
}

// ----- AI 对话：按成员隔离的会话与消息 -----
export function listSessions(userId?: FamilyId): ChatSession[] {
  const rows = userId
    ? db.prepare('SELECT id, user_id AS userId, title, created_at AS createdAt, updated_at AS updatedAt FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC').all(userId)
    : db.prepare('SELECT id, user_id AS userId, title, created_at AS createdAt, updated_at AS updatedAt FROM chat_sessions ORDER BY updated_at DESC').all();
  return rows as ChatSession[];
}

export function getSession(id: string): ChatSession | null {
  return db.prepare('SELECT id, user_id AS userId, title, created_at AS createdAt, updated_at AS updatedAt FROM chat_sessions WHERE id = ?').get(id) as ChatSession | undefined || null;
}

export function createSession(userId: FamilyId, title: string | null = null): ChatSession {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare('INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, userId, title, now, now);
  return { id, userId, title, createdAt: now, updatedAt: now };
}

export function renameSession(id: string, title: string): void {
  db.prepare('UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?').run(title, new Date().toISOString(), id);
}

export function deleteSession(id: string): boolean {
  return db.transaction(() => {
    db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(id);
    return db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
  })().changes > 0;
}

export function listMessages(sessionId: string): ChatMessage[] {
  return db.prepare('SELECT id, session_id AS sessionId, role, content, created_at AS createdAt FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as ChatMessage[];
}

export function listMessageMemories(sessionId: string): { messageId: string; memories: { id: string; content: string; category: AiMemoryCategory; expiresAt: string | null }[]; resolved: { id: string; content: string }[] }[] {
  const messages = db.prepare("SELECT id FROM chat_messages WHERE session_id = ? AND role = 'assistant'").all(sessionId) as { id: string }[];
  const result: { messageId: string; memories: { id: string; content: string; category: AiMemoryCategory; expiresAt: string | null }[]; resolved: { id: string; content: string }[] }[] = [];
  for (const msg of messages) {
    const memories = db.prepare("SELECT id, content, category, expires_at AS expiresAt FROM ai_memories WHERE source_message_id = ? AND status = 'active'").all(msg.id) as { id: string; content: string; category: AiMemoryCategory; expiresAt: string | null }[];
    const resolved = db.prepare("SELECT id, content FROM ai_memories WHERE source_message_id = ? AND status = 'resolved'").all(msg.id) as { id: string; content: string }[];
    if (memories.length > 0 || resolved.length > 0) {
      result.push({ messageId: msg.id, memories, resolved });
    }
  }
  return result;
}

export function addMessage(sessionId: string, role: 'user' | 'assistant', content: string): ChatMessage {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare('INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(id, sessionId, role, content, now);
  db.prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
  return { id, sessionId, role, content, createdAt: now };
}

export function allChatMessages(): ChatMessage[] {
  return db.prepare('SELECT id, session_id AS sessionId, role, content, created_at AS createdAt FROM chat_messages ORDER BY created_at ASC').all() as ChatMessage[];
}
