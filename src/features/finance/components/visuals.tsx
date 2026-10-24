import React, { useState, useEffect, useRef } from 'react';
import type { FinanceBanks, FinanceBuckets } from '@/domain/finance/types';
import { formatEGP } from '@/domain/finance/money';
import { ICON_STROKE_WIDTH } from '@/ui/icons';

/**
 * Purely presentational pieces for the Finance screen: bank/bucket dot-matrix
 * icons, the privacy-blur value mask, and the flash-on-change animated
 * number. No app state — just props in, SVG/markup out.
 */

// Balance → animation duration: slow at 0 EGP (12s), fast at 100k+ EGP (2s)
function balanceToDuration(balance: number): number {
  const norm = Math.min(1, (balance || 0) / 100_000);
  return Math.max(2, 12 - norm * 10);
}

// CIB — diamond star network; dots radiate center→out, wave reflects balance speed
const CIBVector: React.FC<{ balance: number }> = ({ balance }) => {
  const d = balanceToDuration(balance);
  const dots: [number, number, number][] = [
    [12, 12, 0],
    [12, 7, 0.08], [17, 12, 0.16], [12, 17, 0.24], [7, 12, 0.32],
    [7, 7, 0.42], [17, 7, 0.50], [17, 17, 0.58], [7, 17, 0.66],
    [12, 2, 0.74], [22, 12, 0.82], [12, 22, 0.90], [2, 12, 0.98],
  ];
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-ink">
      {dots.map(([cx, cy, frac], i) => (
        <circle key={i} cx={cx} cy={cy} r={i === 0 ? 1.5 : 1.1}
          style={{ animation: `vectorFade ${d}s ease-in-out infinite`, animationDelay: `${frac * d}s` }} />
      ))}
    </svg>
  );
};

// Ahly Main — ankh ☥ (Egyptian cross); loop → crossbar → stem, wave = balance
const AhlyMainVector: React.FC<{ balance: number }> = ({ balance }) => {
  const d = balanceToDuration(balance);
  const dots: [number, number, number][] = [
    // oval loop top→right→bottom→left
    [12, 2,    0   ],
    [16, 4,    0.07],
    [18, 8,    0.14],
    [16, 11.5, 0.21],
    [8,  11.5, 0.28],
    [6,  8,    0.35],
    [8,  4,    0.42],
    // crossbar L→R
    [5,  13.5, 0.50],
    [8,  13.5, 0.55],
    [16, 13.5, 0.60],
    [19, 13.5, 0.65],
    // stem downward
    [12, 16,   0.72],
    [12, 19,   0.79],
    [12, 22,   0.86],
    // loop center
    [12, 8,    0.93],
  ];
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-ink">
      {dots.map(([cx, cy, frac], i) => (
        <circle key={i} cx={cx} cy={cy} r={i === 14 ? 1.5 : 1.1}
          style={{ animation: `vectorFade ${d}s ease-in-out infinite`, animationDelay: `${frac * d}s` }} />
      ))}
    </svg>
  );
};

// Ahly Meeza — card outline + stripe; sweep clockwise, speed = balance
const AhlyMeezaVector: React.FC<{ balance: number }> = ({ balance }) => {
  const d = balanceToDuration(balance);
  const dots: [number, number, number][] = [
    // top edge L→R
    [3, 4, 0], [7, 4, 0.07], [12, 4, 0.14], [17, 4, 0.21], [21, 4, 0.28],
    // right edge T→B
    [21, 9, 0.35], [21, 14, 0.42], [21, 20, 0.49],
    // bottom edge R→L
    [17, 20, 0.56], [12, 20, 0.63], [7, 20, 0.70], [3, 20, 0.77],
    // left edge B→T
    [3, 14, 0.84], [3, 9, 0.91],
    // magnetic stripe
    [6, 10, 0.3], [10, 10, 0.35], [14, 10, 0.4], [18, 10, 0.45],
  ];
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-ink">
      {dots.map(([cx, cy, frac], i) => (
        <circle key={i} cx={cx} cy={cy} r={i >= 14 ? 1.0 : 1.1}
          style={{ animation: `vectorFade ${d}s ease-in-out infinite`, animationDelay: `${frac * d}s` }} />
      ))}
    </svg>
  );
};

