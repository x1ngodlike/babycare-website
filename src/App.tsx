// 应用主组件：会话、数据加载、实时刷新、离线同步与页面切换。
// 视图组件已拆到 src/views/（Today / History / RecordEditor / RecordDialogs / Settings / Trends / Archive / Chat）。
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { api, ApiError, setBaseUrl } from './api';
import { addDays, isoDay } from './date';
import { createUuid } from './id';
import { cacheProfile, cacheRecords, clearRememberedUser, getCachedProfile, getCachedRecords, getOutbox, getRememberedUser, queueAction, rememberUser, setOutbox } from './offline';
import { blankDraft, canManage, emptyCapabilities, familyMembers, optimisticRecord, roleNames, summary, weekContains, type ThemeMode, auditNames } from './shared';
import { confirmAction } from './ui';
import { usePullToRefresh } from './usePullToRefresh';
import { syncNativeVaccineReminders } from './native';
import { VaccineEditor, type VaccineEditorState } from './VaccineViews';
import type { VaccinePlanItem } from './vaccines';
import { TodayView } from './views/Today';
import { HistoryView } from './views/History';
import { RecordEditor } from './views/RecordEditor';
import { AuditDialog, GrowthEditor } from './views/RecordDialogs';
import { useAutoConnect } from './hooks/useAutoConnect';
import type { Capabilities, CareItem, CareRecord, DraftGrowthRecord, DraftRecord, DraftVaccineRecord, FamilyId, GrowthRecord, Profile, PushStatus, SessionUser, Supplement, VaccineCatalogItem, VaccineRecord } from './types';

// 低频页面按需加载，配合 main.tsx 空闲预取与 Service Worker 运行时缓存
const TrendsView = lazy(() => import('./views/Trends'));
const ArchiveView = lazy(() => import('./views/Archive'));
const SettingsView = lazy(() => import('./views/Settings'));
const ChatView = lazy(() => import('./views/Chat'));

type Tab = 'today' | 'history' | 'chat' | 'trends' | 'archive' | 'settings';
type ChangeScope = 'records' | 'profile' | 'all';
type ToastState = { message: string; actionLabel?: string; onAction?: () => void | Promise<void> };

