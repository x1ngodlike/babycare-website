import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'baby-care-chat-test-'));
process.env.DATABASE_PATH = join(directory, 'test.db');

const legacyDb = new Database(process.env.DATABASE_PATH);
legacyDb.exec(`
  CREATE TABLE care_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL CHECK (icon IN ('medicine', 'massage')),
    sort_order INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO care_items (id, name, icon, sort_order, active, created_at, updated_at)
  VALUES ('test-ad', 'AD', 'medicine', 1, 1, datetime('now'), datetime('now'));
`);
legacyDb.close();

const chat = await import('./chat.js');
const db = await import('./db/index.js');

beforeAll(() => {
  const now = new Date().toISOString();
  db.saveProfile({ name: '示例宝宝', birthDate: '2026-01-01', sex: 'male', nickname: '', caregiverTitle: '妈妈', avatar: null });
  db.saveRecord({ id: crypto.randomUUID(), type: 'feeding', occurredAt: '2026-08-10T06:00:00.000Z', breastMilkMl: 80, formulaMl: 40, supplement: null, bowelSize: null, subject: null, note: null, createdAt: now, updatedAt: now, createdBy: 'father', updatedBy: 'father', deletedAt: null, deletedBy: null });
  db.saveRecord({ id: crypto.randomUUID(), type: 'bowel', occurredAt: '2026-08-10T08:00:00.000Z', breastMilkMl: null, formulaMl: null, supplement: null, bowelSize: '中', subject: null, note: null, createdAt: now, updatedAt: now, createdBy: 'father', updatedBy: 'father', deletedAt: null, deletedBy: null });
  db.saveGrowthRecord({ id: crypto.randomUUID(), measuredOn: '2026-08-10', heightCm: 62.5, weightKg: 6.35, createdAt: now, updatedAt: now, createdBy: 'father', updatedBy: 'father', deletedAt: null, deletedBy: null });
  db.saveVaccineRecord({ id: crypto.randomUUID(), vaccineName: '乙肝测试', category: 'program', dose: 1, plannedOn: '2026-01-01', appointmentOn: null, appointmentTime: null, administeredOn: '2026-01-01', note: null, createdAt: now, updatedAt: now, createdBy: 'father', updatedBy: 'father', deletedAt: null, deletedBy: null });
});

afterAll(() => { db.closeDatabaseForTests(); rmSync(directory, { recursive: true, force: true }); });

describe('chat data context', () => {
  it('includes profile, growth, vaccines, care items and recent raw records', () => {
    const context = chat.buildDataContext();
    expect(context).toContain('【宝宝资料】');
    expect(context).toContain('示例宝宝');
    expect(context).toContain('【生长记录】');
    expect(context).toContain('62.5cm');
    expect(context).toContain('【疫苗记录】');
    expect(context).toContain('乙肝测试');
    expect(context).toContain('【喂养全期统计】');
    expect(context).toContain('【最近 30 天原始记录】');
  });

  it('keeps memory context empty when no memories exist', () => {
    expect(chat.buildMemoryContext()).toContain('暂无');
  });
});

describe('chat structured output schema', () => {
  it('accepts a valid reply with memories and title', () => {
    const parsed = chat.chatSchema.parse({ reply: '宝宝今日奶量正常。', memories: [{ category: 'preferences', content: '喜欢躺着喝奶' }], title: '今日奶量' });
    expect(parsed.reply).toBe('宝宝今日奶量正常。');
    expect(parsed.memories[0].category).toBe('preferences');
  });

  it('rejects an empty reply', () => {
    expect(() => chat.chatSchema.parse({ reply: '', memories: [] })).toThrow();
  });
});

