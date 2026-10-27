import React, { useEffect } from 'react';
import { FilterSelect, PERIOD_OPTIONS } from '@/ui/FilterSelect';
import { buildFocusReports, focusTargetHours } from '@/domain/focus/report';
import { isFocusNightLocked } from '@/domain/devotion/prayer';
import type { ReportView } from '@/domain/report';
import { Tabs } from '@/ui/Tabs';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from 'recharts';
import { niceTicks } from '@/lib/charts';
import { ChartTooltip } from '@/ui/ChartTooltip';
import {
  IconPlay as Play, IconPause as Pause, IconRotateCcw as RotateCcw,
  IconArrowLeft as ArrowLeft, IconChevronRight as ChevronRight,
} from '@/ui/icons';
import { usePomodoro } from '@/data/usePomodoro';
import { PixelDigits, PixelClock } from '@/ui/PixelFocusDisplay';
import { FocusCarousel } from '@/ui/FocusCarousel';
import { RulerTimer } from '@/ui/RulerTimer';
import { useFridayGate } from '@/data/useFridayGate';
import { usePrayer } from '@/data/usePrayer';


interface PomodoroProps {
  navigate: (to: string) => void;
}



const getTip = (value: number, view: ReportView) => {
  const target = focusTargetHours(view);
  if (value >= target) return "Elite Focus!";
  if (value >= target * 0.7) return "Almost there!";
  return "Keep pushing";
};

// ─── Main Component ───────────────────────────────────────────────────────────
const PAGE_TABS = [{ value: 'focus', label: 'Focus Time' }, { value: 'analysis', label: 'Analysis' }] as const;

