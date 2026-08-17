import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { familyMembers } from '../shared';
import { ActionMenu, confirmAction, EmptyState, SegmentedControl } from '../ui';
import type { AiMemory, Capabilities, ChatMessage, ChatSession, ExtractedMemory, FamilyId, SessionUser } from '../types';

const categoryLabels: Record<AiMemory['category'], string> = { preferences: '偏好', health: '健康', notes: '备忘' };
const categoryOrder: AiMemory['category'][] = ['health', 'preferences', 'notes'];

function formatChatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

const SUGGESTIONS = ['最近奶量怎么样？', '这个月身高体重达标吗？', '下次疫苗什么时候打？'];

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const segments = text.split(/(\*\*[^*]+\*\*)/g);
  return segments.map((segment, index) => {
    if (/^\*\*[^*]+\*\*$/.test(segment)) {
      return <strong key={`${keyBase}-s${index}`}>{segment.slice(2, -2)}</strong>;
    }
    return <span key={`${keyBase}-t${index}`}>{segment}</span>;
  });
}

function renderRichText(text: string): React.ReactNode {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const key = `p${blocks.length}`;
    blocks.push(
      <p key={key}>
        {paragraph.map((line, index) => (
          <span key={index}>
            {renderInline(line, `${key}-${index}`)}
            {index < paragraph.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    const key = `lst${blocks.length}`;
    const items = listItems.map((item, index) => <li key={index}>{renderInline(item, `${key}-${index}`)}</li>);
    blocks.push(listOrdered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const depth = Math.min(heading[1].length, 3);
      const content = renderInline(heading[2], `h${blocks.length}`);
      const key = `h${blocks.length}`;
      blocks.push(depth === 1 ? <h4 key={key}>{content}</h4> : depth === 2 ? <h5 key={key}>{content}</h5> : <h6 key={key}>{content}</h6>);
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (listItems.length > 0 && listOrdered) flushList();
      listOrdered = false;
      listItems.push(bullet[1]);
      continue;
    }
    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      flushParagraph();
      if (listItems.length > 0 && !listOrdered) flushList();
      listOrdered = true;
      listItems.push(numbered[2]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return <>{blocks}</>;
}

function MemoryManager({ open, onClose }: { open: boolean; onClose(): void }) {
  const [memories, setMemories] = useState<AiMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<AiMemory['category']>('notes');
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  useEffect(() => { if (!open) return; setLoading(true); setError(''); api.memories().then(r => setMemories(r.memories)).catch(err => setError(err instanceof Error ? err.message : '读取失败')).finally(() => setLoading(false)); }, [open]);
  async function add() {
    if (!content.trim()) return;
    setSaving(true); setError('');
    try { const memory = await api.addMemory(content.trim(), category); setMemories(prev => [memory, ...prev]); setContent(''); }
    catch (err) { setError(err instanceof Error ? err.message : '添加失败'); }
    finally { setSaving(false); }
  }
  async function remove(id: string) {
    if (!await confirmAction({ title: '删除这条记忆？', description: '删除后 AI 将不再参考该要点。', confirmLabel: '删除', danger: true })) return;
    try { await api.deleteMemory(id); setMemories(prev => prev.filter(m => m.id !== id)); }
    catch (err) { setError(err instanceof Error ? err.message : '删除失败'); }
  }
  if (!open) return null;
  return <div className="modal-layer" onMouseDown={e => e.target === e.currentTarget && onClose()}><section ref={dialogRef} className="editor memory-manager" role="dialog" aria-modal="true" aria-labelledby="memory-title">
    <header className="editor-head"><div><p className="kicker">AI 记忆</p><h2 id="memory-title">管理家庭共享记忆</h2></div><button type="button" className="close-btn" onClick={onClose} aria-label="关闭">×</button></header>
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="memory-add">
      <textarea rows={2} maxLength={200} placeholder="手动添加一条希望 AI 记住的要点…" value={content} onChange={e => setContent(e.target.value)} />
      <div className="memory-add-row">
        <SegmentedControl<AiMemory['category']> label="记忆分类" value={category} options={[{ value: 'health', label: '健康' }, { value: 'preferences', label: '偏好' }, { value: 'notes', label: '备忘' }]} onChange={setCategory} />
        <button type="button" className="btn primary" disabled={saving || !content.trim()} onClick={() => void add()}>{saving ? '保存中…' : '添加记忆'}</button>
      </div>
    </div>
    {loading ? <p className="loading-copy">正在读取…</p> : memories.length === 0 ? <p className="loading-copy">还没有 AI 记忆。</p> : <ul className="memory-list">{memories.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) || b.updatedAt.localeCompare(a.updatedAt)).map(m => <li key={m.id}><span className={`memory-tag ${m.category}`}>{categoryLabels[m.category]}</span><p>{m.content}</p><button type="button" aria-label="删除" onClick={() => void remove(m.id)}>×</button></li>)}</ul>}
    <div className="memory-footer"><button type="button" className="btn secondary full" onClick={onClose}>关闭</button></div>
  </section></div>;
}

export default function ChatView({ user, capabilities, online }: { user: SessionUser; capabilities: Capabilities; online: boolean }) {
  const superadmin = user.role === 'superadmin';
  const [targetUserId, setTargetUserId] = useState<FamilyId>(user.id);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showMemoryManager, setShowMemoryManager] = useState(false);
  const [extractedHints, setExtractedHints] = useState<Record<string, ExtractedMemory[]>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId) || null, [sessions, activeSessionId]);

  const loadSessions = useCallback(async () => {
    try { const res = await api.chatSessions(superadmin ? targetUserId : undefined); setSessions(res.sessions); }
    catch (err) { setError(err instanceof Error ? err.message : '读取对话列表失败'); }
  }, [superadmin, targetUserId]);

  const loadMessages = useCallback(async (sessionId: string) => {
    try { const res = await api.chatMessages(sessionId); setMessages(res.messages); }
    catch (err) { setError(err instanceof Error ? err.message : '读取消息失败'); }
  }, []);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  useEffect(() => { if (activeSessionId) void loadMessages(activeSessionId); }, [activeSessionId, loadMessages]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  async function createSession() {
    try {
      const session = await api.createChatSession(superadmin ? targetUserId : undefined);
      setSessions(prev => [session, ...prev]);
      setActiveSessionId(session.id);
      setMessages([]);
      inputRef.current?.focus();
    } catch (err) { setError(err instanceof Error ? err.message : '创建对话失败'); }
  }

  async function deleteSession(id: string) {
    if (!await confirmAction({ title: '删除这段对话？', description: '对话记录将被移除，无法恢复。', confirmLabel: '删除', danger: true })) return;
    try { await api.deleteChatSession(id); setSessions(prev => prev.filter(s => s.id !== id)); if (activeSessionId === id) { setActiveSessionId(null); setMessages([]); } }
    catch (err) { setError(err instanceof Error ? err.message : '删除失败'); }
  }

  function selectSession(id: string) {
    setActiveSessionId(id);
    setMessages([]);
    setError('');
    inputRef.current?.focus();
  }

  async function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    if (!online) { setError('当前离线，无法使用 AI 对话'); return; }
    if (!capabilities.aiEnabled) { setError('服务器尚未配置 AI 模型，请先在设置中配置'); return; }
    setLoading(true); setError(''); setInput('');
    const optimisticUser: ChatMessage = { id: `local-${Date.now()}`, sessionId: activeSessionId || '', role: 'user', content: trimmed, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, optimisticUser]);
    try {
      const res = await api.chat(trimmed, activeSessionId || undefined, superadmin ? targetUserId : undefined);
      setActiveSessionId(res.sessionId);
      setSessions(prev => {
        const exists = prev.some(s => s.id === res.sessionId);
        const next = exists ? prev.map(s => s.id === res.sessionId ? { ...s, title: res.title || s.title, updatedAt: new Date().toISOString() } : s) : [{ id: res.sessionId, userId: res.userId, title: res.title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...prev];
        return next;
      });
      const assistant: ChatMessage = { id: `reply-${Date.now()}`, sessionId: res.sessionId, role: 'assistant', content: res.reply, createdAt: new Date().toISOString() };
      setMessages(prev => {
        const withoutOptimistic = prev.filter(m => m.id !== optimisticUser.id);
        return [...withoutOptimistic, { ...optimisticUser, sessionId: res.sessionId }, assistant];
      });
      if (res.extractedMemories.length) setExtractedHints(prev => ({ ...prev, [`reply-${Date.now()}`]: res.extractedMemories }));
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== optimisticUser.id));
      setInput(trimmed);
      setError(err instanceof ApiError ? err.message : (err instanceof Error ? err.message : '发送失败'));
    } finally {
      setLoading(false);
    }
  }

  function send() {
    void sendText(input);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
  }

  const sessionMenuItems = useMemo(() => sessions.map(s => ({ label: s.title || '新对话', onSelect: () => selectSession(s.id) })), [sessions]);

  return <div className="page-stack chat-page">
    <header className="page-head chat-head">
      <div>
        <h1>AI 育儿助手</h1>
        <p>{activeSession?.title || (activeSessionId ? '新对话' : '选择或开始一段对话')}</p>
      </div>
    </header>

    {superadmin && <div className="chat-member-switch"><SegmentedControl<FamilyId> label="查看成员对话" value={targetUserId} options={familyMembers.map(m => ({ value: m.id, label: m.name }))} onChange={id => { setTargetUserId(id); setActiveSessionId(null); setMessages([]); }} /></div>}

    <div className="chat-toolbar">
      {sessions.length > 0 ? <div className="chat-session-picker">
        <span className="chat-session-name">{activeSession?.title || '新对话'}</span>
        <ActionMenu label="切换对话" items={sessionMenuItems} />
        {activeSessionId && <button type="button" className="text-link" onClick={() => void deleteSession(activeSessionId)}>删除</button>}
      </div> : <span className="chat-empty-hint">还没有对话，点击「新对话」开始。</span>}
      <div className="chat-toolbar-right">
        {superadmin && <button type="button" className="btn secondary" onClick={() => setShowMemoryManager(true)}>记忆</button>}
        <button type="button" className="btn primary" onClick={() => void createSession()}>新对话</button>
      </div>
    </div>

    <div className="chat-messages">
      {!activeSessionId && sessions.length === 0 && <EmptyState title="开始一段 AI 对话" description="可以问喂奶、排便、生长、疫苗或照护相关的任何问题。" action={<button type="button" className="btn primary" onClick={() => void createSession()}>开始对话</button>} />}
      {activeSessionId && messages.length === 0 && <div className="chat-welcome"><p>可以问我关于宝宝的问题，例如：</p><div className="chat-suggestions">{SUGGESTIONS.map(suggestion => <button type="button" key={suggestion} className="chat-suggestion" onClick={() => void sendText(suggestion)}>{suggestion}</button>)}</div></div>}
      {messages.map(m => <div key={m.id} className={`chat-bubble ${m.role}`}>
        <div className="chat-meta">{m.role === 'user' ? user.name : 'AI 助手'} · {formatChatTime(m.createdAt)}</div>
        <div className="chat-content">{renderRichText(m.content)}</div>
        {m.role === 'assistant' && extractedHints[m.id] && <div className="chat-memory-hint">已记住：{extractedHints[m.id].map(h => `「${h.content}」`).join('、')}</div>}
      </div>)}
      {loading && <div className="chat-bubble assistant loading"><span /></div>}
      <div ref={messagesEndRef} />
    </div>

    <div className="chat-input-bar">
      <textarea ref={inputRef} rows={1} maxLength={2000} placeholder={capabilities.aiEnabled ? '输入问题…' : 'AI 模型未配置'} value={input} disabled={loading || !capabilities.aiEnabled} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} />
      <button type="button" className="btn primary" disabled={loading || !input.trim() || !capabilities.aiEnabled} onClick={() => void send()}>{loading ? '思考中…' : '发送'}</button>
    </div>

    {error && <div className="chat-error-toast" role="alert"><span>{error}</span><button type="button" aria-label="关闭" onClick={() => setError('')}>×</button></div>}
    <MemoryManager open={showMemoryManager} onClose={() => setShowMemoryManager(false)} />
  </div>;
}
