import type { VaccinePlanItem } from './vaccines';

export type NativeNotificationPermission = 'granted' | 'required' | 'unavailable';

declare global {
  interface Window {
    BabyCareNative?: {
      openServerSettings(): void;
      getEnvironmentLabel(): string;
      getNotificationPermissionStatus?(): 'granted' | 'required';
      requestNotificationPermission?(): void;
      showTestNotification?(type: NativeNotificationType): void;
      getAppNotificationSettings?(): string;
      saveAppNotificationSettings?(settingsJson: string): void;
      syncVaccineReminders?(remindersJson: string): void;
      addVaccineToCalendar?(title: string, appointmentOn: string, appointmentTime: string, description: string): void;
    };
  }
}

export function getNativeNotificationPermission(): NativeNotificationPermission {
  try {
    return window.BabyCareNative?.getNotificationPermissionStatus?.() || 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export function requestNativeNotificationPermission() {
  window.BabyCareNative?.requestNotificationPermission?.();
}

export function showNativeTestNotification() {
  window.BabyCareNative?.showTestNotification?.('vaccine');
}

export type NativeNotificationType = 'morning' | 'feeding' | 'care' | 'vaccine';
export type NativeNotificationSettings = { all: boolean; morning: boolean; feeding: boolean; care: boolean; vaccine: boolean };
export const defaultNativeNotificationSettings: NativeNotificationSettings = { all: true, morning: true, feeding: true, care: true, vaccine: true };

export function getNativeNotificationSettings(): NativeNotificationSettings {
  try {
    const value = JSON.parse(window.BabyCareNative?.getAppNotificationSettings?.() || '{}') as Partial<NativeNotificationSettings>;
    return { ...defaultNativeNotificationSettings, ...value };
  } catch {
    return defaultNativeNotificationSettings;
  }
}

export function saveNativeNotificationSettings(settings: NativeNotificationSettings) {
  window.BabyCareNative?.saveAppNotificationSettings?.(JSON.stringify(settings));
}

export function showNativeCategoryTestNotification(type: NativeNotificationType) {
  window.BabyCareNative?.showTestNotification?.(type);
}

export function syncNativeVaccineReminders(records: Array<{ id: string; vaccineName: string; dose: number; appointmentOn: string; appointmentTime: string }>) {
  try {
    window.BabyCareNative?.syncVaccineReminders?.(JSON.stringify(records));
  } catch {
    // Older Android shells simply keep working without native reminders.
  }
}

function compactDay(day: string) {
  return day.replaceAll('-', '');
}

function nextDay(day: string) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function calendarDateTime(day: string, time: string, addHours = 0) {
  const date = new Date(`${day}T${time}:00`);
  date.setHours(date.getHours() + addHours);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}00`;
}

function escapeCalendarText(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
}

export function buildVaccineCalendarFile(item: VaccinePlanItem) {
  const record = item.record;
  if (!record?.appointmentOn) return '';
  const title = `接种疫苗：${item.vaccineName} · 第 ${item.dose} 剂`;
  const description = [
    item.hasSuggestedDate ? `建议接种日：${item.plannedOn}` : '',
    record.note ? `备注：${record.note}` : '',
    '具体接种与补种安排请以接种门诊为准。'
  ].filter(Boolean).join('\n');
  const start = record.appointmentTime
    ? `DTSTART:${calendarDateTime(record.appointmentOn, record.appointmentTime)}`
    : `DTSTART;VALUE=DATE:${compactDay(record.appointmentOn)}`;
  const end = record.appointmentTime
    ? `DTEND:${calendarDateTime(record.appointmentOn, record.appointmentTime, 1)}`
    : `DTEND;VALUE=DATE:${compactDay(nextDay(record.appointmentOn))}`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BabyCare//Vaccine Appointment//ZH-CN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:vaccine-${record.id}@babycare.local`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    start, end, `SUMMARY:${escapeCalendarText(title)}`, `DESCRIPTION:${escapeCalendarText(description)}`,
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${escapeCalendarText(title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', ''
  ].join('\r\n');
}

export function addVaccineAppointmentToCalendar(item: VaccinePlanItem) {
  const record = item.record;
  if (!record?.appointmentOn) return;
  const title = `接种疫苗：${item.vaccineName} · 第 ${item.dose} 剂`;
  const description = [
    item.hasSuggestedDate ? `建议接种日：${item.plannedOn}` : '',
    record.note ? `备注：${record.note}` : '',
    '具体接种与补种安排请以接种门诊为准。'
  ].filter(Boolean).join('\n');
  if (window.BabyCareNative?.addVaccineToCalendar) {
    window.BabyCareNative.addVaccineToCalendar(title, record.appointmentOn, record.appointmentTime || '', description);
    return;
  }
  const file = buildVaccineCalendarFile(item);
  const href = URL.createObjectURL(new Blob([file], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = href;
  link.download = `疫苗预约-${record.appointmentOn}.ics`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

export function vaccineCalendarActionLabel() {
  return window.BabyCareNative?.addVaccineToCalendar ? '添加到手机日历' : '下载日历日程';
}
