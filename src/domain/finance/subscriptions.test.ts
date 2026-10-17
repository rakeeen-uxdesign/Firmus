import { describe, it, expect } from 'vitest';
import { monthlySubscriptionCost, nextRenewal, shareAfterSubscriptions, subMatchesFilter } from '@/domain/finance/subscriptions';
import type { Subscription } from '@/domain/finance/types';

const base: Subscription = {
  id: '1', name: 'X', cost: 100, renewalDay: 15,
  reminderTime: '09:00', bank: 'CIB', intervalMonths: 1,
};

const now = new Date('2026-09-10T12:00:00'); // 10 Sep, midday

describe('nextRenewal', () => {
  it('monthly: next is the 15th of this month when still ahead', () => {
    const n = nextRenewal(base, now);
    expect(n.getMonth()).toBe(8);   // September
    expect(n.getDate()).toBe(15);
    expect(n.getHours()).toBe(9);
  });

  it('monthly: rolls to next month once this month\'s day has passed', () => {
    const late = new Date('2026-09-20T12:00:00');
    const n = nextRenewal(base, late);
    expect(n.getMonth()).toBe(9);   // October
    expect(n.getDate()).toBe(15);
  });

  it('quarterly from a start date: only lands on aligned months', () => {
    const q: Subscription = { ...base, intervalMonths: 3, startDate: '2026-01-15' };
    // Jan + 3n → Apr, Jul, Oct … next after 10 Sep is Oct
    const n = nextRenewal(q, now);
    expect(n.getMonth()).toBe(9);
    expect(n.getDate()).toBe(15);
  });
});

describe('subMatchesFilter', () => {
  it('day: true only when the next renewal is today', () => {
    const today: Subscription = { ...base, renewalDay: 10, reminderTime: '23:00' };
    expect(subMatchesFilter(today, 'day', now)).toBe(true);
    expect(subMatchesFilter(base, 'day', now)).toBe(false); // renews the 15th
  });

  it('month: monthly-ish (interval < 12)', () => {
    expect(subMatchesFilter({ ...base, intervalMonths: 1 }, 'month', now)).toBe(true);
    expect(subMatchesFilter({ ...base, intervalMonths: 3 }, 'month', now)).toBe(true);
    expect(subMatchesFilter({ ...base, intervalMonths: 12 }, 'month', now)).toBe(false);
  });

  it('year: interval ≥ 12', () => {
    expect(subMatchesFilter({ ...base, intervalMonths: 12 }, 'year', now)).toBe(true);
    expect(subMatchesFilter({ ...base, intervalMonths: 1 }, 'year', now)).toBe(false);
  });
});

describe('monthlySubscriptionCost / shareAfterSubscriptions', () => {
  const sub = (cost: number, intervalMonths: number) => ({ id: `${cost}-${intervalMonths}`, name: 'x', cost, renewalDay: 1, reminderTime: '09:00', bank: 'CIB', intervalMonths });

  it('spreads each plan over its billing cycle', () => {
    expect(monthlySubscriptionCost([sub(100, 1), sub(300, 3), sub(1200, 12)])).toBe(300);
  });

  it('subtracts that from the salary, and can go negative', () => {
    expect(shareAfterSubscriptions(7000, [sub(1000, 1)])).toBe(6000);
    expect(shareAfterSubscriptions(500, [sub(1000, 1)])).toBe(-500);
    expect(shareAfterSubscriptions(7000, [])).toBe(7000);
  });
});
