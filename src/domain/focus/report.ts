import { buildPeriodReports, periodMultiplier, type ReportView } from '@/domain/report';

export interface FocusReportPoint {
  name: string;
  hours: number;
}

/** Hours of focus per day the charts measure themselves against. */
export const DAILY_TARGET_HOURS = 10;

/** The target line for a chart: one day's worth per bar, scaled up for weeks and months. */
export const focusTargetHours = (view: ReportView) => DAILY_TARGET_HOURS * periodMultiplier(view);

const hours = (minutes: number) => Number((minutes / 60).toFixed(2));

/**
 * Focus hours for the charts. `history` holds finished days (keyed by `Date.toDateString()`);
 * `todayMinutes` — what's been focused so far today — is added on top.
 */
export function buildFocusReports(
  history: Record<string, { minutes?: number }>,
  todayMinutes: number,
  now: Date = new Date(),
): Record<ReportView, FocusReportPoint[]> {
  const minutes = Object.fromEntries(Object.entries(history).map(([key, day]) => [key, day.minutes || 0]));
  const reports = buildPeriodReports(minutes, todayMinutes, now);
  const toHours = (points: typeof reports.week) => points.map((p) => ({ name: p.name, hours: hours(p.value) }));
  return { week: toHours(reports.week), month: toHours(reports.month), year: toHours(reports.year) };
}
