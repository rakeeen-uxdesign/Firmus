import { describe, it, expect } from 'vitest';
import { applyMove, moveError, urgentDebtFor, type MoneyMove } from '@/domain/finance/moves';
import type { FinanceBanks, FinanceBuckets } from '@/domain/finance/types';

const banks: FinanceBanks = { cib: 1000, ahly_main: 500, ahly_meeza: 0, bm: 250 };
const buckets: FinanceBuckets = { tawarr2: 300, mustaqbal: 800, basmala: 0, sadaqa: 50 };
const move = (over: Partial<MoneyMove>): MoneyMove => ({ type: 'deposit', amount: 100, bank: 'cib', bucket: null, ...over });

describe('applyMove', () => {
  it('a deposit raises the bank, and the bucket by the same amount when tagged', () => {
    const r = applyMove(banks, buckets, move({ bucket: 'mustaqbal' }));
    expect(r.banks.cib).toBe(1100);
    expect(r.buckets.mustaqbal).toBe(900);
  });

  it('an untagged move leaves the buckets alone', () => {
    expect(applyMove(banks, buckets, move({ type: 'withdraw' })).buckets).toBe(buckets);
  });

  it('a withdrawal lowers both, rounded to cents, without mutating the inputs', () => {
    const r = applyMove(banks, buckets, move({ type: 'withdraw', amount: 0.1 + 0.2, bucket: 'tawarr2' }));
    expect(r.banks.cib).toBe(999.7);
    expect(r.buckets.tawarr2).toBe(299.7);
    expect(banks.cib).toBe(1000);
  });
});

describe('moveError', () => {
  it('needs a positive amount', () => {
    expect(moveError(move({ amount: 0 }), banks, buckets)).toBe('Enter an amount');
    expect(moveError(move({ amount: NaN }), banks, buckets)).toBe('Enter an amount');
  });

  it('allows deposits of any size', () => {
    expect(moveError(move({ amount: 1e9 }), banks, buckets)).toBeNull();
  });

  it('refuses to overdraw a bank or a bucket', () => {
    expect(moveError(move({ type: 'withdraw', amount: 1001 }), banks, buckets)).toBe('More than the bank holds');
    expect(moveError(move({ type: 'withdraw', amount: 400, bucket: 'tawarr2' }), banks, buckets)).toBe('More than the bucket holds');
    expect(moveError(move({ type: 'withdraw', amount: 300, bucket: 'tawarr2' }), banks, buckets)).toBeNull();
  });
});

describe('urgentDebtFor', () => {
  const now = new Date('2026-10-10T10:00:00');
  it('logs a debt only when withdrawing from Tawarru\'', () => {
    const debt = urgentDebtFor(move({ type: 'withdraw', amount: 200, bucket: 'tawarr2' }), 'id-1', now);
    expect(debt).toMatchObject({ id: 'id-1', personName: 'Urgent', amount: 200, type: 'owed_by_me' });
    expect(debt?.notes).toContain('10/10/2026');
  });
  it('is null for every other move', () => {
    expect(urgentDebtFor(move({ type: 'deposit', bucket: 'tawarr2' }), 'x')).toBeNull();
    expect(urgentDebtFor(move({ type: 'withdraw', bucket: 'mustaqbal' }), 'x')).toBeNull();
    expect(urgentDebtFor(move({ type: 'withdraw' }), 'x')).toBeNull();
  });
});
