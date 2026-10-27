import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useFirebaseSync } from '@/data/useFirebaseSync';
import { usePrayer } from '@/data/usePrayer';
import { POMODORO_WEEKLY_MOCK } from '@/constants/mockData';
import { getPomoTodayIdx } from '@/domain/day';
import { getDayMoments } from '@/domain/devotion/prayer';
import {
  breakMinutesFor, recordSession, type FocusDayStats, type FocusLogEntry, type FocusWeekDay,
} from '@/domain/focus/session';
import { formatDurationText } from '@/lib/format';

/** The slice of a Discord embed the Pomodoro webhook posts. */
interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer: { text: string };
  timestamp: string;
}

interface PomodoroContextType {
  timeLeft: number;
  overtime: number;
  isOvertime: boolean;
  running: boolean;
  mode: 'focus' | 'break';
  sessions: number;
  weekStats: FocusWeekDay[];
  logs: FocusLogEntry[];
  history: Record<string, FocusDayStats & { logs?: FocusLogEntry[] }>;
  todayIdx: number;
  focusDuration: number;
  breakDuration: number;
  setWeekStats: (v: FocusWeekDay[]) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  startBreak: () => void;
  startNewSession: () => void;
  skipBreak: () => void;
  saveProgress: () => void;
}

const PomodoroContext = createContext<PomodoroContextType | null>(null);

