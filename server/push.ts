import axios from 'axios';
import {
  enqueueAppNotification,
  getProfile,
  getPushSettings,
  hasRecentAppNotificationClient,
  listCareItems,
  listRecords,
  savePushSettings,
  writePushSentFlags,
  type FeedingGapLevel,
  type PushSentFlags
} from './db/index.js';
import { shanghaiDateString } from './shanghai-date.js';
import { buildPushPlusPerItemHtml, getLastFeedInfo, isCareItemDue, maskToken, minutesLabel, renderFeedingGapLevel, renderMorningDigest, shanghaiHHMM, type AppNotificationPayload } from './push-templates.js';
import type { CareItem, CareRecord } from './types.js';

export interface PushStatus {
  enabled: boolean;
  pushplusConfigured: boolean;
  pushplusTokenMasked: string;
  pushplusTopic: string;
  schedulerRunning: boolean;
  lastCheckAt: string | null;
  todayPushedItems: number;
  updatedAt: string | null;

  morningDigestEnabled: boolean;
  morningDigestTime: string;
  morningDigestTodaySent: boolean;
  feedingGapEnabled: boolean;
  feedingGapLevel1Minutes: number;
  feedingGapLevel2Minutes: number;
  careItemEnabled: boolean;
  currentFeedingGapMinutes: number | null;
  feedingGapLevel: FeedingGapLevel;
  lastFeedAt: string | null;
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let lastCheckAt: string | null = null;
const pushedToday = new Set<string>();
let pushedTodayDate = '';

function resetDaily() {
  const today = shanghaiDateString();
  if (pushedTodayDate !== today) {
    pushedToday.clear();
    pushedTodayDate = today;
  }
}

// -------- Dispatch --------

async function dispatchMessage(pushplusTitle: string, pushplusContent: string, app?: AppNotificationPayload, options: { forcePushPlus?: boolean; allowPushPlus?: boolean } = {}) {
  const settings = getPushSettings();
  const results: Array<{ channel: 'app' | 'pushplus'; ok: boolean; error?: string }> = [];
  if (app && hasRecentAppNotificationClient()) {
    enqueueAppNotification(app);
    results.push({ channel: 'app', ok: true });
  }
  if ((options.forcePushPlus || (settings.enabled && options.allowPushPlus !== false)) && settings.pushplusToken) {
    const result = await sendPushPlusMessage(pushplusTitle, pushplusContent, 'html');
    results.push({ channel: 'pushplus', ...result });
  }
  if (results.length === 0) return { ok: false, error: '没有可用的推送通道', results };
  return { ok: results.some(result => result.ok), results };
}

// -------- Core push functions --------

export function getPushStatus(): PushStatus {
  resetDaily();
  const settings = getPushSettings();
  const flags = settings.pushSentFlags;
  const todayStr = shanghaiDateString();
  const info = getLastFeedInfo();
  let level: FeedingGapLevel = 'none';
  if (info.record && info.gapMinutes !== null) {
    const l1 = settings.feedingGapLevel1Minutes;
    const l2 = settings.feedingGapLevel2Minutes;
    if (info.gapMinutes >= l2) level = 'level2';
    else if (info.gapMinutes >= l1) level = 'level1';
  }
  return {
    enabled: settings.enabled,
    pushplusConfigured: Boolean(settings.pushplusToken),
    pushplusTokenMasked: maskToken(settings.pushplusToken),
    pushplusTopic: settings.pushplusTopic,
    schedulerRunning: schedulerTimer !== null,
    lastCheckAt,
    todayPushedItems: pushedToday.size,
    updatedAt: settings.updatedAt || null,

    morningDigestEnabled: settings.morningDigestEnabled,
    morningDigestTime: settings.morningDigestTime,
    morningDigestTodaySent: flags.morningDigestDate === todayStr,
    feedingGapEnabled: settings.feedingGapEnabled,
    feedingGapLevel1Minutes: settings.feedingGapLevel1Minutes,
    feedingGapLevel2Minutes: settings.feedingGapLevel2Minutes,
    careItemEnabled: settings.careItemEnabled,
    currentFeedingGapMinutes: info.gapMinutes,
    feedingGapLevel: (flags.feedingGapNotifiedLevel && level !== 'none') ? flags.feedingGapNotifiedLevel : level,
    lastFeedAt: info.record ? info.record.occurredAt : null
  };
}

export async function updatePushSettings(input: { enabled?: boolean; pushplusToken?: string; pushplusTopic?: string; morningDigestEnabled?: boolean; morningDigestTime?: string; feedingGapEnabled?: boolean; feedingGapLevel1Minutes?: number; feedingGapLevel2Minutes?: number; careItemEnabled?: boolean }) {
  savePushSettings(input);
  startPushScheduler();
  return getPushStatus();
}

export async function sendPushPlusMessage(title: string, content: string, template: 'html' | 'txt' | 'markdown' | 'json' = 'txt') {
  const settings = getPushSettings();
  if (!settings.pushplusToken) return { ok: false, error: 'PushPlus Token 未配置' };
  const payload: Record<string, unknown> = { token: settings.pushplusToken, title, content, template };
  if (settings.pushplusTopic) payload.topic = settings.pushplusTopic;
  try {
    const response = await axios.post('https://www.pushplus.plus/send', payload, {
      headers: { 'Content-Type': 'application/json' }, timeout: 15_000
    });
    const data = response.data as { code: number; msg: string; data?: unknown };
    return data.code === 200 ? { ok: true } : { ok: false, error: data.msg || 'PushPlus 推送失败' };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function testMorningDigestPush() {
  const now = new Date();
  const rendered = renderMorningDigest(now);
  if (!rendered) {
    const profile = getProfile();
    const fallbackTitle = '🔔 宝宝照护 · 早报测试';
    const fallbackHtml = profile
      ? `<div style="padding:14px 16px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;"><h3 style="margin:0 0 12px;">☀️ ${profile.name} 早报测试</h3><p>如果看到这条消息，说明早报推送配置正确。</p></div>`
      : '<div style="padding:14px 16px;"><p>🔔 早报推送测试：请先完善宝宝资料。</p></div>';
    return dispatchMessage(fallbackTitle, fallbackHtml, {
      type: 'morning', title: '宝宝早报 · 测试', body: '测试成功。以后每天的宝宝早报会显示在这里。', target: 'today'
    }, { forcePushPlus: true });
  }
  return dispatchMessage(rendered.pushplusTitle, rendered.pushplusHtml, rendered.app, { forcePushPlus: true });
}

export async function testCareItemPush() {
  const items = listCareItems().filter(i => i.active);
  let item: CareItem | undefined = items.find(i => i.icon === 'medicine');
  if (!item) item = items[0];
  if (!item) {
    const testItem: CareItem = {
      id: 'test-care-item',
      name: '维生素D3',
      category: 'medication',
      icon: 'medicine',
      scheduleType: 'daily',
      intervalDays: 1,
      scheduleStartDate: shanghaiDateString(new Date()),
      scheduleEndDate: null,
      reminderTime: '08:00',
      reminderTimes: null,
      weekDays: null,
      patternDays: null,
      sortOrder: 0,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const rendered = buildPushPlusPerItemHtml(testItem);
    return dispatchMessage(rendered.title, rendered.html, rendered.app, { forcePushPlus: true });
  }
  const rendered = buildPushPlusPerItemHtml(item);
  return dispatchMessage(rendered.title, rendered.html, rendered.app, { forcePushPlus: true });
}

export async function testFeedingGapPush(level: 'level1' | 'level2' = 'level1') {
  const now = new Date();
  // Use most recent feed record if available; otherwise build a synthetic feed for testing
  let lastFeed = getLastFeedInfo(now).record;
  let gapMinutes = lastFeed ? (() => {
    const g = Math.floor((now.getTime() - new Date(lastFeed.occurredAt).getTime()) / 60_000);
    return Math.max(0, g);
  })() : -1;

  const settings = getPushSettings();
  const l1 = Math.max(30, settings.feedingGapLevel1Minutes);
  let l2 = settings.feedingGapLevel2Minutes;
  if (l2 <= l1) l2 = l1 + 30;
  const targetGap = level === 'level1' ? l1 : l2;

  if (!lastFeed || gapMinutes < targetGap) {
    const offsetMs = targetGap * 60_000;
    const syntheticTime = new Date(now.getTime() - offsetMs).toISOString();
    const list = listRecords(
      new Date(now.getTime() - 7 * 86_400_000).toISOString(),
      new Date(now.getTime() + 86_400_000).toISOString()
    ).filter(r => r.type === 'feeding').sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    if (list.length > 0) {
      // Clone the most recent feeding but adjust occurredAt to match target gap
      const original = list[0];
      lastFeed = { ...original, occurredAt: syntheticTime } as CareRecord;
    } else {
      lastFeed = {
        id: 'test-feed',
        type: 'feeding',
        occurredAt: syntheticTime,
        breastMilkMl: 60,
        formulaMl: 60,
        subject: null,
        note: null,
        supplement: null,
        bowelSize: null,
        createdAt: syntheticTime,
        updatedAt: syntheticTime,
        createdBy: 'legacy',
        updatedBy: 'legacy',
        deletedAt: null,
        deletedBy: null
      };
    }
    gapMinutes = targetGap;
  }

  if (!lastFeed) throw new Error('无法生成喂奶间隔测试记录');
  const rendered = renderFeedingGapLevel(level, lastFeed, gapMinutes, now);
  return dispatchMessage(rendered.pushplusTitle, rendered.pushplusHtml, rendered.app, { forcePushPlus: true });
}

// ---------- 2 new triggers ----------

async function maybeSendMorningDigest(now: Date): Promise<boolean> {
  const settings = getPushSettings();
  if (!settings.morningDigestEnabled) return false;
  const flags: PushSentFlags = settings.pushSentFlags;
  const todayStr = shanghaiDateString(now);
  if (flags.morningDigestDate === todayStr) return false;
  const current = shanghaiHHMM(now);
  if (current < settings.morningDigestTime) return false;

  const rendered = renderMorningDigest(now);
  if (!rendered) return false;
  const result = await dispatchMessage(rendered.pushplusTitle, rendered.pushplusHtml, rendered.app, { allowPushPlus: settings.morningDigestEnabled });
  if (result.ok) {
    writePushSentFlags({ morningDigestDate: todayStr });
    const okCh = result.results?.filter(r => r.ok).map(r => r.channel).join(',');
    console.log('[push] 早间日报已发送, 通道:', okCh);
    return true;
  } else {
    console.error('[push] 早间日报发送失败', result);
    return false;
  }
}

async function maybeSendFeedingGap(now: Date): Promise<boolean> {
  const settings = getPushSettings();
  if (!settings.feedingGapEnabled) return false;
  const info = getLastFeedInfo(now);
  if (!info.record || info.gapMinutes === null) return false;
  const flags: PushSentFlags = getPushSettings().pushSentFlags;

  if (flags.lastFeedRecordId && flags.lastFeedRecordId !== info.record.id) {
    writePushSentFlags({ lastFeedRecordId: info.record.id, feedingGapNotifiedLevel: undefined });
    flags.lastFeedRecordId = info.record.id;
    flags.feedingGapNotifiedLevel = undefined;
  }


  const l1 = Math.max(30, settings.feedingGapLevel1Minutes);
  let l2 = settings.feedingGapLevel2Minutes;
  if (l2 <= l1) l2 = l1 + 30;
  const notified = flags.feedingGapNotifiedLevel || undefined;

  let sendLevel: 'level1' | 'level2' | null = null;
  if (info.gapMinutes >= l2 && notified !== 'level2') sendLevel = 'level2';
  else if (info.gapMinutes >= l1 && !notified) sendLevel = 'level1';
  if (!sendLevel) return false;

  const rendered = renderFeedingGapLevel(sendLevel, info.record, info.gapMinutes, now);
  const result = await dispatchMessage(rendered.pushplusTitle, rendered.pushplusHtml, rendered.app, { allowPushPlus: settings.feedingGapEnabled });
  if (result.ok) {
    writePushSentFlags({
      lastFeedRecordId: info.record.id,
      feedingGapNotifiedLevel: sendLevel
    });
    const okCh = result.results?.filter(r => r.ok).map(r => r.channel).join(',');
    console.log(`[push] 喂奶间隔${sendLevel}(${minutesLabel(info.gapMinutes)}) 已发送, 通道: ${okCh}`);
    return true;
  } else {
    console.error(`[push] 喂奶间隔${sendLevel} 推送失败`, result);
    return false;
  }
}

// -------- Original per-item reminder --------

async function checkCareItemReminders(now: Date) {
  const settings = getPushSettings();
  if (!settings.careItemEnabled) return;

  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todayStr = now.toDateString();

  const items = listCareItems().filter(item =>
    item.active &&
    item.reminderTime &&
    item.reminderTime === currentTime &&
    isCareItemDue(item, now)
  );

  for (const item of items) {
    const dedupKey = `${todayStr}-${item.id}`;
    if (pushedToday.has(dedupKey)) continue;
    pushedToday.add(dedupKey);

    const { title, html, app } = buildPushPlusPerItemHtml(item);
    const result = await dispatchMessage(title, html, app, { allowPushPlus: settings.careItemEnabled });
    if (!result.ok) {
      console.error('[push] 单项提醒推送失败, item:', item.name, result);
    } else {
      const okCh = result.results?.filter(r => r.ok).map(r => r.channel).join(',');
      console.log('[push] 单项提醒发送:', item.name, '通道:', okCh);
    }
  }
}

// -------- Scheduler tick --------

async function checkAndPush() {
  resetDaily();
  lastCheckAt = new Date().toISOString();
  const now = new Date();

  // 1. Morning digest (fast, check first)
  try { await maybeSendMorningDigest(now); } catch (err) { console.error('[push] morning digest error', err); }

  // 2. Feeding gap
  try { await maybeSendFeedingGap(now); } catch (err) { console.error('[push] feeding gap error', err); }

  // 3. Per-item exact-time reminders (original)
  try { await checkCareItemReminders(now); } catch (err) { console.error('[push] care item reminders error', err); }
}

export function startPushScheduler() {
  if (schedulerTimer) return;

  checkAndPush().catch(error => console.error('[push] 初始检查失败:', error));

  schedulerTimer = setInterval(() => {
    checkAndPush().catch(error => console.error('[push] 定时检查失败:', error));
  }, 30_000);

  console.log('[push] 推送调度器已启动（每 30 秒检查一次）');
}

export function stopPushScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('[push] 推送调度器已停止');
  }
}
