import { describe, it, expect } from 'vitest';
import { getOccasionLine } from '@/domain/devotion/occasion';

const times = { Fajr: '04:24', Sunrise: '05:55', Dhuhr: '12:03', Asr: '15:36', Maghrib: '18:30', Isha: '19:52' };
// 2026-09-10 is a Thursday, 2026-09-11 a Friday.
const thu = (hhmm: string) => new Date(`2026-09-10T${hhmm}:00`);
const fri = (hhmm: string) => new Date(`2026-09-11T${hhmm}:00`);

describe('getOccasionLine', () => {
  it('is quiet in the middle of an ordinary day', () => {
    expect(getOccasionLine(times, { day: 5, month: 3 }, thu('10:00'))).toBeNull();
  });

  it('counts down to a prayer in 5-minute steps, starting 15 minutes out', () => {
    expect(getOccasionLine(times, null, thu('11:48'))).toBe("DHUHR IN 15 MIN ... FINISH THAT SENTENCE AND GO ");
    expect(getOccasionLine(times, null, thu('11:55'))).toBe("DHUHR IN 10 MIN ... FINISH THAT SENTENCE AND GO ");
    expect(getOccasionLine(times, null, thu('11:46'))).toBeNull();
  });

  it('on Friday, Jumu\'ah replaces the Dhuhr countdown and the hour before Maghrib is for dua', () => {
    expect(getOccasionLine(times, null, fri('11:30'))).toContain("JUMU'AH IN");
    expect(getOccasionLine(times, null, fri('17:45'))).toContain('HOUR OF DUA');
    expect(getOccasionLine(times, null, fri('16:00'))).toBeNull();
  });

  it('counts the final minutes exactly', () => {
    expect(getOccasionLine(times, null, thu('11:58'))).toBe("DHUHR IN 5 MIN ... FINISH THAT SENTENCE AND GO ");
    expect(getOccasionLine(times, null, thu('12:01'))).toBe("DHUHR IN 2 MIN ... FINISH THAT SENTENCE AND GO ");
  });

  it('sunrise adhkar, then Duha', () => {
    expect(getOccasionLine(times, null, thu('06:05'))).toContain('MORNING ADHKAR');
    expect(getOccasionLine(times, null, thu('06:30'))).toContain('DUHA');
    expect(getOccasionLine(times, null, thu('09:00'))).toBeNull();
  });

  it('Ramadan: suhoor, iftar, taraweeh, last ten nights', () => {
    const r = (day: number) => ({ day, month: 9 });
    expect(getOccasionLine(times, r(5), thu('03:55'))).toContain('SUHOOR');
    expect(getOccasionLine(times, r(5), thu('18:00'))).toBe('IFTAR IN 30 MIN ... THE DATES ARE STARING AT YOU ');
    expect(getOccasionLine(times, r(5), thu('18:40'))).toContain('BISMILLAH');
    expect(getOccasionLine(times, r(5), thu('20:30'))).toContain('TARAWEEH');
    expect(getOccasionLine(times, r(25), thu('22:30'))).toContain('LAST TEN NIGHTS');
  });

  it('festivals and white days', () => {
    expect(getOccasionLine(times, { day: 1, month: 10 }, thu('10:00'))).toContain('EID MUBARAK');
    expect(getOccasionLine(times, { day: 9, month: 12 }, thu('10:00'))).toContain('ARAFAH');
    expect(getOccasionLine(times, { day: 10, month: 12 }, thu('10:00'))).toContain('EID AL-ADHA');
    expect(getOccasionLine(times, { day: 14, month: 3 }, thu('09:00'))).toContain('WHITE DAYS');
  });
});
