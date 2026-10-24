import type { DayPhase } from '@/domain/devotion/prayer';
import { pickBlessing, pickPoolLine } from '@/domain/linePool';
import { DAILY_TARGET_HOURS } from '@/domain/focus/report';

export interface DayTotals { water: number; focus: number; workout: number }

/** Whole days since the most recent day (before `todayKey`) with any logged activity; null if there is none. */
export function daysSinceActive(history: Record<string, DayTotals>, todayKey: string): number | null {
  let latest: string | null = null;
  for (const [key, d] of Object.entries(history)) {
    if (key >= todayKey) continue;
    if ((d?.water || 0) + (d?.focus || 0) + (d?.workout || 0) <= 0) continue;
    if (!latest || key > latest) latest = key;
  }
  if (!latest) return null;
  return Math.round((Date.parse(todayKey) - Date.parse(latest)) / 86_400_000);
}

/** Welcome-back line after a gap, only while today is still empty. */
export function getAbsenceLine(daysAway: number | null, todayEmpty: boolean): string | null {
  if (!todayEmpty || daysAway === null || daysAway < 2) return null;
  return `BACK AFTER ${daysAway} DAYS ... THE DASHBOARD MISSED YOU `;
}

const DAYTIME: DayPhase[] = ['morning', 'hunting', 'midday', 'push', 'birdsHome'];
/** Phases in which a low glass count is worth a nudge (water closes at Maghrib). */
const WATER_NUDGE_PHASES: DayPhase[] = ['hunting', 'midday', 'push', 'birdsHome'];
/** The week's-trend lines are a morning framing, not something to repeat all day. */
const TREND_PHASES: DayPhase[] = ['fajrHour', 'morning', 'hunting'];
/** Early enough in the day that "still early" is true — before the afternoon push. */
const EARLY_DAY: DayPhase[] = ['morning', 'hunting', 'midday', 'push'];

/** Glasses that fill the day — the same goal the Water screen counts toward. */
export const WATER_GOAL_GLASSES = 12;

/** A finished daily goal, celebrated in the header with that many small vectors instead of a sentence. */
export interface Achievement { kind: 'water' | 'focus'; count: number }

/** The goal reached today, if any; water is checked first. */
export function getAchievement(glasses: number, focusMinutes: number): Achievement | null {
  if (glasses >= WATER_GOAL_GLASSES) return { kind: 'water', count: WATER_GOAL_GLASSES };
  if (focusMinutes >= DAILY_TARGET_HOURS * 60) return { kind: 'focus', count: DAILY_TARGET_HOURS };
  return null;
}

/** Lines that quote today's real numbers back — only when there's something worth praising. */
export function getProgressLine(glasses: number, focusMinutes: number, phase: DayPhase): string | null {
  if (focusMinutes >= 120) return `${Math.floor(focusMinutes / 60)}H OF FOCUS ALREADY ... LOOK AT YOU GO `;
  if (glasses >= 8 && EARLY_DAY.includes(phase)) return `${glasses} GLASSES AND THE DAY IS BARELY WARM ... SHOW OFF `;
  return null;
}

export interface Weather { temp: number; code: number }

/** WMO codes that mean rain / drizzle / showers / thunderstorm. */
const WET = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

/** A weather remark, daytime only, and only when the weather is actually notable. */
export function getWeatherLine(w: Weather | null, phase: DayPhase): string | null {
  if (!w || !DAYTIME.includes(phase)) return null;
  if (WET.has(w.code)) return "IT'S RAINING ... PERFECT EXCUSE TO STAY IN AND GET THINGS DONE ";
  if (w.temp >= 38) return `${Math.round(w.temp)}° OUTSIDE ... DRINK LIKE A CAMEL ON PURPOSE `;
  if (w.temp <= 12) return `${Math.round(w.temp)}° OUTSIDE ... SWEATER WEATHER, NO ARGUING `;
  return null;
}

export interface LiveFocus {
  /** Minutes of the CURRENT focus session so far (overtime included); 0 when none is in progress. */
  elapsedMin: number;
  /** Minutes left on the session's goal; 0 once in overtime. */
  remainingMin: number;
  /** Minutes already banked today from finished sessions. */
  savedTodayMin: number;
}

/**
 * Lines about a focus session WHILE it runs — no need to press Done. Totals count the
 * live session on top of what's already saved today. Returns null when nothing is in
 * progress or it's too early to say anything.
 */
