import React, { useState } from 'react';
import { ICON_STROKE_LINECAP, ICON_STROKE_WIDTH } from '@/ui/icons';

/**
 * Purely presentational pieces for the Home screen: the privacy-blur value
 * mask, the dot-matrix section icons, and the monthly "fingerprint" chart.
 * No app state — just props in, SVG out.
 */

export const MaskedValue: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <span className={`relative inline-block cursor-pointer select-none ${className}`}
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
    >
      <span className="absolute inset-0 flex items-center justify-start transition-opacity duration-200"
        style={{ opacity: revealed ? 0 : 1, pointerEvents: 'none' }}
        aria-hidden>
        <svg width="2.2em" height="0.8em" viewBox="0 0 44 14" fill="none">
          <style>{`@keyframes mvr{to{transform:rotate(360deg)}}@keyframes mvrr{to{transform:rotate(-360deg)}}`}</style>
          {[0,1,2].map(i => {
            const cx = 7 + i * 15, cy = 7, r = 4;
            const anim = i === 1 ? 'mvrr' : 'mvr';
            return (
              <g key={i} style={{ animation: `${anim} ${2 + i * 0.5}s linear infinite`, transformOrigin: `${cx}px ${cy}px`, opacity: 0.25 + i * 0.2 }}>
                <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" />
                <line x1={cx - r * 0.5} y1={cy - r * 0.866} x2={cx + r * 0.5} y2={cy + r * 0.866} stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" />
                <line x1={cx + r * 0.5} y1={cy - r * 0.866} x2={cx - r * 0.5} y2={cy + r * 0.866} stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" />
              </g>
            );
          })}
        </svg>
      </span>
      <span className="transition-opacity duration-200" style={{ opacity: revealed ? 1 : 0 }}>
        {children}
      </span>
    </span>
  );
};

// Priority indicator — 6 dots orbiting a right-pointing triangle outline.
// The bright point chases the triangle clockwise: tip → upper → left → lower → tip.
// Reads as "active / locked-on" without being a circle, chevron, or spinner.
export const SidebarActiveVector: React.FC = () => {
  // Triangle pointing right: tip, upper-right, upper-left, left-mid, lower-left, lower-right
  const pts: [number,number][] = [
    [18,12],  // 0 — tip (right)
    [11,4],   // 1 — upper corner
    [4,4],    // 2 — upper-left
    [4,12],   // 3 — left mid
    [4,20],   // 4 — lower-left
    [11,20],  // 5 — lower corner
  ];
  return (
    <svg width="22" height="22" viewBox="0 0 22 24" fill="currentColor" className="text-ink/80">
      {pts.map(([cx,cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.4"
          style={{ animation: 'vectorFade 1.5s ease-in-out infinite', animationDelay: `${i * 0.25}s` }} />
      ))}
    </svg>
  );
};

// ─── Section Vectors ────────────────────────────────────────────────────────
// Style matches Calendar DotMatrixVector: dot-matrix shapes, viewBox 0 0 24 24
// Each shape + animation expresses the section concept.
// size=20 → small card   size=36 → big card corner

// WATER — teardrop outline; animation fills bottom→top like water rising inside the drop
// fillLevel 0–1: fraction of the drop that's "full" — dots below glow, above are dim, level dot pulses
export const WaterVector: React.FC<{ size?: number; fillLevel?: number }> = ({ size = 20, fillLevel = 0.5 }) => {
  const dots: [number, number, number][] = [
    [12,22,0], [9,21,1], [15,21,1], [7,18,2], [17,18,2],
    [5,14,3], [19,14,3], [7,9,4], [17,9,4], [9,5,5], [15,5,5], [12,2,6],
  ];
  const threshold = fillLevel * 6; // order 0–6
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      {dots.map(([cx, cy, order], i) => {
        const isAtLevel = Math.abs(order - threshold) < 0.8;
        const isBelow = order < threshold && !isAtLevel;
        return (
          <circle key={i} cx={cx} cy={cy} r="1.2"
            style={{
              opacity: isBelow ? 0.9 : isAtLevel ? undefined : 0.1,
              animation: isAtLevel ? 'vectorFade 2.5s ease-in-out infinite' : 'none',
              animationDelay: `${order * 0.28}s`,
              transition: 'opacity 0.8s ease',
            }} />
        );
      })}
    </svg>
  );
};

// FOCUS — a small clock face: a dotted rim (12 hour marks, lit in sequence like a hand
// sweeping past) and one hand, slowly turning. Echoes the pixel clock on the Focus page
// itself, just simplified down to a size this icon actually reads at.
// paused=true → the rim stops pulsing and the hand stops turning (no focus today)
export const FocusVector: React.FC<{ size?: number; paused?: boolean }> = ({ size = 20, paused = false }) => {
  const dots = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    return { cx: 12 + Math.cos(angle) * 9, cy: 12 + Math.sin(angle) * 9, delay: (i / 12) * 2.4 };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {dots.map(({ cx, cy, delay }, i) => (
        <circle key={i} cx={cx} cy={cy} r={1.3} fill="currentColor"
          style={{
            animation: 'vectorFade 3s ease-in-out infinite',
            animationDelay: `${delay}s`,
            animationPlayState: paused ? 'paused' : 'running',
          }} />
      ))}
      <g style={{ transformOrigin: '12px 12px', animation: 'focusHandSpin 9s linear infinite', animationPlayState: paused ? 'paused' : 'running' }}>
        <line x1="12" y1="12" x2="12" y2="5" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap={ICON_STROKE_LINECAP} />
      </g>
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
};


