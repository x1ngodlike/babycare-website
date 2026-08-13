import axios from 'axios';
import {
  getPushSettings,
  listCareItems,
  listRecords,
  savePushSettings,
  getDailyReport,
  getProfile,
  listVaccineCatalog,
  listVaccineRecords,
  writePushSentFlags,
  type FeedingGapLevel,
  type PushSentFlags
} from './db.js';
import { addDaysToDateString, shanghaiDayUtcRange, shanghaiDateString } from './shanghai-date.js';
import type { CareItem, CareRecord } from './types.js';
import { isScheduledCareItemDue } from '../shared/care-schedule.js';
import { dayNumber } from '../shared/date.js';
import { buildServerVaccinePlan } from './vaccine-plan.js';

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

type MorningDigestRendered = { pushplusTitle: string; pushplusHtml: string };
type FeedingGapRendered = { pushplusTitle: string; pushplusHtml: string };
type LocalProfile = { name: string; birthDate: string; birthTime?: string | null; sex?: 'male' | 'female' | 'unspecified' };

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let lastCheckAt: string | null = null;
const pushedToday = new Set<string>();
let pushedTodayDate = '';

// -------- Date / time helpers --------

function isCareItemDue(item: CareItem, date = new Date()) {
  return isScheduledCareItemDue(item, date);
}

function shanghaiHHMM(date = new Date()): string {
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
  // en-GB gives HH:MM already
  return hhmm.length === 5 ? hhmm : `0${hhmm}`.slice(-5);
}

function resetDaily() {
  const today = shanghaiDateString();
  if (pushedTodayDate !== today) {
    pushedToday.clear();
    pushedTodayDate = today;
  }
}

// -------- Masking --------

function maskToken(token: string) {
  if (!token) return '';
  if (token.length <= 8) return '****';
  return token.slice(0, 4) + '****' + token.slice(-4);
}

// -------- Utility: baby age display --------

function babyAgeText(birthDate: string, todayStr = shanghaiDateString()): string {
  const birth = new Date(`${birthDate}T12:00:00+08:00`);
  const today = new Date(`${todayStr}T12:00:00+08:00`);
  let months = (today.getUTCFullYear() - birth.getUTCFullYear()) * 12 + (today.getUTCMonth() - birth.getUTCMonth());
  if (today.getUTCDate() < birth.getUTCDate()) months -= 1;
  const days = Math.max(0, Math.round((today.getTime() - birth.getTime()) / 86_400_000));
  if (days < 30) return `${days} 天`;
  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  if (years === 0) return `${restMonths} 个月`;
  if (restMonths === 0) return `${years} 岁`;
  return `${years} 岁 ${restMonths} 个月`;
}

function formatInstantShort(iso: string): string {
  // HH:MM (Shanghai time)
  const d = new Date(iso);
  return shanghaiHHMM(d);
}

