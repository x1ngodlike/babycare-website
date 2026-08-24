export const DAILY_REPORT_AUTO_OPEN_HOUR = 8;

export function canAutoOpenDailyReport(now = new Date()) {
  return now.getHours() >= DAILY_REPORT_AUTO_OPEN_HOUR;
}

export function millisecondsUntilDailyReportAutoOpen(now = new Date()) {
  if (canAutoOpenDailyReport(now)) return 0;
  const release = new Date(now);
  release.setHours(DAILY_REPORT_AUTO_OPEN_HOUR, 0, 0, 0);
  return Math.max(0, release.getTime() - now.getTime());
}
