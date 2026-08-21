import {
  Activity, Armchair, ArrowLeft, ArrowLeftRight, ArrowUp, AudioLines, Baby, BadgeInfo,
  BicepsFlexed, Blocks, BookOpen, Brain, CalendarCheck, Check, ChevronDown, ChevronRight, Circle, CircleDot,
  ClipboardCheck, Clock3, ExternalLink, Eye, Footprints, GlassWater, Hammer, Hand,
  HandHelping, HeartHandshake, Info, ListChecks, MapPin, MessageCircle, MessageCircleMore,
  MousePointer2, MoveDown, MoveUp, PackageCheck, PackageOpen, PanelTopOpen, Pencil,
  PersonStanding, Puzzle, RefreshCw, Repeat2, RotateCw, ScanFace, Search, Shapes, Share2,
  ShieldCheck, Shirt, Smile, Soup, Sparkles, Speech, Sun, Theater, Toilet, UserRoundCheck,
  Users, UsersRound, Utensils, Volume2, WashingMachine,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_GUIDE_REGION, GROWTH_STAGES, GUIDE_VERIFIED_ON, LOCAL_GUIDE_TASKS,
  seasonalAdvice, stageForAge,
} from '../shared/growth-guide';
import {
  MILESTONE_CATEGORY_LABELS, MILESTONE_CATEGORY_ORDER, MILESTONE_DEFINITIONS,
  formatWholeMonths, getMilestoneDefinition, type MilestoneCategory, type MilestoneDefinition,
} from '../shared/milestones';
import { api } from './api';
import { calculateAge, isoDay } from './date';
import { DateField } from './DateField';
import type { GrowthGuideEntry, GrowthGuideEntryKind, MilestoneRecord, Profile } from './types';
import { confirmAction, Modal } from './ui';

type ChecklistState = 'done' | 'skip';
interface ChecklistEntry { state: ChecklistState; completedAt?: string | null; updatedAt?: string; updatedBy?: string }
type ChecklistMap = Record<string, ChecklistEntry>;
type HistoryKind = 'ability' | 'task' | 'shopping';
type GuideTab = 'advice' | 'abilities' | 'tasks' | 'shopping';
interface GuideHistoryItem { id: string; kind: HistoryKind; title: string; detail: string; date?: string; sortKey: string }
interface GuideEntryEditorTarget { id: string; kind: GrowthGuideEntryKind; title: string; entry?: ChecklistEntry }
const CHECKLIST_STORAGE_KEY = 'babycare-growth-guide-checklist-v1';
const CATEGORY_ICONS = {
  gross_motor: PersonStanding,
  fine_motor: Hand,
  language: MessageCircle,
  cognitive: Brain,
  social: Users,
  self_care: Shirt,
} satisfies Record<MilestoneCategory, typeof PersonStanding>;

const ABILITY_ICONS: Record<string, typeof PersonStanding> = {
  turn_head: RotateCw, lift_head: ArrowUp, forearm_support: BicepsFlexed, roll_over: RefreshCw,
  sit_alone: Armchair, crawl: Baby, pull_stand: PersonStanding, cruise: Footprints,
  walk_alone: Footprints, squat_stand: MoveDown, run: Activity, stairs: MoveUp, jump: MoveUp,
  open_hands: Hand, hands_together: HandHelping, grasp: Hand, transfer: ArrowLeftRight,
  bang_objects: Hammer, pinch: MousePointer2, release_object: PackageOpen, scribble: Pencil,
  turn_pages: BookOpen, stack_blocks: Blocks, imitate_circle: Circle,
  react_sound: Volume2, coo: AudioLines, laugh_sound: Smile, babble: Speech,
  respond_name: Volume2, call_mama: Speech, gesture_words: Hand, single_word: MessageCircle,
  understand_simple: ListChecks, short_phrase: MessageCircleMore, name_objects: BadgeInfo,
  say_own_name: BadgeInfo, track_face: Eye, recognize: ScanFace, mouth_explore: CircleDot,
  peekaboo: Eye, find_hidden: Search, point: MousePointer2, container_play: PanelTopOpen,
  imitate_action: Repeat2, sort_shapes: Shapes, pretend_play: Theater, simple_puzzle: Puzzle,
  eye_contact: Eye, smile: Smile, enjoy_interaction: HeartHandshake,
  stranger_awareness: UserRoundCheck, wave: Hand, joint_attention: UsersRound, share: Share2,
  help_housework: HandHelping, parallel_play: Users, take_turns: Repeat2,
  finger_feed: Utensils, drink_cup: GlassWater, use_spoon: Soup, help_dress: Shirt,
  wash_hands: WashingMachine, remove_clothes: Shirt, toilet_signal: Toilet,
};

