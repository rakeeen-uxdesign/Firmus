import React, { useState } from 'react';
import { useFirebaseSync } from '@/data/useFirebaseSync';
import { usePrayer } from '@/data/usePrayer';
import { useFridayGate } from '@/data/useFridayGate';
import { niceTicks } from '@/lib/charts';
import { ChartTooltip } from '@/ui/ChartTooltip';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts';
import {
  IconRotateCcw as RotateCcw, IconUndo2 as Undo2, IconPlus as Plus,
  IconArrowLeft as ArrowLeft, IconChevronRight as ChevronRight,
} from '@/ui/icons';
import { FilterSelect, PERIOD_OPTIONS } from '@/ui/FilterSelect';
import { isWaterClosed } from '@/domain/devotion/prayer';
import { buildPeriodReports, periodMultiplier, type ReportView } from '@/domain/report';
import { DotMatrixText } from '@/ui/DotMatrixText';


interface WaterProps {
  navigate: (to: string) => void;
}

export const Water: React.FC<WaterProps> = ({ navigate }) => {
  const [glasses, setGlasses] = useFirebaseSync<number>('hydration_glasses', 0);
  const [history] = useFirebaseSync<Record<string, number>>('hydration_history', {});
  const [reportView, setReportView] = useState<ReportView>('week');
  const goal = 12;

  React.useEffect(() => {
    document.title = 'Firmus — Water';
  }, []);

  // Day is archived/reset at the real Maghrib time (from the prayer API, refreshed
  // daily) and reopens at the real Fajr time. Locking adds during this window prevents
  // new water from being misattributed to the day that was just closed out.
  const { times } = usePrayer();
  const [now, setNow] = useState(() => new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const isLocked = isWaterClosed(times, now);
  const { friday, includedToday, includeToday } = useFridayGate(now);
  const fridayLocked = friday && !includedToday;

  const addGlass = () => {
    if (isLocked || fridayLocked) return;
    setGlasses(glasses + 1);
  };

  const reset = () => {
    if (isLocked) return;
    setGlasses(0);
  };

  const undo = () => {
    if (isLocked) return;
    if (glasses <= 0) return;
    setGlasses(glasses - 1);
  };

  // --- ANALYTICS ---
  // Once the 6pm reset archives today's tally into history and zeroes the live counter,
  // "today" needs the higher of the two — otherwise the chart shows 0 for the rest of
  // the night even though the day's data is safely archived.
  const todayGlasses = Math.max(history[new Date().toDateString()] || 0, glasses);
  const reports = buildPeriodReports(history, todayGlasses);
  const target = goal * periodMultiplier(reportView);

  return (
    <div className="min-h-screen bg-bg text-ink py-6 md:py-12 px-6 md:px-12 lg:px-20 font-sans-main flex flex-col transition-colors duration-300">

      {/* HEADER */}
      <header className="w-full max-w-[1000px] mx-auto mb-12">
        <div className="flex items-center gap-2 mb-8">
          <button
            onClick={() => navigate('home')}
            className="flex items-center gap-2 text-ink/40 hover:text-ink transition-colors group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="font-mono-main text-[10px] uppercase tracking-[0.25em] font-bold">Home</span>
          </button>
          <ChevronRight size={12} className="text-ink/20" />
          <span className="font-mono-main text-[10px] uppercase tracking-[0.25em] font-bold text-ink/50">Water</span>
        </div>

        <h1 className="font-sans-main text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight text-ink">
          WATER
        </h1>
      </header>

      {/* MAIN CONTENT */}
      <main className="w-full max-w-[1000px] mx-auto flex flex-col gap-6">

        {/* HERO COUNTER CARD */}
        <div className="brutalist-dashed-card no-lift flex flex-col md:flex-row md:items-center md:justify-between gap-10">
          <div className="flex-grow flex flex-col sm:flex-row sm:items-center gap-8">
            <div className="flex items-center gap-6">
              <DotMatrixText text={String(glasses)} />
              <div className="flex items-center gap-4 self-end pb-1">
                <span className="font-mono-main text-4xl font-black text-ink/20">/</span>
                <DotMatrixText
                  text={String(goal)}
                  dotSizeClassName="w-1.5 h-1.5 sm:w-2 sm:h-2"
                  gapClassName="gap-0.5 sm:gap-1"
                />
              </div>
            </div>
            <span className="font-sans-main text-xs font-bold uppercase tracking-widest text-ink/40">
              glasses today
            </span>
          </div>

          <div className="flex flex-col gap-3 min-w-[180px]">
            {fridayLocked ? (
              <button
                onClick={includeToday}
                className="btn-brutalist flex items-center justify-center gap-2 w-full py-4 text-sm text-center leading-snug"
              >
                It's Jumu'ah — count today anyway?
              </button>
            ) : (
              <button
                onClick={addGlass}
                disabled={isLocked}
                className="btn-brutalist flex items-center justify-center gap-2 w-full py-4 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus size={16} />
                Add Glass
              </button>
            )}
            <div
              className={`flex gap-2 transition-all duration-200 ${glasses > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none invisible'}`}
              style={{ visibility: glasses > 0 ? 'visible' : 'hidden' }}
            >
              <button
                onClick={undo}
                disabled={isLocked}
                className="flex-1 flex items-center justify-center gap-2 py-3 border border-ink/20 text-ink/40 hover:text-ink hover:border-ink transition-all font-mono-main text-[10px] uppercase tracking-widest font-bold disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-ink/40 disabled:hover:border-ink/20"
              >
                <Undo2 size={14} />
                Undo
              </button>
              <button
                onClick={reset}
                disabled={isLocked}
                className="flex-1 flex items-center justify-center gap-2 py-3 border border-ink/10 text-ink/20 hover:text-ink/60 hover:border-ink/40 transition-all font-mono-main text-[10px] uppercase tracking-widest font-bold disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-ink/20 disabled:hover:border-ink/10"
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* ANALYTICS CARD */}
        <div className="brutalist-card no-lift">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
            <h2 className="font-sans-main text-2xl font-black uppercase tracking-tight">Analytics</h2>

            <FilterSelect label="Period" value={reportView} onChange={setReportView} options={PERIOD_OPTIONS} />
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer>
              <BarChart data={reports[reportView]} margin={{ top: 16, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--ink)" strokeOpacity={0.05} strokeDasharray="0" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--ink)', opacity: 0.3, fontSize: 10, fontWeight: 700, fontFamily: 'Geist Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <YAxis
                  tick={{ fill: 'var(--ink)', opacity: 0.3, fontSize: 10, fontWeight: 700, fontFamily: 'Geist Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                  domain={[0, (dataMax: number) => Math.max(dataMax, target)]}
                  ticks={(() => {
                    // Nice round intermediate steps, but the final tick always lands
                    // exactly on the real goal (12/84/360) instead of overshooting it.
                    const ticks = niceTicks(target).filter(t => t <= target);
                    if (ticks[ticks.length - 1] !== target) ticks.push(target);
                    return ticks;
                  })()}
                />
                <Tooltip
                  cursor={{ fill: 'var(--ink)', fillOpacity: 0.04 }}
                  content={
                    <ChartTooltip
                      unit="Glasses"
                      getTipMessage={(val) =>
                        val >= target ? 'Goal Achieved' : 'Hydration Pending'
                      }
                    />
                  }
                />
                <ReferenceLine
                  y={target}
                  stroke="var(--ink)"
                  strokeOpacity={0.15}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{
                    value: String(target),
                    position: 'insideTopRight',
                    fill: 'var(--ink)',
                    fontSize: 10,
                    fontWeight: 900,
                    opacity: 0.25,
                    fontFamily: 'Geist Mono, monospace',
                  }}
                />
                <Bar dataKey="value" maxBarSize={36} radius={[0, 0, 0, 0]}>
                  {reports[reportView].map((_, i) => (
                    <Cell
                      key={i}
                      fill="var(--sepia)"
                      fillOpacity={0.9}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Stats Footer */}
          <div className="flex items-center justify-between border-t border-ink/5 pt-5 mt-4">
            <span className="font-mono-main text-[10px] uppercase tracking-widest text-ink/30 font-bold">
              Daily Target: {goal} Glasses
            </span>
            <span className="font-mono-main text-[10px] uppercase tracking-widest text-ink/30 font-bold">
              {reportView === 'week' ? 'This Week' : reportView === 'month' ? 'This Month' : 'This Year'}
            </span>
          </div>
        </div>

      </main>
    </div>
  );
};
