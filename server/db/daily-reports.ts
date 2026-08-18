import { db } from './connection.js';
import { shanghaiDateForInstant } from '../shanghai-date.js';

export interface DailyReport {
  reportDate: string;
  summary: string;
  suggestions: string[];
  model: string;
  generatedAt: string;
}

export function getDailyReport(date: string): DailyReport | null {
  const row = db.prepare('SELECT report_date AS reportDate, summary, suggestions, model, generated_at AS generatedAt FROM daily_reports WHERE report_date = ?').get(date) as { reportDate: string; summary: string; suggestions: string; model: string; generatedAt: string } | undefined;
  if (!row) return null;
  return { ...row, suggestions: JSON.parse(row.suggestions) as string[] };
}

export function saveDailyReport(report: DailyReport): DailyReport {
  db.prepare('INSERT INTO daily_reports (report_date, summary, suggestions, model, generated_at) VALUES (@reportDate, @summary, @suggestions, @model, @generatedAt) ON CONFLICT(report_date) DO UPDATE SET summary=excluded.summary, suggestions=excluded.suggestions, model=excluded.model, generated_at=excluded.generated_at')
    .run({ ...report, suggestions: JSON.stringify(report.suggestions) });
  return report;
}

export function invalidateDailyReports(...occurredAtValues: (string | undefined)[]) {
  const dates = [...new Set(occurredAtValues.filter((value): value is string => Boolean(value)).map(shanghaiDateForInstant))];
  const remove = db.prepare('DELETE FROM daily_reports WHERE report_date = ?');
  for (const date of dates) remove.run(date);
}

export function listDailyReports(): DailyReport[] {
  const rows = db.prepare('SELECT report_date AS reportDate, summary, suggestions, model, generated_at AS generatedAt FROM daily_reports ORDER BY report_date DESC').all() as (Omit<DailyReport, 'suggestions'> & { suggestions: string })[];
  return rows.map(row => ({ ...row, suggestions: JSON.parse(row.suggestions) as string[] }));
}
