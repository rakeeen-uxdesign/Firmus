/** Rules for a focus session. */

/**
 * A break is 20% of the focus time just completed (base + overtime),
 * rounded, never shorter than a minute.
 *   25m focus → 5m    ·   50m → 10m   ·   3m → 1m
 */
export function breakMinutesFor(focusGainedMinutes: number): number {
  return Math.max(1, Math.round(focusGainedMinutes * 0.2));
}

/** One day of Focus: how many sessions were finished and how many minutes they added up to. */
export interface FocusDayStats {
  sessions: number;
  minutes: number;
}

/** A day in the Focus week array. The seed data only has `sessions`; `minutes` appears once something is logged. */
export interface FocusWeekDay {
  day?: string;
  sessions: number;
  minutes?: number;
}

/** What the app tells the Discord bot happened in a focus session; the bot turns it into a message. */
export interface FocusNotification {
  /** Unique per event, so the bot posts each one once. */
  id: string;
  type: 'focus_timer_up' | 'focus_complete' | 'break_complete';
  /** The session's goal, in minutes. */
  focusMinutes: number;
  /** Time past the goal, in seconds (0 unless the session ran over). */
  overtimeSeconds: number;
  at: string;             // ISO
}

/** One finished session in today's log. */
export interface FocusLogEntry {
  time: string;
  duration: number;
}

/** The week with one more session, of `focusedMinutes`, counted on day `dayIndex`. Doesn't mutate `week`. */
export function recordSession(week: FocusWeekDay[], dayIndex: number, focusedMinutes: number): FocusWeekDay[] {
  return week.map((day, i) =>
    i === dayIndex ? { ...day, sessions: day.sessions + 1, minutes: (day.minutes || 0) + focusedMinutes } : day,
  );
}
