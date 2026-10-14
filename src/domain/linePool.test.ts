import { describe, it, expect } from 'vitest';
import { LINE_POOL, pickBlessing, pickPoolLine } from '@/domain/linePool';
import type { DayPhase } from '@/domain/devotion/prayer';

const PHASES = Object.keys(LINE_POOL) as DayPhase[];
const day = (offset: number) => new Date(2026, 9, 1 + offset, 14, 0, 0);
const dayNumber = (offset: number) => Math.floor(Date.UTC(2026, 9, 1 + offset) / 86_400_000);
/** Offset of the first day of a cycle for a pool of `n` lines — the pool is used in whole cycles of n days. */
const cycleStart = (n: number) => (n - (dayNumber(0) % n)) % n;

describe('LINE_POOL', () => {
  it('every phase has all three themes, and every line ends with a space for the name', () => {
    for (const phase of PHASES) {
      const themes = new Set(LINE_POOL[phase].map(([theme]) => theme));
      expect([...themes].sort()).toEqual(['design', 'love', 'nature']);
      for (const [, text] of LINE_POOL[phase]) expect(text.endsWith(' ')).toBe(true);
    }
  });

  it('has no duplicate line inside a phase', () => {
    for (const phase of PHASES) {
      const texts = LINE_POOL[phase].map(([, t]) => t);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });
});

describe('pickPoolLine', () => {
  it('uses every line once before any repeats', () => {
    for (const phase of PHASES) {
      const n = LINE_POOL[phase].length;
      const start = cycleStart(n) + n;   // a whole cycle that isn't the very first
      const seen = Array.from({ length: n }, (_, i) => pickPoolLine(phase, day(start + i)));
      expect(new Set(seen).size).toBe(n);
    }
  });

  it('reshuffles into a different order after a full cycle', () => {
    const n = LINE_POOL.push.length;
    const start = cycleStart(n);
    const first = Array.from({ length: n }, (_, i) => pickPoolLine('push', day(start + i)));
    const second = Array.from({ length: n }, (_, i) => pickPoolLine('push', day(start + n + i)));
    expect([...second].sort()).toEqual([...first].sort());
    expect(second).not.toEqual(first);
  });

  it('never repeats the same line two days in a row, across cycle boundaries too', () => {
    for (const phase of PHASES) {
      const days = LINE_POOL[phase].length * 4;
      for (let i = 1; i < days; i++) expect(pickPoolLine(phase, day(i))).not.toBe(pickPoolLine(phase, day(i - 1)));
    }
  });

  it('is stable within a day', () => {
    expect(pickPoolLine('dusk', new Date(2026, 9, 5, 9, 0))).toBe(pickPoolLine('dusk', new Date(2026, 9, 5, 23, 0)));
  });
});

describe('pickBlessing', () => {
  it('rotates by day', () => {
    expect(new Set([0, 1, 2].map((i) => pickBlessing(day(i)))).size).toBe(3);
  });
});