function ageInMonths(birthDate: string): number {
  const birth = new Date(`${birthDate}T00:00:00`);
  return Math.max(0, (Date.now() - birth.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
}

function ageInMonthsOn(birthDate: string, value?: string): number | null {
  if (!value) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  const observed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  const months = (observed.getTime() - birth.getTime()) / (30.44 * 24 * 60 * 60 * 1000);
  return Number.isFinite(months) && months >= 0 ? months : null;
}

function readChecklist(): ChecklistMap {
  try {
    const stored = JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_KEY) || '{}') as Record<string, ChecklistEntry | ChecklistState>;
    return Object.fromEntries(Object.entries(stored).map(([key, value]) => [key, typeof value === 'string' ? { state: value } : value]));
  }
  catch { return {}; }
}

function checklistFromShared(entries: GrowthGuideEntry[]): ChecklistMap {
  return Object.fromEntries(entries.map(entry => [entry.itemKey, { state: entry.state, completedAt: entry.completedAt, updatedAt: entry.updatedAt, updatedBy: entry.updatedBy }]));
}

function formatRecordDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function formatHistoryDate(value?: string): string {
  if (!value) return '此前完成';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function MilestoneBadge({ milestoneKey, size = 44, status = 'pending' }: { milestoneKey: string; size?: number; status?: string }) {
  const definition = getMilestoneDefinition(milestoneKey);
  const category = definition?.category || 'cognitive';
  const AbilityIcon = ABILITY_ICONS[milestoneKey] || CATEGORY_ICONS[category];
  return <span className={`milestone-badge ms-badge-${status} category-${category}`} style={{ width: size, height: size }} aria-hidden="true"><span className="badge-category-icon"><AbilityIcon /></span></span>;
}

export function MilestoneArchiveSummary({ profile, onOpen }: { profile: Profile; onOpen(): void }) {
  const [records, setRecords] = useState<MilestoneRecord[]>([]);
  const ageMonths = ageInMonths(profile.birthDate);
  const stage = stageForAge(ageMonths);
  useEffect(() => { api.milestoneRecords().then(setRecords).catch(() => undefined); }, []);
  const observed = new Set(records.filter(record => !record.deletedAt).map(record => record.milestoneKey)).size;
  const dueTasks = LOCAL_GUIDE_TASKS.filter(task => !task.archived && ageMonths >= task.range[0] && ageMonths < task.range[1]).length;

  return <section className="vaccine-archive-summary milestone-summary growth-summary">
    <div className="section-title"><h2>成长指南</h2><button className="text-button vaccine-archive-link" onClick={onOpen}>打开指南 <ChevronRight aria-hidden="true" /></button></div>
    <button type="button" className="growth-summary-body" onClick={onOpen}>
      <span className="growth-summary-icon"><Sparkles aria-hidden="true" /></span>
      <span className="growth-summary-copy"><strong>{stage.label} · {stage.title}</strong><small>{DEFAULT_GUIDE_REGION}</small><span>{observed} 项能力记录 · {dueTasks} 件近期事项 · 本季建议已更新</span></span>
      <ChevronRight aria-hidden="true" />
    </button>
  </section>;
}

function AbilityEditor({ definition, record, profile, onClose, onSaved, onDelete }: {
  definition: MilestoneDefinition; record: MilestoneRecord | null; profile: Profile; onClose(): void; onSaved(): Promise<void>; onDelete?(): void;
}) {
  const [observedOn, setObservedOn] = useState(record?.achievedOn || isoDay(new Date()));
  const [note, setNote] = useState(record?.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const payload = { milestoneKey: definition.key, achievedOn: observedOn, note: note || null };
      if (record) await api.updateMilestoneRecord(record.id, payload); else await api.createMilestoneRecord(payload);
      await onSaved(); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试'); setBusy(false); }
  }

  return <Modal title={definition.label} kicker="宝宝会什么" headerExtra={<small className="milestone-def-desc">{definition.description} · 常见参考 {formatWholeMonths(definition.whoMonthsRange)}</small>} onClose={onClose} busy={busy}>
    <form className="editor-form" onSubmit={submit}>
      <DateField label="第一次观察到的日期" value={observedOn} onChange={setObservedOn} min={profile.birthDate} max={isoDay(new Date())} required />
      <small className="field-hint">当时宝宝 {calculateAge(profile.birthDate, new Date(`${observedOn}T12:00:00`))}</small>
      <label>成长记录（可选）<textarea value={note} maxLength={200} onChange={event => setNote(event.target.value)} placeholder="例如：今天在客厅地垫上第一次坐得很稳" rows={3} /></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <footer className="editor-actions guide-editor-actions">{record && onDelete && <button type="button" className="btn secondary guide-editor-delete" onClick={onDelete} disabled={busy}>删除记录</button>}<button type="button" className="btn secondary" onClick={onClose} disabled={busy}>取消</button><button type="submit" className="btn primary" disabled={busy}>{busy ? '保存中…' : record ? '保存修改' : '记录宝宝会了'}</button></footer>
    </form>
  </Modal>;
}

function GuideEntryEditor({ target, profile, onClose, onSave, onRemove }: {
  target: GuideEntryEditorTarget;
  profile: Profile;
  onClose(): void;
  onSave(completedAt: string): Promise<void>;
  onRemove(): Promise<void>;
}) {
  const actionLabel = target.kind === 'task' ? '办理' : '准备';
  const existing = target.entry?.state === 'done';
  const initialDay = target.entry?.completedAt ? isoDay(new Date(target.entry.completedAt)) : isoDay(new Date());
  const [completedOn, setCompletedOn] = useState(initialDay);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await onSave(new Date(`${completedOn}T12:00:00`).toISOString());
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试');
      setBusy(false);
    }
  }

  async function remove() {
    if (!await confirmAction({ title: `取消${actionLabel}记录？`, description: `将从家庭共享档案中移除「${target.title}」的${actionLabel}记录。`, confirmLabel: '取消记录', danger: true })) return;
    setBusy(true); setError('');
    try { await onRemove(); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除失败，请稍后重试'); setBusy(false); }
  }

  return <Modal title={target.title} kicker={`${actionLabel}记录`} headerExtra={<small className="milestone-def-desc">日期会决定这条记录归入哪个成长阶段</small>} onClose={onClose} busy={busy}>
    <form className="editor-form" onSubmit={submit}>
      <DateField label={`实际${actionLabel}日期`} value={completedOn} onChange={setCompletedOn} min={profile.birthDate} max={isoDay(new Date())} required />
      <small className="field-hint">当时宝宝 {calculateAge(profile.birthDate, new Date(`${completedOn}T12:00:00`))}</small>
      {error && <p className="field-error" role="alert">{error}</p>}
      <footer className="editor-actions guide-editor-actions">{existing && <button type="button" className="btn secondary guide-editor-delete" onClick={() => void remove()} disabled={busy}>{`取消${actionLabel}记录`}</button>}<button type="button" className="btn secondary" onClick={onClose} disabled={busy}>取消</button><button type="submit" className="btn primary" disabled={busy}>{busy ? '保存中…' : `保存${actionLabel}日期`}</button></footer>
    </form>
  </Modal>;
}

