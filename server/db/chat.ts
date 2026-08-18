import { randomUUID } from 'node:crypto';
import { db } from './connection.js';
import type { AiMemory, AiMemoryCategory, ChatMessage, ChatSession, FamilyId } from '../types.js';

// ----- AI 对话：家庭共享记忆 -----
export function listMemories(): AiMemory[] {
  return db.prepare('SELECT id, content, category, created_at AS createdAt, updated_at AS updatedAt FROM ai_memories ORDER BY updated_at DESC').all() as AiMemory[];
}

export function addMemory(content: string, category: AiMemoryCategory): AiMemory {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare('INSERT INTO ai_memories (id, content, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, content, category, now, now);
  return { id, content, category, createdAt: now, updatedAt: now };
}

/** 去重合并：同分类下内容（去空格后）已存在则只刷新 updated_at，否则新增。 */
export function upsertMemory(content: string, category: AiMemoryCategory): AiMemory {
  const normalized = content.trim();
  const existing = db.prepare('SELECT id, content, category, created_at AS createdAt, updated_at AS updatedAt FROM ai_memories WHERE category = ? AND TRIM(content) = ?').get(category, normalized) as AiMemory | undefined;
  const now = new Date().toISOString();
  if (existing) {
    db.prepare('UPDATE ai_memories SET updated_at = ? WHERE id = ?').run(now, existing.id);
    return { ...existing, updatedAt: now };
  }
  return addMemory(normalized, category);
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
