import type { Debt, FinanceBanks, FinanceBuckets } from '@/domain/finance/types';
import type { MoneyMove } from '@/domain/finance/moves';
import { sumOf } from '@/domain/finance/insights';

/** EGP assigned to each bucket. */
export type Allocations = Partial<Record<keyof FinanceBuckets, number>>;
/** Each bucket's share of an income, 0–100. */
export type Percentages = Partial<Record<keyof FinanceBuckets, number>>;

export const BUCKET_ORDER: Array<keyof FinanceBuckets> = ['mustaqbal', 'tawarr2', 'basmala', 'sadaqa'];

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Free money: what the banks hold beyond what the buckets claim. It's your own money, kept
 * in a bank on purpose — positive is normal. Negative means the buckets claim more than the
 * banks hold, i.e. something left a bank without saying which bucket paid for it.
 */
export const freeMoneyOf = (banks: FinanceBanks, buckets: FinanceBuckets) => cents(sumOf(banks) - sumOf(buckets));

export const allocationTotal = (a: Allocations) => cents(BUCKET_ORDER.reduce((s, k) => s + (a[k] || 0), 0));

/** What's left of `amount` once `allocations` are taken out (negative when over-allocated). */
export const remainderOf = (amount: number, allocations: Allocations) => cents(amount - allocationTotal(allocations));

/**
 * Turns remembered percentages into whole-pound amounts for `amount`. Never hands out more
 * than there is; whatever is left stays unassigned.
 */
export function suggestAllocations(amount: number, percents: Percentages): Allocations {
  const out: Allocations = {};
  let left = Math.max(0, Math.floor(amount));
  for (const key of BUCKET_ORDER) {
    const pct = percents[key] || 0;
    if (pct <= 0) continue;
    const share = Math.min(left, Math.floor((amount * pct) / 100));
    if (share <= 0) continue;
    out[key] = share;
    left -= share;
  }
  return out;
}

/** The percentages an allocation amounts to, to one decimal — what gets remembered for next time. */
export function toPercentages(allocations: Allocations, amount: number): Percentages {
  const out: Percentages = {};
  if (amount <= 0) return out;
  for (const key of BUCKET_ORDER) {
    const value = allocations[key] || 0;
    if (value > 0) out[key] = Math.round((value / amount) * 1000) / 10;
  }
  return out;
}

export interface Income { bank: keyof FinanceBanks; amount: number; allocations: Allocations }

/** An income arriving in a bank and being split across buckets; the rest stays free. */
export function applyIncome(banks: FinanceBanks, buckets: FinanceBuckets, income: Income) {
  const nextBuckets = { ...buckets };
  for (const key of BUCKET_ORDER) nextBuckets[key] = cents((buckets[key] || 0) + (income.allocations[key] || 0));
  return {
    banks: { ...banks, [income.bank]: cents((banks[income.bank] || 0) + income.amount) },
    buckets: nextBuckets,
  };
}

/** Bucket-only change: +1 moves free money into buckets, −1 takes money out of them (the bank already lost it). */
export function applyAssignment(buckets: FinanceBuckets, allocations: Allocations, direction: 1 | -1): FinanceBuckets {
  const next = { ...buckets };
  for (const key of BUCKET_ORDER) next[key] = cents((buckets[key] || 0) + direction * (allocations[key] || 0));
  return next;
}

/** Why an income split can't be saved, or null. */
export function incomeError(income: Income): string | null {
  if (!Number.isFinite(income.amount) || income.amount <= 0) return 'Enter the amount';
  if (allocationTotal(income.allocations) > income.amount) return 'Split is more than the income';
  return null;
}

/** Why an assignment can't be saved, or null. `free` decides the direction: positive moves free money into buckets, negative takes it back out. */
export function assignmentError(buckets: FinanceBuckets, free: number, allocations: Allocations): string | null {
  const total = allocationTotal(allocations);
  if (total <= 0) return 'Enter amounts';
  if (total > Math.abs(free)) return free > 0 ? 'More than your free money' : 'More than the shortfall';
  if (free < 0) {
    for (const key of BUCKET_ORDER) if ((allocations[key] || 0) > (buckets[key] || 0)) return 'More than the bucket holds';
  }
  return null;
}

/** Pays the "Urgent" debt (what you took from Tawarru') back first-in-first-out; returns what was actually repaid. */
export function repayUrgent(debts: Debt[], amount: number): { debts: Debt[]; repaid: number } {
  let left = amount;
  const next: Debt[] = [];
  for (const debt of debts) {
    if (left > 0 && debt.type === 'owed_by_me' && debt.personName === 'Urgent') {
      const pay = Math.min(left, debt.amount);
      left = cents(left - pay);
      const remaining = cents(debt.amount - pay);
      if (remaining > 0) next.push({ ...debt, amount: remaining });
    } else {
      next.push(debt);
    }
  }
  return { debts: next, repaid: cents(amount - left) };
}

export const urgentDebtTotal = (debts: Debt[]) =>
  debts.filter((d) => d.type === 'owed_by_me' && d.personName === 'Urgent').reduce((s, d) => s + d.amount, 0);

/** The movement that makes a bank's balance equal what the bank itself says; null when they already match. */
export function matchMove(banks: FinanceBanks, bank: keyof FinanceBanks, actual: number): MoneyMove | null {
  const diff = cents(actual - (banks[bank] || 0));
  if (!Number.isFinite(diff) || diff === 0) return null;
  return { type: diff > 0 ? 'deposit' : 'withdraw', amount: Math.abs(diff), bank, bucket: null, mode: 'reconcile' };
}
