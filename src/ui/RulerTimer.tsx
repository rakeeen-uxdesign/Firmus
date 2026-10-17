import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { DM } from '@/ui/TimerComponents';
import { RULER_STEP_SECONDS, rulerTicks } from '@/domain/focus/ruler';

// The iOS timer-picker's look — numbers over a row of tall ticks, a pointer under the middle
// one — without its box or Start button: the ruler runs the full width it's given, with the
// time in dot-matrix digits centred under the pointer.
//
// Everything is laid out in a 870 × 216 design space and converted to `cqw` (a hundredth of the
// container's width), so it scales to whatever card it sits in. The ruler is plain HTML: the
// ticks are drawn once per step (5s), and only one wrapper is moved, with a transform, every
// animation frame — a compositor-only motion, so it stays smooth. No filters, no SVG masks.
const DESIGN_W = 870;
const DESIGN_H = 216;
// Design units the ruler travels per second of the clock: a tick every 5s, 20 units apart.
const TICK_SPACING = 20;
const PER_SECOND = TICK_SPACING / RULER_STEP_SECONDS;
const TICK_W = 5;
const TICK_TOP = 50;
const TICK_H = 62;
const LABEL_TOP = 6;
const LABEL_SIZE = 32;
const POINTER_TOP = 120;
const POINTER_W = 26;
const POINTER_H = 22;
const DIGITS_TOP = 166;
const DIGITS_H = 40;
const CENTER = DESIGN_W / 2;

const cq = (n: number) => `${((n / DESIGN_W) * 100).toFixed(4)}cqw`;

/** The digits of `MM:SS` as dot-matrix squares, centred in their own box. */
const Digits: React.FC<{ mm: string; ss: string }> = ({ mm, ss }) => {
  const step = DIGITS_H / 5;
  const cell = step * 0.86;
  const digitW = 4 * step;
  const gap = step * 0.6;
  const colonW = step * 2.2;
  const chars = [...mm, ':', ...ss];
  const widths = chars.map((c) => (c === ':' ? colonW : digitW));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let x = 0;
  const placed = chars.map((ch, i) => { const at = x; x += widths[i] + gap; return { ch, x: at }; });

  return (
    <svg viewBox={`0 0 ${total} ${DIGITS_H}`} style={{ width: cq(total), height: cq(DIGITS_H), display: 'block' }} shapeRendering="crispEdges" role="img" aria-label={`${mm}:${ss}`}>
      <g fill="currentColor">
        {placed.map(({ ch, x: cx }, i) =>
          ch === ':' ? (
            <g key={i} opacity="0.85">
              <rect x={cx + step * 0.6} y={step * 1.2} width={cell} height={cell} />
              <rect x={cx + step * 0.6} y={step * 3} width={cell} height={cell} />
            </g>
          ) : (
            (DM[ch] ?? DM['0']).flatMap((row, ri) =>
              row.map((on, ci) => (
                <rect key={`${i}-${ri}-${ci}`} x={cx + ci * step} y={ri * step} width={cell} height={cell} opacity={on ? 1 : 0.07} />
              ))
            )
          ),
        )}
      </g>
    </svg>
  );
};

interface Anchor {
  /** The clock reading the ruler was last pinned to, in seconds. */
  seconds: number;
  /** When (performance.now()) it was pinned. */
  at: number;
  /** Leftover difference from the previous anchor, easing out to nothing. */
  correction: number;
  /** -1 counting down, 1 counting up, 0 standing still. */
  direction: -1 | 0 | 1;
}

/** How long a correction takes to fade, and how late (seconds) a reading typically is. */
const CORRECTION_MS = 350;
const READING_LAG = 0.1;

/** The clock value the ruler shows at `now`: the pinned reading, plus the slide since (at most one second), plus the fading correction. */
function valueAt(a: Anchor, now: number): number {
  const elapsed = now - a.at;
  const slide = Math.max(-1, Math.min(1, (a.direction * elapsed) / 1000));
  return a.seconds + slide + a.correction * Math.exp(-elapsed / CORRECTION_MS);
}

