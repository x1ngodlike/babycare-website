import type { DailyReportInput } from './ai.js';
import { evaluateAdVdPlan, generateDailyReport } from './ai.js';
import { getAiSettings, getDailyReport, getProfile, listGrowthRecords, listRecords, saveDailyReport } from './db.js';

function shanghaiDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function addDaysToDateString(dateStr: string, days: number): string {
  const value = new Date(`${dateStr}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function yesterdayInShanghai(): string {
  return addDaysToDateString(shanghaiDateString(), -1);
}

function nextShanghaiHour(hour: number): Date {
  const now = new Date();
  const shanghaiNow = new Date(now.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }));
  const target = new Date(shanghaiNow);
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() <= shanghaiNow.getTime()) target.setDate(target.getDate() + 1);
  return new Date(now.getTime() + (target.getTime() - shanghaiNow.getTime()));
}

function calculateAgeText(birthDate: string, at: Date): string {
  const birth = new Date(`${birthDate}T12:00:00`);
  let months = (at.getFullYear() - birth.getFullYear()) * 12 + at.getMonth() - birth.getMonth();
  if (at.getDate() < birth.getDate()) months -= 1;
  const anniversary = new Date(birth.getFullYear(), birth.getMonth() + months, birth.getDate());
  const days = Math.max(0, Math.floor((at.getTime() - anniversary.getTime()) / 86400000));
  return `${Math.max(0, months)}个月${days ? `${days}天` : ''}`;
}

interface ReportInput {
  babyName: string;
  ageText: string;
  sex: DailyReportInput['sex'];
  date: string;
  growthContext: DailyReportInput['growthContext'];
  supplementPlan: DailyReportInput['supplementPlan'];
  yesterday: {
    breastMl: number;
    formulaMl: number;
    feedCount: number;
    bowelCount: number;
    supplements: string[];
    notes: string[];
  };
  hasData: boolean;
}

function dayDistance(from: string, to: string) {
  return Math.floor((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000);
}

function buildReportInput(date: string): ReportInput {
  const profile = getProfile();
  const growthRecords = listGrowthRecords().filter(record => record.measuredOn <= date);
  const growth = growthRecords[0] || null;

  const from = `${date}T00:00:00+08:00`;
  const to = `${addDaysToDateString(date, 1)}T00:00:00+08:00`;
  const records = listRecords(from, to);
  const feedings = records.filter(record => record.type === 'feeding');
  const breastMl = feedings.reduce((sum, record) => sum + (record.breastMilkMl || 0), 0);
  const formulaMl = feedings.reduce((sum, record) => sum + (record.formulaMl || 0), 0);
  const bowelCount = records.filter(record => record.type === 'bowel').length;
  const supplements = [...new Set(records.filter(record => record.type === 'supplement' && record.supplement).map(record => record.supplement!))];
  const previousDate = addDaysToDateString(date, -1);
  const previousDayRecords = listRecords(`${previousDate}T00:00:00+08:00`, `${date}T00:00:00+08:00`);
  const previousDaySupplements = [...new Set(previousDayRecords.filter(record => record.type === 'supplement' && record.supplement).map(record => record.supplement!))];
  const notes = records.filter(record => record.type === 'note' && record.note).map(record => record.note!);

  const hasData = breastMl + formulaMl > 0 || feedings.length > 0 || bowelCount > 0 || supplements.length > 0 || notes.length > 0;

  return {
    babyName: profile.name,
    ageText: calculateAgeText(profile.birthDate, new Date(`${date}T12:00:00+08:00`)),
    sex: profile.sex,
    date,
    growthContext: growth ? {
      heightCm: growth.heightCm, weightKg: growth.weightKg, measuredOn: growth.measuredOn,
      daysSinceMeasurement: dayDistance(growth.measuredOn, date), recordCount: growthRecords.length,
      recent: dayDistance(growth.measuredOn, date) <= 14
    } : null,
    supplementPlan: {
      rule: '维生素 AD 与维生素 D（VD）每天一种、交替补充',
      previousDay: previousDaySupplements,
      status: evaluateAdVdPlan(supplements, previousDaySupplements)
    },
    yesterday: { breastMl, formulaMl, feedCount: feedings.length, bowelCount, supplements, notes },
    hasData
  };
}

export async function generateDailyReportForDate(date: string) {
  const settings = getAiSettings();
  if (!settings.apiKey) throw new Error('服务器尚未配置 AI 模型');
  const input = buildReportInput(date);
  const result: { summary: string; suggestions: string[] } = input.hasData
    ? await generateDailyReport(input as DailyReportInput, { baseUrl: settings.baseUrl, model: settings.model, apiKey: settings.apiKey })
    : { summary: '昨天还没有照护记录，明天再来领取日报', suggestions: ['今天多记录宝宝的吃喝拉撒，明天就能看到日报啦'] };
  saveDailyReport({ reportDate: date, summary: result.summary, suggestions: result.suggestions, model: settings.model, generatedAt: new Date().toISOString() });
  return getDailyReport(date)!;
}

export function startDailyReportScheduler() {
  const runCatchUp = () => {
    const date = yesterdayInShanghai();
    if (!getDailyReport(date) && getAiSettings().apiKey) {
      generateDailyReportForDate(date).catch(error => console.error('[daily-report] 启动补生成失败', error));
    }
  };
  runCatchUp();
  const schedule = () => {
    const delay = nextShanghaiHour(0).getTime() - Date.now();
    setTimeout(() => {
      const date = yesterdayInShanghai();
      generateDailyReportForDate(date).catch(error => console.error('[daily-report] 定时生成失败', error));
      schedule();
    }, delay);
  };
  schedule();
}
