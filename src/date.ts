export function startOfWeek(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return value;
}

export function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

export function isoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 月龄/天数拆分（含月末截断，例如 1-31 出生 + 1 个月 → 2-28），供年龄文案统一使用 */
export function ageParts(birthDate: string, at = new Date()): { years: number; months: number; days: number } {
  const birth = new Date(`${birthDate}T12:00:00`);
  const value = new Date(at); value.setHours(12, 0, 0, 0);
  const anniversaryFor = (months: number) => {
    const targetMonth = birth.getMonth() + months;
    const lastDay = new Date(birth.getFullYear(), targetMonth + 1, 0, 12).getDate();
    return new Date(birth.getFullYear(), targetMonth, Math.min(birth.getDate(), lastDay), 12);
  };
  let totalMonths = (value.getFullYear() - birth.getFullYear()) * 12 + value.getMonth() - birth.getMonth();
  if (anniversaryFor(totalMonths) > value) totalMonths -= 1;
  totalMonths = Math.max(0, totalMonths);
  const days = Math.max(0, Math.floor((value.getTime() - anniversaryFor(totalMonths).getTime()) / 86400000));
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, days };
}

export function calculateAge(birthDate: string, at = new Date()) {
  const { years, months, days } = ageParts(birthDate, at);
  return `${Math.max(0, years * 12 + months)}个月${days ? `${days}天` : ''}`;
}
