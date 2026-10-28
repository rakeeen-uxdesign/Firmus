/**
 * Firmus's notion of "which day is it".
 *
 * Water, fitness and journalling run on a **logical day** that rolls at 04:00
 * (around Fajr), not midnight — so 00:00–03:59 still belongs to the day before.
 * Focus sessions are different: they count toward the **real** calendar day and
 * flip at midnight (the archive-to-history step happens separately, at Isha).
 *
 * Every function takes an optional `now` so behaviour is testable; it defaults
 * to the real clock, matching the previous call sites exactly.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const LOGICAL_DAY_ROLLS_AT_HOUR = 4;

/** Mon = 0 … Sun = 6 (JS `getDay()` has Sun = 0). */
function mondayFirstIndex(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

/** The logical day for water / fitness / journal — rolls at 04:00. */
export function getLogicalDate(now: Date = new Date()): Date {
  if (now.getHours() < LOGICAL_DAY_ROLLS_AT_HOUR) {
    return new Date(now.getTime() - DAY_MS);
  }
  return new Date(now);
}

/** The day a focus session counts toward — the real calendar day, no rollback. */
export function getPomoLogicalDate(now: Date = new Date()): Date {
  return new Date(now);
}

/** Weekday index (Mon-first) for focus sessions. */
export function getPomoTodayIdx(now: Date = new Date()): number {
  return mondayFirstIndex(getPomoLogicalDate(now));
}

/** Whether `now` falls on a Friday (JS `getDay()` has Fri = 5). */
export function isFriday(now: Date = new Date()): boolean {
  return now.getDay() === 5;
}
