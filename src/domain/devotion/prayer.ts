/** Prayer-time arithmetic. Input is the aladhan `timings` map; nothing here fetches. */

export type PrayerTimes = Record<string, string>; // e.g. { Fajr: "04:24", Dhuhr: "12:03", … }

export interface NextPrayer {
  name: string;
  time: string;
  countdown: string;          // "MM:SS"
  remainingMinutes: number;
  totalRemainingSeconds: number;
}

const ORDER = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

function countdown(fromMs: number): Pick<NextPrayer, 'countdown' | 'remainingMinutes' | 'totalRemainingSeconds'> {
  const mins = Math.floor(fromMs / 60000);
  const secs = Math.floor((fromMs % 60000) / 1000);
  return {
    countdown: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
    remainingMinutes: mins,
    totalRemainingSeconds: Math.floor(fromMs / 1000),
  };
}

/**
 * The next prayer after `now`. Once Isha has passed, rolls to tomorrow's Fajr.
 * Returns `null` when no times are available (caller should leave state untouched).
 */
export function computeNextPrayer(times: PrayerTimes, now: Date = new Date()): NextPrayer | null {
  if (!times || Object.keys(times).length === 0) return null;

  for (const name of ORDER) {
    const timeStr = times[name];
    if (!timeStr) continue;
    const [h, m] = timeStr.split(':').map(Number);
    const at = new Date(now);
    at.setHours(h, m, 0, 0);
    if (at > now) {
      return { name, time: timeStr, ...countdown(at.getTime() - now.getTime()) };
    }
  }

  // everything today has passed → tomorrow's Fajr
  const timeStr = times['Fajr'];
  if (timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const at = new Date(now);
    at.setDate(at.getDate() + 1);
    at.setHours(h, m, 0, 0);
    return { name: 'Fajr', time: timeStr, ...countdown(at.getTime() - now.getTime()) };
  }
  return { name: 'Fajr', time: timeStr, countdown: '--:--', remainingMinutes: 999, totalRemainingSeconds: 0 };
}

/**
 * The "wind down for the night" window: from the real Isha adhan until the real
 * Fajr adhan the next morning. Falls back to 21:00 / 04:00 before times load.
 */
export function isSleepWindow(times: PrayerTimes | undefined, now: Date = new Date()): boolean {
  const [fajrH, fajrM] = (times?.Fajr || '04:00').split(':').map(Number);
  const fajr = new Date(now); fajr.setHours(fajrH, fajrM, 0, 0);

  const [ishaH, ishaM] = (times?.Isha || '21:00').split(':').map(Number);
  const isha = new Date(now); isha.setHours(ishaH, ishaM, 0, 0);

  return now >= isha || now < fajr;
}

/** Water is closed from Maghrib (when the day is archived) until Fajr. */
export function isWaterClosed(times: PrayerTimes | undefined, now: Date = new Date()): boolean {
  const { fajr, maghrib } = getDayMoments(times, now);
  return now.getTime() >= maghrib || now.getTime() < fajr;
}

/** New focus sessions can't start from Isha until Fajr. */
export function isFocusNightLocked(times: PrayerTimes | undefined, now: Date = new Date()): boolean {
  const { fajr, isha } = getDayMoments(times, now);
  return now.getTime() >= isha || now.getTime() < fajr;
}

export type DayPhase =
  | 'deepNight' | 'fajrHour' | 'morning' | 'hunting' | 'midday'
  | 'push' | 'birdsHome' | 'goldenHour' | 'dusk' | 'ishaNear' | 'night';

const MIN = 60_000;

/** Typical times, used for any prayer the API map doesn't have (yet). */
const FALLBACK_TIMES = { Fajr: '04:00', Sunrise: '05:30', Dhuhr: '12:00', Asr: '15:30', Maghrib: '18:00', Isha: '19:00' } as const;

/** Today's prayer moments as epoch ms, so callers can compare and add minutes directly. */
export interface DayMoments { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number }

export function getDayMoments(times: PrayerTimes | undefined, now: Date = new Date()): DayMoments {
  const at = (key: keyof typeof FALLBACK_TIMES) => {
    const [h, m] = (times?.[key] || FALLBACK_TIMES[key]).split(':').map(Number);
    return new Date(now).setHours(h, m, 0, 0);
  };
  return {
    fajr: at('Fajr'), sunrise: at('Sunrise'), dhuhr: at('Dhuhr'),
    asr: at('Asr'), maghrib: at('Maghrib'), isha: at('Isha'),
  };
}

/**
 * Where "now" sits in the day, measured against the real prayer times rather than
 * fixed clock hours — so the header line shifts with the seasons. Falls back to
 * typical times for any prayer the map doesn't have yet.
 *
 *   before Fajr → deepNight · Fajr→Sunrise → fajrHour · Sunrise→mid-morning → morning
 *   → Dhuhr → hunting · Dhuhr→+90m → midday · →Asr → push · →Maghrib−60m → birdsHome
 *   Maghrib−60m→Maghrib → goldenHour (the hour before sunset) · Maghrib→Isha−30m → dusk
 *   Isha−30m→Isha → ishaNear · after Isha → night
 */
export function getDayPhase(times: PrayerTimes | undefined, now: Date = new Date()): DayPhase {
  const { fajr, sunrise, dhuhr, asr, maghrib, isha } = getDayMoments(times, now);
  const t = now.getTime();

  if (t < fajr) return 'deepNight';
  if (t < sunrise) return 'fajrHour';
  if (t < sunrise + (dhuhr - sunrise) / 2) return 'morning';
  if (t < dhuhr) return 'hunting';
  if (t < dhuhr + 90 * MIN) return 'midday';
  if (t < asr) return 'push';
  if (t < maghrib - 60 * MIN) return 'birdsHome';
  if (t < maghrib) return 'goldenHour';
  if (t < isha - 30 * MIN) return 'dusk';
  if (t < isha) return 'ishaNear';
  return 'night';
}