export function MilestoneHistory({ profile, manager, onBack }: { profile: Profile; manager: boolean; onBack(): void }) {
  const [records, setRecords] = useState<MilestoneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ definition: MilestoneDefinition; record: MilestoneRecord | null } | null>(null);
  const [checklist, setChecklist] = useState<ChecklistMap>({});
  const [syncingKey, setSyncingKey] = useState<string | null>(null);
  const [syncError, setSyncError] = useState('');
  const [shoppingFilter, setShoppingFilter] = useState<'all' | 'needed' | 'optional' | 'skip'>('all');
  const [shoppingExpanded, setShoppingExpanded] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | HistoryKind>('all');
  const [historyScope, setHistoryScope] = useState<'stage' | 'all'>('stage');
  const [editingGuideEntry, setEditingGuideEntry] = useState<GuideEntryEditorTarget | null>(null);
  const ageMonths = ageInMonths(profile.birthDate);
  const currentStage = stageForAge(ageMonths);
  const [selectedStageId, setSelectedStageId] = useState(currentStage.id);
  const [activeTab, setActiveTab] = useState<GuideTab>('advice');
  const [activitiesExpanded, setActivitiesExpanded] = useState(false);
  const [abilitiesExpanded, setAbilitiesExpanded] = useState(false);
  const [seasonExpanded, setSeasonExpanded] = useState(false);
  const stageNavRef = useRef<HTMLElement>(null);
  const stage = GROWTH_STAGES.find(item => item.id === selectedStageId) ?? currentStage;
  const seasonItems = seasonalAdvice(new Date().getMonth() + 1);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRecords(await api.milestoneRecords()); } catch { setRecords([]); }
    finally { setLoading(false); }
  }, []);
  const loadGuideEntries = useCallback(async () => {
    const localEntries = readChecklist();
    try {
      const sharedEntries = await api.growthGuideEntries();
      const sharedMap = new Map(sharedEntries.map(entry => [entry.itemKey, entry]));
      const migrated = [...sharedEntries];
      for (const [itemKey, entry] of Object.entries(localEntries)) {
        const serverEntry = sharedMap.get(itemKey);
        if (serverEntry && (!entry.updatedAt || serverEntry.updatedAt >= entry.updatedAt)) continue;
        const saved = await api.saveGrowthGuideEntry({ itemKey, kind: itemKey.startsWith('shop:') ? 'shopping' : 'task', state: entry.state, completedAt: entry.updatedAt || null });
        const existingIndex = migrated.findIndex(item => item.itemKey === itemKey);
        if (existingIndex >= 0) migrated[existingIndex] = saved; else migrated.push(saved);
      }
      if (Object.keys(localEntries).length) localStorage.removeItem(CHECKLIST_STORAGE_KEY);
      setChecklist(checklistFromShared(migrated));
      setSyncError('');
    } catch {
      if (Object.keys(localEntries).length) setChecklist(localEntries);
      setSyncError('共享档案暂时无法同步，请稍后重试。');
    }
  }, []);
  useEffect(() => { void load(); void loadGuideEntries(); }, [load, loadGuideEntries]);
  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    stageNavRef.current?.querySelector<HTMLButtonElement>('.guide-stage-item.active')?.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedStageId]);
  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    const source = new EventSource('/api/events');
    let timer: number | null = null;
    source.onmessage = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadGuideEntries(), 200);
    };
    return () => { if (timer) window.clearTimeout(timer); source.close(); };
  }, [loadGuideEntries]);

  const validRecords = records.filter(record => !record.deletedAt);
  const recordMap = useMemo(() => {
    const map = new Map<string, MilestoneRecord>();
    for (const record of validRecords) if (!map.has(record.milestoneKey)) map.set(record.milestoneKey, record);
    return map;
  }, [validRecords]);
  const relevantAbilities = useMemo(() => {
    return MILESTONE_DEFINITIONS
      .filter(definition => definition.whoMonthsRange[0] < stage.range[1] && definition.whoMonthsRange[1] >= stage.range[0])
      .sort((a, b) => Number(recordMap.has(b.key)) - Number(recordMap.has(a.key)) || MILESTONE_CATEGORY_ORDER.indexOf(a.category) - MILESTONE_CATEGORY_ORDER.indexOf(b.category) || a.whoMonthsRange[0] - b.whoMonthsRange[0]);
  }, [recordMap, stage]);

  const activeTasks = LOCAL_GUIDE_TASKS.filter(task => !task.archived && task.range[0] < stage.range[1] && task.range[1] > stage.range[0]);
  const filteredShopping = stage.shopping.filter(item => shoppingFilter === 'all' || item.level === shoppingFilter);
  const visibleShopping = shoppingFilter === 'all' && !shoppingExpanded ? filteredShopping.slice(0, 3) : filteredShopping;
  const completedCount = stage.shopping.filter(item => checklist[`shop:${item.id}`]?.state === 'done').length;
  const stageObservedCount = relevantAbilities.filter(item => recordMap.has(item.key)).length;
  const visibleActivities = activitiesExpanded ? stage.activities : stage.activities.slice(0, 3);
  const visibleAbilities = abilitiesExpanded ? relevantAbilities : relevantAbilities.slice(0, 4);
  const historyItems = useMemo(() => {
    const items: GuideHistoryItem[] = validRecords.map(record => {
      const definition = getMilestoneDefinition(record.milestoneKey);
      return { id: `ability:${record.id}`, kind: 'ability', title: `宝宝会了「${definition?.label || record.milestoneKey}」`, detail: `${definition ? MILESTONE_CATEGORY_LABELS[definition.category] : '成长能力'}${record.note ? ` · ${record.note}` : ''}`, date: record.achievedOn, sortKey: record.achievedOn };
    });
    const shoppingMap = new Map(GROWTH_STAGES.flatMap(item => item.shopping).map(item => [item.id, item]));
    for (const [key, entry] of Object.entries(checklist)) {
      const historyAt = entry.completedAt === undefined ? entry.updatedAt : entry.completedAt;
      if (key.startsWith('shop:')) {
        const item = shoppingMap.get(key.slice(5));
        if (item) items.push({ id: key, kind: 'shopping', title: entry.state === 'done' ? `已准备「${item.title}」` : `不需要「${item.title}」`, detail: '用品准备 · 家庭共享档案', date: historyAt ?? undefined, sortKey: historyAt ?? '' });
      } else {
        const task = LOCAL_GUIDE_TASKS.find(item => item.id === key);
        if (task) items.push({ id: key, kind: 'task', title: entry.state === 'done' ? `已办理「${task.title}」` : `设为不适用「${task.title}」`, detail: `${DEFAULT_GUIDE_REGION} · 家庭共享档案`, date: historyAt ?? undefined, sortKey: historyAt ?? '' });
      }
    }
    return items.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [checklist, validRecords]);
  const visibleHistory = historyItems.filter(item => historyFilter === 'all' || item.kind === historyFilter);
  const allHistoryGroups = useMemo(() => {
    const grouped = new Map<string, GuideHistoryItem[]>();
    for (const item of visibleHistory) {
      const itemAge = ageInMonthsOn(profile.birthDate, item.date);
      const groupId = itemAge == null ? 'unknown' : stageForAge(itemAge).id;
      grouped.set(groupId, [...(grouped.get(groupId) || []), item]);
    }
    const stageGroups = [...GROWTH_STAGES].reverse().filter(item => grouped.has(item.id)).map(item => ({ id: item.id, label: item.label, title: item.title, items: grouped.get(item.id) || [] }));
    if (grouped.has('unknown')) stageGroups.push({ id: 'unknown', label: '日期待确认', title: '时间未确认', items: grouped.get('unknown') || [] });
    return stageGroups;
  }, [profile.birthDate, visibleHistory]);
  const selectedHistoryGroup = allHistoryGroups.find(group => group.id === stage.id);
  const selectedStageIndex = GROWTH_STAGES.findIndex(item => item.id === stage.id);
  const currentStageIndex = GROWTH_STAGES.findIndex(item => item.id === currentStage.id);
  const stageRelation = selectedStageIndex < currentStageIndex ? 'past' : selectedStageIndex > currentStageIndex ? 'future' : 'current';

  async function persistChecklist(id: string, kind: GrowthGuideEntryKind, value: ChecklistState, completedAt: string | null, removing = false) {
    if (syncingKey) throw new Error('其他记录正在同步，请稍候');
    const previous = checklist;
    const next = { ...checklist };
    const updatedAt = new Date().toISOString();
    if (removing) delete next[id]; else next[id] = { state: value, completedAt, updatedAt };
    setChecklist(next); setSyncingKey(id); setSyncError('');
    try {
      if (removing) await api.deleteGrowthGuideEntry(id);
      else {
        const saved = await api.saveGrowthGuideEntry({ itemKey: id, kind, state: value, completedAt });
        setChecklist(current => ({ ...current, [id]: { state: saved.state, completedAt: saved.completedAt, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy } }));
      }
    } catch {
      setChecklist(previous);
      setSyncError('没有保存到家庭共享档案，请检查网络后重试。');
      throw new Error('没有保存到家庭共享档案，请检查网络后重试。');
    } finally { setSyncingKey(null); }
  }

  async function toggleChecklist(id: string, kind: GrowthGuideEntryKind, value: ChecklistState) {
    const removing = checklist[id]?.state === value;
    try { await persistChecklist(id, kind, value, removing ? null : new Date().toISOString(), removing); }
    catch { /* 页面级同步错误已显示 */ }
  }

  async function deleteRecord(record: MilestoneRecord) {
    const definition = getMilestoneDefinition(record.milestoneKey);
    if (!await confirmAction({ title: '删除成长记录？', description: `将删除「${definition?.label || record.milestoneKey}」的观察记录。`, confirmLabel: '删除', danger: true })) return;
    await api.deleteMilestoneRecord(record.id); setEditing(null); await load();
  }

  const stageIndex = GROWTH_STAGES.findIndex(s => s.id === stage.id);

  return <div className="page-stack milestone-history-page growth-guide-page" data-stage={stageIndex + 1}>
    <header className="guide-topbar"><button type="button" className="guide-back" onClick={onBack} aria-label="返回档案"><ArrowLeft aria-hidden="true" /></button><div><span>宝宝档案</span><h1>成长指南</h1></div><span className="guide-region"><MapPin aria-hidden="true" />余杭区</span></header>

    <nav ref={stageNavRef} className="guide-stage-nav" aria-label="选择成长阶段">{GROWTH_STAGES.map((item, index) => {
      const relation = index < currentStageIndex ? '已走过' : index === currentStageIndex ? '当前' : '接下来';
      return <button type="button" key={item.id} className={`guide-stage-item ${item.id === stage.id ? 'active' : ''} ${relation === '当前' ? 'current' : ''}`} aria-current={relation === '当前' ? 'step' : undefined} aria-pressed={item.id === stage.id} onClick={() => { setSelectedStageId(item.id); setActivitiesExpanded(false); setAbilitiesExpanded(false); setSeasonExpanded(false); setShoppingExpanded(false); }}><span>{item.label}</span><small>{relation}</small></button>;
    })}</nav>

    <section className="guide-stage-hero" aria-labelledby="guide-stage-title"><div className="guide-stage-main"><span className="guide-stage-label">{stage.label} · {stageRelation === 'current' ? `${profile.name}当前阶段` : stageRelation === 'past' ? '已走过的阶段' : '提前了解'}</span><h2 id="guide-stage-title">{stage.title}</h2><p>{stage.summary}</p>{stageRelation !== 'current' && <em className="guide-stage-context">{stageRelation === 'past' ? '这里展示宝宝当时所处阶段的参考内容。' : '接下来可能进入这一阶段，提前了解即可，不需要预先训练。'}</em>}<span className="guide-location"><MapPin aria-hidden="true" />默认地区：{DEFAULT_GUIDE_REGION}</span></div><dl className="guide-overview-stats"><div><dt>本阶段已记录</dt><dd>{stageObservedCount}<small>项</small></dd></div><div><dt>相关事项</dt><dd>{activeTasks.length}<small>件</small></dd></div><div><dt>已准备</dt><dd>{completedCount}<small>件</small></dd></div></dl></section>

    <section className="guide-priority" aria-labelledby="guide-priority-title"><GuideHeading eyebrow={stageRelation === 'current' ? '现在最值得关注' : stage.label} title={stageRelation === 'current' ? '最近优先处理' : '本阶段重点'} id="guide-priority-title" /><div className="guide-priority-grid">
      {activeTasks.slice(0, 1).map(task => <article key={task.id}><span className="guide-priority-icon task"><ClipboardCheck /></span><div><small>余杭办事</small><strong>{task.title}</strong><p>{task.timing}</p></div></article>)}
      <article><span className="guide-priority-icon season"><Sun /></span><div><small>{seasonItems[0].season}照护</small><strong>{seasonItems[0].title}</strong><p>{seasonItems[0].description}</p></div></article>
      {stage.shopping.filter(item => item.level === 'needed').slice(0, 1).map(item => <article key={item.id}><span className="guide-priority-icon shopping"><PackageCheck /></span><div><small>提前准备</small><strong>{item.title}</strong><p>{item.reason}</p></div></article>)}
    </div></section>

    <div className="guide-content-tabs" role="tablist" aria-label="成长指南内容">{([['advice', '成长建议'], ['abilities', '宝宝会什么'], ['tasks', '办事提醒'], ['shopping', '准备清单']] as const).map(([value, label]) => <button type="button" role="tab" key={value} aria-selected={activeTab === value} className={activeTab === value ? 'active' : ''} onClick={() => setActiveTab(value)}>{label}{value === 'abilities' && <small>{relevantAbilities.length}</small>}</button>)}</div>
    {syncError && <p className="guide-sync-error" role="alert"><Info />{syncError}</p>}

    <main className="guide-tab-panel">
      {activeTab === 'advice' && <div className="guide-advice-grid"><section className="guide-section" aria-labelledby="guide-activity-title"><GuideHeading eyebrow={`${stage.label} · 轻松陪伴`} title="现在可以一起做" id="guide-activity-title" icon={<Sparkles />} /><p className="guide-section-intro">从宝宝当下感兴趣的活动开始，不需要逐项完成。</p><div className="guide-activity-list">{visibleActivities.map((activity, index) => <article key={activity.title}><span className="guide-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{activity.title}</h3><p>{activity.description}</p><small>{activity.meta}</small>{activity.safety && <em><ShieldCheck />{activity.safety}</em>}</div></article>)}</div>{stage.activities.length > 3 && <button type="button" className="guide-expand-button" aria-expanded={activitiesExpanded} onClick={() => setActivitiesExpanded(value => !value)}>{activitiesExpanded ? '收起成长建议' : `查看本阶段全部 ${stage.activities.length} 个`}<ChevronDown /></button>}</section><section className="guide-section seasonal-section" aria-labelledby="guide-season-title"><GuideHeading eyebrow={`杭州 · ${seasonItems[0].season}`} title="本季照护建议" id="guide-season-title" icon={<Sun />} /><div className="guide-season-list">{seasonItems.slice(0, seasonExpanded ? seasonItems.length : 2).map(item => <article key={item.title}><span /><div><h3>{item.title}</h3><p>{item.description}</p><a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceLabel}<ExternalLink /></a></div></article>)}</div>{seasonItems.length > 2 && <button type="button" className="guide-expand-button" aria-expanded={seasonExpanded} onClick={() => setSeasonExpanded(value => !value)}>{seasonExpanded ? '收起季节建议' : `查看全部 ${seasonItems.length} 条建议`}<ChevronDown /></button>}</section></div>}

      {activeTab === 'abilities' && <section className="guide-section ability-section" aria-labelledby="guide-ability-title"><GuideHeading eyebrow="成长观察" title="宝宝可能会什么" id="guide-ability-title" icon={<Baby />} /><p className="guide-section-intro">这是本阶段常见的能力参考，不是必须完成的测试。已记录能力优先展示。</p>{loading ? <div className="guide-skeleton"><span /><span /><span /></div> : <><ul className="guide-ability-list">{visibleAbilities.map(definition => {
        const record = recordMap.get(definition.key) ?? null;
        return <li key={definition.key} className={record ? 'observed' : ''}><MilestoneBadge milestoneKey={definition.key} status={record ? 'achieved' : stageRelation === 'current' ? 'pending' : 'upcoming'} /><div><strong>{definition.label}</strong><p>{definition.description}</p><small>{record ? `${formatRecordDate(record.achievedOn)}记录 · ${MILESTONE_CATEGORY_LABELS[definition.category]}` : `${formatWholeMonths(definition.whoMonthsRange)}常见 · ${MILESTONE_CATEGORY_LABELS[definition.category]} · ${stageRelation === 'current' ? '最近可以留意' : stageRelation === 'past' ? '当时的能力参考' : '提前了解'}`}</small></div>{manager && (record ? <button type="button" className="guide-recorded-button" aria-label="宝宝会了" onClick={() => setEditing({ definition, record })}><Check /><span>宝宝会了</span></button> : <button type="button" className="guide-record-button" onClick={() => setEditing({ definition, record: null })}>记录</button>)}</li>;
      })}</ul>{relevantAbilities.length > 4 && <button type="button" className="guide-expand-button" aria-expanded={abilitiesExpanded} onClick={() => setAbilitiesExpanded(value => !value)}>{abilitiesExpanded ? '收起能力列表' : `查看本阶段全部 ${relevantAbilities.length} 项`}<ChevronDown /></button>}</>}</section>}

      {activeTab === 'tasks' && <section className="guide-section" aria-labelledby="guide-tasks-title"><GuideHeading eyebrow={DEFAULT_GUIDE_REGION} title="本阶段办事提醒" id="guide-tasks-title" icon={<CalendarCheck />} /><div className="guide-task-list">{activeTasks.map(task => {
        const done = checklist[task.id]?.state === 'done';
        return <article key={task.id} className={done ? 'done' : ''}><div className="guide-task-top"><span>{task.timing}</span>{done && <em><Check />已办理</em>}</div><h3>{task.title}</h3><p>{task.description}</p><details><summary>查看材料与办理依据 <ChevronDown /></summary><p>{task.materials}</p><a href={task.sourceUrl} target="_blank" rel="noreferrer">{task.sourceLabel}<ExternalLink /></a><small>适用地区：{DEFAULT_GUIDE_REGION} · 核验于 {GUIDE_VERIFIED_ON}</small></details><div className="guide-task-actions"><button type="button" className={done ? 'active' : ''} disabled={syncingKey === task.id} onClick={() => setEditingGuideEntry({ id: task.id, kind: 'task', title: task.title, entry: checklist[task.id] })}><Check />{syncingKey === task.id ? '同步中…' : done ? '修改办理日期' : '标记已办理'}</button><button type="button" disabled={syncingKey === task.id} onClick={() => void toggleChecklist(task.id, 'task', 'skip')}>{checklist[task.id]?.state === 'skip' ? '已设为不适用' : '不适用于我'}</button></div></article>;
      })}{activeTasks.length === 0 && <div className="guide-task-empty"><ClipboardCheck /><div><strong>本阶段暂无特殊办事</strong><p>例行儿保和常规预防接种不在这里重复提醒，请按医疗机构或接种门诊的安排进行。</p></div></div>}</div></section>}

      {activeTab === 'shopping' && <section className="guide-section shopping-section" aria-labelledby="guide-shopping-title"><GuideHeading eyebrow={stage.label} title="本阶段准备清单" id="guide-shopping-title" icon={<PackageCheck />} /><div className="guide-filter" role="group" aria-label="筛选准备清单">{([['all', '全部'], ['needed', '建议准备'], ['optional', '按需'], ['skip', '不必提前买']] as const).map(([value, label]) => <button type="button" key={value} className={shoppingFilter === value ? 'active' : ''} aria-pressed={shoppingFilter === value} onClick={() => { setShoppingFilter(value); setShoppingExpanded(false); }}>{label}</button>)}</div><ul className="guide-shopping-list">{visibleShopping.map(item => {
        const done = checklist[`shop:${item.id}`]?.state === 'done';
        return <li key={item.id} className={done ? 'done' : ''}><button type="button" className="guide-check" disabled={syncingKey === `shop:${item.id}`} onClick={() => setEditingGuideEntry({ id: `shop:${item.id}`, kind: 'shopping', title: item.title, entry: checklist[`shop:${item.id}`] })} aria-label={`${done ? '修改准备日期' : '标记已准备'}：${item.title}`}>{done && <Check />}</button><div><span className={`guide-level ${item.level}`}>{item.level === 'needed' ? '建议准备' : item.level === 'optional' ? '按需选择' : '通常不必买'}</span><h3>{item.title}</h3><p>{item.reason}</p><small>{item.tip}</small></div></li>;
      })}</ul>{shoppingFilter === 'all' && stage.shopping.length > 3 && <button type="button" className="guide-expand-button" aria-expanded={shoppingExpanded} onClick={() => setShoppingExpanded(value => !value)}>{shoppingExpanded ? '收起准备清单' : `查看本阶段全部 ${stage.shopping.length} 项`}<ChevronDown /></button>}<p className="guide-local-note"><Info />准备状态会同步到家庭共享档案；本指南不提供品牌、价格或购买链接。</p></section>}
    </main>

    <section className="guide-section guide-history-section" aria-labelledby="guide-history-title">
      <GuideHeading eyebrow={historyScope === 'stage' ? `${stage.label} · 家庭共享档案` : '按宝宝当时月龄归档'} title={historyScope === 'stage' ? '本阶段成长历史' : '全部成长历史'} id="guide-history-title" icon={<Clock3 />} />
      <div className="guide-history-controls">
        <div className="guide-history-scope" role="group" aria-label="选择历史范围">{([['stage', '本阶段'], ['all', '全部阶段']] as const).map(([value, label]) => <button type="button" key={value} className={historyScope === value ? 'active' : ''} aria-pressed={historyScope === value} onClick={() => setHistoryScope(value)}>{label}</button>)}</div>
        <div className="guide-filter guide-history-filter" role="group" aria-label="筛选成长历史">{([['all', '全部'], ['ability', '宝宝能力'], ['task', '已办事项'], ['shopping', '已备用品']] as const).map(([value, label]) => <button type="button" key={value} className={historyFilter === value ? 'active' : ''} aria-pressed={historyFilter === value} onClick={() => setHistoryFilter(value)}>{label}</button>)}</div>
      </div>
      {historyScope === 'stage' ? (selectedHistoryGroup ? <GuideHistoryList items={selectedHistoryGroup.items} /> : <div className="guide-history-empty"><Clock3 /><p>{stage.label}还没有这一类记录。切换记录类型，或查看全部阶段的家庭历史。</p></div>) : (allHistoryGroups.length === 0 ? <div className="guide-history-empty"><Clock3 /><p>还没有这一类记录。标记宝宝能力、办理事项或准备用品后，会在这里按阶段展示。</p></div> : <div className="guide-history-groups">{allHistoryGroups.map(group => {
        const counts = { ability: group.items.filter(item => item.kind === 'ability').length, task: group.items.filter(item => item.kind === 'task').length, shopping: group.items.filter(item => item.kind === 'shopping').length };
        const summary = [[counts.ability, '能力'], [counts.task, '办事'], [counts.shopping, '用品']].filter(([count]) => Number(count) > 0).map(([count, label]) => `${label} ${count}`).join(' · ');
        return <section key={group.id}><header className="guide-history-group-heading"><span><small>{group.label}{group.id === currentStage.id ? ' · 当前阶段' : ''}</small><strong>{group.title}</strong></span><span className="guide-history-summary">{summary}</span></header><GuideHistoryList items={group.items} /></section>;
      })}</div>)}
      <p className="guide-local-note"><Info />能力、办事和用品历史均来自家庭共享档案。</p>
    </section>

    <aside className="guide-disclaimer"><Info /><div><strong>指南不是诊断或强制任务</strong><p>月龄、能力和用品内容用于日常参考；办事政策、材料和渠道可能调整，请以浙里办及办理部门最新要求为准。如对宝宝健康或发育有持续担心，请携带近期记录咨询专业人员。</p></div></aside>

    {editing && <AbilityEditor definition={editing.definition} record={editing.record} profile={profile} onClose={() => setEditing(null)} onSaved={load} onDelete={editing.record ? () => void deleteRecord(editing.record!) : undefined} />}
    {editingGuideEntry && <GuideEntryEditor target={editingGuideEntry} profile={profile} onClose={() => setEditingGuideEntry(null)} onSave={completedAt => persistChecklist(editingGuideEntry.id, editingGuideEntry.kind, 'done', completedAt)} onRemove={() => persistChecklist(editingGuideEntry.id, editingGuideEntry.kind, 'done', null, true)} />}
  </div>;
}

function GuideHeading({ eyebrow, title, id, icon }: { eyebrow: string; title: string; id: string; icon?: React.ReactNode }) {
  return <div className="guide-section-heading"><div><span>{eyebrow}</span><h2 id={id}>{title}</h2></div>{icon}</div>;
}

function GuideHistoryList({ items }: { items: GuideHistoryItem[] }) {
  return <ol className="guide-history-list">{items.map(item => <li key={item.id}><span className={`guide-history-icon ${item.kind}`}>{item.kind === 'ability' ? <Baby /> : item.kind === 'task' ? <ClipboardCheck /> : <PackageCheck />}</span><div><time>{formatHistoryDate(item.date)}</time><h3>{item.title}</h3><p>{item.detail}</p></div></li>)}</ol>;
}