export function getLiveFocusLine({ elapsedMin, remainingMin, savedTodayMin }: LiveFocus): string | null {
  if (elapsedMin < 1) return null;
  const todayMin = savedTodayMin + elapsedMin;
  if (remainingMin > 0 && remainingMin <= 5) return `${Math.ceil(remainingMin)} MIN LEFT ... YOU CAN SEE THE FINISH LINE `;
  if (todayMin >= 120) return `${Math.floor(todayMin / 60)}H OF FOCUS TODAY ... YOUR PHONE IS CRYING SOMEWHERE `;
  if (elapsedMin >= 30) return `${Math.floor(elapsedMin / 30) * 30} MIN DEEP ... THE WORLD CAN WAIT `;
  if (elapsedMin >= 10) return 'IN THE ZONE ... DO NOT DISTURB, EVEN YOURSELF ';
  return null;
}

const WEEK_PATTERN_LINES: Record<string, string> = {
  momentum: "THREE GOOD DAYS IN A ROW ... YOU'RE ON A ROLL ",
  slump: 'THIS WEEK WAS SLOW ... IT HAPPENS, TODAY IS NEW ',
  rising: "THINGS ARE LOOKING UP ... KEEP THE STREAK WARM ",
  fading: 'YOU HAVE BEEN QUIET LATELY ... COME SAY HI ',
};

export interface GreetingInputs {
  phase: DayPhase;
  /** From `getLiveFocusLine` — a focus session is running. */
  liveFocus: string | null;
  /** A prayer is minutes away; it outranks the live focus line. */
  prayerImminent: boolean;
  /** From `getOccasionLine`. */
  occasion: string | null;
  absence: string | null;
  weekPattern: string;
  weather: string | null;
  progress: string | null;
  glasses: number;
  focusMinutes: number;
  focusRunning: boolean;
  isFriday: boolean;
  now: Date;
}

/**
 * The header line, most notable condition first: a running focus session, a prayer or
 * occasion, a return after absence, weather, real numbers, then the nudges
 * (low water, no focus), Friday, the week's trend (mornings only, so it never buries
 * the rest of the day), and finally today's line from the rotating pool for this part of the day
 * (love, design & art, nature — see `pickPoolLine`).
 *
 * A focus session otherwise wins outright for as long as it runs — for someone who's at
 * their desk focusing most of the day, that's literally every line but one, forever. Once
 * every few minutes it steps aside so everything below actually gets a turn, falling
 * straight back to the focus line itself if nothing else has anything to say that minute.
 */
export function pickGreetingLine(g: GreetingInputs): string {
  const waterLow = g.glasses < 3 && WATER_NUDGE_PHASES.includes(g.phase);
  const noFocus = g.focusMinutes === 0 && !g.focusRunning &&
    (g.phase === 'push' || g.phase === 'birdsHome' || g.phase === 'goldenHour' || g.phase === 'dusk');
  const yieldLiveFocus = g.now.getMinutes() % 5 === 0;

  if (g.liveFocus && !g.prayerImminent && !yieldLiveFocus) return g.liveFocus;
  if (g.occasion) return g.occasion;
  if (g.absence) return g.absence;
  if (g.weather) return g.weather;
  if (g.progress) return g.progress;
  if (waterLow) return 'YOUR WATER BOTTLE IS FEELING LONELY ... ';
  if (noFocus) return "NO FOCUS YET ... THE TIMER IS GETTING BORED ";
  if (g.isFriday) return "HAPPY JUMU'AH ... SURAT AL-KAHF IS WAITING ";
  if (TREND_PHASES.includes(g.phase) && WEEK_PATTERN_LINES[g.weekPattern]) return WEEK_PATTERN_LINES[g.weekPattern];
  if (g.liveFocus && !g.prayerImminent) return g.liveFocus;
  return pickPoolLine(g.phase, g.now);
}

/** What the header shows: a sentence, or — once a daily goal is reached — vectors plus a blessing. */
export interface HeaderChoice { text: string; achievement: Achievement | null }

/**
 * `pickGreetingLine`, plus the goal celebration: a finished goal replaces everything except
 * an occasion (Eid, Ramadan, a prayer a few minutes away) with its row of vectors and a blessing.
 */
export function pickHeader(g: GreetingInputs & { achievement: Achievement | null }): HeaderChoice {
  if (g.achievement && !g.occasion) return { text: pickBlessing(g.now), achievement: g.achievement };
  return { text: pickGreetingLine(g), achievement: null };
}
