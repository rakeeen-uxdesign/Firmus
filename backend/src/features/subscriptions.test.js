import { describe, it, expect } from 'vitest';
import { cairoClock, isDueAt } from './subscriptions.js';

const sub = (over = {}) => ({ name: 'Netflix', cost: 300, renewalDay: 15, reminderTime: '09:00', intervalMonths: 1, startDate: '2026-01-10', ...over });
const clock = (year, month, day, hour = 9, minute = 0) => ({ year, month, day, hour, minute });

describe('isDueAt', () => {
  it('fires on the renewal day at the reminder time, and not a minute either side', () => {
    expect(isDueAt(sub(), clock(2026, 10, 15, 9, 0))).toBe(true);
    expect(isDueAt(sub(), clock(2026, 10, 15, 9, 1))).toBe(false);
    expect(isDueAt(sub(), clock(2026, 10, 14, 9, 0))).toBe(false);
  });

  it('defaults the reminder to 09:00', () => {
    expect(isDueAt(sub({ reminderTime: undefined }), clock(2026, 10, 15, 9, 0))).toBe(true);
  });

  it('a quarterly plan only fires every third month from its start', () => {
    const quarterly = sub({ intervalMonths: 3, startDate: '2026-01-10' });   // renews Jan, Apr, Jul, Oct
    expect(isDueAt(quarterly, clock(2026, 10, 15))).toBe(true);
    expect(isDueAt(quarterly, clock(2026, 11, 15))).toBe(false);
    expect(isDueAt(quarterly, clock(2026, 12, 15))).toBe(false);
    expect(isDueAt(quarterly, clock(2027, 1, 15))).toBe(true);
  });

  it('a yearly plan fires once a year, never before it started', () => {
    const yearly = sub({ intervalMonths: 12, startDate: '2026-03-01' });
    expect(isDueAt(yearly, clock(2027, 3, 15))).toBe(true);
    expect(isDueAt(yearly, clock(2026, 9, 15))).toBe(false);
    expect(isDueAt(yearly, clock(2026, 2, 15))).toBe(false);       // before the start month
  });

  it('a renewal day past the end of a short month falls on its last day', () => {
    expect(isDueAt(sub({ renewalDay: 31 }), clock(2026, 2, 28))).toBe(true);
    expect(isDueAt(sub({ renewalDay: 31 }), clock(2026, 4, 30))).toBe(true);
    expect(isDueAt(sub({ renewalDay: 31 }), clock(2026, 4, 29))).toBe(false);
  });

  it('with no start date, it is simply monthly', () => {
    expect(isDueAt(sub({ startDate: undefined, intervalMonths: 3 }), clock(2026, 11, 15))).toBe(true);
  });
});

describe('cairoClock', () => {
  it("reads the wall clock in Cairo, whatever the machine's own zone", () => {
    // 17:00 UTC in October is 19:00 or 20:00 in Cairo depending on summer time — the same day either way, and not 17.
    const { day, hour } = cairoClock(new Date('2026-10-17T17:00:00Z'));
    expect(day).toBe(17);
    expect([19, 20]).toContain(hour);
  });
});
