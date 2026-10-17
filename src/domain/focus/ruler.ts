/** The tick ruler face of the Focus timer — which ticks are on screen and how they look. */

export interface RulerTick {
  /** The second on the clock this tick stands for (a multiple of the step). */
  second: number;
  /** Seconds from the current value: negative to the left of the pointer, positive to the right. */
  offset: number;
  /** Ticks at or below the value are lit; the ones beyond it are dim. */
  lit: boolean;
  /** Every whole minute carries a number. */
  labelled: boolean;
}

/** One tick per this many seconds — fine enough that the ruler visibly travels every second. */
export const RULER_STEP_SECONDS = 5;

/** How many seconds of ruler show on each side of the pointer. */
export const RULER_HALF_SPAN_SECONDS = 120;

/**
 * The ticks to draw for a timer showing `valueSeconds` (fractional — the ruler slides smoothly
 * between readings). One tick every `step` seconds, none below zero, a number on each minute.
 */
export function rulerTicks(
  valueSeconds: number,
  halfSpanSeconds: number = RULER_HALF_SPAN_SECONDS,
  step: number = RULER_STEP_SECONDS,
): RulerTick[] {
  const from = Math.max(0, Math.floor((valueSeconds - halfSpanSeconds) / step) * step);
  const to = Math.ceil((valueSeconds + halfSpanSeconds) / step) * step;
  const ticks: RulerTick[] = [];
  for (let second = from; second <= to; second += step) {
    ticks.push({ second, offset: second - valueSeconds, lit: second <= valueSeconds, labelled: second % 60 === 0 });
  }
  return ticks;
}
