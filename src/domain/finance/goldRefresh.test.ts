import { describe, it, expect } from 'vitest';
import { isGoldRefreshDue, lastRefreshMoment, RETRY_AFTER_MS, type StoredGoldPrices } from '@/domain/finance/goldRefresh';

const times = { Fajr: '04:30', Sunrise: '06:00', Dhuhr: '12:00', Asr: '15:30', Maghrib: '18:00', Isha: '19:30' };
const at = (day: number, hhmm: string) => new Date(`2026-10-${String(day).padStart(2, '0')}T${hhmm}:00`);
const stored = (fetchedAt: Date): StoredGoldPrices => ({ price24: 7000, price21: 6100, fetchedAt: fetchedAt.getTime() });

describe('lastRefreshMoment', () => {
  it('after Maghrib it is today\'s Maghrib', () => {
    expect(lastRefreshMoment(times, at(10, '21:00'))).toBe(at(10, '18:00').getTime());
  });
  it('between Fajr and Maghrib it is today\'s Fajr', () => {
    expect(lastRefreshMoment(times, at(10, '12:00'))).toBe(at(10, '04:30').getTime());
  });
  it('before Fajr it is yesterday\'s Maghrib', () => {
    expect(lastRefreshMoment(times, at(10, '02:00'))).toBe(at(9, '18:00').getTime());
  });
  it('moves with the season: the times given decide, not fixed hours', () => {
    const winter = { ...times, Fajr: '05:15', Maghrib: '17:00' };
    expect(lastRefreshMoment(winter, at(10, '17:30'))).toBe(at(10, '17:00').getTime());
  });
});

describe('isGoldRefreshDue', () => {
  it('is due when nothing has ever been fetched', () => {
    expect(isGoldRefreshDue(null, times, null, at(10, '12:00'))).toBe(true);
  });

  it('is due once Fajr passes after the last fetch, and not before', () => {
    const lastNight = stored(at(9, '18:20'));
    expect(isGoldRefreshDue(lastNight, times, null, at(10, '03:00'))).toBe(false);   // still the Maghrib fetch
    expect(isGoldRefreshDue(lastNight, times, null, at(10, '04:31'))).toBe(true);    // Fajr passed
  });

  it('is not due again once the fetch is after that Fajr', () => {
    const afterFajr = stored(at(10, '05:00'));
    expect(isGoldRefreshDue(afterFajr, times, null, at(10, '11:00'))).toBe(false);
    expect(isGoldRefreshDue(afterFajr, times, null, at(10, '17:59'))).toBe(false);
    expect(isGoldRefreshDue(afterFajr, times, null, at(10, '18:01'))).toBe(true);    // Maghrib passed
  });

  it('catches up on a refresh that was missed (app closed, API down)', () => {
    const twoDaysAgo = stored(at(8, '19:00'));
    expect(isGoldRefreshDue(twoDaysAgo, times, null, at(10, '09:00'))).toBe(true);
  });

  it('waits an hour after a failed attempt before trying again', () => {
    const old = stored(at(9, '18:20'));
    const attempt = at(10, '09:00').getTime();
    expect(isGoldRefreshDue(old, times, attempt, at(10, '09:30'))).toBe(false);
    expect(isGoldRefreshDue(old, times, attempt, new Date(attempt + RETRY_AFTER_MS))).toBe(true);
  });
});
