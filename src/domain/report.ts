export type ReportView = 'week' | 'month' | 'year';

export interface ReportPoint {
  name: string;
  value: number;
}

/** How many days' worth one bar of the chart stands for, relative to the weekly chart: a day, a week, a month. */
export function periodMultiplier(view: ReportView): number {
  return view === 'month' ? 7 : view === 'year' ? 30 : 1;
}

const WEEK_DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Daily totals for the charts: this week (Saturday first), this month in four week-long
 * buckets, and this year by month. `history` is keyed by `Date.toDateString()` and holds
 * finished days; `todayValue` is today's live value, added on top.
 *
 * Today can have BOTH: a day is archived into `history` at its close-out (Isha for Focus)
 * and its live counter is zeroed, while the calendar date hasn't changed yet. So today's
 * total is the live value plus whatever was already archived under today's key.
 */
export function buildPeriodReports(
  history: Record<string, number>,
  todayValue: number,
  now: Date = new Date(),
): Record<ReportView, ReportPoint[]> {
  const todayKey = now.toDateString();
  const today = todayValue + (history[todayKey] || 0);

  // Week — runs Saturday to Friday.
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 1) % 7));
  startOfWeek.setHours(0, 0, 0, 0);
  const week = WEEK_DAYS.map((name, i) => {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + i);
    const key = day.toDateString();
    if (key === todayKey) return { name, value: today };
    return { name, value: day > now ? 0 : history[key] || 0 };
  });

  // Month and year — finished days from history, then today on top.
  const monthTotals = [0, 0, 0, 0];
  const yearTotals = new Array<number>(12).fill(0);
  for (const [key, value] of Object.entries(history)) {
    const day = new Date(key);
    if (key === todayKey || day.getFullYear() !== now.getFullYear()) continue;
    yearTotals[day.getMonth()] += value;
    if (day.getMonth() === now.getMonth()) monthTotals[Math.min(Math.floor((day.getDate() - 1) / 7), 3)] += value;
  }
  monthTotals[Math.min(Math.floor((now.getDate() - 1) / 7), 3)] += today;
  yearTotals[now.getMonth()] += today;

  return {
    week,
    month: monthTotals.map((value, i) => ({ name: `Week ${i + 1}`, value })),
    year: MONTH_NAMES.map((name, i) => ({ name, value: yearTotals[i] })),
  };
}
