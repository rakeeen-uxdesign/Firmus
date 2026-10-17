import type { Debt, FinanceBanks, FinanceBuckets, FinanceLog, GoldAsset, Subscription } from '@/domain/finance/types';
import { nextRenewal } from '@/domain/finance/subscriptions';
import { EMPTY_BANKS, EMPTY_BUCKETS } from '@/domain/finance/defaults';

/** Balances largest first. */
function ranked<K extends string>(values: Record<K, number>): Array<{ key: K; balance: number }> {
  return (Object.keys(values) as K[])
    .map((key) => ({ key, balance: values[key] || 0 }))
    .sort((a, b) => b.balance - a.balance);
}

export const rankBanks = (banks: FinanceBanks) => ranked({ ...EMPTY_BANKS, ...banks });

/** Buckets split the same money, so this ranks what's allocated; Future also counts the gold and Thndr held (`heldValue`). */
export const rankBuckets = (buckets: FinanceBuckets, heldValue: number) =>
  ranked({ ...EMPTY_BUCKETS, ...buckets, mustaqbal: (buckets.mustaqbal || 0) + heldValue });

export const sumOf = (values: FinanceBanks | FinanceBuckets) => (Object.values(values) as number[]).reduce((a, b) => a + (b || 0), 0);

export interface Upcoming {
  sub: Subscription;
  next: Date;
  /** Whole days from now, 0 = today. */
  daysLeft: number;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** The soonest renewals first. */
export function upcomingRenewals(subs: Subscription[], now: Date = new Date(), limit = Infinity): Upcoming[] {
  return subs
    .map((sub) => {
      const next = nextRenewal(sub, now);
      return { sub, next, daysLeft: Math.round((startOfDay(next) - startOfDay(now)) / 86_400_000) };
    })
    .sort((a, b) => a.next.getTime() - b.next.getTime())
    .slice(0, limit);
}

/** "Today", "in 5d", or "in 2mo" once it's far enough away that days stop being useful. */
export const countdownLabel = (daysLeft: number) =>
  daysLeft <= 0 ? 'Today' : daysLeft >= 60 ? `in ${Math.round(daysLeft / 30)}mo` : `in ${daysLeft}d`;

/** What others owe you and what you owe. */
export function debtTotals(debts: Debt[]) {
  const owedToMe = debts.filter((d) => d.type === 'owed_to_me').reduce((s, d) => s + d.amount, 0);
  const owedByMe = debts.filter((d) => d.type === 'owed_by_me').reduce((s, d) => s + d.amount, 0);
  return { owedToMe, owedByMe };
}

export interface GoldPrices { price24: number; price21: number }

export const goldAssetValue = (asset: GoldAsset, prices: GoldPrices | null) =>
  prices ? asset.quantity * (asset.carat === 24 ? prices.price24 : prices.price21) : 0;

export function goldSummary(gold: GoldAsset[], prices: GoldPrices | null) {
  const value = gold.reduce((s, g) => s + goldAssetValue(g, prices), 0);
  const weight = gold.reduce((s, g) => s + g.quantity, 0);
  // P&L only counts assets bought at a known price.
  const bought = gold.filter((g): g is GoldAsset & { purchasePrice: number } => !!g.purchasePrice);
  const pnl = prices && bought.length
    ? bought.reduce((s, g) => s + goldAssetValue(g, prices) - g.purchasePrice * g.quantity, 0)
    : null;
  return { value, weight, pnl };
}

export type LogRange = 'day' | 'month' | 'year';

/** Logs inside the current day / month / year, newest first as stored. */
export function logsInRange(logs: FinanceLog[], range: LogRange, now: Date = new Date()): FinanceLog[] {
  return logs.filter((log) => {
    const d = new Date(log.timestamp);
    if (d.getFullYear() !== now.getFullYear()) return false;
    if (range === 'year') return true;
    if (d.getMonth() !== now.getMonth()) return false;
    return range === 'month' || d.getDate() === now.getDate();
  });
}

export interface LogDay {
  /** YYYY-MM-DD in local time */
  key: string;
  date: Date;
  logs: FinanceLog[];
  deposits: number;
  withdrawals: number;
}

/** Logs grouped by local day, newest day first, with each day's totals in and out. */
export function groupLogsByDay(logs: FinanceLog[]): LogDay[] {
  const days = new Map<string, LogDay>();
  for (const log of logs) {
    const date = new Date(log.timestamp);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const day = days.get(key) ?? { key, date, logs: [], deposits: 0, withdrawals: 0 };
    day.logs.push(log);
    // Assignments only shuffle money between buckets, so they're not money in or out.
    if (log.type === 'deposit') day.deposits += log.amount;
    else if (log.type === 'withdraw') day.withdrawals += log.amount;
    days.set(key, day);
  }
  return [...days.values()].sort((a, b) => b.key.localeCompare(a.key));
}
