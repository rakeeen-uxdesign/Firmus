import React from 'react';
import { DM } from '@/ui/TimerComponents';

/**
 * The second Focus face — a blocky pixel-art style, swipeable alongside the
 * wavy ring (see FocusCarousel). Same DM digit bitmaps (see TimerComponents), just drawn
 * as square pixels instead of dots, to match this style's chunkier look.
 */
export const PixelDigits: React.FC<{ mm: string; ss: string; color: string; maxWidth?: string; height?: string; flush?: boolean }> = ({
  mm, ss, color, maxWidth = 'min(88vw, 480px)', height, flush = false,
}) => {
  const cell = 15;
  const gap = 3;
  const step = cell + gap;
  const digitW = 4 * step - gap;
  const digitH = 5 * step - gap;
  const colGap = step * 1.1;

  const mmChars = [...(mm || '0')];
  const xPositions: number[] = [];
  let curX = 0;
  mmChars.forEach(() => { xPositions.push(curX); curX += digitW + colGap; });
  const xColon = curX;
  const xSS = xColon + step * 1.6;
  const ssPositions = [xSS, xSS + digitW + colGap];
  const totalW = ssPositions[1] + digitW;
  // The padding is breathing room for the big faces; `flush` drops it so the first
  // pixel column sits exactly on the svg's left edge, for aligning against text.
  const pad = flush ? 0 : cell;

  const renderDigit = (digit: string, tx: number) =>
    (DM[digit] ?? DM['0']).flatMap((row, ri) =>
      row.map((val, ci) => (
        <rect
          key={`${tx}-${ri}-${ci}`}
          x={tx + ci * step} y={ri * step} width={cell} height={cell}
          fill={color} opacity={val ? 1 : 0.08}
        />
      ))
    );

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${totalW + pad * 2} ${digitH + pad * 2}`}
      // `height` pins the digit size regardless of how many digits there are (a 12-hour
      // clock's hour is 1 or 2 digits) — otherwise a fixed width would rescale them.
      style={height ? { height, width: 'auto' } : { width: maxWidth, height: 'auto' }}
      overflow="visible"
    >
      {mmChars.map((ch, i) => renderDigit(ch, xPositions[i]))}
      <rect x={xColon} y={digitH * 0.22} width={cell} height={cell} fill={color} opacity={0.5} />
      <rect x={xColon} y={digitH * 0.62} width={cell} height={cell} fill={color} opacity={0.5} />
      {renderDigit(ss[0] ?? '0', ssPositions[0])}
      {renderDigit(ss[1] ?? '0', ssPositions[1])}
    </svg>
  );
};

// 14×14 grid with the clock's center on the corner shared by the middle four
// cells, so the hub sits dead center.
const N = 14;
const C = N / 2;
const FACE_RADIUS = 6.95;
const RIM_FROM = 5.9;
const HOUR_MARKS = new Set(['1,6', '1,7', '12,6', '12,7', '6,1', '7,1', '6,12', '7,12']);

const distFromCenter = (r: number, c: number) => Math.hypot(c + 0.5 - C, r + 0.5 - C);

// The pixel face is identical for every clock (Focus and the world clocks), so
// it's built once here rather than on every render of every instance.
const CLOCK_FACE = (() => {
  const face = 'color-mix(in srgb, var(--ink) 16%, var(--paper))';
  const rim = 'color-mix(in srgb, var(--ink) 38%, var(--paper))';
  const mark = 'color-mix(in srgb, var(--ink) 55%, var(--paper))';
  const cell = 10;
  const gap = 1;
  const step = cell + gap;
  const size = N * step - gap;
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const d = distFromCenter(r, c);
      if (d > FACE_RADIUS) continue;
      const key = `${r},${c}`;
      const fill = d > RIM_FROM ? rim : HOUR_MARKS.has(key) ? mark : face;
      cells.push(<rect key={key} x={c * step} y={r * step} width={cell} height={cell} fill={fill} />);
    }
  }
  return { size, center: size / 2, step, cell, cells };
})();

/**
 * A pixel-art clock: a square-pixel face in a neutral tone, with one ordinary
 * smooth hand in the session's color (green for focus, teal for break, gold
 * for overtime) so it always contrasts with the face. One turn a minute.
 *
 * The hand is driven by its own animation frame loop at a constant 6°/s, not
 * by the counter's integer-second ticks — those arrive a little early or late,
 * and a hand chasing them stalls and catches up. Instead it free-runs and is
 * only re-anchored to the counter if it ever drifts more than about a second
 * away (a new session, a reset, a tab that was backgrounded). Frozen while
 * paused. The angle is unwrapped so crossing 12 never spins it backwards.
 */
export const PixelClock: React.FC<{
  elapsedSeconds: number;
  mode: 'focus' | 'break';
  isOvertime: boolean;
  running: boolean;
  width?: string;
}> = ({ elapsedSeconds, mode, isOvertime, running, width = '120px' }) => {
  const handColor = isOvertime ? 'var(--pomo-overtime)' : mode === 'break' ? 'var(--pomo-break)' : 'var(--pomo-focus)';
  const counterRef = React.useRef(Math.max(0, Math.floor(elapsedSeconds)));
  counterRef.current = Math.max(0, Math.floor(elapsedSeconds));
  const handRef = React.useRef<SVGGElement>(null);
  // Seconds of elapsed time the hand is currently showing, and when that was set.
  const anchor = React.useRef({ seconds: counterRef.current, at: performance.now() });

  React.useEffect(() => {
    let frame = 0;
    const draw = (seconds: number) => {
      handRef.current?.style.setProperty('transform', `rotate(${seconds * 6}deg)`);
    };
    const tick = () => {
      const counter = counterRef.current;
      let shown = anchor.current.seconds + (performance.now() - anchor.current.at) / 1000;
      // The counter floors and its 200ms interval runs a little late, so a
      // healthy hand sits in [counter, counter + ~1.3). Only a real discontinuity
      // (new session, reset, throttled background tab) is far outside that —
      // a tighter bound mistakes ordinary tick jitter for drift and yanks the
      // hand backwards, which reads as it stalling.
      if (shown < counter - 1.5 || shown > counter + 2.5) {
        shown = counter + 0.5;
        anchor.current = { seconds: shown, at: performance.now() };
      }
      draw(shown);
      frame = requestAnimationFrame(tick);
    };
    if (running) {
      anchor.current = { seconds: Math.max(anchor.current.seconds, counterRef.current), at: performance.now() };
      frame = requestAnimationFrame(tick);
    } else {
      anchor.current = { seconds: counterRef.current, at: performance.now() };
      draw(counterRef.current);
    }
    return () => cancelAnimationFrame(frame);
  }, [running, running ? -1 : Math.floor(elapsedSeconds)]);

  const { size, center, cells } = CLOCK_FACE;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width, height: 'auto' }}>
      {cells}
      <g ref={handRef} style={{ transformOrigin: `${center}px ${center}px` }}>
        <line x1={center} y1={center + 12} x2={center} y2={center - 58} stroke={handColor} strokeWidth={5} strokeLinecap="round" />
      </g>
      <circle cx={center} cy={center} r={7} fill={handColor} />
    </svg>
  );
};

/**
 * Pixel pictograms for the world clocks — one per country. They're drawn on a grid
 * twice as fine as the face's own (half-cell pixels), so there's room for real
 * detail: up to 12 wide × 8 tall, centred on the face's lower half under the hands.
 */
export const CLOCK_EMBLEMS = {
  // Great Pyramid
  egypt: [
    '.....##.....',
    '....####....',
    '...######...',
    '..########..',
    '.##########.',
    '############',
  ],
  // Big Ben — spire, clock face, tower
  london: [
    '..##..',
    '..##..',
    '.####.',
    '.#..#.',
    '.####.',
    '.####.',
    '.####.',
    '.####.',
  ],
  // Burj Khalifa — needle and stepped tiers
  dubai: [
    '..#..',
    '..#..',
    '.###.',
    '.###.',
    '.###.',
    '#####',
    '#####',
    '#####',
  ],
  // Date palm
  saudi: [
    '..##...##..',
    '.#.#####.#.',
    '#...###...#',
    '.....#.....',
    '.....#.....',
    '.....#.....',
    '.....#.....',
    '....###....',
  ],
  // Khanjar — hilt, guard, curved sheath
  oman: [
    '.#####.',
    '...#...',
    '..###..',
    '#######',
    '.#####.',
    '..####.',
    '...###.',
    '....##.',
  ],
  // Southern Cross
  australia: [
    '.....#.....',
    '....###....',
    '.#...#...#.',
    '###.....###',
    '.#.......#.',
    '.....#..#..',
    '....###....',
    '.....#.....',
  ],
} as const;

// One muted dark tone for every emblem — a step above the face, so the hands stay the focus.
const EMBLEM_COLOR = 'color-mix(in srgb, var(--ink) 30%, var(--paper))';

const ClockEmblem = React.memo<{ rows: readonly string[] }>(({ rows }) => {
  const { size, step, cell } = CLOCK_FACE;
  const emblemStep = step / 2;
  const width = Math.max(...rows.map((r) => r.length));
  const x0 = (size - width * emblemStep) / 2;
  // The bottom row ends a few pixels above the 6 o'clock mark (row N - 2 is the last row inside the rim).
  const y0 = (N - 2) * step - 4 - rows.length * emblemStep;
  return (
    <g fill={EMBLEM_COLOR}>
      {rows.flatMap((row, r) =>
        [...row].map((ch, c) => (ch === '#'
          ? <rect key={`${r},${c}`} x={x0 + c * emblemStep} y={y0 + r * emblemStep} width={cell / 2} height={cell / 2} />
          : null)),
      )}
    </g>
  );
});
ClockEmblem.displayName = 'ClockEmblem';

/** UTC offset of `timeZone` at `at`, in ms — via Intl so DST is handled by the platform. */
function zoneOffsetMs(timeZone: string, at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/**
 * The same pixel clock as the Focus face, showing the real time in a time
 * zone, with hour, minute and second hands. All three are drawn every frame
 * from the wall clock, so the second hand sweeps rather than ticks and the
 * minute and hour hands creep the way a real clock's do. The zone's UTC
 * offset is re-read every half minute so a DST change is picked up live.
 */
export const PixelWallClock = React.memo<{
  timeZone: string;
  width?: string;
  /** A pixel emblem (see CLOCK_EMBLEMS) drawn on the face's lower half, under the hands. */
  emblem?: readonly string[];
}>(({ timeZone, width = '110px', emblem }) => {
  const accent = 'var(--pomo-focus)';
  const { size, center, cells } = CLOCK_FACE;
  const hourRef = React.useRef<SVGGElement>(null);
  const minuteRef = React.useRef<SVGGElement>(null);
  const secondRef = React.useRef<SVGGElement>(null);

  React.useEffect(() => {
    let frame = 0;
    let offset = zoneOffsetMs(timeZone, Date.now());
    let offsetAt = Date.now();
    const tick = () => {
      const now = Date.now();
      if (now - offsetAt > 30_000) { offset = zoneOffsetMs(timeZone, now); offsetAt = now; }
      const t = now + offset;
      const rotate = (el: SVGGElement | null, turns: number) =>
        el?.style.setProperty('transform', `rotate(${turns * 360}deg)`);
      rotate(secondRef.current, (t % 60_000) / 60_000);
      rotate(minuteRef.current, (t % 3_600_000) / 3_600_000);
      rotate(hourRef.current, (t % 43_200_000) / 43_200_000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [timeZone]);

  const origin = { transformOrigin: `${center}px ${center}px` };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width, height: 'auto' }}>
      {cells}
      {emblem && <ClockEmblem rows={emblem} />}
      <g ref={hourRef} style={origin}>
        <line x1={center} y1={center + 6} x2={center} y2={center - 34} stroke="var(--ink)" strokeWidth={6} strokeLinecap="round" />
      </g>
      <g ref={minuteRef} style={origin}>
        <line x1={center} y1={center + 8} x2={center} y2={center - 54} stroke="var(--ink)" strokeWidth={4.5} strokeLinecap="round" />
      </g>
      <g ref={secondRef} style={origin}>
        <line x1={center} y1={center + 14} x2={center} y2={center - 60} stroke={accent} strokeWidth={2.5} strokeLinecap="round" />
      </g>
      <circle cx={center} cy={center} r={6} fill={accent} />
    </svg>
  );
});
PixelWallClock.displayName = 'PixelWallClock';
