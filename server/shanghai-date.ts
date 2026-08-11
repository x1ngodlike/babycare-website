const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

export function shanghaiDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function addDaysToDateString(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function shanghaiDayUtcRange(date: string): { from: string; to: string } {
  return {
    from: new Date(`${date}T00:00:00+08:00`).toISOString(),
    to: new Date(`${addDaysToDateString(date, 1)}T00:00:00+08:00`).toISOString()
  };
}

export function shanghaiDateForInstant(value: string | Date): string {
  return shanghaiDateString(value instanceof Date ? value : new Date(value));
}

export function canonicalInstant(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`无效的记录时间：${value}`);
  return date.toISOString();
}
