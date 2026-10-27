import type { ThndrEntry, ThndrFlow, ThndrPart, ThndrParts } from '@/domain/finance/types';

/** The parts in display order, with their labels. */
export const THNDR_PARTS: ReadonlyArray<{ key: ThndrPart; label: string }> = [
  { key: 'clouds', label: 'Clouds' },
  { key: 'gold', label: 'Gold' },
  { key: 'funds', label: 'Funds' },
  { key: 'wallet', label: 'Wallet' },
];

export const EMPTY_THNDR_PARTS: ThndrParts = { clouds: 0, gold: 0, funds: 0, wallet: 0 };

export const thndrPartLabel = (part: ThndrPart) => THNDR_PARTS.find((p) => p.key === part)!.label;

export const thndrPartsTotal = (parts: Partial<ThndrParts>) => THNDR_PARTS.reduce((sum, { key }) => sum + (parts[key] || 0), 0);


/** How the value moved between two readings. `percent` is null when the older reading was 0. */
export interface ThndrDelta { amount: number; percent: number | null }

export function thndrDelta(newer: number, older: number): ThndrDelta {
  return { amount: newer - older, percent: older === 0 ? null : ((newer - older) / older) * 100 };
}

const byTimeAsc = (a: ThndrEntry, b: ThndrEntry) => a.timestamp.localeCompare(b.timestamp);

/** The readings oldest first — the order a chart wants. */
export const thndrSeries = (entries: ThndrEntry[]): ThndrEntry[] => [...entries].sort(byTimeAsc);

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

// ─── Money moved in and out ─────────────────────────────────────────────────
//
// A reading is what the portfolio is worth; a flow is money the user put in or took out. Telling
// them apart is what makes "gain" honest: depositing 2,000 raises the value but isn't a gain.

/** What a flow does to the portfolio's total: a deposit adds, a withdrawal subtracts, a transfer between parts changes nothing. */
const signedAmount = (flow: ThndrFlow) => (flow.type === 'deposit' ? flow.amount : flow.type === 'withdraw' ? -flow.amount : 0);

/** Net money put in (negative: taken out) by the flows after `afterIso` and up to `untilIso` (both exclusive/inclusive as named). */
export function netFlows(flows: ThndrFlow[], afterIso: string | null, untilIso: string | null = null): number {
  return flows
    .filter((f) => (afterIso === null || f.timestamp > afterIso) && (untilIso === null || f.timestamp <= untilIso))
    .reduce((sum, f) => sum + signedAmount(f), 0);
}

/** What the portfolio is worth now: the latest reading plus whatever was put in or taken out since. With no readings yet, the net of the flows. */
export function currentThndrValue(entries: ThndrEntry[], flows: ThndrFlow[]): number {
  const series = thndrSeries(entries);
  const latest = series[series.length - 1];
  return latest ? latest.value + netFlows(flows, latest.timestamp) : Math.max(0, netFlows(flows, null));
}

/** The split now: the latest reading that has one, moved by the flows since it (transfers included). Null when there is no split to build on. */
export function currentThndrParts(entries: ThndrEntry[], flows: ThndrFlow[]): ThndrParts | null {
  const base = [...thndrSeries(entries)].reverse().find((e) => e.parts);
  if (!base) return null;
  const parts: ThndrParts = { ...EMPTY_THNDR_PARTS, ...base.parts };
  for (const f of flows.filter((x) => x.timestamp > base.timestamp).sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    if (f.type === 'transfer') {
      if (f.from) parts[f.from] = Math.max(0, parts[f.from] - f.amount);
      parts[f.part] += f.amount;
    } else {
      parts[f.part] = Math.max(0, parts[f.part] + signedAmount(f));
    }
  }
  return parts;
}

export interface ThndrPerformance {
  /** What the user has put in: the first reading, plus the flows since. */
  invested: number;
  value: number;
  /** Value against invested — the real gain or loss, with money moved in or out taken out of it. */
  gain: ThndrDelta;
}

/** Null until there is a first reading to measure from. */
export function thndrPerformance(entries: ThndrEntry[], flows: ThndrFlow[]): ThndrPerformance | null {
  const first = thndrSeries(entries)[0];
  if (!first) return null;
  const invested = first.value + netFlows(flows, first.timestamp);
  const value = currentThndrValue(entries, flows);
  return { invested, value, gain: thndrDelta(value, invested) };
}

export type ThndrTimelineRow =
  | {
      kind: 'reading';
      entry: ThndrEntry;
      /** Total move since the previous reading — null for the first. */
      delta: ThndrDelta | null;
      partDeltas: Record<ThndrPart, ThndrDelta> | null;
      /** Money put in (negative: taken out) between the previous reading and this one. */
      contributed: number;
      /** The move the market made on its own: the total less what was contributed. */
      market: ThndrDelta | null;
    }
  | { kind: 'flow'; flow: ThndrFlow };

/** Readings and flows together, newest first; each reading splits its move into what was contributed and what the market did. */
export function thndrTimeline(entries: ThndrEntry[], flows: ThndrFlow[]): ThndrTimelineRow[] {
  const series = thndrSeries(entries);
  const readings: ThndrTimelineRow[] = thndrRows(entries).map((row) => {
    const previous = series[series.findIndex((e) => e.id === row.entry.id) - 1];
    const contributed = previous ? netFlows(flows, previous.timestamp, row.entry.timestamp) : 0;
    return {
      kind: 'reading' as const,
      entry: row.entry,
      delta: row.delta,
      partDeltas: row.partDeltas,
      contributed,
      market: previous ? thndrDelta(row.entry.value, previous.value + contributed) : null,
    };
  });
  const moves: ThndrTimelineRow[] = flows.map((flow) => ({ kind: 'flow' as const, flow }));
  const time = (r: ThndrTimelineRow) => (r.kind === 'reading' ? r.entry.timestamp : r.flow.timestamp);
  return [...readings, ...moves].sort((a, b) => time(b).localeCompare(time(a)));
}
