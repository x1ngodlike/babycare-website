// 推送内容模板与数据构建（由 server/push.ts 抽出，逻辑不变）。
// 本文件只负责"渲染什么"，不负责"何时发送"（调度在 push.ts）。
import { getCareItemReminderTimes, isScheduledCareItemDue } from '../shared/care-schedule.js';
import { addDaysToDateString, dayNumber } from '../shared/date.js';
import { getDailyReport, getProfile, listCareItems, listRecords, listVaccineCatalog, listVaccineRecords } from './db/index.js';
import { shanghaiDateString, shanghaiDayUtcRange } from './shanghai-date.js';
import { buildServerVaccinePlan } from './vaccine-plan.js';
import type { CareItem, CareRecord } from './types.js';
import type { AppNotificationType } from './db/index.js';

export type AppNotificationPayload = { type: AppNotificationType; title: string; body: string; target: 'today' };
export type MorningDigestRendered = { pushplusTitle: string; pushplusHtml: string; app: AppNotificationPayload };
export type FeedingGapRendered = { pushplusTitle: string; pushplusHtml: string; app: AppNotificationPayload };
type LocalProfile = { name: string; birthDate: string; birthTime?: string | null; sex?: 'male' | 'female' | 'unspecified' };

// -------- Date / time helpers --------

function isCareItemDue(item: CareItem, date = new Date()) {
  return isScheduledCareItemDue(item, date);
}

export { isCareItemDue };

export function shanghaiHHMM(date = new Date()): string {
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
  // en-GB gives HH:MM already
  return hhmm.length === 5 ? hhmm : `0${hhmm}`.slice(-5);
}

// -------- Masking --------

export function maskToken(token: string) {
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

export function minutesLabel(totalMinutes: number): string {
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
  const items = listCareItems().filter(item => isCareItemDue(item, todayDateObj));
  const asNeeded = listCareItems().filter(item => item.scheduleType === 'as_needed' && item.active);
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
  todayAppointments: { vaccineName: string; dose: number; appointmentTime: string | null; isAppointment: boolean }[];
  overdue: { vaccineName: string; dose: number; overdueDays: number; plannedOn: string; isAppointment: boolean }[];
  upcoming: { vaccineName: string; dose: number; plannedOn: string; category: string; isAppointment: boolean }[];
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
      todayAppointments.push({ vaccineName: item.vaccineName, dose: item.dose, appointmentTime: record?.appointmentTime || null, isAppointment: Boolean(record?.appointmentOn) });
    } else if (delta < 0) {
      overdue.push({ vaccineName: item.vaccineName, dose: item.dose, overdueDays: Math.max(1, -delta), plannedOn: effectiveOn, isAppointment: Boolean(record?.appointmentOn) });
    } else if (delta >= 1 && delta <= 7) {
      upcoming.push({ vaccineName: item.vaccineName, dose: item.dose, plannedOn: effectiveOn, category: item.category, isAppointment: Boolean(record?.appointmentOn) });
    }
  }
  todayAppointments.sort((a, b) => (a.appointmentTime || '99:99').localeCompare(b.appointmentTime || '99:99'));
  overdue.sort((a, b) => b.overdueDays - a.overdueDays);
  upcoming.sort((a, b) => a.plannedOn.localeCompare(b.plannedOn));
  return { todayAppointments, overdue, upcoming: upcoming.slice(0, 3) };
}

// ---------- Feed gap info ----------
export type LastFeedInfo = {
  record: CareRecord | null;
  gapMinutes: number | null;
};

