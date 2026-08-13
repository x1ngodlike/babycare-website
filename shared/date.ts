export const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

export function dateStringInTimeZone(date = new Date(), timeZone = SHANGHAI_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function addDaysToDateString(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dayNumber(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

export function addMonthsClamped(day: string, months: number, days = 0): string {
  const [year, month, date] = day.split('-').map(Number);
  const targetMonth = month - 1 + months;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, targetMonth, Math.min(date, lastDay) + days)).toISOString().slice(0, 10);
}