// Banque Misr — pyramid; wave from apex→base, speed = balance
const BanqueMisrVector: React.FC<{ balance: number }> = ({ balance }) => {
  const d = balanceToDuration(balance);
  const rows: [number, number, number][][] = [
    [[12, 3, 0]],
    [[9, 9, 0.18], [12, 9, 0.18], [15, 9, 0.18]],
    [[6, 15, 0.40], [9, 15, 0.40], [12, 15, 0.40], [15, 15, 0.40], [18, 15, 0.40]],
    [[3, 21, 0.65], [6, 21, 0.65], [9, 21, 0.65], [12, 21, 0.65], [15, 21, 0.65], [18, 21, 0.65], [21, 21, 0.65]],
  ];
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-ink">
      {rows.map((row, ri) =>
        row.map(([cx, cy, frac], i) => (
          <circle key={`${ri}-${i}`} cx={cx} cy={cy} r={ri === 0 ? 1.6 : 1.1}
            style={{ animation: `vectorFade ${d}s ease-in-out infinite`, animationDelay: `${frac * d}s` }} />
        ))
      )}
    </svg>
  );
};

// Animated price number — flashes green/red on change
// Spinning vector that hides the value until hover
/** `align="end"` draws the mask against the right edge, for amounts that sit flush right. */
export const MaskedValue: React.FC<{ children: React.ReactNode; className?: string; disabled?: boolean; align?: 'start' | 'end' }> = ({ children, className = '', disabled = false, align = 'start' }) => {
  const [revealed, setRevealed] = useState(false);
  if (disabled) return <span className={className}>{children}</span>;
  return (
    <span
      className={`relative inline-block cursor-pointer select-none ${className}`}
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
    >
      {/* Spinning asterisk mask — positioned absolute so container = value width */}
      <span
        className={`absolute inset-0 flex items-center transition-opacity duration-200 ${align === 'end' ? 'justify-end' : 'justify-start'}`}
        style={{ opacity: revealed ? 0 : 1, pointerEvents: 'none' }}
        aria-hidden
      >
        <svg width="2.2em" height="0.8em" viewBox="0 0 44 14" fill="none">
          <style>{`@keyframes mvr{to{transform:rotate(360deg)}}@keyframes mvrr{to{transform:rotate(-360deg)}}`}</style>
          {[0,1,2].map(i => {
            const cx = 7 + i * 15;
            const cy = 7;
            const r = 4;
            const anim = i === 1 ? 'mvrr' : 'mvr';
            const dur = 2 + i * 0.5;
            return (
              <g key={i} style={{ animation: `${anim} ${dur}s linear infinite`, transformOrigin: `${cx}px ${cy}px`, opacity: 0.25 + i * 0.2 }}>
                <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" />
                <line x1={cx - r * 0.5} y1={cy - r * 0.866} x2={cx + r * 0.5} y2={cy + r * 0.866} stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" />
                <line x1={cx + r * 0.5} y1={cy - r * 0.866} x2={cx - r * 0.5} y2={cy + r * 0.866} stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" />
              </g>
            );
          })}
        </svg>
      </span>
      {/* Value — invisible but holds layout width */}
      <span className="transition-opacity duration-200" style={{ opacity: revealed ? 1 : 0 }}>
        {children}
      </span>
    </span>
  );
};

