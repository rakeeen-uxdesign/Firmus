import { describe, it, expect } from 'vitest';
import {
  allocationTotal, remainderOf, applyAssignment, applyIncome, assignmentError, incomeError, matchMove, repayUrgent,
  suggestAllocations, toPercentages, freeMoneyOf, urgentDebtTotal,
} from '@/domain/finance/split';
import type { Debt, FinanceBanks, FinanceBuckets } from '@/domain/finance/types';

const banks: FinanceBanks = { cib: 1000, ahly_main: 500, ahly_meeza: 0, bm: 0 };
const buckets: FinanceBuckets = { tawarr2: 400, mustaqbal: 900, basmala: 0, sadaqa: 0 };

describe('freeMoneyOf', () => {
  it('is what the banks hold beyond what the buckets claim — negative when they claim more', () => {
    expect(freeMoneyOf(banks, buckets)).toBe(200);
    expect(freeMoneyOf({ ...banks, cib: 400 }, buckets)).toBe(-400);
  });
});

describe('remainderOf', () => {
  it('is what is left after the allocations, free of float noise', () => {
    expect(remainderOf(100, { mustaqbal: 33.3, tawarr2: 33.3, sadaqa: 33.4 })).toBe(0);
    expect(remainderOf(100, { mustaqbal: 60 })).toBe(40);
    expect(remainderOf(100, { mustaqbal: 101 })).toBe(-1);
  });
});

describe('suggestAllocations', () => {
  it('turns percentages into whole pounds and leaves the rest unassigned', () => {
    const a = suggestAllocations(10_001, { mustaqbal: 50, tawarr2: 20, sadaqa: 5 });
    expect(a).toEqual({ mustaqbal: 5000, tawarr2: 2000, sadaqa: 500 });
    expect(allocationTotal(a)).toBeLessThan(10_001);
  });
  it('never gives out more than the income', () => {
    const a = suggestAllocations(100, { mustaqbal: 80, tawarr2: 80 });
    expect(allocationTotal(a)).toBeLessThanOrEqual(100);
    expect(a.tawarr2).toBe(20);
  });
  it('nothing remembered → nothing suggested', () => {
    expect(suggestAllocations(5000, {})).toEqual({});
  });
});

describe('toPercentages', () => {
  it('round-trips with suggestAllocations', () => {
    const p = toPercentages({ mustaqbal: 5000, tawarr2: 2000 }, 10_000);
    expect(p).toEqual({ mustaqbal: 50, tawarr2: 20 });
    expect(suggestAllocations(20_000, p)).toEqual({ mustaqbal: 10_000, tawarr2: 4000 });
  });
  it('no income → no percentages', () => {
    expect(toPercentages({ mustaqbal: 5 }, 0)).toEqual({});
  });
});

describe('applyIncome / applyAssignment', () => {
  it('income raises the bank and the chosen buckets; the rest stays free', () => {
    const r = applyIncome(banks, buckets, { bank: 'cib', amount: 1000, allocations: { mustaqbal: 600, tawarr2: 200 } });
    expect(r.banks.cib).toBe(2000);
    expect(r.buckets.mustaqbal).toBe(1500);
    expect(r.buckets.tawarr2).toBe(600);
    expect(freeMoneyOf(r.banks, r.buckets)).toBe(200 + 200);
    expect(buckets.mustaqbal).toBe(900);
  });
  it('assigning moves buckets only, either way', () => {
    expect(applyAssignment(buckets, { basmala: 150 }, 1).basmala).toBe(150);
    expect(applyAssignment(buckets, { mustaqbal: 100 }, -1).mustaqbal).toBe(800);
  });
});

describe('validation', () => {
  it('income: needs an amount and cannot split more than it', () => {
    expect(incomeError({ bank: 'cib', amount: 0, allocations: {} })).toBe('Enter the amount');
    expect(incomeError({ bank: 'cib', amount: 100, allocations: { mustaqbal: 101 } })).toBe('Split is more than the income');
    expect(incomeError({ bank: 'cib', amount: 100, allocations: { mustaqbal: 100 } })).toBeNull();
  });
  it('assignment: positive moves free money into buckets, negative takes back out of what a bucket holds', () => {
    expect(assignmentError(buckets, 200, {})).toBe('Enter amounts');
    expect(assignmentError(buckets, 200, { basmala: 201 })).toBe('More than your free money');
    expect(assignmentError(buckets, 200, { basmala: 200 })).toBeNull();
    expect(assignmentError(buckets, -300, { mustaqbal: 301 })).toBe('More than the shortfall');
    expect(assignmentError(buckets, -300, { basmala: 100 })).toBe('More than the bucket holds');
    expect(assignmentError(buckets, -300, { mustaqbal: 300 })).toBeNull();
  });
});

describe('repayUrgent', () => {
  const debts: Debt[] = [
    { id: '1', personName: 'Urgent', amount: 300, type: 'owed_by_me' },
    { id: '2', personName: 'Aly', amount: 500, type: 'owed_by_me' },
    { id: '3', personName: 'Urgent', amount: 200, type: 'owed_by_me' },
  ];
  it('pays the Urgent debts in order and drops the settled ones', () => {
    const r = repayUrgent(debts, 400);
    expect(r.repaid).toBe(400);
    expect(r.debts.map((d) => [d.id, d.amount])).toEqual([['2', 500], ['3', 100]]);
  });
  it('never repays more than is owed, and leaves other people alone', () => {
    const r = repayUrgent(debts, 9999);
    expect(r.repaid).toBe(500);
    expect(r.debts.map((d) => d.id)).toEqual(['2']);
    expect(urgentDebtTotal(debts)).toBe(500);
  });
});

describe('matchMove', () => {
  it('is the movement that makes the bank equal what it really holds', () => {
    expect(matchMove(banks, 'cib', 1250)).toEqual({ type: 'deposit', amount: 250, bank: 'cib', bucket: null, mode: 'reconcile' });
    expect(matchMove(banks, 'cib', 700)).toMatchObject({ type: 'withdraw', amount: 300 });
  });
  it('null when it already matches', () => {
    expect(matchMove(banks, 'cib', 1000)).toBeNull();
  });
});
