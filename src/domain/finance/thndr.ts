import type { ThndrEntry, ThndrPart, ThndrParts } from '@/domain/finance/types';

/** The parts in display order, with their labels. */
export const THNDR_PARTS: ReadonlyArray<{ key: ThndrPart; label: string }> = [
  { key: 'clouds', label: 'Clouds' },
  { key: 'gold', label: 'Gold' },
  { key: 'funds', label: 'Funds' },
];

export const EMPTY_THNDR_PARTS: ThndrParts = { clouds: 0, gold: 0, funds: 0 };

export const thndrPartsTotal = (parts: Partial<ThndrParts>) => THNDR_PARTS.reduce((sum, { key }) => sum + (parts[key] || 0), 0);


/** How the value moved between two readings. `percent` is null when the older reading was 0. */
export interface ThndrDelta { amount: number; percent: number | null }

export function thndrDelta(newer: number, older: number): ThndrDelta {
  return { amount: newer - older, percent: older === 0 ? null : ((newer - older) / older) * 100 };
}

const byTimeAsc = (a: ThndrEntry, b: ThndrEntry) => a.timestamp.localeCompare(b.timestamp);

/** The readings oldest first — the order a chart wants. */
export const thndrSeries = (entries: ThndrEntry[]): ThndrEntry[] => [...entries].sort(byTimeAsc);

/** The latest reading's value, or 0 when nothing has been recorded. */
export function latestThndrValue(entries: ThndrEntry[]): number {
  const series = thndrSeries(entries);
  return series.length ? series[series.length - 1].value : 0;
}

export interface ThndrRow {
  entry: ThndrEntry;
  /** Against the reading before it; null for the very first. */
  delta: ThndrDelta | null;
  /** The same, per part; null when either reading has no split. */
  partDeltas: Record<ThndrPart, ThndrDelta> | null;
}

/** Newest first, each with its move since the previous reading. */
export function thndrRows(entries: ThndrEntry[]): ThndrRow[] {
  const series = thndrSeries(entries);
  return series
    .map((entry, i) => ({
      entry,
      delta: i === 0 ? null : thndrDelta(entry.value, series[i - 1].value),
      partDeltas: thndrPartDeltas(entry, series[i - 1]),
    }))
    .reverse();
}

/** Move from the first reading ever to the latest; null with fewer than two readings. */
export function thndrSinceStart(entries: ThndrEntry[]): ThndrDelta | null {
  const series = thndrSeries(entries);
  return series.length < 2 ? null : thndrDelta(series[series.length - 1].value, series[0].value);
}

/** The latest reading that recorded a split, or null. */
export function latestThndrParts(entries: ThndrEntry[]): ThndrParts | null {
  const withParts = thndrSeries(entries).filter((e) => e.parts);
  return withParts.length ? { ...EMPTY_THNDR_PARTS, ...withParts[withParts.length - 1].parts } : null;
}

/** Each part's share of the total, in percent (all 0 when the total is 0). */
export function thndrShares(parts: ThndrParts): ThndrParts {
  const total = thndrPartsTotal(parts);
  return Object.fromEntries(THNDR_PARTS.map(({ key }) => [key, total === 0 ? 0 : ((parts[key] || 0) / total) * 100])) as ThndrParts;
}

/** How each part moved between two readings; null unless both recorded a split. */
export function thndrPartDeltas(newer: ThndrEntry, older: ThndrEntry | undefined): Record<ThndrPart, ThndrDelta> | null {
  if (!newer.parts || !older?.parts) return null;
  const n = newer.parts, o = older.parts;
  return Object.fromEntries(THNDR_PARTS.map(({ key }) => [key, thndrDelta(n[key] || 0, o[key] || 0)])) as Record<ThndrPart, ThndrDelta>;
}
