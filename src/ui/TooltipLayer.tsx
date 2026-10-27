import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const SHOW_AFTER_MS = 350;
const EDGE = 8;
const GAP = 8;

/**
 * The app's hover tooltip — one shared bubble for every element that carries `data-tip="…"`,
 * so it looks like the rest of the system instead of the browser's own yellow box.
 *
 * It follows the pointer's position rather than hover events, because a disabled button swallows
 * those but is still what `elementFromPoint` returns — and "Reopens at Fajr" lives on exactly such
 * a button. Mouse and pen only; on touch there is no hover to show it on.
 */
export const TooltipLayer = () => {
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current: Element | null = null;
    let timer = 0;

    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
      setPos(null);
    };

    // elementFromPoint is cheap, and nothing happens unless the element under the pointer changes.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-tip]') ?? null;
      if (el === current) return;
      window.clearTimeout(timer);
      current = el;
      setTip(null);
      setPos(null);
      const text = el?.getAttribute('data-tip');
      if (el && text) timer = window.setTimeout(() => setTip({ text, rect: el.getBoundingClientRect() }), SHOW_AFTER_MS);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', hide);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    document.addEventListener('keydown', hide);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
      document.removeEventListener('keydown', hide);
      window.clearTimeout(timer);
    };
  }, []);

  // Place it above the element (below, if there's no room), kept inside the window.
  useLayoutEffect(() => {
    if (!tip || !boxRef.current) return;
    const box = boxRef.current.getBoundingClientRect();
    const left = Math.min(Math.max(tip.rect.left + tip.rect.width / 2 - box.width / 2, EDGE), window.innerWidth - box.width - EDGE);
    const above = tip.rect.top - box.height - GAP;
    setPos({ left, top: above >= EDGE ? above : tip.rect.bottom + GAP });
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={boxRef}
      role="tooltip"
      className="pointer-events-none fixed z-[10000] max-w-[260px] bg-ink text-paper font-mono-main text-[10px] font-bold uppercase tracking-[0.15em] leading-snug px-3 py-2"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, opacity: pos ? 1 : 0, transition: 'opacity 120ms ease' }}
    >
      {tip.text}
    </div>
  );
};