describe('generateChatReply integration', () => {
  it('calls the model and returns the assistant reply with a session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: '今日记录了一笔喂奶和一次排便。', memories: [], title: '今日记录' }) } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await chat.generateChatReply({ baseUrl: 'https://api.example.com', model: 'test', apiKey: 'secret' }, { userId: 'father', message: '今天怎么样', userName: '爸爸' });
    expect(result.reply).toBe('今日记录了一笔喂奶和一次排便。');
    expect(result.sessionId).toBeTruthy();
    expect(result.title).toBe('今日记录');
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/chat/completions', expect.objectContaining({ method: 'POST' }));
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.messages[0].role).toBe('system');
    expect(request.messages[1].content).toContain('当前上下文');
    expect(request.messages[1].content).toContain('提问者：爸爸');
    expect(request.messages[1].content).toContain('家长最新问题');
    vi.unstubAllGlobals();
  });
});

describe('memory expiry', () => {
  it('filters expired memories from context but keeps them when includeExpired', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();
    db.addMemory('已过期测试记忆', 'notes', past);
    db.addMemory('未过期测试记忆', 'notes', future);
    expect(chat.buildMemoryContext()).not.toContain('已过期测试记忆');
    expect(chat.buildMemoryContext()).toContain('未过期测试记忆');
    const all = db.listMemories(true);
    expect(all.some(m => m.content === '已过期测试记忆')).toBe(true);
    expect(all.some(m => m.content === '未过期测试记忆')).toBe(true);
  });
});

describe('memory contradiction resolution', () => {
  it('marks a conflicting active memory resolved and hides it from context', () => {
    db.addMemory('宝宝肚子不舒服', 'health');
    expect(db.listMemories().some(m => m.content === '宝宝肚子不舒服' && m.status === 'active')).toBe(true);

    const resolved = db.resolveBySupersede('宝宝肚子不舒服');
    expect(resolved.length).toBe(1);
    expect(resolved[0].content).toBe('宝宝肚子不舒服');

    // 作废后不再注入对话上下文
    expect(chat.buildMemoryContext()).not.toContain('宝宝肚子不舒服');
    // 默认列表隐藏已作废记忆
    expect(db.listMemories().some(m => m.content === '宝宝肚子不舒服')).toBe(false);
    // includeExpired 可找回，且状态为 resolved
    expect(db.listMemories(true).some(m => m.content === '宝宝肚子不舒服' && m.status === 'resolved')).toBe(true);
  });

  it('does not resolve when overlap is too small', () => {
    db.addMemory('宝宝喜欢被竖抱', 'preferences');
    expect(db.resolveBySupersede('宝宝今天很开心').length).toBe(0);
  });

  it('resolves old memory when the model sets supersedes in its output', async () => {
    db.addMemory('宝宝肚子不舒服', 'health');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: '太好了，已经好了。', memories: [{ category: 'health', content: '宝宝肚子好了', supersedes: '宝宝肚子不舒服' }], title: '恢复情况' }) } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await chat.generateChatReply({ baseUrl: 'https://api.example.com', model: 'test', apiKey: 'secret' }, { userId: 'father', message: '宝宝肚子好了' });
    expect(result.resolvedMemories.length).toBe(1);
    expect(result.resolvedMemories[0].content).toBe('宝宝肚子不舒服');
    expect(chat.buildMemoryContext()).not.toContain('宝宝肚子不舒服');
    vi.unstubAllGlobals();
  });
});

describe('memory restore', () => {
  it('restores a resolved memory back to active and back into the chat context', () => {
    const created = db.addMemory('宝宝发烧了', 'health');
    db.resolveBySupersede('宝宝发烧了');
    expect(db.listMemories().some(m => m.content === '宝宝发烧了')).toBe(false);

    const restored = db.restoreMemoryById(created.id);
    expect(restored).not.toBeNull();
    expect(restored!.status).toBe('active');
    expect(restored!.expiresAt).toBeNull();
    expect(chat.buildMemoryContext()).toContain('宝宝发烧了');
    expect(db.listMemories().some(m => m.content === '宝宝发烧了' && m.status === 'active')).toBe(true);
  });

  it('returns null for a non-existent id', () => {
    expect(db.restoreMemoryById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
