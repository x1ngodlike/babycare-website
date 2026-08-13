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

export function calculateAge(birthDate: string, at = new Date()) {
  const birth = new Date(`${birthDate}T12:00:00`);
  let months = (at.getFullYear() - birth.getFullYear()) * 12 + at.getMonth() - birth.getMonth();
  if (at.getDate() < birth.getDate()) months -= 1;
  const anniversary = new Date(birth.getFullYear(), birth.getMonth() + months, birth.getDate());
  const days = Math.max(0, Math.floor((at.getTime() - anniversary.getTime()) / 86400000));
  return `${Math.max(0, months)}个月${days ? `${days}天` : ''}`;
}