// FINANCE — vintage coin face; outer ring + inner cross-hatch + center dot.
// Animation: shimmer sweeps clockwise around the coin edge.
export const FinanceVector: React.FC<{ size?: number }> = ({ size = 20 }) => {
  // Outer ring — 12 dots like clock positions
  const ring: [number, number, number][] = [
    [12, 3,  0],    // 12
    [16.8, 4.2, 0.08], // 1
    [20.2, 7.8, 0.17], // 2
    [21, 12, 0.25], // 3
    [20.2, 16.2, 0.33], // 4
    [16.8, 19.8, 0.42], // 5
    [12, 21, 0.50], // 6
    [7.2, 19.8, 0.58], // 7
    [3.8, 16.2, 0.67], // 8
    [3, 12, 0.75], // 9
    [3.8, 7.8, 0.83], // 10
    [7.2, 4.2, 0.92], // 11
  ];
  // Inner £ symbol in dots (center of 24×24)
  const symbol: [number, number, number][] = [
    // top arc of £
    [10, 8, 0.1], [12, 7, 0.15], [14, 8, 0.20],
    // vertical stem
    [10, 10, 0.25], [10, 12, 0.30],
    // cross bar
    [10, 14, 0.35], [12, 14, 0.40],
    // base
    [9, 17, 0.45], [11, 17, 0.50], [13, 17, 0.55],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      {ring.map(([cx, cy, delay], i) => (
        <circle key={`r${i}`} cx={cx} cy={cy} r="1.1"
          style={{ animation: 'vectorFade 2.4s ease-in-out infinite', animationDelay: `${delay}s` }} />
      ))}
      {symbol.map(([cx, cy, delay], i) => (
        <circle key={`s${i}`} cx={cx} cy={cy} r="0.9"
          style={{ animation: 'vectorFade 2.4s ease-in-out infinite', animationDelay: `${delay + 0.3}s` }} />
      ))}
    </svg>
  );
};


// TIME — dotted clock face; 12 hour dots + two dotted hands + center dot.
// Animation: the hour dots fade in sequence, like a second hand sweeping round.
export const TimeVector: React.FC<{ size?: number }> = ({ size = 20 }) => {
  const ring: [number, number][] = [
    [12, 3], [16.5, 4.2], [19.8, 7.5], [21, 12], [19.8, 16.5], [16.5, 19.8],
    [12, 21], [7.5, 19.8], [4.2, 16.5], [3, 12], [4.2, 7.5], [7.5, 4.2],
  ];
  const hands: [number, number][] = [[12, 12], [12, 9.5], [12, 7], [14.5, 12], [16.5, 12]];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      {ring.map(([cx, cy], i) => (
        <circle key={`r${i}`} cx={cx} cy={cy} r="1.1"
          style={{ animation: 'vectorFade 2.4s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
      ))}
      {hands.map(([cx, cy], i) => (
        <circle key={`h${i}`} cx={cx} cy={cy} r="0.9" />
      ))}
    </svg>
  );
};


// ─── Monthly Fingerprint ────────────────────────────────────────────────────
export const MonthFingerprint: React.FC<{
  monthKey: string;
  days: Record<string, { water: number; focus: number; workout: number }>;
  size?: number;
}> = ({ monthKey, days, size = 72 }) => {
  const cx = size / 2, cy = size / 2, maxR = size * 0.44;
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      {Array.from({ length: daysInMonth }, (_, i) => {
        const dateKey = `${monthKey}-${String(i + 1).padStart(2, '0')}`;
        const d = days[dateKey] ?? null;
        const angle = (i / daysInMonth) * Math.PI * 2 - Math.PI / 2;
        const score = d ? Math.min(1, d.water / 12 * 0.4 + d.focus / 100 * 0.4 + (d.workout > 0 ? 1 : 0) * 0.2) : 0;
        const r = score > 0 ? maxR * (0.3 + score * 0.7) : maxR * 0.08;
        const x2 = cx + Math.cos(angle) * r;
        const y2 = cy + Math.sin(angle) * r;
        return (
          <line key={i} x1={cx} y1={cy} x2={x2} y2={y2}
            stroke="currentColor"
            strokeWidth={score > 0.5 ? 1.6 : 1}
            opacity={score > 0 ? 0.3 + score * 0.65 : 0.1} />
        );
      })}
    </svg>
  );
};
