import { describe, it, expect } from 'vitest';
import { latestThndrParts, latestThndrValue, thndrDelta, thndrPartDeltas, thndrPartsTotal, thndrRows, thndrSeries, thndrShares, thndrSinceStart } from '@/domain/finance/thndr';
import type { ThndrEntry } from '@/domain/finance/types';

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

describe('thndrSeries / latestThndrValue', () => {
  it('orders by time and picks the latest by date, not by position', () => {
    expect(thndrSeries(entries).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(latestThndrValue(entries)).toBe(9900);
  });
  it('is 0 with nothing recorded', () => {
    expect(latestThndrValue([])).toBe(0);
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

describe('thndrSinceStart', () => {
  it('first reading to latest', () => {
    expect(thndrSinceStart(entries)).toEqual(thndrDelta(9900, 10000));
  });
  it('needs two readings', () => {
    expect(thndrSinceStart([e('a', 1, 1)])).toBeNull();
  });
});

describe('the split into clouds / gold / funds', () => {
  const withParts = (id: string, day: number, clouds: number, gold: number, funds: number): ThndrEntry => ({
    ...e(id, clouds + gold + funds, day), parts: { clouds, gold, funds },
  });
  const older = withParts('x', 3, 6000, 3000, 1000);
  const newer = withParts('y', 10, 6600, 2700, 1200);

  it('totals the parts, treating a missing one as 0', () => {
    expect(thndrPartsTotal({ clouds: 5, gold: 3 })).toBe(8);
  });

  it('shares add up to 100', () => {
    expect(thndrShares({ clouds: 6000, gold: 3000, funds: 1000 })).toEqual({ clouds: 60, gold: 30, funds: 10 });
    expect(thndrShares({ clouds: 0, gold: 0, funds: 0 })).toEqual({ clouds: 0, gold: 0, funds: 0 });
  });

  it('latest split skips readings that have none', () => {
    expect(latestThndrParts([older, newer, e('legacy', 5, 17)])).toEqual({ clouds: 6600, gold: 2700, funds: 1200 });
    expect(latestThndrParts([e('legacy', 5, 17)])).toBeNull();
  });

  it('per-part moves between two readings, null when one has no split', () => {
    expect(thndrPartDeltas(newer, older)).toEqual({
      clouds: thndrDelta(6600, 6000), gold: thndrDelta(2700, 3000), funds: thndrDelta(1200, 1000),
    });
    expect(thndrPartDeltas(newer, e('legacy', 1, 1))).toBeNull();
    expect(thndrPartDeltas(newer, undefined)).toBeNull();
  });

  it('rows carry the per-part moves', () => {
    expect(thndrRows([older, newer])[0].partDeltas?.gold.amount).toBe(-300);
    expect(thndrRows([older, newer])[1].partDeltas).toBeNull();
  });
});