export const RulerTimer = React.memo<{
  /** Seconds on the clock: what's left, or the overtime so far. Whole seconds — the ruler smooths between them. */
  seconds: number;
  mm: string;
  ss: string;
  mode: 'focus' | 'break';
  isOvertime: boolean;
  /** Whether the clock is moving; when it isn't, the ruler holds still. */
  running: boolean;
  maxWidth?: string;
}>(({ seconds, mm, ss, mode, isOvertime, running, maxWidth = '100%' }) => {
  // The whole step the ticks are laid out around; the slide between steps is the mover's job.
  const base = Math.floor(seconds / RULER_STEP_SECONDS) * RULER_STEP_SECONDS;
  const moverRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef(base);
  const anchorRef = useRef<Anchor>({ seconds, at: 0, correction: 0, direction: 0 });
  const direction = !running ? 0 : isOvertime ? 1 : -1;

  // Ticks only change when the step does; the sliding in between is done by `mover`.
  const ticks = useMemo(() => rulerTicks(base), [base]);

  const place = (now: number) => {
    if (moverRef.current) moverRef.current.style.transform = `translate3d(${cq((baseRef.current - valueAt(anchorRef.current, now)) * PER_SECOND)}, 0, 0)`;
  };

  // A new reading (or the clock starting / stopping): re-anchor and re-place within the same
  // commit, so there's no one-frame jump when the ticks above are redrawn for a new step.
  // Deliberately NOT on every render — the page re-renders this far more often than the clock
  // changes, and re-anchoring each time would freeze the slide between readings.
  useLayoutEffect(() => {
    const now = performance.now();
    const previous = anchorRef.current;
    // A reading arrives up to ~200ms after its second really turned over, so the true value is
    // already a little past it, in the direction the clock moves.
    const estimate = seconds + READING_LAG * direction;
    // Where the ruler is drawn right now is where it must stay; the difference to the new estimate
    // is eased out over the next moments instead of showing up as a jump.
    const carried = previous.at > 0 && previous.direction === direction && direction !== 0 ? valueAt(previous, now) - estimate : 0;
    anchorRef.current = { seconds: estimate, at: now, correction: Math.abs(carried) <= 0.5 ? carried : 0, direction };
    baseRef.current = base;
    place(now);
  }, [seconds, running, isOvertime]);

  useLayoutEffect(() => {
    if (!running) return;
    let frame = requestAnimationFrame(function loop(now) {
      place(now);
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [running, isOvertime]);

  const tone = isOvertime ? 'overtime' : mode;

  return (
    <div className={`ruler-face ruler-${tone}`} style={{ width: maxWidth, containerType: 'inline-size' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: `${DESIGN_W} / ${DESIGN_H}`, color: 'var(--ruler-tone)' }}>
        {/* The ruler: fades out into the card at both edges */}
        <div
          style={{
            position: 'absolute', inset: 0, overflow: 'hidden',
            WebkitMaskImage: 'linear-gradient(to right, transparent, #000 14%, #000 86%, transparent)',
            maskImage: 'linear-gradient(to right, transparent, #000 14%, #000 86%, transparent)',
          }}
        >
          <div ref={moverRef} style={{ position: 'absolute', inset: 0, willChange: 'transform' }}>
            {ticks.map(({ second, lit, labelled }) => {
              const x = CENTER + (second - base) * PER_SECOND;
              return (
                <React.Fragment key={second}>
                  <div style={{
                    position: 'absolute', left: cq(x - TICK_W / 2), top: cq(labelled ? TICK_TOP - 6 : TICK_TOP), width: cq(TICK_W), height: cq(labelled ? TICK_H + 6 : TICK_H),
                    background: 'currentColor', opacity: lit ? 1 : 0.28, boxShadow: lit ? '0 0 6px currentColor' : 'none',
                  }} />
                  {labelled && (
                    <div style={{
                      position: 'absolute', left: cq(x - 40), top: cq(LABEL_TOP), width: cq(80), textAlign: 'center',
                      fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: cq(LABEL_SIZE), lineHeight: 1, opacity: lit ? 1 : 0.28,
                    }}>{second / 60}</div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div style={{
          position: 'absolute', left: cq(CENTER - POINTER_W / 2), top: cq(POINTER_TOP), width: cq(POINTER_W), height: cq(POINTER_H),
          background: 'currentColor', clipPath: 'polygon(50% 0, 100% 100%, 0 100%)',
        }} />

        <div style={{ position: 'absolute', left: '50%', top: cq(DIGITS_TOP), transform: 'translateX(-50%)', filter: 'drop-shadow(0 0 6px color-mix(in srgb, currentColor 55%, transparent))' }}>
          <Digits mm={mm} ss={ss} />
        </div>
      </div>
    </div>
  );
});
RulerTimer.displayName = 'RulerTimer';
