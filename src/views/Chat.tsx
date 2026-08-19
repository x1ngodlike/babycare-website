import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Brain, Lightbulb, Trash2, XIcon, RotateCcw, Archive } from 'lucide-react';
import { api, ApiError } from '../api';
import { familyMembers } from '../shared';
import { confirmAction, EmptyState } from '../ui';
import type { AiMemory, Capabilities, ChatMessage, ChatSession, ExtractedMemory, FamilyId, SessionUser } from '../types';

const categoryLabels: Record<AiMemory['category'], string> = { preferences: '偏好', health: '健康', notes: '备忘' };
const categoryOrder: AiMemory['category'][] = ['health', 'preferences', 'notes'];

function formatChatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function chatBubbleTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return '刚刚';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yday = new Date(today.getTime() - 86400000);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (target.getTime() === today.getTime()) return `${hh}:${mm}`;
  if (target.getTime() === yday.getTime()) return `昨天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return formatChatTime(iso);
}

type ExpiryChoice = 'perm' | '3' | '7' | '30';
const EXPIRY_PRESETS: { key: ExpiryChoice; label: string; days: number | null }[] = [
  { key: 'perm', label: '永久', days: null },
  { key: '3', label: '3 天', days: 3 },
  { key: '7', label: '7 天', days: 7 },
  { key: '30', label: '30 天', days: 30 }
];

function computeExpiresAt(choice: ExpiryChoice): string | null {
  const days = EXPIRY_PRESETS.find(p => p.key === choice)?.days;
  if (!days) return null;
  return new Date(Date.now() + days * 86400000).toISOString();
}

function formatExpiry(expiresAt: string | null | undefined): { text: string; expired: boolean } {
  if (!expiresAt) return { text: '永久', expired: false };
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return { text: '永久', expired: false };
  if (t <= Date.now()) return { text: '已过期', expired: true };
  const ms = t - Date.now();
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return { text: `剩 ${days} 天`, expired: false };
  const hours = Math.floor(ms / 3600000);
  return { text: `剩 ${hours} 小时`, expired: false };
}

function originalDurationDays(createdAt: string, expiresAt: string | null | undefined): string {
  if (!expiresAt) return '永久';
  const from = new Date(createdAt).getTime();
  const to = new Date(expiresAt).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return '';
  const days = Math.max(1, Math.round((to - from) / 86400000));
  return `${days}天期限`;
}

const SUGGESTIONS = [
  { icon: '🍼', text: '最近奶量怎么样？' },
  { icon: '📏', text: '这个月身高体重达标吗？' },
  { icon: '💉', text: '下次疫苗什么时候打？' },
  { icon: '🛁', text: '宝宝洗澡需要注意什么？' },
];

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
  const [filter, setFilter] = useState<'all' | AiMemory['category']>('all');
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>('perm');
  const [showExpiredDialog, setShowExpiredDialog] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    setLoading(true); setError('');
    api.memories(true).then(r => setMemories(r.memories ?? [])).catch(err => setError(err instanceof Error ? err.message : '读取失败')).finally(() => setLoading(false));
  }, [open]);
  const expiredMemories = useMemo(() => {
    const now = Date.now();
    return memories.filter(m => {
      if (m.status === 'resolved') return true;
      if (!m.expiresAt) return false;
      const t = new Date(m.expiresAt).getTime();
      return !Number.isNaN(t) && t <= now;
    });
  }, [memories]);
  async function add() {
    if (!content.trim()) return;
    setSaving(true); setError('');
    const expiresAt = computeExpiresAt(expiryChoice);
    try {
      const memory = await api.addMemory(content.trim(), category, expiresAt);
      setMemories(prev => [memory, ...prev]);
      setContent(''); setExpiryChoice('perm');
    }
    catch (err) { setError(err instanceof Error ? err.message : '添加失败'); }
    finally { setSaving(false); }
  }
  async function remove(id: string) {
    if (!await confirmAction({ title: '删除这条记忆？', description: '删除后 AI 将不再参考该要点。', confirmLabel: '删除', danger: true })) return;
    try { await api.deleteMemory(id); setMemories(prev => prev.filter(m => m.id !== id)); }
    catch (err) { setError(err instanceof Error ? err.message : '删除失败'); }
  }
  async function restore(id: string) {
    try {
      const memory = await api.restoreMemory(id);
      setMemories(prev => prev.map(m => m.id === id ? memory : m));
    }
    catch (err) { setError(err instanceof Error ? err.message : '恢复失败'); }
  }
  const filtered = useMemo(() => {
    const sorted = [...memories].filter(m => {
      if (m.status === 'resolved') return false;
      if (m.expiresAt) {
        const t = new Date(m.expiresAt).getTime();
        if (!Number.isNaN(t) && t <= Date.now()) return false;
      }
      return true;
    }).sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) || b.updatedAt.localeCompare(a.updatedAt));
    if (filter === 'all') return sorted;
    return sorted.filter(m => m.category === filter);
  }, [memories, filter]);
  const countByCategory = useMemo(() => ({ health: memories.filter(m => m.category === 'health').length, preferences: memories.filter(m => m.category === 'preferences').length, notes: memories.filter(m => m.category === 'notes').length }), [memories]);
  if (!open) return null;
  return createPortal(<div className="modal-layer memory-modal" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section ref={dialogRef} className="editor memory-manager" role="dialog" aria-modal="true" aria-labelledby="memory-title">
      <header className="memory-head">
        <div className="memory-head-copy">
          <p className="kicker">AI 记忆</p>
          <h2 id="memory-title">家庭共享记忆</h2>
          <p className="memory-subtitle">AI 在对话中会参考这些记忆来回答问题</p>
        </div>
        <button type="button" className="memory-close" onClick={onClose} aria-label="关闭">
          <XIcon size={18} strokeWidth={2} />
        </button>
      </header>

      {error && <p className="error-text" role="alert">{error}</p>}

      <div className="memory-add-card">
        <div className="memory-add-row">
          <div className="memory-add-input-wrap">
            <textarea rows={2} maxLength={200} placeholder="添加一条希望 AI 记住的要点…" value={content} onChange={e => setContent(e.target.value)} />
            <span className="memory-char-count">{content.length}/200</span>
          </div>
          <button type="button" className="btn primary memory-add-btn" disabled={saving || !content.trim()} onClick={() => void add()}>
            {saving ? '保存中…' : '添加'}
          </button>
        </div>
        <div className="memory-add-subrow">
          <div className="memory-category-tabs" role="radiogroup" aria-label="记忆分类">
            {categoryOrder.map(cat => (
              <button key={cat} type="button" role="radio" aria-checked={category === cat} className={`memory-category-tab ${category === cat ? 'selected' : ''}`} onClick={() => setCategory(cat)}>
                <span className={`memory-dot ${cat}`} />{categoryLabels[cat]}
              </button>
            ))}
          </div>
          <div className="memory-expiry-tabs" role="radiogroup" aria-label="记忆有效期">
            {EXPIRY_PRESETS.map(p => (
              <button key={p.key} type="button" role="radio" aria-checked={expiryChoice === p.key} className={`memory-expiry-tab ${expiryChoice === p.key ? 'selected' : ''}`} onClick={() => setExpiryChoice(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!loading && memories.length > 0 && <div className="memory-filter-bar">
        <span className="memory-filter-label">筛选</span>
        <div className="memory-filter-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            全部 <span className="memory-count">{memories.length}</span>
          </button>
          {categoryOrder.map(cat => countByCategory[cat] > 0 && (
            <button key={cat} type="button" role="tab" aria-selected={filter === cat} className={filter === cat ? 'active' : ''} onClick={() => setFilter(cat)}>
              {categoryLabels[cat]} <span className="memory-count">{countByCategory[cat]}</span>
            </button>
          ))}
        </div>
      </div>}

      {!loading && memories.length > 0 && (
        <div className="memory-expired-bar">
          <span className="memory-expired-hint">过期/作废的记忆</span>
          <button type="button" className="memory-expired-entry" onClick={() => setShowExpiredDialog(true)}>
            <Archive size={14} strokeWidth={2} /> 共 {expiredMemories.length} 条
          </button>
        </div>
      )}

      {loading ? (
        <div className="memory-loading">
          <div className="memory-spinner" />
          <span>正在加载记忆…</span>
        </div>
      ) : memories.length === 0 ? (
        <div className="memory-empty">
          <div className="memory-empty-icon" aria-hidden="true">
            <Brain size={40} strokeWidth={1.5} />
          </div>
          <p>还没有 AI 记忆</p>
          <span>在上方添加要点，AI 会在对话中自动参考</span>
        </div>
      ) : (
        <ul className="memory-list" role="list">
          {filtered.map(m => {
            const exp = formatExpiry(m.expiresAt);
            const statusText = m.status === 'resolved' ? '已作废' : (exp.text === '永久' ? '' : exp.text);
            const durationLabel = originalDurationDays(m.createdAt, m.expiresAt);
            return (
            <li key={m.id} className={`memory-item cat-${m.category}`}>
              <div className="memory-item-bar" aria-hidden="true" />
              <div className="memory-item-main">
                <div className="memory-item-head">
                  <span className={`memory-tag ${m.category}`}>{categoryLabels[m.category]}</span>
                  <span className={`memory-duration-tag ${durationLabel === '永久' ? 'perm' : ''}`}>{durationLabel}</span>
                </div>
                <p className="memory-item-text">{m.content}</p>
                <div className="memory-item-meta">
                  <span className="memory-item-time" title={new Date(m.updatedAt).toLocaleString('zh-CN')}>{relativeTime(m.updatedAt)}</span>
                  {statusText && <>
                    <span className="memory-item-sep">·</span>
                    <span className={`memory-item-status ${m.status === 'resolved' ? 'resolved' : exp.expired ? 'expired' : ''}`}>{statusText}</span>
                  </>}
                </div>
              </div>
              <div className="memory-item-actions">
                {m.status === 'resolved' && (
                  <button type="button" className="memory-item-restore" aria-label="恢复这条记忆" title="恢复（撤销作废）" onClick={() => void restore(m.id)}>
                    <RotateCcw size={14} strokeWidth={2} />
                  </button>
                )}
                <button type="button" className="memory-item-delete" aria-label="删除这条记忆" onClick={() => void remove(m.id)}>
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              </div>
            </li>
          );})}
        </ul>
      )}
    </section>

    {showExpiredDialog && createPortal(<div className="modal-layer memory-expired-modal" onMouseDown={e => e.target === e.currentTarget && setShowExpiredDialog(false)}>
      <section className="editor memory-expired-dialog" role="dialog" aria-modal="true" aria-labelledby="memory-expired-title">
        <header className="memory-head">
          <div className="memory-head-copy">
            <p className="kicker">AI 记忆</p>
            <h2 id="memory-expired-title">已过期 / 已作废</h2>
            <p className="memory-subtitle">这些记忆不再被 AI 参考，可选择恢复或永久删除</p>
          </div>
          <button type="button" className="memory-close" onClick={() => setShowExpiredDialog(false)} aria-label="关闭">
            <XIcon size={18} strokeWidth={2} />
          </button>
        </header>
        <ul className="memory-list expired" role="list">
          {expiredMemories.map(m => {
            const durationLabel = originalDurationDays(m.createdAt, m.expiresAt);
            return (
            <li key={m.id} className={`memory-item cat-${m.category}`}>
              <div className="memory-item-bar" aria-hidden="true" />
              <div className="memory-item-main">
                <div className="memory-item-head">
                  <span className={`memory-tag ${m.category}`}>{categoryLabels[m.category]}</span>
                  <span className={`memory-duration-tag ${durationLabel === '永久' ? 'perm' : ''}`}>{durationLabel}</span>
                  <span className={`memory-item-status ${m.status === 'resolved' ? 'resolved' : 'expired'}`}>
                    {m.status === 'resolved' ? '已作废' : '已过期'}
                  </span>
                </div>
                <p className="memory-item-text">{m.content}</p>
                <div className="memory-item-meta">
                  <span className="memory-item-time" title={new Date(m.updatedAt).toLocaleString('zh-CN')}>{relativeTime(m.updatedAt)}</span>
                </div>
              </div>
              <div className="memory-item-actions">
                <button type="button" className="memory-item-restore" aria-label="恢复这条记忆" title="恢复（撤销作废）" onClick={() => void restore(m.id)}>
                  <RotateCcw size={14} strokeWidth={2} />
                </button>
                <button type="button" className="memory-item-delete" aria-label="删除这条记忆" onClick={() => void remove(m.id)}>
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              </div>
            </li>
          );})}
        </ul>
      </section>
    </div>, document.body)}
  </div>, document.body);
}

function renderAvatar(role: ChatMessage['role'], userName: string): React.ReactNode {
  if (role === 'user') {
    return <div className="chat-avatar user">{userName.slice(0, 1)}</div>;
  }
  return <div className="chat-avatar assistant" aria-hidden="true">AI</div>;
}

export default function ChatView({ user, capabilities, online, onBack }: { user: SessionUser; capabilities: Capabilities; online: boolean; onBack?: () => void }) {
  const superadmin = user.role === 'superadmin';
  const canManageMemory = user.role === 'superadmin' || user.role === 'admin';
  const [targetUserId, setTargetUserId] = useState<FamilyId>(user.id);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showMemoryManager, setShowMemoryManager] = useState(false);
  const [showSessionSheet, setShowSessionSheet] = useState(false);
  const [showSessionDropdown, setShowSessionDropdown] = useState(false);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [extractedHints, setExtractedHints] = useState<Record<string, ExtractedMemory[]>>({});
  const [resolvedHints, setResolvedHints] = useState<Record<string, { id: string; content: string }[]>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const sessionDropdownRef = useRef<HTMLDivElement | null>(null);
  const memberDropdownRef = useRef<HTMLDivElement | null>(null);
  const sessionRequestId = useRef(0);
  const messageRequestId = useRef(0);
  const suppressNextMessageLoad = useRef(false);

  const displayUserName = superadmin
    ? (familyMembers.find(m => m.id === targetUserId)?.name || user.name)
    : user.name;

  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId) || null, [sessions, activeSessionId]);

  const loadSessions = useCallback(async () => {
    const reqId = ++sessionRequestId.current;
    try {
      const res = await api.chatSessions(superadmin ? targetUserId : undefined);
      if (reqId === sessionRequestId.current) setSessions(res.sessions);
    } catch (err) {
      if (reqId === sessionRequestId.current) setError(err instanceof Error ? err.message : '读取对话列表失败');
    }
  }, [superadmin, targetUserId]);

  const loadMessages = useCallback(async (sessionId: string) => {
    const reqId = ++messageRequestId.current;
    try {
      const res = await api.chatMessages(sessionId);
      if (reqId === messageRequestId.current) {
        if (suppressNextMessageLoad.current) {
          suppressNextMessageLoad.current = false;
          return;
        }
        setMessages(res.messages);
        if (res.hints?.length) {
          const ext: Record<string, ExtractedMemory[]> = {};
          const resv: Record<string, { id: string; content: string }[]> = {};
          for (const h of res.hints) {
            if (h.memories.length) ext[h.messageId] = h.memories;
            if (h.resolved.length) resv[h.messageId] = h.resolved;
          }
          setExtractedHints(prev => ({ ...prev, ...ext }));
          setResolvedHints(prev => ({ ...prev, ...resv }));
        }
      }
    } catch (err) {
      if (reqId === messageRequestId.current) setError(err instanceof Error ? err.message : '读取消息失败');
    }
  }, []);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  useEffect(() => { if (!activeSessionId && sessions.length > 0) setActiveSessionId(sessions[0].id); }, [sessions, activeSessionId]);

  useEffect(() => { if (activeSessionId) void loadMessages(activeSessionId); }, [activeSessionId, loadMessages]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

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
    setDeletingSessionId(id);
    try { await api.deleteChatSession(id); setSessions(prev => prev.filter(s => s.id !== id)); if (activeSessionId === id) { setActiveSessionId(null); setMessages([]); } }
    catch (err) { setError(err instanceof Error ? err.message : '删除失败'); }
    finally { setDeletingSessionId(null); }
  }

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showSessionDropdown && !showMemberDropdown) return;
    function handleClick(e: MouseEvent) {
      if (showSessionDropdown && sessionDropdownRef.current && !sessionDropdownRef.current.contains(e.target as Node)) {
        setShowSessionDropdown(false);
      }
      if (showMemberDropdown && memberDropdownRef.current && !memberDropdownRef.current.contains(e.target as Node)) {
        setShowMemberDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSessionDropdown, showMemberDropdown]);

  function selectSession(id: string) {
    if (id === activeSessionId) { setShowSessionSheet(false); setShowSessionDropdown(false); return; }
    setActiveSessionId(id);
    setMessages([]);
    setError('');
    setShowSessionSheet(false);
    setShowSessionDropdown(false);
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
      const res = await api.chat(trimmed, activeSessionId || undefined, superadmin ? targetUserId : undefined, superadmin ? displayUserName : undefined);
      suppressNextMessageLoad.current = true;
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
      if (res.extractedMemories?.length) setExtractedHints(prev => ({ ...prev, [assistant.id]: res.extractedMemories }));
      if (res.resolvedMemories?.length) setResolvedHints(prev => ({ ...prev, [assistant.id]: res.resolvedMemories }));
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

  return <div className="chat-page">
    <header className="chat-fullscreen-header">
      {onBack && <button type="button" className="chat-back-btn" onClick={onBack} aria-label="返回">
        <ChevronLeft aria-hidden="true" size={20} strokeWidth={2.2} />
      </button>}
      <div className="chat-header-title">
        <h1>AI 助手</h1>
      </div>
      <div className="chat-header-actions">
        {canManageMemory && <button type="button" className="btn ghost" onClick={() => setShowMemoryManager(true)} aria-label="记忆">记忆</button>}
        <button type="button" className="btn primary" onClick={() => void createSession()}>新对话</button>
      </div>
    </header>

    <div className="chat-toolbar">
      {superadmin && <div className="chat-member-switch" ref={memberDropdownRef}>
        <button type="button" className="chat-member-trigger" onClick={() => setShowMemberDropdown(v => !v)} aria-haspopup="listbox" aria-expanded={showMemberDropdown}>
          <span className="chat-member-name">{familyMembers.find(m => m.id === targetUserId)?.name}</span>
          <span className="chat-member-caret" aria-hidden="true">▾</span>
        </button>
        {showMemberDropdown && <div className="chat-member-dropdown" role="listbox">
          <ul className="chat-member-dropdown-list">
            {familyMembers.map(m => <li key={m.id} className={targetUserId === m.id ? 'active' : ''} role="option" aria-selected={targetUserId === m.id}>
              <button type="button" className="chat-member-item" onClick={() => { sessionRequestId.current++; messageRequestId.current++; setTargetUserId(m.id); setActiveSessionId(null); setMessages([]); setSessions([]); setShowSessionDropdown(false); setShowMemberDropdown(false); }}>
                <span className="chat-member-item-name">{m.name}</span>
                {targetUserId === m.id && <span className="chat-member-item-check" aria-hidden="true">✓</span>}
              </button>
            </li>)}
          </ul>
        </div>}
      </div>}

      {sessions.length > 0 ? <div className="chat-session-picker desktop" ref={sessionDropdownRef}>
        <button type="button" className="chat-session-trigger-btn" onClick={() => setShowSessionDropdown(v => !v)} aria-haspopup="listbox" aria-expanded={showSessionDropdown}>
          <span className="chat-session-name">{activeSession?.title || '新对话'}</span>
          <span className="chat-session-caret" aria-hidden="true">▾</span>
        </button>
        {showSessionDropdown && <div className="chat-session-dropdown" role="listbox">
          <div className="chat-session-dropdown-head">
            <span>全部对话</span>
            <span className="chat-session-count">{sessions.length}</span>
          </div>
          <ul className="chat-session-dropdown-list">
            {sessions.map(s => <li key={s.id} className={activeSessionId === s.id ? 'active' : ''} role="option" aria-selected={activeSessionId === s.id}>
              <button type="button" className="chat-session-item" onClick={() => selectSession(s.id)}>
                <div className="chat-session-item-info">
                  <span className="chat-session-item-title">{s.title || '新对话'}</span>
                  <span className="chat-session-item-time">{relativeTime(s.updatedAt)}</span>
                </div>
                {activeSessionId === s.id && <span className="chat-session-item-check" aria-hidden="true">✓</span>}
              </button>
              <button type="button" className="chat-session-item-delete" onClick={e => { e.stopPropagation(); void deleteSession(s.id); }} disabled={deletingSessionId === s.id} aria-label={`删除对话 ${s.title || '新对话'}`}>
                {deletingSessionId === s.id ? '…' : '×'}
              </button>
            </li>)}
          </ul>
        </div>}
      </div> : <span className="chat-empty-hint">还没有对话，点击「新对话」开始。</span>}

      {sessions.length > 0 && <button type="button" className="chat-session-trigger mobile" onClick={() => setShowSessionSheet(true)}>
        {activeSession?.title || '新对话'} ▾
      </button>}
    </div>

    {/* Mobile Session Sheet */}
    {showSessionSheet && createPortal(<div className="mobile-sheet-layer" onClick={() => setShowSessionSheet(false)}>
      <section className="mobile-sheet" onClick={e => e.stopPropagation()}>
        <header className="mobile-sheet-header">
          <h3>选择对话</h3>
          <button type="button" className="close-btn" onClick={() => setShowSessionSheet(false)}>×</button>
        </header>
        <ul className="mobile-sheet-list">
          {sessions.map(s => <li key={s.id} className={activeSessionId === s.id ? 'active' : ''}>
            <button type="button" className="mobile-session-item" onClick={() => selectSession(s.id)}>
              <div className="mobile-session-item-info">
                <span className="mobile-session-item-title">{s.title || '新对话'}</span>
                <span className="mobile-session-item-time">{relativeTime(s.updatedAt)}</span>
              </div>
              {activeSessionId === s.id && <span className="check-icon">✓</span>}
            </button>
            <button type="button" className="mobile-session-delete" onClick={e => { e.stopPropagation(); void deleteSession(s.id); }} disabled={deletingSessionId === s.id} aria-label={`删除对话 ${s.title || '新对话'}`}>
              {deletingSessionId === s.id ? '…' : '删除'}
            </button>
          </li>)}
        </ul>
      </section>
    </div>, document.body)}

    <div className="chat-messages">
      {!activeSessionId && sessions.length === 0 && <EmptyState title="开始一段 AI 对话" description="可以问喂奶、排便、生长、疫苗或照护相关的任何问题。" action={<button type="button" className="btn primary" onClick={() => void createSession()}>开始对话</button>} />}
      {activeSessionId && messages.length === 0 && <div className="chat-welcome">
        <div className="chat-welcome-icon" aria-hidden="true">
          <Lightbulb size={28} strokeWidth={1.8} />
        </div>
        <p>你好！我是宝宝的 AI 助手，可以问我任何关于宝宝的问题：</p>
        <div className="chat-suggestions">
          {SUGGESTIONS.map((suggestion, index) => (
            <button type="button" key={index} className="chat-suggestion" onClick={() => void sendText(suggestion.text)}>
              <span className="suggestion-icon">{suggestion.icon}</span>
              <span className="suggestion-text">{suggestion.text}</span>
            </button>
          ))}
        </div>
      </div>}
      {messages.map(m => <div key={m.id} className={`chat-msg-row ${m.role}`}>
        {m.role === 'assistant' && renderAvatar(m.role, displayUserName)}
        <div className={`chat-bubble ${m.role}`}>
          <div className="chat-content">{renderRichText(m.content)}</div>
          {m.role === 'assistant' && (extractedHints[m.id]?.length || resolvedHints[m.id]?.length) && (
            <div className="chat-memory-hint">
              {extractedHints[m.id]?.length ? (
                <span className="hint-line">已记住：{extractedHints[m.id].map(h => {
                  const exp = formatExpiry(h.expiresAt);
                  return `「${h.content}」${exp.expired || exp.text === '永久' ? '' : `（${exp.text}）`}`;
                }).join('、')}</span>
              ) : null}
              {resolvedHints[m.id]?.length ? (
                <span className="hint-line hint-resolved">已作废旧记忆：{resolvedHints[m.id].map(r => `「${r.content}」`).join('、')}</span>
              ) : null}
            </div>
          )}
          <span className="chat-bubble-time" title={new Date(m.createdAt).toLocaleString('zh-CN')}>{chatBubbleTime(m.createdAt)}</span>
        </div>
        {m.role === 'user' && renderAvatar(m.role, displayUserName)}
      </div>)}
      {loading && <div className="chat-msg-row assistant">
        {renderAvatar('assistant', displayUserName)}
        <div className="chat-bubble assistant loading">
          <span /><span /><span />
        </div>
      </div>}
      <div ref={messagesEndRef} />
    </div>

    <div className="chat-input-bar">
      <div className="chat-input-wrapper">
        <textarea ref={inputRef} rows={1} maxLength={2000} placeholder={capabilities.aiEnabled ? '输入问题…' : 'AI 模型未配置'} value={input} disabled={loading || !capabilities.aiEnabled} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} />
        {input && <button type="button" className="chat-input-clear" onClick={() => setInput('')} aria-label="清空">×</button>}
      </div>
      <button type="button" className="btn primary" disabled={loading || !input.trim() || !capabilities.aiEnabled} onClick={() => void send()}>{loading ? '思考中…' : '发送'}</button>
    </div>

    {error && createPortal(<div className="chat-error-toast" role="alert"><span>{error}</span><button type="button" aria-label="关闭" onClick={() => setError('')}>×</button></div>, document.body)}
    <MemoryManager open={showMemoryManager} onClose={() => setShowMemoryManager(false)} />
  </div>;
}
