import type { Subscription } from '@/domain/finance/types';

export type SubFilter = 'day' | 'month' | 'year';

/**
 * The next time a subscription renews, counting forward from `now`.
 * Walks month-by-month from the current month until it lands on a month that is
 * `intervalMonths` after the start month AND whose renewal moment is still ahead.
 */
export function nextRenewal(sub: Subscription, now: Date = new Date()): Date {
  const interval = sub.intervalMonths ?? 1;
  const start = sub.startDate
    ? new Date(sub.startDate)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMonthIdx = start.getFullYear() * 12 + start.getMonth();
  const [rh, rm] = (sub.reminderTime || '09:00').split(':').map(Number);

  for (let offset = 0; offset <= 24; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, sub.renewalDay, rh, rm, 0);
    const monthsFromStart = (d.getFullYear() * 12 + d.getMonth()) - startMonthIdx;
    if (monthsFromStart >= 0 && monthsFromStart % interval === 0 && d >= now) return d;
  }
  return new Date(now.getFullYear(), now.getMonth() + interval, sub.renewalDay);
}

/**
 * Which filter tab a subscription belongs to:
 *   day   — its next renewal lands today
 *   month — billed every < 12 months
 *   year  — billed every ≥ 12 months
 */
export function subMatchesFilter(sub: Subscription, filter: SubFilter, now: Date = new Date()): boolean {
  if (filter === 'day') {
    const n = nextRenewal(sub, now);
    return (
      n.getFullYear() === now.getFullYear() &&
      n.getMonth() === now.getMonth() &&
      n.getDate() === now.getDate()
    );
  }
  const interval = sub.intervalMonths ?? 1;
  return filter === 'month' ? interval < 12 : interval >= 12;
}

/**
 * What the subscriptions cost per month: each one's cost spread over its billing cycle
 * (a 3-month plan counts a third, a yearly one a twelfth).
 */
export function monthlySubscriptionCost(subs: Subscription[]): number {
  return subs.reduce((sum, sub) => sum + sub.cost / Math.max(1, sub.intervalMonths ?? 1), 0);
}

/** What's left of the monthly salary once the subscriptions are paid. Negative when they cost more. */
export function shareAfterSubscriptions(salary: number, subs: Subscription[]): number {
  return salary - monthlySubscriptionCost(subs);
}
