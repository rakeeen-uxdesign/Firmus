import { describe, it, expect } from 'vitest';
import {
  countdownLabel, debtTotals, goldSummary, groupLogsByDay, logsInRange, rankBanks, rankBuckets, upcomingRenewals,
} from '@/domain/finance/insights';
import type { Debt, FinanceLog, GoldAsset, Subscription } from '@/domain/finance/types';

describe('rankBanks', () => {
  it('sorts largest first', () => {
    expect(rankBanks({ cib: 100, ahly_main: 300, ahly_meeza: 0, bm: 150 }).map((x) => x.key)).toEqual(['ahly_main', 'bm', 'cib', 'ahly_meeza']);
  });
});

describe('rankBuckets', () => {
  it('counts gold into Future', () => {
    const r = rankBuckets({ tawarr2: 100, mustaqbal: 100, basmala: 0, sadaqa: 0 }, 300);
    expect(r[0]).toEqual({ key: 'mustaqbal', balance: 400 });
  });

  it('lists every bucket even when the stored record predates one', () => {
    const old = { tawarr2: 10, mustaqbal: 10, basmala: 0 } as unknown as Parameters<typeof rankBuckets>[0];
    expect(rankBuckets(old, 0).map((x) => x.key).sort()).toEqual(['basmala', 'mustaqbal', 'sadaqa', 'tawarr2']);
  });
});

describe('upcomingRenewals', () => {
  const now = new Date('2026-09-10T12:00:00');
  const sub = (id: string, day: number): Subscription => ({ id, name: id, cost: 10, renewalDay: day, reminderTime: '09:00', bank: 'CIB', intervalMonths: 1 });
  it('soonest first (a renewal due later today first), with whole days left, limited', () => {
    const r = upcomingRenewals([sub('late', 28), sub('soon', 12), { ...sub('today', 10), reminderTime: '18:00' }, sub('next-month', 5)], now, 3);
    expect(r.map((x) => x.sub.id)).toEqual(['today', 'soon', 'late']);
    expect(r).toHaveLength(3);
    expect(r[0].daysLeft).toBe(0);
    expect(r[1].daysLeft).toBe(2);
  });
  it('a renewal later today has 0 days left', () => {
    const r = upcomingRenewals([{ ...sub('today', 10), reminderTime: '18:00' }], now);
    expect(r[0].daysLeft).toBe(0);
  });
});

describe('countdownLabel', () => {
  it('says today, then days, then months once days stop being useful', () => {
    expect(countdownLabel(0)).toBe('Today');
    expect(countdownLabel(5)).toBe('in 5d');
    expect(countdownLabel(59)).toBe('in 59d');
    expect(countdownLabel(90)).toBe('in 3mo');
  });
});

describe('debtTotals', () => {
  it('splits receivables and payables', () => {
    const debts: Debt[] = [
      { id: '1', personName: 'A', amount: 500, type: 'owed_to_me' },
      { id: '2', personName: 'B', amount: 200, type: 'owed_by_me' },
      { id: '3', personName: 'C', amount: 100, type: 'owed_to_me' },
    ];
    expect(debtTotals(debts)).toEqual({ owedToMe: 600, owedByMe: 200 });
  });
});

describe('goldSummary', () => {
  const gold: GoldAsset[] = [
    { id: '1', quantity: 10, carat: 24, purchasePrice: 3000 },
    { id: '2', quantity: 5, carat: 21 },
  ];
  it('values at spot, sums weight, and computes P&L only over assets with a purchase price', () => {
    const r = goldSummary(gold, { price24: 4000, price21: 3500 });
    expect(r.value).toBe(10 * 4000 + 5 * 3500);
    expect(r.weight).toBe(15);
    expect(r.pnl).toBe(10 * 4000 - 10 * 3000);
  });
  it('without prices there is no value and no P&L', () => {
    expect(goldSummary(gold, null)).toEqual({ value: 0, weight: 15, pnl: null });
  });
});

describe('logs', () => {
  const log = (id: string, type: 'deposit' | 'withdraw', amount: number, ts: string): FinanceLog => ({ id, type, amount, bank: 'CIB', timestamp: ts });
  const now = new Date('2026-09-10T12:00:00');
  const logs = [
    log('a', 'deposit', 100, '2026-09-10T08:00:00'),
    log('b', 'withdraw', 30, '2026-09-10T09:00:00'),
    log('c', 'deposit', 50, '2026-09-02T09:00:00'),
    log('d', 'deposit', 70, '2026-03-02T09:00:00'),
    log('e', 'deposit', 10, '2025-09-10T09:00:00'),
  ];
  it('filters to the current day / month / year', () => {
    expect(logsInRange(logs, 'day', now).map((l) => l.id)).toEqual(['a', 'b']);
    expect(logsInRange(logs, 'month', now).map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(logsInRange(logs, 'year', now).map((l) => l.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('assignments are not counted as money in or out', () => {
    const days = groupLogsByDay([{ id: 'x', type: 'assign', amount: 500, bank: '', timestamp: '2026-09-10T10:00:00' }]);
    expect(days[0]).toMatchObject({ deposits: 0, withdrawals: 0 });
  });
  it('groups by day, newest first, with totals in and out', () => {
    const days = groupLogsByDay(logsInRange(logs, 'month', now));
    expect(days.map((d) => d.key)).toEqual(['2026-09-10', '2026-09-02']);
    expect(days[0]).toMatchObject({ deposits: 100, withdrawals: 30 });
    expect(days[1]).toMatchObject({ deposits: 50, withdrawals: 0 });
  });
});
