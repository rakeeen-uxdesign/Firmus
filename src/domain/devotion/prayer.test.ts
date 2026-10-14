import { describe, it, expect } from 'vitest';
import { computeNextPrayer, isSleepWindow, getDayPhase, getDayMoments, isWaterClosed, isFocusNightLocked } from '@/domain/devotion/prayer';

const times = { Fajr: '04:24', Dhuhr: '12:03', Asr: '15:36', Maghrib: '18:30', Isha: '19:52' };

describe('computeNextPrayer', () => {
  it('null when there are no times', () => {
    expect(computeNextPrayer({}, new Date())).toBeNull();
  });

  it('picks the next prayer later today', () => {
    const np = computeNextPrayer(times, new Date('2026-09-10T13:00:00'));
    expect(np?.name).toBe('Asr');
    expect(np?.time).toBe('15:36');
  });

  it('counts down in MM:SS', () => {
    const np = computeNextPrayer(times, new Date('2026-09-10T15:00:00'));
    expect(np?.name).toBe('Asr');
    expect(np?.countdown).toBe('36:00');
    expect(np?.remainingMinutes).toBe(36);
  });

  it('after Isha, rolls to tomorrow\'s Fajr', () => {
    const np = computeNextPrayer(times, new Date('2026-09-10T21:00:00'));
    expect(np?.name).toBe('Fajr');
    expect(np?.remainingMinutes).toBeGreaterThan(6 * 60); // ~7h24m away
  });
});

describe('isSleepWindow — Isha … Fajr', () => {
  it('true just after Isha', () => {
    expect(isSleepWindow(times, new Date('2026-09-10T20:30:00'))).toBe(true);
  });
  it('true in the small hours', () => {
    expect(isSleepWindow(times, new Date('2026-09-10T03:00:00'))).toBe(true);
  });
  it('false during the day', () => {
    expect(isSleepWindow(times, new Date('2026-09-10T14:00:00'))).toBe(false);
  });
  it('falls back to 21:00 / 04:00 with no times', () => {
    expect(isSleepWindow(undefined, new Date('2026-09-10T22:00:00'))).toBe(true);
    expect(isSleepWindow(undefined, new Date('2026-09-10T10:00:00'))).toBe(false);
  });
});

describe('getDayPhase', () => {
  const t = { Fajr: '04:24', Sunrise: '05:55', Dhuhr: '12:03', Asr: '15:36', Maghrib: '18:30', Isha: '19:52' };
  const at = (hhmm: string) => new Date(`2026-09-10T${hhmm}:00`);

  it('walks through the day by real prayer times', () => {
    expect(getDayPhase(t, at('03:00'))).toBe('deepNight');
    expect(getDayPhase(t, at('05:00'))).toBe('fajrHour');
    expect(getDayPhase(t, at('07:00'))).toBe('morning');
    expect(getDayPhase(t, at('11:00'))).toBe('hunting');
    expect(getDayPhase(t, at('12:30'))).toBe('midday');
    expect(getDayPhase(t, at('14:00'))).toBe('push');
    expect(getDayPhase(t, at('17:00'))).toBe('birdsHome');
    expect(getDayPhase(t, at('17:45'))).toBe('goldenHour');   // the hour BEFORE Maghrib (18:30)
    expect(getDayPhase(t, at('18:29'))).toBe('goldenHour');
    expect(getDayPhase(t, at('18:30'))).toBe('dusk');         // sun is down — never golden hour
    expect(getDayPhase(t, at('19:00'))).toBe('dusk');
    expect(getDayPhase(t, at('19:30'))).toBe('ishaNear');
    expect(getDayPhase(t, at('21:00'))).toBe('night');
  });

  it('moves with the season — same clock time, different phase', () => {
    const winter = { Fajr: '05:15', Sunrise: '06:45', Dhuhr: '11:55', Asr: '14:40', Maghrib: '17:10', Isha: '18:35' };
    expect(getDayPhase(winter, at('16:30'))).toBe('goldenHour');
    expect(getDayPhase(t, at('16:30'))).toBe('birdsHome');
  });

  it('falls back to typical times when none are loaded', () => {
    expect(getDayPhase({}, at('03:00'))).toBe('deepNight');
    expect(getDayPhase(undefined, at('13:00'))).toBe('midday');
  });
});

describe('getDayMoments', () => {
  it('turns the API strings into today\'s epoch ms', () => {
    const m = getDayMoments({ Fajr: '04:24', Dhuhr: '12:03' }, new Date('2026-09-10T09:00:00'));
    expect(new Date(m.fajr).getHours()).toBe(4);
    expect(new Date(m.fajr).getMinutes()).toBe(24);
    expect(new Date(m.dhuhr).getHours()).toBe(12);
  });
  it('fills any missing prayer with a typical time', () => {
    const m = getDayMoments({}, new Date('2026-09-10T09:00:00'));
    expect(new Date(m.isha).getHours()).toBe(19);
    expect(new Date(m.isha).getMinutes()).toBe(0);
  });
});

describe('locks', () => {
  const t = { Fajr: '04:24', Dhuhr: '12:03', Asr: '15:36', Maghrib: '18:30', Isha: '19:52' };
  const at = (hhmm: string) => new Date(`2026-09-10T${hhmm}:00`);

  it('water is closed from Maghrib until Fajr', () => {
    expect(isWaterClosed(t, at('03:00'))).toBe(true);
    expect(isWaterClosed(t, at('04:30'))).toBe(false);
    expect(isWaterClosed(t, at('18:29'))).toBe(false);
    expect(isWaterClosed(t, at('18:30'))).toBe(true);
  });

  it('new focus is locked from Isha until Fajr — later than the water lock', () => {
    expect(isFocusNightLocked(t, at('19:00'))).toBe(false);
    expect(isFocusNightLocked(t, at('19:52'))).toBe(true);
    expect(isFocusNightLocked(t, at('04:00'))).toBe(true);
    expect(isFocusNightLocked(t, at('05:00'))).toBe(false);
  });

  it('falls back to typical times before the prayer times load', () => {
    expect(isWaterClosed(undefined, at('18:30'))).toBe(true);
    expect(isFocusNightLocked({}, at('12:00'))).toBe(false);
  });
});