export const PomodoroProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [focusDuration] = useState(25); // minutes (enforced 25m default)
  const [breakDuration, setBreakDurationState] = useState(5);  // minutes (initially 5m)
  const FOCUS = focusDuration * 60;
  const [timeLeft, setTimeLeft] = useState(FOCUS);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [overtime, setOvertime] = useState(0);
  const [isOvertime, setIsOvertime] = useState(false);
  const [sessions, setSessions] = useFirebaseSync<number>('pomodoro_sessions', 0);
  const [rawWeekStats, setWeekStats] = useFirebaseSync<FocusWeekDay[]>('pomodoro_week', POMODORO_WEEKLY_MOCK);
  const weekStats = Array.isArray(rawWeekStats) && rawWeekStats.length === 7 ? rawWeekStats : POMODORO_WEEKLY_MOCK;
  const [logs, setLogs] = useFirebaseSync<FocusLogEntry[]>('pomodoro_logs', []);
  const [history] = useFirebaseSync<Record<string, FocusDayStats & { logs?: FocusLogEntry[] }>>('pomodoro_history', {});
  const todayIdx = getPomoTodayIdx();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Checkpoint of the in-progress timer, so a reload/crash mid-session doesn't
  // silently lose everything since the last completed session (see incident:
  // ~5h of focus lost because nothing is persisted until "take a break"/"save").
  //
  // `writtenBy` tags which tab/actor last wrote this checkpoint — a random id
  // generated once per tab load, or the fixed string the Discord bot uses.
  // It's what lets this tab tell "that's just my own periodic write echoing
  // back through Firestore's realtime listener" apart from "something else
  // (another device, the bot) genuinely changed this" — see the adoption
  // effect below. Comparing raw *values* instead doesn't work: a remote pause
  // one second after a remote start writes a checkpoint value this tab could
  // easily have produced itself, so there's no way to tell them apart without
  // an explicit origin marker.
  type Checkpoint = {
    timeLeft: number; overtime: number; isOvertime: boolean; running: boolean; mode: 'focus' | 'break';
    writtenBy?: string;
  };
  const [checkpoint, setCheckpoint, checkpointReady] = useFirebaseSync<Checkpoint | null>('pomodoro_checkpoint', null);
  const hydratedFromCheckpoint = useRef(false);
  const instanceIdRef = useRef<string>(crypto.randomUUID());

  // On first mount, always adopt whatever checkpoint exists (reload/crash
  // recovery). After that, keep adopting LATER checkpoint changes too — but
  // skip ones this exact tab just wrote itself (its own echo, nothing new to
  // apply). Anything genuinely external — another device, the Discord bot —
  // is adopted immediately and unconditionally, which is what makes a remote
  // Start/Pause/Resume/Done actually take effect on an already-open tab
  // instead of needing a reload, even mid-session.
  //
  // Two things this effect must get right, both found the hard way:
  //
  // 1. Wait for `checkpointReady`. useFirebaseSync seeds `checkpoint` from
  //    localStorage synchronously on mount, before Firestore has actually
  //    confirmed anything — acting on that pre-confirmation value is acting
  //    on a cache that might be stale (e.g. a leftover "running" snapshot
  //    from a session that's since ended on another device). Worse: once
  //    adopted, this tab's own heartbeat writes a fresh `updatedAt` within
  //    seconds, which then makes useFirebaseSync's "newest write wins" merge
  //    permanently reject Firestore's real (older, by then) correction —
  //    the stale session never self-heals, it just keeps ticking. Only once
  //    `checkpointReady` is true does `checkpoint` reflect what Firestore
  //    actually has.
  //
  // 2. `null` is a real, meaningful value (idle), not "nothing to do yet" —
  //    it must be applied too, not skipped, so a genuine external clear
  //    (Discord's Discard, this tab's own stale adoption self-correcting)
  //    actually takes local state back to idle instead of leaving it as
  //    whatever it was.
  useEffect(() => {
    if (!checkpointReady) return;
    const isFirstRun = !hydratedFromCheckpoint.current;
    hydratedFromCheckpoint.current = true;
    if (!isFirstRun && checkpoint?.writtenBy === instanceIdRef.current) return;
    if (!checkpoint) {
      setTimeLeft(FOCUS);
      setOvertime(0);
      setIsOvertime(false);
      setMode('focus');
      setRunning(false);
      return;
    }
    setTimeLeft(checkpoint.timeLeft);
    setOvertime(checkpoint.overtime);
    setIsOvertime(checkpoint.isOvertime);
    setMode(checkpoint.mode);
    setRunning(checkpoint.running);
  }, [checkpoint, checkpointReady, FOCUS]);

  // Daily Reset handled by DailyResetManager (src/app/)



  const sendDiscordNotification = useCallback(async (type: 'focus_started' | 'focus_timer_up' | 'focus_complete' | 'break_complete' | 'test', data?: { duration?: number, overtime?: number }) => {
    const webhookUrl = import.meta.env.VITE_DISCORD_POMODORO_WEBHOOK;
    if (!webhookUrl) return;

    const embeds: DiscordEmbed[] = [];
    
    if (type === 'focus_timer_up') {
      embeds.push({
        title: '🔔 Focus Session Finished!',
        description: `You finished **${formatDurationText(focusDuration)}**, take a break.`,
        color: 0x7ca982,
        footer: { text: 'Rakeeen Productivity System' },
        timestamp: new Date().toISOString()
      });
    } else if (type === 'focus_complete') {
      const totalMins = (data?.duration || focusDuration) + Math.floor((data?.overtime || 0) / 60);
      embeds.push({
        title: '🧠 Focus Session Logged',
        description: `Excellent! You've logged **${formatDurationText(totalMins)}** of deep work.`,
        fields: [
          { name: 'Base Goal', value: formatDurationText(data?.duration || focusDuration), inline: true },
          { name: 'Overtime', value: `${Math.floor((data?.overtime || 0) / 60)}m ${ (data?.overtime || 0) % 60}s`, inline: true }
        ],
        color: 0x7ca982,
        footer: { text: 'Rakeeen Productivity System' },
        timestamp: new Date().toISOString()
      });
    } else if (type === 'break_complete') {
      embeds.push({
        title: '☕ Break Time Over',
        description: `Your break is done? Time to get back to work! 🚀`,
        color: 0xc8a96e,
        footer: { text: 'Rakeeen Productivity System' },
        timestamp: new Date().toISOString()
      });
    }

    if (embeds.length === 0) return;

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds })
      });
    } catch (e) { console.error('Discord Webhook Error:', e); }
  }, [focusDuration, breakDuration]);

  // Core timer logic - Robust against background throttling
  const startTimeRef = useRef<number | null>(null);
  const baseTimeLeftRef = useRef<number>(timeLeft);
  const baseOvertimeRef = useRef<number>(overtime);

  useEffect(() => {
    if (running) {
      startTimeRef.current = Date.now();
      baseTimeLeftRef.current = timeLeft;
      baseOvertimeRef.current = overtime;

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - (startTimeRef.current || Date.now())) / 1000);
        
        if (isOvertime) {
          setOvertime(baseOvertimeRef.current + elapsed);
        } else {
          const newTime = Math.max(0, baseTimeLeftRef.current - elapsed);
          setTimeLeft(newTime);

          if (newTime <= 0) {
            if (mode === 'focus') {
              setIsOvertime(true);
              sendDiscordNotification('focus_timer_up');
              // We only send a "Time's up" browser notification at 0, 
              // but we'll send the final Discord report when they actually click "Start Break"
              // to capture the full time spent.
            } else {
              // Break finished. The checkpoint only stores a snapshot, not a
              // timestamp — on reload it resumes counting down from whatever
              // `timeLeft` it last held, in real time, no matter how long ago
              // that was. Since this transition sets `running` false, the
              // periodic/on-hide checkpoint writer below stops running too and
              // would never persist that — leaving a stale "still on break"
              // checkpoint that replays its last few leftover seconds forever,
              // on every future reload, even though nothing is actually running.
              // Clearing it here (same as reset()) is what actually stops that.
              setRunning(false);
              setMode('focus');
              setTimeLeft(FOCUS);
              setCheckpoint(null);
              sendDiscordNotification('break_complete');
            }
          }
        }
      }, 200);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running, mode, isOvertime, sendDiscordNotification, FOCUS, focusDuration, setCheckpoint]);

  // Periodic + on-hide checkpoint: keeps `pomodoro_checkpoint` in sync with the
  // live timer so a reload/crash restores from here instead of losing progress.
  const checkpointStateRef = useRef({ timeLeft, overtime, isOvertime, running, mode });
  useEffect(() => {
    checkpointStateRef.current = { timeLeft, overtime, isOvertime, running, mode };
  }, [timeLeft, overtime, isOvertime, running, mode]);

  // 3s, not the original 45s: this is also the heartbeat a remote actor (the
  // Discord bot) reads to know "how stale is this snapshot" — the shorter
  // the interval, the less a remote Done/save can be off by. Cheap at this
  // scale (at most ~1200 writes/hour of continuous running).
  useEffect(() => {
    if (!running) return;
    const writeCheckpoint = () => setCheckpoint({ ...checkpointStateRef.current, writtenBy: instanceIdRef.current });
    const intervalId = setInterval(writeCheckpoint, 3000);
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') writeCheckpoint(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [running, setCheckpoint]);

  // start/pause also write the checkpoint immediately instead of waiting for
  // the next periodic tick (up to 3s away) — so a Pause made here is visible
  // to a remote reader (the bot) right away, not just "eventually".
  const start = useCallback(() => {
    setRunning(true);
    setCheckpoint({ ...checkpointStateRef.current, running: true, writtenBy: instanceIdRef.current });
  }, [setCheckpoint]);
  const pause = useCallback(() => {
    setRunning(false);
    setCheckpoint({ ...checkpointStateRef.current, running: false, writtenBy: instanceIdRef.current });
  }, [setCheckpoint]);

  const reset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(false);
    setIsOvertime(false);
    setOvertime(0);
    setMode('focus');
    setTimeLeft(FOCUS);
    setCheckpoint(null);
  }, [FOCUS, setCheckpoint]);

  const startBreak = useCallback(() => {
    const focusGained = focusDuration + Math.floor(overtime / 60);
    const calculatedBreakMins = breakMinutesFor(focusGained);
    setBreakDurationState(calculatedBreakMins);

    setSessions(s => s + 1);
    const nowTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    setLogs(l => [{ time: nowTime, duration: focusGained }, ...l]);
    
    // Send Discord Report with full time (Base + Overtime)
    sendDiscordNotification('focus_complete', { duration: focusDuration, overtime });

    const currentWeekStats = Array.isArray(weekStats) && weekStats.length === 7 ? weekStats : POMODORO_WEEKLY_MOCK;
    const updated = recordSession(currentWeekStats, todayIdx, focusGained);
    setWeekStats(updated);

    setMode('break');
    setIsOvertime(false);
    setOvertime(0);
    setTimeLeft(calculatedBreakMins * 60);
    setRunning(true);
    setCheckpoint({
      timeLeft: calculatedBreakMins * 60, overtime: 0, isOvertime: false, mode: 'break', running: true,
      writtenBy: instanceIdRef.current,
    });
  }, [overtime, weekStats, todayIdx, setWeekStats, focusDuration, sendDiscordNotification, setCheckpoint]);

  const startNewSession = useCallback(() => {
    setMode('focus');
    setIsOvertime(false);
    setOvertime(0);
    setTimeLeft(FOCUS);
    setRunning(true);
    setCheckpoint({ timeLeft: FOCUS, overtime: 0, isOvertime: false, mode: 'focus', running: true, writtenBy: instanceIdRef.current });
  }, [FOCUS, setCheckpoint]);

  const skipBreak = useCallback(() => {
    setMode('focus');
    setIsOvertime(false);
    setOvertime(0);
    setTimeLeft(FOCUS);
    setRunning(false);
    setCheckpoint(null);
  }, [FOCUS, setCheckpoint]);

  const saveProgress = useCallback(() => {
    if (mode !== 'focus') return;
    
    const focusGained = Math.max(1, Math.floor((focusDuration * 60 - timeLeft + overtime) / 60));
    const calculatedBreakMins = breakMinutesFor(focusGained);
    setBreakDurationState(calculatedBreakMins);

    setSessions(s => s + 1);
    const nowTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    setLogs(l => [{ time: nowTime, duration: focusGained }, ...l]);
    
    // Send Discord Report with full time (Base + Overtime)
    sendDiscordNotification('focus_complete', { duration: focusDuration, overtime });

    const currentWeekStats = Array.isArray(weekStats) && weekStats.length === 7 ? weekStats : POMODORO_WEEKLY_MOCK;
    const updated = recordSession(currentWeekStats, todayIdx, focusGained);
    setWeekStats(updated);

    setMode('break');
    setIsOvertime(false);
    setOvertime(0);
    setTimeLeft(calculatedBreakMins * 60);
    setRunning(true);
    setCheckpoint({
      timeLeft: calculatedBreakMins * 60, overtime: 0, isOvertime: false, mode: 'break', running: true,
      writtenBy: instanceIdRef.current,
    });
  }, [mode, focusDuration, timeLeft, overtime, weekStats, todayIdx, setWeekStats, sendDiscordNotification, setLogs, setCheckpoint]);

  // Focus is locked Isha→Fajr (Pomodoro.tsx's `nightLocked`), but that lock only blocks
  // *starting* a new session — a session already running (or sitting in overtime) when
  // Isha hits just keeps counting, uninterrupted, with no button left to save it since
  // Start is now disabled. DailyResetManager's own Isha close-out can't catch this either:
  // it only archives what's already been committed to `pomodoro_week` (via this same
  // save/startBreak path), never the live in-memory timer. Without this, a session left
  // running through Isha silently never gets archived or zeroed at all.
  const { times: nightLockPrayerTimes } = usePrayer();
  const firedIshaAutoSaveRef = useRef('');
  useEffect(() => {
    if (mode !== 'focus' || !(running || isOvertime)) return;
    const check = () => {
      const now = new Date();
      const todayDateStr = now.toDateString();
      if (firedIshaAutoSaveRef.current === todayDateStr) return;
      if (now.getTime() < getDayMoments(nightLockPrayerTimes, now).isha) return;
      firedIshaAutoSaveRef.current = todayDateStr;

      // Read live timeLeft/overtime from the checkpoint ref (updated every render, see
      // above) instead of closing over them directly — keeping them out of this effect's
      // deps means the 30s interval below isn't torn down and recreated on every ~200ms
      // countdown tick while running.
      const { timeLeft: liveTimeLeft, overtime: liveOvertime } = checkpointStateRef.current;
      const focusGained = Math.max(1, Math.floor((focusDuration * 60 - liveTimeLeft + liveOvertime) / 60));
      setSessions(s => s + 1);
      const nowTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      setLogs(l => [{ time: nowTime, duration: focusGained }, ...l]);
      sendDiscordNotification('focus_complete', { duration: focusDuration, overtime: liveOvertime });
      const currentWeekStats = Array.isArray(weekStats) && weekStats.length === 7 ? weekStats : POMODORO_WEEKLY_MOCK;
      const updated = recordSession(currentWeekStats, todayIdx, focusGained);
      setWeekStats(updated);

      // Go fully idle rather than into a break — Focus (and, by extension, starting a
      // break) is locked until Fajr, so there's nothing to run into.
      setMode('focus');
      setIsOvertime(false);
      setOvertime(0);
      setTimeLeft(FOCUS);
      setRunning(false);
      setCheckpoint(null);
    };
    const interval = setInterval(check, 30000);
    check();
    return () => clearInterval(interval);
  }, [mode, running, isOvertime, nightLockPrayerTimes, focusDuration, weekStats, todayIdx, setWeekStats, sendDiscordNotification, setLogs, FOCUS, setCheckpoint]);

  return (
    <PomodoroContext.Provider value={{
      timeLeft, overtime, isOvertime, running, mode, sessions, weekStats, history, todayIdx,
      focusDuration, breakDuration,
      setWeekStats, logs,
      start, pause, reset, startBreak, startNewSession, skipBreak, saveProgress
    }}>
      {children}
    </PomodoroContext.Provider>
  );
};

export const usePomodoro = () => {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error('usePomodoro must be used within PomodoroProvider');
  return ctx;
};