export const Pomodoro: React.FC<PomodoroProps> = ({ navigate }) => {
  const {
    timeLeft, overtime, isOvertime, running, mode, sessions, weekStats, history, todayIdx,
    focusDuration, breakDuration,
    start, pause, reset, startBreak, startNewSession, skipBreak, saveProgress
  } = usePomodoro();
  const { friday, includedToday } = useFridayGate();
  const fridayLocked = friday && !includedToday;

  // New sessions can't be started between Isha and the real Fajr time (both from the
  // prayer API, refreshed daily, same as Water's own Maghrib→Fajr lock).
  const { times: pomoTimes } = usePrayer();
  const nightLocked = isFocusNightLocked(pomoTimes);

  const [view, setView] = React.useState<ReportView>('week');
  const [pomTab, setPomTab] = React.useState<'focus' | 'analysis'>('focus');

  const FOCUS_S = focusDuration * 60;
  const BREAK_S = breakDuration * 60;

  useEffect(() => { document.title = 'Rakeeen - Pomodoro'; }, []);

  const getTimerColor = () => {
    if (isOvertime) return 'var(--pomo-overtime)';
    if (mode === 'break') return 'var(--pomo-break)';
    return 'var(--ink)';
  };

  const focusMinsToday = Math.round(weekStats?.[todayIdx]?.minutes || 0);
  const reports = buildFocusReports(history, focusMinsToday, new Date());

  const controls = (
    <div className="flex flex-col items-center gap-4">
      <div className="flex justify-center items-center gap-3">
        {isOvertime || (mode === 'break' && timeLeft === 0) ? (
          <>
            {isOvertime && (
              <button
                onClick={running ? pause : start}
                className="w-12 h-12 border border-ink/20 flex items-center justify-center text-ink/60 hover:border-ink/60 hover:text-ink transition-all cursor-pointer bg-transparent"
                data-tip={running ? 'Stop' : 'Resume'}
                aria-label={running ? 'Stop' : 'Resume'}
              >
                {running ? <Pause size={18} /> : <Play size={18} />}
              </button>
            )}
            <button
              onClick={isOvertime ? startBreak : startNewSession}
              className="btn-brutalist min-w-[180px] py-3 text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw size={14} />
              <span>{isOvertime ? 'Take a break' : 'Start new session'}</span>
            </button>
            {isOvertime && (
              <button
                onClick={startNewSession}
                className="w-12 h-12 border border-ink/20 flex items-center justify-center text-ink/30 hover:border-ink/60 hover:text-ink/60 transition-all cursor-pointer bg-transparent"
                data-tip="Restart from the beginning"
                aria-label="Restart from the beginning"
              >
                <RotateCcw size={18} />
              </button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={running ? pause : start}
              disabled={!running && (fridayLocked || nightLocked)}
              className="w-12 h-12 border border-ink flex items-center justify-center transition-all bg-ink text-paper hover:opacity-90 cursor-pointer animate-none disabled:opacity-30 disabled:cursor-not-allowed"
              data-tip={
                running ? 'Pause'
                : fridayLocked ? "Include today from the Water page first"
                : nightLocked ? "Reopens at Fajr"
                : 'Start'
              }
            >
              {running ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              onClick={reset}
              className="w-12 h-12 border border-ink/20 flex items-center justify-center text-ink/30 hover:border-ink/60 hover:text-ink/60 transition-all cursor-pointer bg-transparent"
              data-tip="Reset"
              aria-label="Reset"
            >
              <RotateCcw size={18} />
            </button>
          </>
        )}
        
        {mode === 'focus' && running && !isOvertime && (
          <button 
            onClick={saveProgress}
            className="text-[10px] uppercase font-black tracking-widest text-forest/40 hover:text-forest transition-all border-b border-forest/20 ml-2 cursor-pointer"
          >
            Done
          </button>
        )}
      </div>
      {mode === 'break' && (
        <button onClick={skipBreak} className="text-[10px] uppercase tracking-[0.2em] font-black text-ink/40 hover:text-sepia transition-all underline underline-offset-4 cursor-pointer">
          Skip Break
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="min-h-screen bg-bg text-ink py-6 md:py-12 px-6 md:px-12 lg:px-20 font-sans-main flex flex-col transition-colors duration-300">
        
        {/* HEADER */}
        <header className="w-full max-w-[1000px] mx-auto mb-12">
          {/* Breadcrumb / Back */}
          <div className="flex items-center gap-2 mb-8">
            <button
              onClick={() => navigate('home')}
              className="flex items-center gap-2 text-ink/40 hover:text-ink transition-colors group"
            >
              <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="font-mono-main text-[10px] uppercase tracking-[0.25em] font-bold">Home</span>
            </button>
            <ChevronRight size={12} className="text-ink/20" />
            <span className="font-mono-main text-[10px] uppercase tracking-[0.25em] font-bold text-ink/50">Focus</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <h1 className="font-sans-main text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight text-ink">
              FOCUS TIME
            </h1>
            <Tabs
              layoutId="pomodoroTab"
              ruled
              value={pomTab}
              onChange={setPomTab}
              options={PAGE_TABS}
              className="md:mb-1"
            />
          </div>
        </header>

        {/* MAIN CONTENT */}
        <main className="w-full max-w-[1000px] mx-auto flex flex-col gap-6">

          {/* Focus Session Card */}
          {pomTab === 'focus' && (
          <div className="text-center brutalist-card no-lift relative p-6 sm:p-10">

            <div className="text-[10px] uppercase tracking-[0.3em] font-black mb-10">
              <span style={{ color: getTimerColor() }}>
                {isOvertime ? 'Over-focusing' : (mode === 'focus' ? 'Focus session' : 'Break time')}
              </span>
            </div>

            {/* Timer — two faces of the same state, swipe between them */}
            {(() => {
              const secs = isOvertime ? overtime : timeLeft;
              const totalMins = Math.floor(secs / 60);
              const pixelMM = totalMins >= 100 ? String(totalMins) : String(totalMins).padStart(2, '0');
              const pixelSS = String(secs % 60).padStart(2, '0');

              return (
                <FocusCarousel
                persistKey="focus_face"
                  dotColor={getTimerColor()}
                  pages={[
                    <div className="w-full min-h-[220px] flex items-center justify-center gap-5 sm:gap-8">
                      <div className="shrink-0">
                        <PixelClock
                          elapsedSeconds={isOvertime ? FOCUS_S + overtime : (mode === 'focus' ? FOCUS_S : BREAK_S) - timeLeft}
                          mode={mode}
                          running={running}
                          isOvertime={isOvertime}
                          width="clamp(84px, 14vw, 128px)"
                        />
                      </div>
                      <PixelDigits mm={pixelMM} ss={pixelSS} color={getTimerColor()} maxWidth="min(60vw, 300px)" />
                    </div>,
                    <div className="w-full min-h-[220px] flex items-center justify-center">
                      <RulerTimer seconds={secs} mm={pixelMM} ss={pixelSS} mode={mode} isOvertime={isOvertime} running={running} />
                    </div>,
                  ]}
                />
              );
            })()}

            <div className="relative flex justify-center mt-6 select-none">
              <span className="text-[10px] uppercase tracking-[0.2em] font-black text-ink/30">
                {mode === 'focus' ? `${focusDuration}m focus session` : `${breakDuration}m health break`}
              </span>
            </div>

            {/* Controls */}
            <div className="mt-10">{controls}</div>
          </div>
          )}

          {/* Performance Reports */}
          {pomTab === 'analysis' && (
          <div className="brutalist-card no-lift pb-6 p-6 sm:p-8">
            {/* Header row */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-10">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Performance</h2>
                <div className="flex items-center gap-4 mt-2">
                  <span className="font-mono-main text-[10px] font-black text-ink/30 uppercase tracking-widest">
                    {sessions} sessions today
                  </span>
                  <span className="text-ink/15">·</span>
                  <span className="font-mono-main text-[10px] font-black text-ink/30 uppercase tracking-widest">
                    {Number(((weekStats?.[todayIdx]?.minutes || 0) / 60).toFixed(1))}h focus today
                  </span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Period switch */}
                <FilterSelect label="Period" value={view} onChange={setView} options={PERIOD_OPTIONS} />
              </div>
            </div>

            {/* Chart */}
            <div className="h-[240px] w-full">
              <ResponsiveContainer>
                <BarChart
                  data={reports[view]}
                  margin={{ top: 20, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--ink)" strokeOpacity={0.05} strokeDasharray="0" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: 'var(--ink)', opacity: 0.4, fontSize: 10, fontWeight: 700, fontFamily: 'Geist Mono, monospace' }} 
                    axisLine={false} tickLine={false} dy={10} 
                  />
                  <YAxis 
                    tick={{ fill: 'var(--ink)', opacity: 0.4, fontSize: 10, fontWeight: 700, fontFamily: 'Geist Mono, monospace' }} 
                    axisLine={false} tickLine={false}
                    width={35}
                    domain={[0, (dataMax: number) => Math.max(dataMax, focusTargetHours(view))]}
                    ticks={niceTicks(focusTargetHours(view))}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--ink)', fillOpacity: 0.04 }}
                    content={<ChartTooltip unit="Hours" getTipMessage={(val) => getTip(val, view)} />}
                  />
                  
                  <ReferenceLine
                    y={focusTargetHours(view)}
                    stroke="var(--forest)" 
                    strokeDasharray="6 6" 
                    strokeOpacity={0.4}
                    strokeWidth={1.5}
                  />

                  <Bar dataKey="hours" radius={[0, 0, 0, 0]} maxBarSize={32}>
                    {reports[view].map((_, i) => (
                      <Cell key={i} fill="var(--sepia)" fillOpacity={0.9} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>
          )}
        </main>
      </div>
    </>
  );
};