function minutesLabel(totalMinutes: number): string {
  if (totalMinutes < 0) totalMinutes = 0;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分`;
}

// -------- Build data sections --------

function buildYesterdayStats(yesterdayStr: string) {
  const { from, to } = shanghaiDayUtcRange(yesterdayStr);
  const records = listRecords(from, to);
  const feedings = records.filter(r => r.type === 'feeding');
  const supplements = records.filter(r => r.type === 'supplement');
  const bowels = records.filter(r => r.type === 'bowel');
  const notes = records.filter(r => r.type === 'note');

  const feedTimes = feedings.length;
  const breastMl = feedings.reduce((sum, r) => sum + (r.breastMilkMl || 0), 0);
  const formulaMl = feedings.reduce((sum, r) => sum + (r.formulaMl || 0), 0);
  const totalMl = breastMl + formulaMl;

  // Average feeding interval
  let avgIntervalText = '—';
  if (feedTimes >= 2) {
    const sorted = [...feedings].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const first = new Date(sorted[0].occurredAt).getTime();
    const last = new Date(sorted[sorted.length - 1].occurredAt).getTime();
    const avgGapMin = Math.round((last - first) / 60_000 / (feedTimes - 1));
    avgIntervalText = minutesLabel(avgGapMin);
  } else if (feedTimes === 1) {
    avgIntervalText = '仅 1 次';
  }

  // Medicine done vs care items due yesterday
  const yesterdayDateObj = new Date(`${yesterdayStr}T12:00:00+08:00`);
  const yesterdayCareItems = listCareItems().filter(item => isCareItemDue(item, yesterdayDateObj));
  const doneNames = new Set(supplements.map(r => r.supplement).filter((x): x is string => Boolean(x)));
  const medTotal = yesterdayCareItems.length || doneNames.size || 0;
  const medDoneList: { name: string; done: boolean }[] = [];
  if (yesterdayCareItems.length > 0) {
    for (const item of yesterdayCareItems) medDoneList.push({ name: item.name, done: doneNames.has(item.name) });
  } else {
    for (const n of doneNames) medDoneList.push({ name: n, done: true });
  }
  const medDoneCount = medDoneList.filter(x => x.done).length;

  return {
    date: yesterdayStr,
    feedTimes,
    breastMl,
    formulaMl,
    totalMl,
    avgIntervalText,
    medDoneCount,
    medTotal,
    medList: medDoneList,
    bowelCount: bowels.length,
    noteCount: notes.length
  };
}

type TodayMedicine = { name: string; reminderTime: string | null; done: boolean; asNeeded: boolean };

function buildTodayPlanMedicines(todayStr: string): TodayMedicine[] {
  const todayDateObj = new Date(`${todayStr}T12:00:00+08:00`);
  const { from, to } = shanghaiDayUtcRange(todayStr);
  const todayRecords = listRecords(from, to);
  const doneNames = new Set(
    todayRecords.filter(r => r.type === 'supplement' && r.supplement).map(r => r.supplement as string)
  );
  const items = listCareItems().filter(item => item.icon === 'medicine' && isCareItemDue(item, todayDateObj));
  const asNeeded = listCareItems().filter(item => item.icon === 'medicine' && item.scheduleType === 'as_needed' && item.active);
  const seen = new Set<string>();
  const result: TodayMedicine[] = [];
  for (const item of [...items, ...asNeeded]) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    const timed = isCareItemDue(item, todayDateObj);
    result.push({
      name: item.name,
      reminderTime: item.reminderTime,
      done: doneNames.has(item.name),
      asNeeded: !timed
    });
  }
  result.sort((a, b) => {
    if (a.asNeeded !== b.asNeeded) return a.asNeeded ? 1 : -1;
    return (a.reminderTime || '99:99').localeCompare(b.reminderTime || '99:99');
  });
  return result;
}

type VaccineBrief = {
  todayAppointments: { vaccineName: string; dose: number; appointmentTime: string | null }[];
  overdue: { vaccineName: string; dose: number; overdueDays: number; plannedOn: string }[];
  upcoming: { vaccineName: string; dose: number; plannedOn: string; category: string }[];
};

function buildVaccineBrief(todayStr: string): VaccineBrief {
  const todayAppointments: VaccineBrief['todayAppointments'] = [];
  const overdue: VaccineBrief['overdue'] = [];
  const upcoming: VaccineBrief['upcoming'] = [];
  const todayNum = dayNumber(todayStr);
  const profile = getProfile();
  if (!profile) return { todayAppointments, overdue, upcoming };
  const plan = buildServerVaccinePlan(profile.birthDate, listVaccineRecords(), listVaccineCatalog(true));
  for (const item of plan) {
    const record = item.record;
    if (record?.administeredOn) continue;
    const effectiveOn = record?.appointmentOn || item.plannedOn;
    const delta = dayNumber(effectiveOn) - todayNum;

    if (effectiveOn === todayStr) {
      todayAppointments.push({ vaccineName: item.vaccineName, dose: item.dose, appointmentTime: record?.appointmentTime || null });
    } else if (delta < 0) {
      overdue.push({ vaccineName: item.vaccineName, dose: item.dose, overdueDays: Math.max(1, -delta), plannedOn: effectiveOn });
    } else if (delta >= 1 && delta <= 7) {
      upcoming.push({ vaccineName: item.vaccineName, dose: item.dose, plannedOn: effectiveOn, category: item.category });
    }
  }
  todayAppointments.sort((a, b) => (a.appointmentTime || '99:99').localeCompare(b.appointmentTime || '99:99'));
  overdue.sort((a, b) => b.overdueDays - a.overdueDays);
  upcoming.sort((a, b) => a.plannedOn.localeCompare(b.plannedOn));
  return { todayAppointments, overdue, upcoming: upcoming.slice(0, 3) };
}

// ---------- Feed gap info ----------
type LastFeedInfo = {
  record: CareRecord | null;
  gapMinutes: number | null;
};

function getLastFeedInfo(now = new Date()): LastFeedInfo {
  // Scan last 24h of records for most recent feeding
  const to = now.toISOString();
  const from = new Date(now.getTime() - 48 * 3_600_000).toISOString();
  const recent = listRecords(from, to);
  const feedings = recent
    .filter(r => r.type === 'feeding')
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  if (feedings.length === 0) return { record: null, gapMinutes: null };
  const record = feedings[0];
  const gap = Math.floor((now.getTime() - new Date(record.occurredAt).getTime()) / 60_000);
  return { record, gapMinutes: gap < 0 ? 0 : gap };
}

// -------- Renderers: morning digest --------

function weekdayLabel(dateStr: string): string {
  const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  return labels[d.getUTCDay()];
}

function renderMorningDigestHtml(
  profile: LocalProfile,
  todayStr: string,
  stats: ReturnType<typeof buildYesterdayStats>,
  aiReport: { summary: string; suggestions: string[] } | null,
  plan: TodayMedicine[],
  vaccines: VaccineBrief
): { title: string; html: string } {
  const yesterdayLabel = `${stats.date.slice(5).replace('-', '月')}日 ${weekdayLabel(stats.date)}`;
  const todayShort = `${todayStr.slice(5).replace('-', '月')}日 ${weekdayLabel(todayStr)}`;
  const ageText = babyAgeText(profile.birthDate, todayStr);

  const CARD = 'border-radius:10px;padding:12px 14px;';
  const STAT_CELL = 'background:#f7faf8;border-radius:10px;padding:10px 12px;';
  const LABEL = 'font-size:12px;color:#6c7a72;line-height:1.5;font-weight:400;';
  const VALUE = 'font-size:15px;font-weight:700;color:#2b6b3e;line-height:1.4;';
  const SUB = 'font-size:12px;color:#6c7a72;line-height:1.5;';
  const H2 = 'font-size:14px;font-weight:700;color:#2b6b3e;line-height:1.4;';
  const DIVIDER = 'margin:12px 0;border:none;border-top:1px solid #e6ebe8;';

  const blocks: string[] = [];

  // 外层卡片容器 + header（浅绿渐变）
  blocks.push(`
    <div style="padding:0;border-radius:14px;border:1px solid #e0e8e3;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue',Arial,sans-serif;font-size:14px;color:#1f2a24;line-height:1.6;overflow:hidden;">
      <div style="padding:16px;background:linear-gradient(180deg,#eaf3ed 0%,#ffffff 100%);">
        <div style="margin:0;font-size:17px;font-weight:700;color:#2b6b3e;line-height:1.4;">${profile.name}早报</div>
        <div style="margin-top:4px;font-size:12px;color:#6c7a72;line-height:1.5;">${todayShort} · ${ageText}</div>
      </div>
      <div style="padding:4px 16px 16px;">
  `);

  // 昨日概括
  blocks.push(`
    <div>
      <div style="${H2}margin-bottom:8px;">📊 昨日概括（${yesterdayLabel}）</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
        <div style="${STAT_CELL}">
          <div style="${LABEL}">喂奶</div>
          <div style="${VALUE}margin-top:2px;">${stats.feedTimes} 次</div>
          <div style="${SUB}margin-top:2px;">共 ${stats.totalMl} ml · 间隔 ${stats.avgIntervalText}</div>
        </div>
        <div style="${STAT_CELL}">
          <div style="${LABEL}">奶量</div>
          <div style="${VALUE}margin-top:4px;">母乳 ${stats.breastMl} ml</div>
          <div style="${VALUE}margin-top:2px;">奶粉 ${stats.formulaMl} ml</div>
        </div>
        <div style="${STAT_CELL}">
          <div style="${LABEL}">用药</div>
          <div style="${VALUE}margin-top:2px;">${stats.medDoneCount} / ${Math.max(stats.medTotal, stats.medList.length) || 0}</div>
          <div style="${SUB}margin-top:2px;">${stats.medList.map(x => (x.done ? '· ' : '· ') + x.name).join(' ') || '无'}</div>
        </div>
        <div style="${STAT_CELL}">
          <div style="${LABEL}">其他</div>
          <div style="${VALUE}margin-top:4px;">排便 ${stats.bowelCount} 次</div>
          <div style="${VALUE}margin-top:2px;">笔记 ${stats.noteCount} 条</div>
        </div>
      </div>
    </div>
  `);

  // AI 总结
  if (aiReport) {
    const suggestions = aiReport.suggestions && aiReport.suggestions.length > 0
      ? aiReport.suggestions.slice(0, 3).map(s => `<li style="margin:3px 0;line-height:1.5;font-size:13px;color:#1f2a24;">${s}</li>`).join('')
      : '';
    blocks.push(`
      <hr style="${DIVIDER}" />
      <div>
        <div style="${H2}margin-bottom:6px;">🤖 昨日 AI 总结</div>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#1f2a24;">${aiReport.summary.replace(/\n/g, '<br />')}</p>
        ${suggestions ? `<ul style="margin:8px 0 0;padding-left:18px;color:#1f2a24;">${suggestions}</ul>` : ''}
      </div>
    `);
  }

  // 今日用药计划（统一 badge 样式）
  const badgeOk = 'display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:#e8f2ec;color:#2b6b3e;';
  const badgeTodo = 'display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:#fdf3de;color:#a36b00;';
  const badgeFree = 'display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:#e6eff5;color:#3a6f8c;';
  const planRows = plan.length === 0
    ? `<div style="text-align:center;padding:12px 0;font-size:13px;color:#6c7a72;">今日无计划用药 🎉</div>`
    : plan.map(med => {
        if (med.asNeeded) {
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #eef3ef;"><span style="font-size:12px;color:#6c7a72;width:54px;"></span><span style="font-size:13px;font-weight:600;color:#1f2a24;flex:1;">${med.name}</span><span style="${badgeFree}text-align:right;">按需</span></div>`;
        }
        const badge = med.done
          ? `<span style="${badgeOk}">已完成</span>`
          : `<span style="${badgeTodo}">待记录</span>`;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #eef3ef;"><span style="font-size:12px;color:#6c7a72;font-weight:700;width:54px;">${med.reminderTime || '今日'}</span><span style="font-size:13px;font-weight:600;color:#1f2a24;flex:1;">${med.name}</span>${badge}</div>`;
      }).join('');
  blocks.push(`
    <hr style="${DIVIDER}" />
    <div>
      <div style="${H2}margin-bottom:4px;">✅ 今日用药计划（${todayShort}）</div>
      <div style="${CARD}background:#fafbfc;padding:0 12px;margin-top:4px;">
        ${planRows}
      </div>
    </div>
  `);

  // 疫苗
  const hasVaccine = vaccines.todayAppointments.length > 0 || vaccines.overdue.length > 0 || vaccines.upcoming.length > 0;
  if (hasVaccine) {
    const VACCINE_DIVIDER = 'margin:10px 0;border:none;border-top:1px solid #d4e2ec;';
    const parts: string[] = [];
    if (vaccines.todayAppointments.length > 0) {
      const rows = vaccines.todayAppointments.map(v => `<div style="padding:4px 0;font-size:13px;color:#1f2a24;line-height:1.5;"><b style="color:#2b6b3e;">📌 ${v.vaccineName} 第${v.dose}剂</b>${v.appointmentTime ? ` · 门诊预约 ${v.appointmentTime}` : ' · 建议今日接种，待预约'}</div>`).join('');
      parts.push(`<div style="font-size:12px;font-weight:700;color:#2b6b3e;margin-bottom:4px;">今日疫苗</div>${rows}`);
    }
    if (vaccines.overdue.length > 0) {
      const rows = vaccines.overdue.slice(0, 3).map(v => `<div style="padding:4px 0;font-size:13px;color:#1f2a24;line-height:1.5;"><b style="color:#c4551d;">⚠️ ${v.vaccineName} 第${v.dose}剂</b> · 逾期 ${v.overdueDays} 天</div>`).join('');
      if (parts.length > 0) parts.push(`<hr style="${VACCINE_DIVIDER}" />`);
      parts.push(`<div style="font-size:12px;font-weight:700;color:#c4551d;margin-bottom:4px;">逾期未接种</div>${rows}`);
    }
    if (vaccines.upcoming.length > 0) {
      const rows = vaccines.upcoming.map(v => {
        const short = `${v.plannedOn.slice(5).replace('-', '/')}（${weekdayLabel(v.plannedOn)}）`;
        const cat = v.category === 'self_paid' ? ' · 自费' : '';
        return `<div style="padding:3px 0;font-size:13px;color:#1f2a24;line-height:1.5;">📅 ${short} <b style="color:#3d6b9a;">${v.vaccineName} 第${v.dose}剂</b>${cat}</div>`;
      }).join('');
      if (parts.length > 0) parts.push(`<hr style="${VACCINE_DIVIDER}" />`);
      parts.push(`<div style="font-size:12px;font-weight:700;color:#3d6b9a;margin-bottom:4px;">未来 7 天待安排</div>${rows}`);
    }
    blocks.push(`
      <hr style="${DIVIDER}" />
      <div>
        <div style="${H2.replace('#2b6b3e', '#3d6b9a')}margin-bottom:6px;">💉 疫苗安排</div>
        <div style="${CARD}background:#fafbfd;">
          ${parts.join('')}
        </div>
      </div>
    `);
  }

  // 底部祝福语
  blocks.push(`
      <div style="margin-top:16px;text-align:center;font-size:12px;color:#6c7a72;line-height:1.5;">祝今天顺利 🍀</div>
      </div>
    </div>
  `);

  return {
    title: `☀️ ${profile.name}早报`,
    html: blocks.join('')
  };
}

