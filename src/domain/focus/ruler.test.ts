import { describe, it, expect } from 'vitest';
import { rulerTicks, RULER_HALF_SPAN_SECONDS, RULER_STEP_SECONDS } from '@/domain/focus/ruler';

describe('rulerTicks', () => {
  it('one tick every step, spanning the half-span either side of the value', () => {
    const ticks = rulerTicks(600);
    expect(ticks[0].second).toBe(600 - RULER_HALF_SPAN_SECONDS);
    expect(ticks[ticks.length - 1].second).toBe(600 + RULER_HALF_SPAN_SECONDS);
    expect(ticks.every((t, i) => i === 0 || t.second - ticks[i - 1].second === RULER_STEP_SECONDS)).toBe(true);
  });

  it('a tick exactly on the value sits under the pointer, and is lit', () => {
    const at = rulerTicks(600).find((t) => t.second === 600)!;
    expect(at.offset).toBe(0);
    expect(at.lit).toBe(true);
  });

  it('ticks up to the value are lit, the ones beyond are dim', () => {
    const ticks = rulerTicks(602);
    expect(ticks.find((t) => t.second === 600)!.lit).toBe(true);
    expect(ticks.find((t) => t.second === 605)!.lit).toBe(false);
  });

  it('slides smoothly: the offset follows the fractional second', () => {
    expect(rulerTicks(599.25).find((t) => t.second === 600)!.offset).toBeCloseTo(0.75);
  });

  it('every whole minute is labelled, and only those', () => {
    const labelled = rulerTicks(900, 125).filter((t) => t.labelled).map((t) => t.second / 60);
    expect(labelled).toEqual([13, 14, 15, 16, 17]);
  });

  it('never goes below zero', () => {
    const ticks = rulerTicks(20);
    expect(ticks[0].second).toBe(0);
    expect(ticks.every((t) => t.second >= 0)).toBe(true);
  });
});
