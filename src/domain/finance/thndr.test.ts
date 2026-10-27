import { describe, it, expect } from 'vitest';
import { currentThndrParts, currentThndrValue, netFlows, thndrDelta, thndrPartDeltas, thndrPartsTotal, thndrPerformance, thndrRows, thndrSeries, thndrShares, thndrTimeline } from '@/domain/finance/thndr';
import type { ThndrEntry, ThndrFlow } from '@/domain/finance/types';

const e = (id: string, value: number, day: number): ThndrEntry => ({ id, value, timestamp: `2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z` });
// Deliberately out of order — stored lists aren't guaranteed to be sorted.
const entries = [e('b', 11000, 10), e('a', 10000, 3), e('c', 9900, 17)];

describe('thndrDelta', () => {
  it('amount and percent', () => {
    expect(thndrDelta(11000, 10000)).toEqual({ amount: 1000, percent: 10 });
    expect(thndrDelta(9000, 10000)).toEqual({ amount: -1000, percent: -10 });
  });
  it('no percent against zero', () => {
    expect(thndrDelta(500, 0)).toEqual({ amount: 500, percent: null });
  });
});

describe('thndrSeries', () => {
  it('orders by time, not by position', () => {
    expect(thndrSeries(entries).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('thndrRows', () => {
  it('newest first, each against the reading before it', () => {
    const rows = thndrRows(entries);
    expect(rows.map((r) => r.entry.id)).toEqual(['c', 'b', 'a']);
    expect(rows[0].delta).toEqual(thndrDelta(9900, 11000));
    expect(rows[2].delta).toBeNull();
  });
});

describe('the split into clouds / gold / funds', () => {
  const withParts = (id: string, day: number, clouds: number, gold: number, funds: number): ThndrEntry => ({
    ...e(id, clouds + gold + funds, day), parts: { clouds, gold, funds, wallet: 0 },
  });
  const older = withParts('x', 3, 6000, 3000, 1000);
  const newer = withParts('y', 10, 6600, 2700, 1200);

  it('totals the parts, treating a missing one as 0', () => {
    expect(thndrPartsTotal({ clouds: 5, gold: 3 })).toBe(8);
  });

  it('shares add up to 100', () => {
    expect(thndrShares({ clouds: 6000, gold: 3000, funds: 1000, wallet: 0 })).toEqual({ clouds: 60, gold: 30, funds: 10, wallet: 0 });
    expect(thndrShares({ clouds: 0, gold: 0, funds: 0, wallet: 0 })).toEqual({ clouds: 0, gold: 0, funds: 0, wallet: 0 });
  });

  it('per-part moves between two readings, null when one has no split', () => {
    expect(thndrPartDeltas(newer, older)).toEqual({
      clouds: thndrDelta(6600, 6000), gold: thndrDelta(2700, 3000), funds: thndrDelta(1200, 1000), wallet: thndrDelta(0, 0),
    });
    expect(thndrPartDeltas(newer, e('legacy', 1, 1))).toBeNull();
    expect(thndrPartDeltas(newer, undefined)).toBeNull();
  });

  it('rows carry the per-part moves', () => {
    expect(thndrRows([older, newer])[0].partDeltas?.gold.amount).toBe(-300);
    expect(thndrRows([older, newer])[1].partDeltas).toBeNull();
  });
});

// ─── Money moved in and out ──────────────────────────────────────────────────

const flow = (id: string, type: ThndrFlow['type'], amount: number, day: number, part: ThndrFlow['part'] = 'clouds'): ThndrFlow => ({
  id, type, amount, part, timestamp: `2026-10-${String(day).padStart(2, '0')}T15:00:00.000Z`,
});
const partsEntry = (id: string, day: number, clouds: number, gold: number, funds: number, wallet = 0): ThndrEntry => ({
  ...e(id, clouds + gold + funds + wallet, day), parts: { clouds, gold, funds, wallet },
});

describe('netFlows', () => {
  const flows = [flow('1', 'deposit', 2000, 5), flow('2', 'withdraw', 500, 8), flow('3', 'deposit', 100, 12)];
  it('deposits add, withdrawals subtract', () => {
    expect(netFlows(flows, null)).toBe(1600);
  });
  it('only the flows after a moment, up to another', () => {
    expect(netFlows(flows, '2026-10-05T15:00:00.000Z')).toBe(-400);       // after the first (exclusive)
    expect(netFlows(flows, '2026-10-04T00:00:00.000Z', '2026-10-08T15:00:00.000Z')).toBe(1500);
  });
});

describe('currentThndrValue', () => {
  it('the latest reading plus what was put in since it', () => {
    const flows = [flow('1', 'deposit', 2000, 4), flow('2', 'deposit', 300, 12)];
    // readings: 3rd → 10000, 10th → 11000, 17th → 9900. A deposit on the 4th is already in the 10th's reading; none after the 17th.
    expect(currentThndrValue(entries, flows)).toBe(9900);
    expect(currentThndrValue(entries, [...flows, flow('3', 'deposit', 2000, 18)])).toBe(11900);
  });
  it('a withdrawal after the latest reading lowers it', () => {
    expect(currentThndrValue(entries, [flow('1', 'withdraw', 900, 20)])).toBe(9000);
  });
  it('with no readings yet, just the net money moved in (never negative)', () => {
    expect(currentThndrValue([], [flow('1', 'deposit', 500, 2)])).toBe(500);
    expect(currentThndrValue([], [flow('1', 'withdraw', 500, 2)])).toBe(0);
  });
});

describe('currentThndrParts', () => {
  const base = [partsEntry('a', 3, 6000, 3000, 1000)];
  it('moves the part the money went into', () => {
    expect(currentThndrParts(base, [flow('1', 'deposit', 2000, 5, 'gold'), flow('2', 'withdraw', 500, 6, 'clouds')]))
      .toEqual({ clouds: 5500, gold: 5000, funds: 1000, wallet: 0 });
  });
  it('ignores flows already inside the reading, and is null without any split', () => {
    expect(currentThndrParts(base, [flow('1', 'deposit', 2000, 2)])).toEqual({ clouds: 6000, gold: 3000, funds: 1000, wallet: 0 });
    expect(currentThndrParts(entries, [])).toBeNull();
  });
});

describe('thndrPerformance — a deposit is not a gain', () => {
  it('gain is the value against what was put in', () => {
    const readings = [e('a', 10000, 1), e('b', 12100, 10)];
    // 2,000 of the 2,100 rise was the user's own deposit on the 5th
    const perf = thndrPerformance(readings, [flow('1', 'deposit', 2000, 5)])!;
    expect(perf.invested).toBe(12000);
    expect(perf.value).toBe(12100);
    expect(perf.gain.amount).toBe(100);
    expect(perf.gain.percent).toBeCloseTo((100 / 12000) * 100);
  });
  it('a withdrawal lowers what was invested', () => {
    const perf = thndrPerformance([e('a', 10000, 1), e('b', 9500, 10)], [flow('1', 'withdraw', 1000, 5)])!;
    expect(perf.invested).toBe(9000);
    expect(perf.gain.amount).toBe(500);
  });
  it('needs a first reading', () => {
    expect(thndrPerformance([], [flow('1', 'deposit', 100, 5)])).toBeNull();
  });
});

describe('thndrTimeline', () => {
  it('a reading splits its move into what was contributed and what the market did', () => {
    const readings = [e('a', 10000, 1), e('b', 12100, 10)];
    const rows = thndrTimeline(readings, [flow('1', 'deposit', 2000, 5)]);
    expect(rows.map((r) => (r.kind === 'flow' ? 'flow' : r.entry.id))).toEqual(['b', 'flow', 'a']);
    const b = rows[0];
    if (b.kind !== 'reading') throw new Error('expected a reading');
    expect(b.delta?.amount).toBe(2100);
    expect(b.contributed).toBe(2000);
    expect(b.market?.amount).toBe(100);
  });
  it('the first reading has no previous to compare with', () => {
    const [row] = thndrTimeline([e('a', 10000, 1)], []);
    expect(row).toMatchObject({ kind: 'reading', contributed: 0, market: null });
  });
});

describe('the wallet — cash in Thndr that is not invested yet', () => {
  const tr = (id: string, from: ThndrFlow['part'], to: ThndrFlow['part'], amount: number, day: number): ThndrFlow => ({
    id, type: 'transfer', amount, from, part: to, timestamp: `2026-10-${String(day).padStart(2, '0')}T15:00:00.000Z`,
  });

  it('counts in the total like any other part', () => {
    expect(thndrPartsTotal({ clouds: 100, gold: 50, funds: 25, wallet: 25 })).toBe(200);
  });

  it('cash put into the wallet raises the value and the wallet', () => {
    const base = [partsEntry('a', 3, 6000, 3000, 1000)];
    const flows = [flow('1', 'deposit', 2000, 5, 'wallet')];
    expect(currentThndrValue(base, flows)).toBe(12000);
    expect(currentThndrParts(base, flows)).toEqual({ clouds: 6000, gold: 3000, funds: 1000, wallet: 2000 });
  });

  it('moving it into a part changes the split but not the total, nor what was invested', () => {
    const base = [partsEntry('a', 3, 6000, 3000, 1000, 2000)];
    const flows = [tr('1', 'wallet', 'gold', 1500, 5)];
    expect(currentThndrParts(base, flows)).toEqual({ clouds: 6000, gold: 4500, funds: 1000, wallet: 500 });
    expect(currentThndrValue(base, flows)).toBe(12000);
    expect(thndrPerformance(base, flows)!.invested).toBe(12000);
    expect(thndrPerformance(base, flows)!.gain.amount).toBe(0);
  });

  it('transfers apply in the order they happened', () => {
    const base = [partsEntry('a', 3, 0, 0, 0, 1000)];
    const flows = [tr('2', 'funds', 'clouds', 400, 7), tr('1', 'wallet', 'funds', 1000, 5)];   // stored out of order
    expect(currentThndrParts(base, flows)).toEqual({ clouds: 400, gold: 0, funds: 600, wallet: 0 });
  });

  it("an older reading saved before the wallet existed reads as 0 in it", () => {
    const legacy: ThndrEntry = { ...e('old', 9000, 3), parts: { clouds: 6000, gold: 2000, funds: 1000 } as ThndrEntry['parts'] };
    expect(currentThndrParts([legacy], [])).toEqual({ clouds: 6000, gold: 2000, funds: 1000, wallet: 0 });
    expect(thndrPartsTotal(legacy.parts!)).toBe(9000);
  });

  it("a transfer isn't a flow of money: it adds nothing to the net", () => {
    expect(netFlows([tr('1', 'wallet', 'gold', 500, 5), flow('2', 'deposit', 100, 6)], null)).toBe(100);
  });
});
