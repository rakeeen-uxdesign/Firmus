import { getDayMoments, type PrayerTimes } from '@/domain/devotion/prayer';
import type { GoldPrices } from '@/domain/finance/insights';

/** Gold prices as kept in Firestore: the two spot prices and when they were fetched (epoch ms). */
export interface StoredGoldPrices extends GoldPrices {
  fetchedAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** After a failed fetch, wait this long before trying again — the free plan is rate-limited. */
export const RETRY_AFTER_MS = 60 * 60 * 1000;

/**
 * The most recent Fajr or Maghrib that has already happened — the moment the prices should have
 * been refreshed at. Before today's Fajr that is yesterday's Maghrib.
 */
export function lastRefreshMoment(times: PrayerTimes | undefined, now: Date = new Date()): number {
  const { fajr, maghrib } = getDayMoments(times, now);
  const passed = [fajr, maghrib, maghrib - DAY_MS].filter((moment) => moment <= now.getTime());
  return Math.max(...passed);
}

/**
 * Whether it's time to fetch fresh prices: they have never been fetched, or the last fetch was
 * before the latest Fajr / Maghrib. So a refresh the app missed (closed at Fajr, API down) happens
 * the next time it can — and the stored prices stay put in between. `lastAttemptAt` throttles
 * retries after a failure.
 */
export function isGoldRefreshDue(
  stored: StoredGoldPrices | null,
  times: PrayerTimes | undefined,
  lastAttemptAt: number | null,
  now: Date = new Date(),
): boolean {
  if (lastAttemptAt !== null && now.getTime() - lastAttemptAt < RETRY_AFTER_MS) return false;
  return !stored || stored.fetchedAt < lastRefreshMoment(times, now);
}