export function getLastFeedInfo(now = new Date()): LastFeedInfo {
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
          <div style="${SUB}margin-top:2px;">共 ${stats.totalMl} mL · 间隔 ${stats.avgIntervalText}</div>
        </div>
        <div style="${STAT_CELL}">
          <div style="${LABEL}">奶量</div>
          <div style="${VALUE}margin-top:4px;">母乳 ${stats.breastMl} mL</div>
          <div style="${VALUE}margin-top:2px;">奶粉 ${stats.formulaMl} mL</div>
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

  // 今日用药护理计划（统一 badge 样式）
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
      <div style="${H2}margin-bottom:4px;">✅ 今日用药护理计划（${todayShort}）</div>
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
      const rows = vaccines.todayAppointments.map(v => `<div style="padding:4px 0;font-size:13px;color:#1f2a24;line-height:1.5;"><b style="color:#2b6b3e;">📌 ${v.vaccineName} 第${v.dose}剂</b> · ${v.isAppointment ? `门诊预约 · 今日${v.appointmentTime ? ` ${v.appointmentTime}` : ''}` : '建议接种日 · 今日 · 待预约'}</div>`).join('');
      parts.push(`<div style="font-size:12px;font-weight:700;color:#2b6b3e;margin-bottom:4px;">今日疫苗</div>${rows}`);
    }
    if (vaccines.overdue.length > 0) {
      const rows = vaccines.overdue.slice(0, 3).map(v => `<div style="padding:4px 0;font-size:13px;color:#1f2a24;line-height:1.5;"><b style="color:#c4551d;">⚠️ ${v.vaccineName} 第${v.dose}剂</b> · ${v.isAppointment ? '门诊预约' : '建议接种日'} · 已过${v.overdueDays}天</div>`).join('');
      if (parts.length > 0) parts.push(`<hr style="${VACCINE_DIVIDER}" />`);
      parts.push(`<div style="font-size:12px;font-weight:700;color:#c4551d;margin-bottom:4px;">逾期未接种</div>${rows}`);
    }
    if (vaccines.upcoming.length > 0) {
      const rows = vaccines.upcoming.map(v => {
        const short = `${v.plannedOn.slice(5).replace('-', '/')}（${weekdayLabel(v.plannedOn)}）`;
        const cat = v.category === 'self_paid' ? ' · 自费' : '';
        return `<div style="padding:3px 0;font-size:13px;color:#1f2a24;line-height:1.5;">📅 ${short} <b style="color:#3d6b9a;">${v.vaccineName} 第${v.dose}剂</b> · ${v.isAppointment ? '门诊预约' : '建议接种日'}${cat}</div>`;
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

export function renderMorningDigest(now = new Date()): MorningDigestRendered | null {
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
  const pendingCare = plan.filter(item => !item.done && !item.asNeeded).length;
  const vaccineCount = vaccines.todayAppointments.length + vaccines.overdue.length + vaccines.upcoming.length;
  return {
    pushplusTitle: title,
    pushplusHtml: html,
    app: {
      type: 'morning',
      title: `${profile.name}早报 · ${Number(todayStr.slice(5, 7))}月${Number(todayStr.slice(8, 10))}日`,
      body: `昨日喂奶 ${stats.feedTimes} 次，共 ${stats.totalMl} mL；今日待办 ${pendingCare} 项，疫苗安排 ${vaccineCount} 项。点击查看完整早报。`,
      target: 'today'
    }
  };
}

// -------- Renderers: feeding gap --------

function feedSummary(feed: CareRecord): string {
  const breast = feed.breastMilkMl || 0;
  const formula = feed.formulaMl || 0;
  const parts: string[] = [];
  if (breast > 0) parts.push(`母乳 ${breast} mL`);
  if (formula > 0) parts.push(`奶粉 ${formula} mL`);
  if (parts.length === 0) parts.push('喂奶');
  return parts.join(' + ');
}

export function renderFeedingGapLevel(
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
            <div style="margin-top:12px;font-size:12px;color:#d98e0b;">距现在：<b style="font-size:15px;">${ago}</b></div>
          </div>
          <hr style="margin:12px 0;border:none;border-top:1px solid #e6ebe8;" />
          <div>
            <div style="font-size:14px;font-weight:700;color:#d98e0b;margin-bottom:4px;line-height:1.4;">⏳ 今日用药护理计划</div>
            <div style="background:#fafbfc;padding:0 12px;margin-top:4px;">
              ${planRows}
            </div>
          </div>
        </div>
      </div>
    `.trim();
    return {
      pushplusTitle: `🟡 ${ago}未喂奶`,
      pushplusHtml: html,
      app: { type: 'feeding', title: '该记录喂奶啦', body: `距上次喂奶已 ${ago}，上次 ${lastTime} · ${summary}。完成后记得及时记录。`, target: 'today' }
    };
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
          <div style="margin-top:12px;font-size:12px;color:#c44032;">距现在：<b style="font-size:15px;">${ago}</b> · 宝宝可能饿了哦~</div>
        </div>
        <hr style="margin:12px 0;border:none;border-top:1px solid #e6ebe8;" />
        <div>
          <div style="font-size:14px;font-weight:700;color:#c44032;margin-bottom:4px;line-height:1.4;">⏳ 今日用药护理计划</div>
          <div style="background:#fafbfc;padding:0 12px;margin-top:4px;">
            ${planRows}
          </div>
        </div>
        <div style="margin-top:14px;text-align:center;font-size:13px;color:#c44032;font-weight:700;line-height:1.5;">→ 快去喂一喂吧 🍼</div>
      </div>
    </div>
  `.trim();
  return {
    pushplusTitle: `🔴 ${ago}未喂奶`,
    pushplusHtml: html,
    app: { type: 'feeding', title: '喂奶间隔较长', body: `距上次喂奶已 ${ago}，请确认宝宝情况，完成后及时记录。`, target: 'today' }
  };
}

export function buildPushPlusPerItemHtml(item: CareItem) {
  const scheduleLabel = item.scheduleType === 'daily' ? '每天一次'
    : item.scheduleType === 'weekly' && item.weekDays ? `每 ${item.weekDays.map(d => ['日','一','二','三','四','五','六'][d]).join('、')}`
    : item.scheduleType === 'pattern' && item.patternDays ? `循环 ${item.patternDays.filter(Boolean).length}执行/${item.patternDays.filter(v => !v).length}休息`
    : `每 ${item.intervalDays} 天一次`;
  const title = `🔔 ${item.name} · 提醒`;
  const isMedicine = item.category === 'medication';
  const actionEmoji = isMedicine ? '💊' : '🤲';
  const verb = isMedicine ? '服用' : '完成';
  const reminders = getCareItemReminderTimes(item);
  const timeLabel = reminders.length > 0 ? reminders.join(' · ') : (item.reminderTime || '今日');
  const html = `
    <div style="padding:0;border-radius:14px;border:1px solid #e0e8e3;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue',Arial,sans-serif;font-size:14px;color:#1f2a24;line-height:1.6;overflow:hidden;">
      <div style="padding:16px;background:linear-gradient(180deg,#eaf3ed 0%,#ffffff 100%);">
        <div style="margin:0;font-size:17px;font-weight:700;color:#2b6b3e;line-height:1.4;">用药护理提醒</div>
      </div>
      <div style="padding:4px 16px 16px;">
        <div style="background:#f7faf8;border-radius:10px;padding:12px 14px;">
          <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:18px;">${actionEmoji}</span><b style="font-size:14px;color:#1f2a24;">今天还未${verb} <span style="color:#2b6b3e;">${item.name}</span></b></div>
          <div style="margin-top:8px;padding-left:28px;font-size:12px;color:#6c7a72;line-height:1.5;">执行计划 · ${scheduleLabel}</div>
        </div>
        <div style="margin-top:14px;text-align:center;font-size:13px;color:#2b6b3e;font-weight:700;line-height:1.5;">现在去做个照护打卡吧~</div>
      </div>
    </div>
  `.trim();
  return {
    title,
    html,
    app: {
      type: 'care' as const,
      title: `${isMedicine ? '用药' : '照护'}提醒：${item.name}`,
      body: `计划时间 ${timeLabel} · 今天待完成。`,
      target: 'today' as const
    }
  };
}