function renderMorningDigest(now = new Date()): MorningDigestRendered | null {
  const todayStr = shanghaiDateString(now);
  const yesterdayStr = addDaysToDateString(todayStr, -1);

  const profile = getProfile();
  if (!profile || !profile.name) return null;
  const stats = buildYesterdayStats(yesterdayStr);
  const aiReportRow = getDailyReport(yesterdayStr);
  const aiReport = aiReportRow ? { summary: aiReportRow.summary, suggestions: aiReportRow.suggestions } : null;
  const plan = buildTodayPlanMedicines(todayStr);
  const vaccines = buildVaccineBrief(todayStr);

  const { title, html } = renderMorningDigestHtml(profile, todayStr, stats, aiReport, plan, vaccines);
  return { pushplusTitle: title, pushplusHtml: html };
}

// -------- Renderers: feeding gap --------

function feedSummary(feed: CareRecord): string {
  const breast = feed.breastMilkMl || 0;
  const formula = feed.formulaMl || 0;
  const parts: string[] = [];
  if (breast > 0) parts.push(`母乳 ${breast}ml`);
  if (formula > 0) parts.push(`奶粉 ${formula}ml`);
  if (parts.length === 0) parts.push('喂奶');
  return parts.join(' + ');
}

function renderFeedingGapLevel(
  level: 'level1' | 'level2',
  lastFeed: CareRecord,
  gapMinutes: number,
  now: Date
): FeedingGapRendered {
  const todayStr = shanghaiDateString(now);
  const plan = buildTodayPlanMedicines(todayStr);
  const lastTime = formatInstantShort(lastFeed.occurredAt);
  const summary = feedSummary(lastFeed);
  const ago = minutesLabel(gapMinutes);

  const badgeOk = 'display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:#e8f2ec;color:#2b6b3e;';
  const badgeTodo = 'display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:#fdf3de;color:#a36b00;';
  const badgeFree = 'display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:#e6eff5;color:#3a6f8c;';
  const planRows = plan.length === 0
    ? `<div style="text-align:center;padding:12px 0;font-size:13px;color:#6c7a72;">今日无计划用药 🎉</div>`
    : plan.map(med => {
        if (med.asNeeded) {
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #eef3ef;"><span style="font-size:12px;color:#6c7a72;width:54px;"></span><span style="font-size:13px;font-weight:600;color:#1f2a24;flex:1;">${med.name}</span><span style="${badgeFree}text-align:right;">按需</span></div>`;
        }
        const badge = med.done
          ? `<span style="${badgeOk}">已完成</span>`
          : `<span style="${badgeTodo}">待记录</span>`;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #eef3ef;"><span style="font-size:12px;color:#6c7a72;font-weight:700;width:54px;">${med.reminderTime || '今日'}</span><span style="font-size:13px;font-weight:600;color:#1f2a24;flex:1;">${med.name}</span>${badge}</div>`;
      }).join('');

  if (level === 'level1') {
    const html = `
      <div style="padding:0;border-radius:14px;border:1px solid #e0e8e3;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue',Arial,sans-serif;font-size:14px;color:#1f2a24;line-height:1.6;overflow:hidden;">
        <div style="padding:16px;background:#fff6df;">
          <div style="margin:0;font-size:17px;font-weight:700;color:#d98e0b;line-height:1.4;">距上次喂奶 ${ago}</div>
        </div>
        <div style="padding:4px 16px 16px;">
          <div style="background:#f7faf8;border-radius:10px;padding:12px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <span style="font-size:12px;color:#6c7a72;">上次 · ${lastTime}</span>
              <span style="font-size:13px;color:#1f2a24;font-weight:600;">${summary}</span>
            </div>
            <div style="margin-top:6px;font-size:12px;color:#d98e0b;">距现在：<b style="font-size:15px;">${ago}</b></div>
          </div>
          <hr style="margin:12px 0;border:none;border-top:1px solid #e6ebe8;" />
          <div>
            <div style="font-size:14px;font-weight:700;color:#d98e0b;margin-bottom:4px;line-height:1.4;">⏳ 今日用药计划</div>
            <div style="background:#fafbfc;padding:0 12px;margin-top:4px;">
              ${planRows}
            </div>
          </div>
        </div>
      </div>
    `.trim();
    return { pushplusTitle: `🟡 ${ago}未喂奶`, pushplusHtml: html };
  }

  // level2
  const html = `
    <div style="padding:0;border-radius:14px;border:1px solid #e0e8e3;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue',Arial,sans-serif;font-size:14px;color:#1f2a24;line-height:1.6;overflow:hidden;">
      <div style="padding:16px;background:#fdecea;">
        <div style="margin:0;font-size:17px;font-weight:700;color:#c44032;line-height:1.4;">已经 ${ago} 没喂奶啦 🧸</div>
      </div>
      <div style="padding:4px 16px 16px;">
        <div style="background:#f7faf8;border-radius:10px;padding:12px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <span style="font-size:12px;color:#6c7a72;">上次 · ${lastTime}</span>
            <span style="font-size:13px;color:#1f2a24;font-weight:600;">${summary}</span>
          </div>
          <div style="margin-top:6px;font-size:12px;color:#c44032;">距现在：<b style="font-size:15px;">${ago}</b> · 宝宝可能饿了哦~</div>
        </div>
        <hr style="margin:12px 0;border:none;border-top:1px solid #e6ebe8;" />
        <div>
          <div style="font-size:14px;font-weight:700;color:#c44032;margin-bottom:4px;line-height:1.4;">⏳ 今日用药计划</div>
          <div style="background:#fafbfc;padding:0 12px;margin-top:4px;">
            ${planRows}
          </div>
        </div>
        <div style="margin-top:14px;text-align:center;font-size:13px;color:#c44032;font-weight:700;line-height:1.5;">→ 快去喂一喂吧 🍼</div>
      </div>
    </div>
  `.trim();
  return { pushplusTitle: `🔴 ${ago}未喂奶`, pushplusHtml: html };
}