function Login({ onSuccess }: { onSuccess: (user: SessionUser) => void }) {
  const [identity, setIdentity] = useState<FamilyId>('father');
  const [loginMembers, setLoginMembers] = useState(familyMembers);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.loginOptions().then(items => setLoginMembers(items.map(item => ({ ...item, role: roleNames[item.role], icon: familyMembers.find(member => member.id === item.id)!.icon })))).catch(() => undefined); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api.login(identity, password); onSuccess(result.user); }
    catch (err) { setError(err instanceof Error ? err.message : '登录失败'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card">
    <div className="brand-bear"><img src="/illustrations/login-family.webp" alt="" /></div>
    <h1>宝宝照护记录</h1>
    <p className="supporting">家人共享同一份喂养、用药和排便记录。</p>
    <form onSubmit={submit}><fieldset className="identity-picker"><legend>选择身份</legend><div>{loginMembers.map(member => <button type="button" key={member.id} aria-pressed={identity === member.id} className={identity === member.id ? 'selected' : ''} onClick={() => { setIdentity(member.id); setPassword(''); }}><img src={member.icon} alt="" /><b>{member.name}</b><small>{member.role}</small></button>)}</div></fieldset>
      <label>{loginMembers.find(member => member.id === identity)?.name}的密码<input autoFocus type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
      {error && <p className="error-text" role="alert">{error}</p>}<button className="btn primary full" disabled={busy || !password}>{busy ? '登录中…' : '进入记录'}</button>
    </form>
  </section></main>;
}

export default function App() {
  const [startupUser] = useState<SessionUser | null>(() => window.BabyCareNative ? getRememberedUser() : null);
  const connection = useAutoConnect();
  const [authenticated, setAuthenticated] = useState<boolean | null>(() => startupUser ? true : null);
  const [profile, setProfile] = useState<Profile>(getCachedProfile() || { name: '示例宝宝', birthDate: '2026-01-01', sex: 'unspecified', nickname: '', caregiverTitle: '妈妈', avatar: null });
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(startupUser);
  const [records, setRecords] = useState<CareRecord[]>(() => startupUser ? getCachedRecords(startupUser.id) : []);
  const tabRef = useRef<Tab>('today');
  const [deletedRecords, setDeletedRecords] = useState<CareRecord[]>([]); const [careItems, setCareItems] = useState<CareItem[]>([]);
  const [growthRecords, setGrowthRecords] = useState<GrowthRecord[]>([]); const [deletedGrowthRecords, setDeletedGrowthRecords] = useState<GrowthRecord[]>([]);
  const [vaccineRecords, setVaccineRecords] = useState<VaccineRecord[]>([]);
  const [vaccineRecordsReady, setVaccineRecordsReady] = useState(false);
  const [vaccineCatalog, setVaccineCatalog] = useState<VaccineCatalogItem[]>([]);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [todayPlanStatus, setTodayPlanStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tab, setTab] = useState<Tab>('today'); const [selectedDate, setSelectedDate] = useState(new Date()); const [historyMode, setHistoryMode] = useState<'care' | 'vaccine'>('care'); const [archiveMode, setArchiveMode] = useState<'main' | 'milestone'>('main');
  const tabScrollPositions = useRef<Partial<Record<Tab, number>>>({ today: 0 });
  const pendingTabScroll = useRef<number | null>(null);
  const goToTab = useCallback((next: Tab, restorePosition = true) => {
    if (next === tab) {
      if (!restorePosition) window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    tabScrollPositions.current[tab] = window.scrollY;
    pendingTabScroll.current = restorePosition ? (tabScrollPositions.current[next] ?? 0) : 0;
    setTab(next);
  }, [tab]);
  useLayoutEffect(() => {
    if (pendingTabScroll.current === null) return;
    const top = pendingTabScroll.current;
    pendingTabScroll.current = null;
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top, behavior: 'auto' }));
    return () => window.cancelAnimationFrame(frame);
  }, [tab]);
  const chatHistoryPushed = useRef(false);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => {
    if (tab === 'chat' && !chatHistoryPushed.current) {
      window.history.pushState({ babycareChat: true }, '');
      chatHistoryPushed.current = true;
    }
  }, [tab]);
  useEffect(() => {
    const pop = () => {
      if (tabRef.current === 'chat' && window.history.state?.babycareChat) {
        chatHistoryPushed.current = false;
        goToTab('today');
      }
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [goToTab]);
  useEffect(() => {
    (window as Window & { babycareHandleBack?: () => boolean }).babycareHandleBack = () => {
      if (tabRef.current === 'chat') {
        chatHistoryPushed.current = false;
        goToTab('today');
        return true;
      }
      return false;
    };
    return () => { delete (window as Window & { babycareHandleBack?: () => boolean }).babycareHandleBack; };
  }, [goToTab]);
  useEffect(() => {
    const openNotification = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      if (target === 'vaccine') { setHistoryMode('vaccine'); goToTab('history', false); }
      else goToTab('today', false);
    };
    window.addEventListener('babycare:native-notification-open', openNotification);
    return () => window.removeEventListener('babycare:native-notification-open', openNotification);
  }, [goToTab]);
  const [editor, setEditor] = useState<DraftRecord | null>(null); const [auditRecord, setAuditRecord] = useState<CareRecord | null>(null);
  const [growthEditor, setGrowthEditor] = useState<GrowthRecord | 'new' | null>(null);
  const [vaccineEditor, setVaccineEditor] = useState<VaccineEditorState | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities>(emptyCapabilities); const [online, setOnline] = useState(navigator.onLine); const [offlineSession, setOfflineSession] = useState(Boolean(startupUser)); const [pendingCount, setPendingCount] = useState(() => startupUser ? getOutbox(startupUser.id).length : 0); const [refreshing, setRefreshing] = useState(false); const [toast, setToast] = useState<ToastState | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => { try { return (localStorage.getItem('babycare-theme') as ThemeMode) || 'system'; } catch { return 'system'; } });
  const [heroBg, setHeroBg] = useState<string>(() => { try { return localStorage.getItem('babycare-hero-bg') || 'auto'; } catch { return 'auto'; } });
  const [heroWeatherEffects, setHeroWeatherEffects] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('babycare-hero-weather-effects') || '{"hero-diary":true,"hero-travel":true}'); }
    catch { return { 'hero-diary': true, 'hero-travel': true }; }
  });
  const refreshingRef = useRef(false);

  const updateLocalRecords = useCallback((userId: string, updater: (items: CareRecord[]) => CareRecord[]) => {
    setRecords(items => { const next = updater(items).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)); cacheRecords(userId, next); return next; });
  }, []);

  const loadRecords = useCallback(async () => {
    if (!currentUser) return false;
    const from = new Date('2000-01-01T00:00:00'); const to = addDays(new Date(), 8); to.setHours(0, 0, 0, 0);
    try { const next = await api.records(from.toISOString(), to.toISOString()); setRecords(next); cacheRecords(currentUser.id, next); setOnline(true); setOfflineSession(false); return true; }
    catch { setRecords(getCachedRecords(currentUser.id)); setOnline(false); return false; }
  }, [currentUser]);

  const loadRecordsToday = useCallback(async () => {
    if (!currentUser) return false;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = addDays(start, 2);
    // 往前取 7 天（含今天），供今日页"预计喂奶"计算近 7 天平均喂奶间隔
    start.setDate(start.getDate() - 7);
    try { const next = await api.records(start.toISOString(), end.toISOString()); setRecords(next); cacheRecords(currentUser.id, next); setOnline(true); setOfflineSession(false); return true; }
    catch { setRecords(getCachedRecords(currentUser.id)); setOnline(false); return false; }
  }, [currentUser]);

  const reloadRecords = useCallback(async () => {
    if (tabRef.current === 'history' || tabRef.current === 'trends') await loadRecords();
    else await loadRecordsToday();
  }, [loadRecords, loadRecordsToday]);

  const loadProfile = useCallback(async () => {
    try { const next = await api.profile(); setProfile(next); cacheProfile(next); return true; }
    catch { return false; }
  }, []);

  const loadCapabilities = useCallback(async () => {
    try { setCapabilities(await api.capabilities()); }
    catch { setCapabilities(emptyCapabilities); }
  }, []);

  const loadCareItems = useCallback(async () => { try { setCareItems(await api.careItems()); return true; } catch { return false; } }, []);
  const loadDeletedRecords = useCallback(async () => { if (!canManage(currentUser)) return; try { setDeletedRecords(await api.deletedRecords()); } catch { setDeletedRecords([]); } }, [currentUser]);
  const loadGrowthRecords = useCallback(async () => { try { setGrowthRecords(await api.growthRecords()); return true; } catch { return false; } }, []);
  const loadDeletedGrowthRecords = useCallback(async () => { if (!canManage(currentUser)) return; try { setDeletedGrowthRecords(await api.deletedGrowthRecords()); } catch { setDeletedGrowthRecords([]); } }, [currentUser]);
  const loadVaccineRecords = useCallback(async () => { try { const next = await api.vaccineRecords(); setVaccineRecords(next); setVaccineRecordsReady(true); return true; } catch { return false; } }, []);
  const loadVaccineCatalog = useCallback(async () => { try { setVaccineCatalog(await api.vaccineCatalog()); return true; } catch { return false; } }, []);
  const loadPushStatus = useCallback(async () => { try { setPushStatus(await api.pushStatus()); } catch { setPushStatus(null); } }, []);
  const testMorningDigest = useCallback(async () => { const r = await api.testMorningDigestPush(); await loadPushStatus(); return r; }, [loadPushStatus]);
  const testFeedingGap = useCallback(async (level: 'level1' | 'level2') => { const r = await api.testFeedingGapPush(level); await loadPushStatus(); return r; }, [loadPushStatus]);
  const testCareItem = useCallback(async () => { const r = await api.testCareItemPush(); await loadPushStatus(); return r; }, [loadPushStatus]);
  const savePush = useCallback(async (data: { enabled?: boolean; pushplusToken?: string; pushplusTopic?: string; morningDigestEnabled?: boolean; morningDigestTime?: string; feedingGapEnabled?: boolean; feedingGapLevel1Minutes?: number; feedingGapLevel2Minutes?: number; feedPrepEnabled?: boolean; feedPrepMinutes?: number; careItemEnabled?: boolean }) => {
    const next = await api.savePushSettings(data);
    setPushStatus(next);
    return next;
  }, []);
  const refreshSession = useCallback(async () => { try { const next = await api.session(); if (!next.authenticated || !next.user) return; setCurrentUser(current => { if (current?.id === next.user!.id && current.role === next.user!.role) return current; rememberUser(next.user!); return next.user; }); } catch { /* keep current session while offline */ } }, []);

  const refreshAll = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true; setRefreshing(true);
    try {
      const planRefresh = Promise.all([loadRecords(), loadProfile(), loadCareItems(), loadGrowthRecords(), loadVaccineRecords(), loadVaccineCatalog()])
        .then(results => setTodayPlanStatus(results[0] ? 'ready' : 'error'));
      await Promise.all([refreshSession(), loadCapabilities(), loadDeletedRecords(), loadDeletedGrowthRecords(), loadPushStatus(), planRefresh]);
    }
    finally { refreshingRef.current = false; setRefreshing(false); }
  }, [loadCapabilities, loadCareItems, loadDeletedGrowthRecords, loadDeletedRecords, loadGrowthRecords, loadProfile, loadPushStatus, loadRecords, loadVaccineCatalog, loadVaccineRecords, refreshSession]);

  const refreshRecords = useCallback(async () => {
    if (!currentUser || refreshingRef.current) return;
    refreshingRef.current = true; setRefreshing(true);
    try {
      if (canManage(currentUser)) await Promise.all([reloadRecords(), loadDeletedRecords()]);
      else await reloadRecords();
    }
    finally { refreshingRef.current = false; setRefreshing(false); }
  }, [currentUser, reloadRecords, loadDeletedRecords]);

  const refreshProfile = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true; setRefreshing(true);
    try { await loadProfile(); }
    finally { refreshingRef.current = false; setRefreshing(false); }
  }, [loadProfile]);

  const syncOutbox = useCallback(async () => {
    if (!currentUser) return;
    const queue = getOutbox(currentUser.id); const remaining = [...queue]; let discarded = 0;
    for (const action of queue) {
      try {
        if (action.action === 'create' && action.payload) await api.createRecord(action.payload);
        if (action.action === 'update' && action.payload && action.recordId) await api.updateRecord(action.recordId, action.payload);
        if (action.action === 'delete' && action.recordId) await api.deleteRecord(action.recordId);
        if (action.action === 'restore' && action.recordId) await api.restoreRecord(action.recordId);
        remaining.shift(); setOutbox(currentUser.id, remaining); setPendingCount(remaining.length);
      } catch (error) {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401) { remaining.shift(); setOutbox(currentUser.id, remaining); discarded += 1; continue; }
        break;
      }
    }
    if (queue.length && !remaining.length) { setToast({ message: discarded ? `${discarded} 条离线操作因冲突未同步` : '离线记录已同步' }); await Promise.all([reloadRecords(), loadDeletedRecords()]); }
  }, [currentUser, reloadRecords]);

  useEffect(() => {
    if (connection.status === 'connected' && connection.currentServer) {
      setBaseUrl(connection.currentServer.url);
      if (connection.isNative) setOnline(true);
    } else if (connection.status === 'failed') {
      setBaseUrl('');
      if (connection.isNative) setOnline(false);
    }
  }, [connection.status, connection.currentServer]);

  useEffect(() => {
    api.session().then(value => {
      setAuthenticated(value.authenticated);
      setCurrentUser(value.user);
      setOfflineSession(false);
      if (value.user) { rememberUser(value.user); setRecords(getCachedRecords(value.user.id)); }
      else clearRememberedUser();
    })
      .catch(() => { 
        const remembered = getRememberedUser(); 
        if (remembered) { 
          setCurrentUser(remembered); 
          setAuthenticated(true); 
          setOfflineSession(true); 
          // APP 环境下不立即设置 online=false，等 useAutoConnect 的结果
          if (!connection.isNative || connection.status !== 'connecting') {
            setOnline(false);
          }
          setRecords(getCachedRecords(remembered.id)); 
          setPendingCount(getOutbox(remembered.id).length); 
        } else { 
          setAuthenticated(false); 
          setCurrentUser(null); 
        } 
      });
  }, []);

  useEffect(() => {
    try { localStorage.setItem('babycare-theme', theme); } catch { /* ignore */ }
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (mql.matches ? 'dark' : 'light') : theme;
      document.documentElement.setAttribute('data-theme', resolved);
    };
    apply();
    if (theme === 'system') {
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    }
    return undefined;
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem('babycare-hero-bg', heroBg); } catch { /* ignore */ }
  }, [heroBg]);
  useEffect(() => {
    try { localStorage.setItem('babycare-hero-weather-effects', JSON.stringify(heroWeatherEffects)); } catch { /* ignore */ }
  }, [heroWeatherEffects]);

  useEffect(() => {
    if (!authenticated || !currentUser) return;
    setPendingCount(getOutbox(currentUser.id).length);
    setTodayPlanStatus('loading');
    loadCapabilities(); loadDeletedGrowthRecords(); loadPushStatus();
    const recordsLoad = loadRecordsToday();
    Promise.all([recordsLoad, loadProfile(), loadCareItems(), loadGrowthRecords(), loadVaccineRecords(), loadVaccineCatalog()])
      .then(results => setTodayPlanStatus(results[0] ? 'ready' : 'error'));
    recordsLoad.then(() => { if (navigator.onLine) syncOutbox(); });
  }, [authenticated, currentUser, loadCapabilities, loadCareItems, loadDeletedGrowthRecords, loadGrowthRecords, loadProfile, loadPushStatus, loadRecordsToday, loadVaccineCatalog, loadVaccineRecords, syncOutbox]);

  useEffect(() => {
    if (!vaccineRecordsReady || !window.BabyCareNative?.syncVaccineReminders) return;
    syncNativeVaccineReminders(vaccineRecords
      .filter(record => Boolean(record.appointmentOn) && !record.administeredOn && !record.deletedAt)
      .map(record => ({
        id: record.id,
        vaccineName: record.vaccineName,
        dose: record.dose,
        appointmentOn: record.appointmentOn!,
        appointmentTime: record.appointmentTime || ''
      })));
  }, [vaccineRecords, vaccineRecordsReady]);

  useEffect(() => {
    const onOnline = () => { setOnline(true); syncOutbox(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [syncOutbox]);

  useEffect(() => {
    if (!authenticated || !currentUser) return;
    if (tab === 'history' || tab === 'trends') void loadRecords();
  }, [authenticated, currentUser, tab, loadRecords]);

  useEffect(() => {
    if (!authenticated || !currentUser) return;
    let eventTimer: number | null = null;
    const pendingScope: { value: ChangeScope } = { value: 'all' };
    const baseUrl = connection.status === 'connected' && connection.currentServer ? connection.currentServer.url : '';
    const source = typeof EventSource === 'undefined' ? null : new EventSource(baseUrl + '/api/events');
    const scheduleRefresh = (scope: ChangeScope) => {
      pendingScope.value = scope;
      if (eventTimer) clearTimeout(eventTimer);
      eventTimer = window.setTimeout(() => {
        const target = pendingScope.value;
        if (target === 'records') void refreshRecords();
        else if (target === 'profile') void refreshProfile();
        else void refreshAll();
      }, 180);
    };
    if (source) {
      source.onopen = () => setOnline(true);
      source.onmessage = (event) => {
        let scope: ChangeScope = 'all';
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && (parsed.scope === 'records' || parsed.scope === 'profile' || parsed.scope === 'all')) scope = parsed.scope;
        }
        catch { /* 数据格式异常时退化为全量刷新 */ }
        scheduleRefresh(scope);
      };
    }
    const pollTimer = window.setInterval(() => {
      if (!source || source.readyState !== EventSource.OPEN) void refreshAll();
    }, 30_000);
    const visibility = () => { if (document.visibilityState === 'visible') scheduleRefresh('all'); };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      if (eventTimer) clearTimeout(eventTimer);
      clearInterval(pollTimer); source?.close(); document.removeEventListener('visibilitychange', visibility);
    };
  }, [authenticated, currentUser, connection.status, connection.currentServer, refreshAll, refreshRecords, refreshProfile]);

  async function saveOne(input: DraftRecord) {
    if (!currentUser) throw new Error('请先登录');
    const value = { ...input, id: input.id || createUuid() };
    try { value.id && records.some(item => item.id === value.id) ? await api.updateRecord(value.id, value) : await api.createRecord(value); await reloadRecords(); setToast({ message: '记录已保存' }); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      const previous = records.find(item => item.id === value.id); const optimistic = optimisticRecord(value, currentUser, previous);
      queueAction(currentUser.id, { action: previous ? 'update' : 'create', recordId: previous?.id, payload: value });
      setPendingCount(getOutbox(currentUser.id).length); updateLocalRecords(currentUser.id, items => [optimistic, ...items.filter(item => item.id !== optimistic.id)]); setOnline(false); setToast({ message: '已暂存，恢复连接后自动同步' });
    }
  }

  async function recordSupplement(supplement: Supplement) {
    try { await saveOne({ ...blankDraft('supplement'), supplement }); }
    catch (error) {
      if (error instanceof ApiError && error.code === 'DUPLICATE_SUPPLEMENT') { const existing = (error.details as { existing?: CareRecord })?.existing; setToast({ message: existing ? `${supplement} 已由${auditNames[existing.createdBy]}在 ${new Date(existing.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} 记录` : `${supplement} 今日已经记录` }); await reloadRecords(); return; }
      setToast({ message: error instanceof Error ? error.message : '用药记录失败' });
    }
  }

  async function undoDelete(record: CareRecord) {
    if (!currentUser || !canManage(currentUser)) return;
    await restoreDeleted(record);
  }

  async function remove(record: CareRecord) {
    if (!currentUser || !canManage(currentUser) || !await confirmAction({ title: `删除“${summary(record)}”？`, description: '记录会移到已删除列表，可以随后恢复。', confirmLabel: '删除记录', danger: true })) return;
    try { await api.deleteRecord(record.id); updateLocalRecords(currentUser.id, items => items.filter(item => item.id !== record.id)); await loadDeletedRecords(); setToast({ message: '记录已移到已删除', actionLabel: '撤销', onAction: () => undoDelete(record) }); }
    catch (error) {
      if (error instanceof ApiError) { setToast({ message: error.message }); return; }
      queueAction(currentUser.id, { action: 'delete', recordId: record.id });
      updateLocalRecords(currentUser.id, items => items.filter(item => item.id !== record.id));
      setPendingCount(getOutbox(currentUser.id).length); setOnline(false);
      setToast({ message: '删除已暂存，联网后自动同步', actionLabel: '撤销', onAction: () => undoDelete(record) });
    }
  }

  async function restoreDeleted(record: CareRecord) {
    if (!currentUser) return;
    try { await api.restoreRecord(record.id); await Promise.all([reloadRecords(), loadDeletedRecords()]); setToast({ message: '记录已恢复' }); }
    catch (error) {
      if (error instanceof ApiError) { setToast({ message: error.message }); return; }
      queueAction(currentUser.id, { action: 'restore', recordId: record.id });
      updateLocalRecords(currentUser.id, items => items.some(item => item.id === record.id) ? items : [record, ...items]);
      setDeletedRecords(items => items.filter(item => item.id !== record.id));
      setPendingCount(getOutbox(currentUser.id).length); setOnline(false);
      setToast({ message: '恢复已暂存，联网后自动同步' });
    }
  }
  async function purgeDeleted(record: CareRecord) { if (!await confirmAction({ title: `彻底删除“${summary(record)}”？`, description: '删除后无法恢复。', confirmLabel: '彻底删除', danger: true })) return; try { await api.purgeRecord(record.id); await loadDeletedRecords(); setToast({ message: '记录已彻底删除' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '彻底删除失败' }); } }

  async function saveGrowth(value: DraftGrowthRecord) {
    try {
      const previous = value.id ? growthRecords.find(item => item.id === value.id) : null;
      const changed = !previous || previous.heightCm !== value.heightCm || previous.weightKg !== value.weightKg || previous.measuredOn !== value.measuredOn;
      const saved = value.id ? await api.updateGrowthRecord(value.id, value) : await api.createGrowthRecord(value);
      await loadGrowthRecords();
      setToast({ message: '成长记录已保存' });
      if (changed && canManage(currentUser) && capabilities.aiEnabled) void autoEvaluateGrowth(saved.id);
    }
    catch (error) { if (error instanceof ApiError && error.code === 'DUPLICATE_GROWTH_DAY') { const existing = (error.details as { existing?: GrowthRecord })?.existing; if (existing) setGrowthEditor(existing); } throw error; }
  }
  async function autoEvaluateGrowth(recordId: string) {
    try { await api.generateGrowthEvaluation(recordId); await loadGrowthRecords(); setToast({ message: '生长 AI 评价已生成，可在档案查看' }); }
    catch { /* AI 未配置或月龄超范围等情况静默跳过，可在档案页手动重试 */ }
  }
  async function removeGrowth(record: GrowthRecord) { if (!await confirmAction({ title: '删除这条成长记录？', description: '记录会移到档案内的已删除列表，可以随后恢复。', confirmLabel: '删除记录', danger: true })) return; try { await api.deleteGrowthRecord(record.id); await Promise.all([loadGrowthRecords(), loadDeletedGrowthRecords()]); setToast({ message: '成长记录已移到已删除' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '删除失败' }); } }
  async function restoreGrowth(record: GrowthRecord) { try { await api.restoreGrowthRecord(record.id); await Promise.all([loadGrowthRecords(), loadDeletedGrowthRecords()]); setToast({ message: '成长记录已恢复' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '恢复失败' }); } }
  async function purgeGrowth(record: GrowthRecord) { if (!await confirmAction({ title: '彻底删除这条成长记录？', description: '删除后无法恢复。', confirmLabel: '彻底删除', danger: true })) return; try { await api.purgeGrowthRecord(record.id); await loadDeletedGrowthRecords(); setToast({ message: '成长记录已彻底删除' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '彻底删除失败' }); } }

  async function saveVaccine(value: DraftVaccineRecord) {
    try { value.id ? await api.updateVaccineRecord(value.id, value) : await api.createVaccineRecord(value); await loadVaccineRecords(); setToast({ message: value.administeredOn ? '接种记录已保存' : value.appointmentOn ? '门诊预约已保存' : '预约已取消' }); }
    catch (error) { if (error instanceof ApiError && error.code === 'DUPLICATE_VACCINE_RECORD') throw new Error('这针疫苗已经记录，可以直接修改已有记录'); throw error; }
  }
  async function removeVaccine(record: VaccineRecord) { if (!await confirmAction({ title: `删除“${record.vaccineName} · 第${record.dose}剂”？`, description: '删除后无法恢复，确定删除这条接种记录吗？', confirmLabel: '确认删除', danger: true })) return; try { await api.deleteVaccineRecord(record.id); await loadVaccineRecords(); setToast({ message: '疫苗记录已删除' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '删除失败' }); } }
  async function cancelVaccineAppointment(item: VaccinePlanItem) { const record = item.record; if (!record?.appointmentOn || !await confirmAction({ title: `取消“${item.vaccineName} · 第${item.dose}剂”的预约？`, description: item.hasSuggestedDate ? '仅清除门诊预约时间，系统建议接种日期仍会保留。' : '这项门诊预约和对应提醒将一起移除。', confirmLabel: '取消预约', danger: true })) return; try { if (item.hasSuggestedDate) await api.updateVaccineRecord(record.id, { id: record.id, vaccineName: record.vaccineName, category: record.category, dose: record.dose, plannedOn: record.plannedOn, appointmentOn: null, appointmentTime: null, administeredOn: record.administeredOn, note: record.note }); else await api.deleteVaccineRecord(record.id); await loadVaccineRecords(); setToast({ message: '门诊预约已取消' }); } catch (error) { setToast({ message: error instanceof Error ? error.message : '取消预约失败' }); } }
  function openVaccines() { setHistoryMode('vaccine'); goToTab('history', false); }

  const todayRecords = useMemo(() => records.filter(r => isoDay(new Date(r.occurredAt)) === isoDay(new Date())), [records]);
  const weeklyGrowth = growthRecords.find(record => weekContains(record));
  const isChatPage = tab === 'chat';
  const pull = usePullToRefresh(Boolean(authenticated && currentUser && (tab === 'today' || tab === 'history' || tab === 'archive') && !editor && !growthEditor && !vaccineEditor && !auditRecord), reloadRecords);

  if (authenticated === null) return <main className="loading-page"><i className="loading-indicator" aria-hidden="true" /><p>正在打开照护记录…</p></main>;
  if (!authenticated || !currentUser) return <Login onSuccess={user => { rememberUser(user); setCurrentUser(user); setRecords(getCachedRecords(user.id)); setAuthenticated(true); setOfflineSession(false); }} />;
  const currentMember = familyMembers.find(member => member.id === currentUser.id)!;
  const isConnectionFailed = connection.status === 'failed';
  const connectionLabel = isConnectionFailed ? '连接失败' : offlineSession ? '离线身份' : !online ? '离线' : pendingCount ? `待同步 ${pendingCount} 条` : refreshing ? '正在更新' : '已连接';
  const pullLabel = pull.phase === 'refreshing' ? '正在更新' : pull.phase === 'done' ? '已更新' : pull.phase === 'ready' ? '松开刷新' : '继续下拉刷新';
  const pullOffset = pull.phase === 'refreshing' || pull.phase === 'done' ? 8 : Math.min(8, pull.distance - 44);
  return <div className="app">{pull.phase !== 'idle' && <div className={`pull-indicator ${pull.phase}`} style={{ transform: `translate(-50%, ${pullOffset}px)` }} role="status"><i aria-hidden="true" />{pullLabel}</div>}{!isChatPage && <div className="top-status"><button className="user-pill" onClick={() => goToTab('settings')} aria-label={`打开设置，当前身份${currentUser.name}${roleNames[currentUser.role]}`}><img src={currentMember.icon} alt="" /><b>{currentUser.name}</b><span>{roleNames[currentUser.role]}</span></button>{(isConnectionFailed || !online || pendingCount > 0 || refreshing || offlineSession) && <div className={`network-pill ${isConnectionFailed ? 'offline' : online ? refreshing ? 'syncing' : '' : 'offline'}`} role="status" aria-live="polite">{connectionLabel}</div>}</div>}
    {toast && <div className={`toast ${toast.actionLabel ? 'with-action' : ''}`} onAnimationEnd={() => !toast.actionLabel && setToast(null)} role="status" aria-live="polite"><span>{toast.message}</span>{toast.actionLabel && <button onClick={async () => { await toast.onAction?.(); }}>{toast.actionLabel}</button>}<button className="toast-close" aria-label="关闭提示" onClick={() => setToast(null)}><X aria-hidden="true" /></button></div>}
    <main className={`main-content${isChatPage ? ' chat-page-fullscreen' : ''}`}>
      <Suspense fallback={null}>
      <div className={`tab-page${isChatPage ? ' chat-tab-page' : ''}`} key={tab}>
      {tab === 'today' && <TodayView profile={profile} records={todayRecords} recentRecords={records} vaccineRecords={vaccineRecords} vaccineCatalog={vaccineCatalog} careItems={careItems} todayPlanStatus={todayPlanStatus} capabilities={capabilities} manager={canManage(currentUser)} superadmin={currentUser?.role === 'superadmin'} userId={currentUser.id} weeklyGrowth={weeklyGrowth} feedPrepEnabled={pushStatus?.feedPrepEnabled ?? true} feedPrepMinutes={pushStatus?.feedPrepMinutes ?? 30} onAddGrowth={() => setGrowthEditor('new')} onAdd={type => setEditor(blankDraft(type))} online={online} heroBg={heroBg} weatherEffectsEnabled={heroWeatherEffects[heroBg] !== false} onOpenSettings={() => goToTab('settings')} onCompleteVaccine={item => setVaccineEditor({ mode: 'complete', item })} onAppointmentVaccine={item => setVaccineEditor({ mode: 'appointment', item })} onSupplement={recordSupplement} onEdit={setEditor} onDelete={remove} onAudit={setAuditRecord} />}
      {tab === 'history' && <HistoryView records={records} deletedRecords={deletedRecords} vaccineRecords={vaccineRecords} vaccineCatalog={vaccineCatalog} profile={profile} historyMode={historyMode} setHistoryMode={setHistoryMode} careItems={careItems} manager={canManage(currentUser)} selected={selectedDate} setSelected={setSelectedDate} onEdit={setEditor} onDelete={remove} onAudit={setAuditRecord} onLoadDeleted={loadDeletedRecords} onRestore={restoreDeleted} onPurge={purgeDeleted} onOpenVaccineEditor={setVaccineEditor} onCancelVaccineAppointment={item => void cancelVaccineAppointment(item)} onDeleteVaccine={record => void removeVaccine(record)} />}
      {tab === 'chat' && <ChatView user={currentUser} capabilities={capabilities} online={online} onBack={() => goToTab('today')} />}
      {tab === 'trends' && <TrendsView records={records} careItems={careItems} />}
      {tab === 'archive' && <ArchiveView profile={profile} growthRecords={growthRecords} deletedGrowthRecords={deletedGrowthRecords} vaccineRecords={vaccineRecords} vaccineCatalog={vaccineCatalog} user={currentUser} archiveMode={archiveMode} setArchiveMode={setArchiveMode} onOpenVaccines={openVaccines} onEditGrowth={setGrowthEditor} onAddGrowth={() => setGrowthEditor('new')} onDeleteGrowth={removeGrowth} onRestoreGrowth={restoreGrowth} onPurgeGrowth={purgeGrowth} onProfileSaved={value => { setProfile(value); setToast({ message: '宝宝资料已保存' }); }} />}
      {tab === 'settings' && <SettingsView profile={profile} careItems={careItems} vaccineCatalog={vaccineCatalog} capabilities={capabilities} user={currentUser} pushStatus={pushStatus} theme={theme} onThemeChange={setTheme} heroBg={heroBg} onHeroBgChange={setHeroBg} heroWeatherEffects={heroWeatherEffects} onHeroWeatherEffectsChange={(value, enabled) => setHeroWeatherEffects(current => ({ ...current, [value]: enabled }))} onProfileSaved={value => { setProfile(value); setToast({ message: '宝宝资料已保存' }); }} onVaccineCatalogChanged={async () => { await loadVaccineCatalog(); }} onCapabilitiesChanged={loadCapabilities} onCareItemsChanged={async () => { await loadCareItems(); }} onImported={refreshAll} onLogout={async () => { try { await api.logout(); } catch { /* local logout still succeeds */ } clearRememberedUser(); setAuthenticated(false); setCurrentUser(null); setRecords([]); setDeletedRecords([]); setGrowthRecords([]); setDeletedGrowthRecords([]); setVaccineRecords([]); setVaccineRecordsReady(false); setVaccineCatalog([]); setPushStatus(null); }} onRefreshPush={loadPushStatus} onTestMorning={testMorningDigest} onTestFeedingGap={testFeedingGap} onTestCareItem={testCareItem} onSavePush={savePush} />}
      </div>
      </Suspense>
    </main>
    {!isChatPage && <nav className="app-nav" aria-label="主要导航">
      {([
        ['today', '/icons/nav-today.png', '今日'],
        ['history', '/icons/nav-records.png', '记录'],
        ['chat', '/icons/nav-chat.png', 'AI 助手'],
        ['trends', '/icons/nav-trends.png', '趋势'],
        ['archive', '/icons/nav-archive.png', '档案']
      ] as [Tab, string, string][]).map(([value, icon, label]) => (
        <button key={value} aria-current={tab === value ? 'page' : undefined} className={tab === value ? 'active' : ''} onClick={() => goToTab(value)}>
          <img src={icon} alt="" />
          <b>{label}</b>
        </button>
      ))}
    </nav>}
    {tab === 'today' && !isChatPage && <button type="button" className="floating-add" onClick={() => setEditor(blankDraft())} aria-label="添加照护记录"><Plus aria-hidden="true" /><b>记录</b></button>}
    {editor && <RecordEditor initial={editor} careItems={careItems} onClose={() => setEditor(null)} onSave={saveOne} />}{growthEditor && <GrowthEditor key={growthEditor === 'new' ? 'new' : growthEditor.id} profile={profile} records={growthRecords} initial={growthEditor === 'new' ? undefined : growthEditor} onClose={() => setGrowthEditor(null)} onSave={saveGrowth} />}{vaccineEditor && <VaccineEditor state={vaccineEditor} profile={profile} catalog={vaccineCatalog} records={vaccineRecords} onClose={() => setVaccineEditor(null)} onSave={saveVaccine} />}{auditRecord && <AuditDialog record={auditRecord} onClose={() => setAuditRecord(null)} />}
  </div>;
}
