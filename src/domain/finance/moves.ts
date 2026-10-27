import type { Debt, FinanceBanks, FinanceBuckets } from '@/domain/finance/types';

export interface MoneyMove {
  type: 'deposit' | 'withdraw';
  amount: number;
  bank: keyof FinanceBanks;
  /** A bucket is just an optional tag on the same movement — it changes by the same amount. */
  bucket: keyof FinanceBuckets | null;
  /** `reconcile` marks a correction made by matching the bank's own balance. */
  mode?: 'manual' | 'reconcile';
  /** What the movement was for, shown in the logs (e.g. 'Thndr'). */
  category?: string;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Why a move can't be made, or null when it can. Mirrors the Discord bot's rules. */
export function moveError(move: MoneyMove, banks: FinanceBanks, buckets: FinanceBuckets): string | null {
  if (!Number.isFinite(move.amount) || move.amount <= 0) return 'Enter an amount';
  if (move.type === 'withdraw') {
    if (move.amount > (banks[move.bank] || 0)) return 'More than the bank holds';
    if (move.bucket && move.amount > (buckets[move.bucket] || 0)) return 'More than the bucket holds';
  }
  return null;
}

/** The balances after a move, rounded to cents. Doesn't mutate its inputs. */
export function applyMove(
  banks: FinanceBanks,
  buckets: FinanceBuckets,
  move: MoneyMove,
): { banks: FinanceBanks; buckets: FinanceBuckets } {
  const delta = move.type === 'deposit' ? move.amount : -move.amount;
  return {
    banks: { ...banks, [move.bank]: cents((banks[move.bank] || 0) + delta) },
    buckets: move.bucket ? { ...buckets, [move.bucket]: cents((buckets[move.bucket] || 0) + delta) } : buckets,
  };
}

/** Taking money out of Tawarru' (the urgent fund) is a loan from yourself, so it's logged as a debt. */
export function urgentDebtFor(move: MoneyMove, id: string, now: Date = new Date()): Debt | null {
  if (move.type !== 'withdraw' || move.bucket !== 'tawarr2') return null;
  return {
    id,
    personName: 'Urgent',
    amount: move.amount,
    type: 'owed_by_me',
    notes: `Borrowed from Urgent bucket on ${now.toLocaleDateString('en-GB')}`,
  };
}