export const AnimatedValue: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => {
  const prevRef = useRef(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (value !== prevRef.current) {
      setFlash(value > prevRef.current ? 'up' : 'down');
      prevRef.current = value;
      const t = setTimeout(() => setFlash(null), 900);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <span
      className={`transition-colors duration-500 ${className}`}
      style={{
        color: flash === 'up' ? 'var(--forest)' : flash === 'down' ? 'var(--rust)' : 'var(--ink)',
      }}
    >
      {formatEGP(value)}
    </span>
  );
};

export const BANK_LABELS: Record<keyof FinanceBanks, string> = {
  cib: 'CIB',
  ahly_main: 'Ahly Main',
  ahly_meeza: 'Ahly Meeza',
  bm: 'Banque Misr',
};

export const BANK_KEYS = Object.keys(BANK_LABELS) as Array<keyof FinanceBanks>;

export const BANK_VECTORS: Record<keyof FinanceBanks, React.ComponentType<{ balance: number }>> = {
  cib: CIBVector,
  ahly_main: AhlyMainVector,
  ahly_meeza: AhlyMeezaVector,
  bm: BanqueMisrVector,
};

// Mustaqbal — shield outline (safe / vault)
const MustaqbalVector: React.FC<{ balance: number }> = ({ balance }) => {
  const d = balanceToDuration(balance);
  const dots: [number, number, number][] = [
    [12, 2,  0   ], [17, 4,  0.08], [20, 8,  0.16], [20, 13, 0.24],
    [17, 18, 0.32], [12, 21, 0.40], [7,  18, 0.48], [4,  13, 0.56],
    [4,  8,  0.64], [7,  4,  0.72],
    [12, 12, 0.85],
  ];
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-ink">
      {dots.map(([cx, cy, frac], i) => (
        <circle key={i} cx={cx} cy={cy} r={i === 10 ? 1.5 : 1.1}
          style={{ animation: `vectorFade ${d}s ease-in-out infinite`, animationDelay: `${frac * d}s` }} />
      ))}
    </svg>
  );
};

// Tawarr2 — lightning bolt (urgent, emergency)
const Tawarr2Vector: React.FC<{ balance: number }> = ({ balance }) => {
  const d = balanceToDuration(balance);
  const dots: [number, number, number][] = [
    [16, 2,  0   ], [14, 5,  0.10], [12, 8,  0.20],
    [14, 8,  0.25], [11, 12, 0.35], [9,  16, 0.45],
    [11, 16, 0.50], [8,  22, 0.65],
  ];
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-ink">
      {dots.map(([cx, cy, frac], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.2"
          style={{ animation: `vectorFade ${d * 0.7}s ease-in-out infinite`, animationDelay: `${frac * d * 0.7}s` }} />
      ))}
    </svg>
  );
};

// Basmala — crescent moon (spiritual, personal)
const BasmalaVector: React.FC<{ balance: number }> = ({ balance }) => {
  const d = balanceToDuration(balance);
  const dots: [number, number, number][] = [
    [12, 2,  0   ], [17, 4,  0.09], [20, 8,  0.18],
    [21, 12, 0.27], [20, 16, 0.36], [17, 20, 0.45], [12, 22, 0.54],
    [4,  6,  0.70], [4,  18, 0.80],
  ];
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-ink">
      {dots.map(([cx, cy, frac], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.1"
          style={{ animation: `vectorFade ${d}s ease-in-out infinite`, animationDelay: `${frac * d}s` }} />
      ))}
    </svg>
  );
};

// Sadaqa — ascending sprout / rising (charity = growth)
const SadaqaVector: React.FC<{ balance: number }> = ({ balance }) => {
  const d = balanceToDuration(balance);
  const dots: [number, number, number][] = [
    [12, 2,  0   ],
    [9,  6,  0.10], [12, 6,  0.15], [15, 6,  0.10],
    [7,  10, 0.22], [12, 10, 0.28], [17, 10, 0.22],
    [12, 14, 0.40],
    [12, 18, 0.55],
    [12, 22, 0.70],
  ];
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-ink">
      {dots.map(([cx, cy, frac], i) => (
        <circle key={i} cx={cx} cy={cy} r={i === 0 ? 1.5 : 1.1}
          style={{ animation: `vectorFade ${d}s ease-in-out infinite`, animationDelay: `${frac * d}s` }} />
      ))}
    </svg>
  );
};

export const BUCKET_VECTORS: Record<keyof FinanceBuckets, React.ComponentType<{ balance: number }>> = {
  mustaqbal: MustaqbalVector,
  tawarr2:   Tawarr2Vector,
  basmala:   BasmalaVector,
  sadaqa:    SadaqaVector,
};

export const BUCKET_META: Record<keyof FinanceBuckets, { en: string; accent: string }> = {
  tawarr2:  { en: "Tawarru'", accent: 'var(--rust)' },
  mustaqbal:{ en: 'Future',   accent: 'var(--forest)' },
  basmala:  { en: 'Basmala',  accent: 'var(--ink-faded)' },
  sadaqa:   { en: 'Sadaqa',   accent: '#B89228' },
};