// -------- Dispatch --------

async function dispatchMessage(pushplusTitle: string, pushplusContent: string) {
  const settings = getPushSettings();
  if (!settings.pushplusToken) return { ok: false, error: 'PushPlus Token 未配置' };
  const r = await sendPushPlusMessage(pushplusTitle, pushplusContent, 'html');
  const results = [{ channel: 'pushplus' as const, ...r }];
  return { ok: r.ok, results };
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
  const settings = getPushSettings();
  if (settings.enabled) startPushScheduler(); else stopPushScheduler();
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
    return dispatchMessage(fallbackTitle, fallbackHtml);
  }
  return dispatchMessage(rendered.pushplusTitle, rendered.pushplusHtml);
}

export async function testCareItemPush() {
  const items = listCareItems().filter(i => i.active);
  let item: CareItem | undefined = items.find(i => i.icon === 'medicine');
  if (!item) item = items[0];
  if (!item) {
    item = {
      id: 'test-care-item',
      name: '维生素D3',
      icon: 'medicine',
      scheduleType: 'daily',
      intervalDays: 1,
      scheduleStartDate: shanghaiDateString(new Date()),
      scheduleEndDate: null,
      reminderTime: '08:00',
      sortOrder: 0,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  const rendered = buildPushPlusPerItemHtml(item);
  return dispatchMessage(rendered.title, rendered.html);
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
  return dispatchMessage(rendered.pushplusTitle, rendered.pushplusHtml);
}

// ---------- 2 new triggers ----------

async function maybeSendMorningDigest(now: Date): Promise<boolean> {
  const settings = getPushSettings();
  if (!settings.enabled || !settings.morningDigestEnabled) return false;
  const flags: PushSentFlags = settings.pushSentFlags;
  const todayStr = shanghaiDateString(now);
  if (flags.morningDigestDate === todayStr) return false;
  const current = shanghaiHHMM(now);
  if (current < settings.morningDigestTime) return false;
  if (!settings.pushplusToken) return false;

  const rendered = renderMorningDigest(now);
  if (!rendered) return false;
  const result = await dispatchMessage(rendered.pushplusTitle, rendered.pushplusHtml);
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
  if (!settings.enabled || !settings.feedingGapEnabled) return false;
  const info = getLastFeedInfo(now);
  if (!info.record || info.gapMinutes === null) return false;
  const flags: PushSentFlags = getPushSettings().pushSentFlags;

  if (flags.lastFeedRecordId && flags.lastFeedRecordId !== info.record.id) {
    writePushSentFlags({ lastFeedRecordId: info.record.id, feedingGapNotifiedLevel: undefined });
    flags.lastFeedRecordId = info.record.id;
    flags.feedingGapNotifiedLevel = undefined;
  }

  if (!settings.pushplusToken) return false;

  const l1 = Math.max(30, settings.feedingGapLevel1Minutes);
  let l2 = settings.feedingGapLevel2Minutes;
  if (l2 <= l1) l2 = l1 + 30;
  const notified = flags.feedingGapNotifiedLevel || undefined;

  let sendLevel: 'level1' | 'level2' | null = null;
  if (info.gapMinutes >= l2 && notified !== 'level2') sendLevel = 'level2';
  else if (info.gapMinutes >= l1 && !notified) sendLevel = 'level1';
  if (!sendLevel) return false;

  const rendered = renderFeedingGapLevel(sendLevel, info.record, info.gapMinutes, now);
  const result = await dispatchMessage(rendered.pushplusTitle, rendered.pushplusHtml);
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

function buildPushPlusPerItemHtml(item: CareItem) {
  const scheduleLabel = item.scheduleType === 'daily' ? '每天一次' : `每 ${item.intervalDays} 天一次`;
  const title = `🔔 ${item.name} · 提醒`;
  const isMedicine = item.icon === 'medicine';
  const actionEmoji = isMedicine ? '💊' : '🤲';
  const verb = isMedicine ? '服用' : '照护';
  const html = `
    <div style="padding:0;border-radius:14px;border:1px solid #e0e8e3;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue',Arial,sans-serif;font-size:14px;color:#1f2a24;line-height:1.6;overflow:hidden;">
      <div style="padding:16px;background:linear-gradient(180deg,#eaf3ed 0%,#ffffff 100%);">
        <div style="margin:0;font-size:17px;font-weight:700;color:#2b6b3e;line-height:1.4;">用药与照护提醒</div>
      </div>
      <div style="padding:4px 16px 16px;">
        <div style="background:#f7faf8;border-radius:10px;padding:12px 14px;">
          <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:18px;">${actionEmoji}</span><b style="font-size:14px;color:#1f2a24;">今天还未${verb} <span style="color:#2b6b3e;">${item.name}</span></b></div>
          <div style="margin-top:8px;padding-left:28px;font-size:12px;color:#6c7a72;line-height:1.5;">照护频率 · ${scheduleLabel}</div>
        </div>
        <div style="margin-top:14px;text-align:center;font-size:13px;color:#2b6b3e;font-weight:700;line-height:1.5;">现在去做个照护打卡吧~</div>
      </div>
    </div>
  `.trim();
  return { title, html };
}

async function checkCareItemReminders(now: Date) {
  const settings = getPushSettings();
  if (!settings.enabled) return;
  if (!settings.careItemEnabled) return;
  if (!settings.pushplusToken) return;

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

    const { title, html } = buildPushPlusPerItemHtml(item);
    const result = await dispatchMessage(title, html);
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
  const settings = getPushSettings();
  if (!settings.enabled) {
    console.log('[push] 推送未启用，跳过启动');
    return;
  }
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
