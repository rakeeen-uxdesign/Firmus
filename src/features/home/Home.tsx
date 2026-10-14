import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFirebaseSync } from '@/data/useFirebaseSync';
import { uploadImage } from '@/lib/cloudinary';
import {
  IconSun as Sun, IconCamera as Camera, IconMoreVertical as MoreVertical,
  IconLogOut as LogOut, IconMoon as Moon,
} from '@/ui/icons';
import { signOut } from 'firebase/auth';
import { auth } from '@/data/firebase';
import { usePomodoro } from '@/data/usePomodoro';
import { useRingAnimation } from '@/ui/useRingAnimation';
import { AppModal } from '@/ui/AppModal';
import { getLogicalDate } from '@/domain/day';
import { usePrayer } from '@/data/usePrayer';
import { getDayMoments, getDayPhase, isFocusNightLocked, isWaterClosed } from '@/domain/devotion/prayer';
import { getOccasionLine } from '@/domain/devotion/occasion';
import {
  daysSinceActive, getAbsenceLine, getAchievement, getLiveFocusLine, getProgressLine, getWeatherLine, pickHeader,
  type Achievement,
} from '@/domain/greeting';
import { AchievementRow } from '@/features/home/components/AchievementRow';
import { getClockParts, HOME_TIME_ZONE } from '@/domain/clock';
import { useWeather } from '@/data/useWeather';
import { isDarkTheme, setTheme } from '@/lib/theme';
import { useFridayGate } from '@/data/useFridayGate';
import { PixelDigits } from '@/ui/PixelFocusDisplay';
import { PixelDateTile } from '@/ui/PixelCalendar';
import { getDateParts } from '@/domain/month';
import {
  MaskedValue, SidebarActiveVector, WaterVector, FocusVector, FinanceVector, TimeVector, MonthFingerprint,
} from '@/features/home/components/visuals';
import { TimeCardBody } from '@/features/home/components/TimeCard';
import { WaterCardBody } from '@/features/home/components/WaterCard';
import { FocusCardBody } from '@/features/home/components/FocusCard';
import { FinanceCardBody } from '@/features/home/components/FinanceCard';

interface HomeProps {
  navigate: (to: string) => void;
}

// How long a manually-picked card stays before the dock snaps back to the system's pick.
const CARD_REVERT_MS = 30_000;

// Persists last active card so remount starts on the correct card instantly
type CardId = 'time' | 'water' | 'pomodoro' | 'finance';
let _lastActiveCardId: CardId = 'time';
// Persists greeting name so it doesn't change on every remount
const _NAMES = ['Hamed', 'Ghorab', 'Shahyn', 'Rakeeen'];
let _persistedGreetingName = _NAMES[Math.floor(Math.random() * _NAMES.length)];



export const Home: React.FC<HomeProps> = ({ navigate }) => {
  const [activeCardId, setActiveCardId] = useState<CardId>(() => _lastActiveCardId);
  const [displayedCardId, setDisplayedCardId] = useState<CardId>(() => _lastActiveCardId);
  const [bigCardVisible, setBigCardVisible] = useState(false);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [lastManualClickTime, setLastManualClickTime] = useState<number>(0);
  // systemCardId tracks which card has system priority — independent of what user is viewing
  const [systemCardId, setSystemCardId] = useState<CardId | null>(null);
  const [avatarUrl, setAvatarUrl] = useFirebaseSync<string | null>('avatar_url', null);
  const [glasses, setGlasses] = useFirebaseSync<number>('hydration_glasses', 0);
  const [financeBanks] = useFirebaseSync<Record<string, number>>('finance_banks', {});
  const [dailyHistory, setDailyHistory, dailyHistoryReady] = useFirebaseSync<Record<string, { water: number; focus: number; workout: number }>>('daily_history', {});
  const [dailyJournal, setDailyJournal] = useFirebaseSync<Record<string, string>>('daily_journal', {});

  const totalPhysical = Object.values(financeBanks).reduce((a, b) => a + (Number(b) || 0), 0);

  // Fitness/workout tracking removed (2026-09) — a separate food+workout system is
  // planned. dailyHistory keeps the `workout` field for existing historical records;
  // new days just record 0.
  const workoutMinsToday = 0;

  const {
    weekStats,
    todayIdx,
    running: pomodoroRunning,
    isOvertime: pomodoroOvertime,
    timeLeft,
    overtime,
    mode,
    focusDuration,
    breakDuration,
    start: pomodoroStart,
  } = usePomodoro();
  const focusMinutes = weekStats?.[todayIdx]?.minutes || 0;
  const focusHours = (focusMinutes / 60).toFixed(1).replace('.0', '');

  // Same ring motion (wave + slow rotation) as the full Focus page — shared via
  // useRingAnimation so the mini ring on this card and the one on /pomodoro are
  // never hand-tuned copies that can drift out of sync. Gated on the Focus card
  // actually being the one displayed — otherwise this rAF loop (and the re-renders
  // it drives) would keep running at animation-frame rate even while looking at
  // the Water or Finance card, for a ring that isn't on screen.
  const pomodoroTotalSecs = (mode === 'focus' ? focusDuration : breakDuration) * 60;
  const pomodoroPct = pomodoroOvertime ? 100 : Math.max(0, ((pomodoroTotalSecs - timeLeft) / pomodoroTotalSecs) * 100);
  // A session that's been started and has progress, but isn't currently ticking —
  // distinct from "never started" (timeLeft === pomodoroTotalSecs) so the card can
  // show a paused state instead of looking identical to true idle.
  const pomodoroPaused = !pomodoroRunning && !pomodoroOvertime && timeLeft > 0 && timeLeft < pomodoroTotalSecs;
  const isPomodoroCardShown = displayedCardId === 'pomodoro';
  const { phase: focusRingPhase, rotation: focusRingRotation, smoothPct: focusRingSmoothPct } = useRingAnimation({
    running: pomodoroRunning && isPomodoroCardShown,
    isOvertime: pomodoroOvertime && isPomodoroCardShown,
    pct: pomodoroPct,
    totalSecs: pomodoroTotalSecs,
  });

  // Save today's snapshot whenever key data changes
  // IMPORTANT: wait for dailyHistoryReady — if we write before Firestore loads,
  // prev={} and we overwrite all past days with only today's data.
  const todayKey = getLogicalDate().toISOString().slice(0, 10);
  useEffect(() => {
    if (!dailyHistoryReady) return;
    if (glasses === 0 && focusMinutes === 0 && workoutMinsToday === 0) return;
    setDailyHistory(prev => {
      const existing = prev[todayKey] ?? { water: 0, focus: 0, workout: 0 };
      return {
        ...prev,
        [todayKey]: {
          water: Math.max(existing.water, glasses || 0),
          focus: Math.max(existing.focus, focusMinutes),
          workout: Math.max(existing.workout, workoutMinsToday),
        },
      };
    });
  }, [glasses, focusMinutes, workoutMinsToday, dailyHistoryReady]);

  // Compute 7-day pattern for emotional greeting awareness
  const weekPattern = (() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      return dailyHistory[key] ?? null;
    }).filter(Boolean) as { water: number; focus: number; workout: number }[];

    if (days.length < 3) return 'neutral';

    const score = (d: { water: number; focus: number; workout: number }) =>
      (d.water >= 8 ? 1 : 0) + (d.focus >= 30 ? 1 : 0);

    const recent = days.slice(0, 3).map(score);
    const older  = days.slice(3).map(score);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg  = older.length ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;

    const allStrong  = recent.every(s => s >= 2);
    const allWeak    = recent.every(s => s === 0);
    const improving  = recentAvg > olderAvg + 0.5;
    const declining  = recentAvg < olderAvg - 0.5;

    if (allStrong)  return 'momentum';
    if (allWeak)    return 'slump';
    if (improving)  return 'rising';
    if (declining)  return 'fading';
    return 'neutral';
  })();


  // Generate one-line journal entry for a given day's snapshot
  // NOTE: Training/Fitness is temporarily hidden system-wide, so the workout mention
  // (previously gated to Sun/Wed, which no longer matched the daily-except-Fri/Sat
  // schedule anyway) is dropped from the summary entirely for now.
  const generateJournalEntry = (dateKey: string, data: { water: number; focus: number; workout: number }) => {
    const d = new Date(dateKey + 'T12:00:00');
    const dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const waterStr = data.water >= 10 ? 'water was strong' : data.water >= 6 ? 'water was decent' : data.water > 0 ? 'water was low' : 'no water logged';
    const focusStr = data.focus >= 60 ? `focus ran ${Math.round(data.focus / 60)}h` : data.focus > 0 ? `focus ran ${data.focus}m` : 'no focus';
    const parts = [waterStr, focusStr];
    return `${dateStr} — ${parts.join(', ')}.`;
  };

  // Write yesterday's journal entry when the day rolls over
  const prevDateRef = useRef(getLogicalDate().toISOString().slice(0, 10));
  useEffect(() => {
    const interval = setInterval(() => {
      const currentDay = getLogicalDate().toISOString().slice(0, 10);
      if (currentDay !== prevDateRef.current) {
        const yesterdayKey = prevDateRef.current;
        prevDateRef.current = currentDay;
        const snap = dailyHistory[yesterdayKey];
        if (snap && !dailyJournal[yesterdayKey]) {
          const entry = generateJournalEntry(yesterdayKey, snap);
          setDailyJournal(prev => ({ ...prev, [yesterdayKey]: entry }));
        }
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [dailyHistory, dailyJournal]);

  // Regenerate today's entry whenever data changes (so format updates apply immediately)
  useEffect(() => {
    const snap = dailyHistory[todayKey];
    if (!snap) return;
    if (snap.water === 0 && snap.focus === 0 && snap.workout === 0) return;
    const entry = generateJournalEntry(todayKey, snap);
    if (dailyJournal[todayKey] === entry) return;
    setDailyJournal(prev => ({ ...prev, [todayKey]: entry }));
  }, [dailyHistory, todayKey]);

  const [showFingerprint, setShowFingerprint] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorModal, setErrorModal] = useState(false);
  const [logoutModal, setLogoutModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Theme management state
  const [isDark, setIsDark] = useState(isDarkTheme);
  const [showMenu, setShowMenu] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Big card height always matches the dock's rendered height — auto-adjusts whenever
  // a small card is added or removed, no hardcoded pixel value to keep in sync by hand.
  // (Only applied at the lg breakpoint, where the dock switches to a vertical column —
  // below that it's a horizontal scroller and the big card uses its own min-height.)
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState<number | null>(null);
  const [isLgUp, setIsLgUp] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsLgUp(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      setDockHeight(entries[0].contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);


  const toggleTheme = () => {
    setTheme(!isDark);
    setIsDark(!isDark);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setAvatarUrl(url);
    } catch (err) {
      setErrorModal(true);
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    if (pomodoroRunning || pomodoroOvertime) {
      setLogoutModal(true);
    } else {
      signOut(auth);
    }
  };

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    document.title = 'Rakeeen Home';
    return () => clearInterval(timer);
  }, []);

  // Show today's journal summary for a 30-minute window before Isha/sleep (20:00–20:30)
  const isJournalTime = now.getHours() === 20 && now.getMinutes() < 30;
  // Build today's key from local date components to avoid UTC offset issues
  const journalTodayKey = (() => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const journalEntry = React.useMemo(() => {
    if (!isJournalTime) return null;
    // Saved entry
    if (dailyJournal[journalTodayKey]) return dailyJournal[journalTodayKey];
    // Generate on-the-fly from history if not yet saved
    const snap = dailyHistory[journalTodayKey];
    if (snap && (snap.water > 0 || snap.focus > 0 || snap.workout > 0)) {
      return generateJournalEntry(journalTodayKey, snap);
    }
    return null;
  }, [isJournalTime, dailyJournal, dailyHistory, journalTodayKey]);

  // Tracks whether the initial reveal has happened — set by auto-select once prayer data is ready
  const firstRevealDoneRef = useRef(false);

  // Big card fade transition when active card changes (only runs AFTER first reveal)
  useEffect(() => {
    _lastActiveCardId = activeCardId;
    if (!firstRevealDoneRef.current) return; // still waiting for first reveal from auto-select
    if (activeCardId !== displayedCardId) {
      setBigCardVisible(false);
      const t = setTimeout(() => {
        setDisplayedCardId(activeCardId);
        setBigCardVisible(true);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [activeCardId]);


  // `times` drives the real Fajr-based water lock and the header line's time-of-day phrases;
  // the "Devotion" card/page and its next-prayer display were removed (2026-09) — you
  // don't need the app to tell you when to pray.
  const { times, hijriDate, nextPrayer } = usePrayer();
  const weather = useWeather();

  const [greetingName, setGreetingName] = useState(() => _persistedGreetingName);

  const isFriday = now.getDay() === 5;

  // Phrases follow the real prayer times (getDayPhase), not fixed clock hours.
  const getGreeting = (): { before: string; name: string; after: string; achievement: Achievement | null } => {
    // A focus session only reaches `focusMinutes` on Done, so count the running one on top.
    const sessionActive = mode === 'focus' && (pomodoroRunning || pomodoroOvertime);
    const sessionElapsedMin = sessionActive
      ? Math.floor((pomodoroOvertime ? pomodoroTotalSecs + overtime : pomodoroTotalSecs - timeLeft) / 60)
      : 0;
    const phase = getDayPhase(times, now);
    const { text: before, achievement } = pickHeader({
      achievement: getAchievement(glasses || 0, focusMinutes + sessionElapsedMin),
      phase,
      liveFocus: sessionActive
        ? getLiveFocusLine({
            elapsedMin: sessionElapsedMin,
            remainingMin: pomodoroOvertime ? 0 : timeLeft / 60,
            savedTodayMin: focusMinutes,
          })
        : null,
      prayerImminent: !!nextPrayer && nextPrayer.name !== 'Fajr' && nextPrayer.remainingMinutes < 10,
      occasion: getOccasionLine(times, hijriDate, now),
      absence: getAbsenceLine(daysSinceActive(dailyHistory, todayKey), !glasses && focusMinutes === 0 && !pomodoroRunning),
      weekPattern,
      weather: getWeatherLine(weather, phase),
      progress: getProgressLine(glasses || 0, focusMinutes + sessionElapsedMin, phase),
      glasses: glasses || 0,
      focusMinutes,
      focusRunning: pomodoroRunning,
      isFriday,
      now,
    });
    return { before, name: greetingName.toUpperCase(), after: '', achievement };
  };

  const greetingParts = getGreeting();

  const [displayedGreeting, setDisplayedGreeting] = useState(greetingParts);
  const [greetingVisible, setGreetingVisible] = useState(true);

  // Single fade controller for the header line — whether it's showing the journal
  // summary or the greeting phrase, both changes go through the SAME timeout, so a new
  // trigger always cancels any pending one first. (Previously two separate effects each
  // had their own timeout racing to set the same flag, which could leave it stuck hidden
  // if both fired close together.)
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const greetingKey = `${greetingParts.achievement?.kind ?? ''}|${greetingParts.before}`;
  const displayKeyRef = useRef<string>(journalEntry ?? greetingKey);
  useEffect(() => {
    const nextKey = journalEntry ?? greetingKey;
    if (displayKeyRef.current === nextKey) return;
    displayKeyRef.current = nextKey;

    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    setGreetingVisible(false);
    fadeTimeoutRef.current = setTimeout(() => {
      if (!journalEntry) {
        setDisplayedGreeting(prev => {
          if (prev.before === greetingParts.before && prev.achievement?.kind === greetingParts.achievement?.kind) return prev;
          const others = _NAMES.filter(n => n.toUpperCase() !== prev.name);
          const nextName = others[Math.floor(Math.random() * others.length)];
          _persistedGreetingName = nextName;
          setGreetingName(nextName);
          return { before: greetingParts.before, name: nextName.toUpperCase(), after: '', achievement: greetingParts.achievement };
        });
      }
      setGreetingVisible(true);
      fadeTimeoutRef.current = null;
    }, 550);

    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, [journalEntry, greetingKey]);

  // Day is archived/reset at the real Maghrib time (from the prayer API, refreshed daily)
  // and reopens at the real Fajr time — Water is locked in between. Computed here (not just
  // below, near the water button) because the priority effect right below also needs it.
  const waterLocked = isWaterClosed(times, now);
  // New focus sessions can't be started between Isha and Fajr — same rule the Pomodoro
  // page itself enforces; this mini "Start Focus" button is a second entry point into the
  // same action, so it needs the same gate.
  const focusNightLocked = isFocusNightLocked(times, now);
  const { friday, includedToday } = useFridayGate(now);
  const focusFridayLocked = friday && !includedToday;

  const timeCard = getClockParts(HOME_TIME_ZONE, now);

  // Smart active card prioritizing logic. Time is the default and always wins before
  // Fajr — even over a running focus session. After Fajr an active/overtime focus
  // session takes over until it ends, then it's back to Time.
  const beforeFajr = now.getTime() < getDayMoments(times, now).fajr;
  useEffect(() => {
    const priorityCardId: 'pomodoro' | null =
      (!beforeFajr && (pomodoroRunning || pomodoroOvertime)) ? 'pomodoro' : null;

    // systemCardId tracks the priority card — always updated, user interaction doesn't clear it
    setSystemCardId(priorityCardId ?? 'time');

    const targetCardId = priorityCardId ?? 'time';

    // First reveal
    if (!firstRevealDoneRef.current) {
      firstRevealDoneRef.current = true;
      _lastActiveCardId = targetCardId;
      setDisplayedCardId(targetCardId);
      setActiveCardId(targetCardId);
      requestAnimationFrame(() => setBigCardVisible(true));
      return;
    }

    // Subsequent auto-selects: only if the user hasn't manually clicked in the last 30 s.
    // `now` (ticks every second, see the setInterval above) has to be a dependency
    // here — otherwise nothing re-runs this effect once the 30 s have actually
    // elapsed, and a manual click sticks forever instead of reverting.
    if (now.getTime() - lastManualClickTime < CARD_REVERT_MS) return;
    if (activeCardId !== targetCardId) {
      setActiveCardId(targetCardId);
    }
  }, [
    pomodoroRunning,
    pomodoroOvertime,
    beforeFajr,
    lastManualClickTime,
    activeCardId,
    now
  ]);

  // Quick action function to increment water glasses
  // Vector emotional states
  const waterFillLevel = Math.min(1, (glasses || 0) / 12);
  const focusPaused = false;

  const addWaterCup = (e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering card navigation
    if (waterLocked) return;
    if (glasses < 12) {
      setGlasses(glasses + 1);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-ink py-6 md:py-12 px-6 md:px-12 lg:px-20 font-sans-main flex flex-col justify-between transition-colors duration-300 relative">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

      {/* 1. HEADER SECTION */}
      <header className="w-full max-w-[1400px] mx-auto mb-6 md:mb-12 lg:mb-16 flex flex-row items-center justify-between gap-4 border-b border-ink/10 pb-4 md:pb-6">
        <div>
          <h1 className="font-sans-main text-lg sm:text-xl md:text-2xl tracking-tight select-none" style={{ color: 'color-mix(in srgb, var(--ink) 55%, transparent)', opacity: greetingVisible ? 1 : 0, transition: 'opacity 0.5s ease' }}>
            {journalEntry
              ? <span className="font-light">{journalEntry}</span>
              : <>
                  {displayedGreeting.achievement && <AchievementRow achievement={displayedGreeting.achievement} />}
                  <span className="font-light">{displayedGreeting.before}</span>
                  <span className="font-medium cursor-pointer" onClick={() => setShowFingerprint(true)} style={{ borderBottom: '1px solid color-mix(in srgb, var(--ink) 20%, transparent)' }}>{displayedGreeting.name}</span>
                  <span className="font-light">{displayedGreeting.after}</span>
                </>
            }
          </h1>
        </div>

        {/* PROFILE CARD & ACTIONS */}
        <div className="flex items-center gap-4 relative" ref={dropdownRef}>
          <div 
            onClick={handleAvatarClick}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border border-ink bg-paper-dark relative overflow-hidden cursor-pointer group flex items-center justify-center transition-transform hover:scale-105"
          >
            {uploading ? (
              <div className="text-[8px] font-mono-main font-bold animate-pulse text-ink/80 text-center">Syncing</div>
            ) : avatarUrl ? (
              <>
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-paper-dark/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Camera size={14} className="text-ink" />
                </div>
              </>
            ) : (
              <span className="text-xl font-black font-sans-main text-ink/30">R</span>
            )}
          </div>

          {/* Three dots dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(v => !v)}
              className="w-10 h-10 border border-ink flex items-center justify-center text-ink hover:bg-ink/5 transition-colors cursor-pointer"
              title="Menu"
            >
              <MoreVertical size={20} />
            </button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                  className="absolute right-0 mt-2 z-50 bg-paper-dark border border-ink p-2 shadow-lg flex items-center gap-2"
                  style={{ borderRadius: 0 }}
                >
                  {/* Theme Button */}
                  <button
                    onClick={toggleTheme}
                    className="w-10 h-10 border border-ink flex items-center justify-center text-ink hover:bg-ink/5 transition-colors cursor-pointer"
                    title={isDark ? 'Switch to Light' : 'Switch to Dark'}
                  >
                    {isDark ? <Sun size={18} /> : <Moon size={18} />}
                  </button>

                  {/* Logout Button */}
                  <button
                    onClick={handleLogout}
                    className="w-10 h-10 border border-ink flex items-center justify-center text-rust hover:bg-rust/5 transition-colors cursor-pointer"
                    title="Log out"
                  >
                    <LogOut size={18} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* 2. STAGE MANAGER TWO-COLUMN LAYOUT */}
      <main className="w-full max-w-[1400px] mx-auto flex-1 flex flex-col lg:flex-row gap-4 md:gap-6 lg:gap-8 mb-6 lg:mb-16 items-stretch lg:items-start">
        
        {/* Left stack (Stage Manager dock) */}
        <div ref={dockRef} className="relative flex lg:flex-col gap-3 lg:gap-4 overflow-x-auto lg:overflow-visible pb-3 lg:pb-0 shrink-0 lg:w-[230px] scrollbar-none -mx-6 px-6 lg:mx-0 lg:px-0">
          {([
            {
              id: 'water',
              title: 'Water',
              Vector: WaterVector,
              route: 'water',
              metric: `${glasses} / 12`,
              subText: 'GLASSES TODAY',
            },
            {
              id: 'pomodoro',
              title: 'Your Focus',
              Vector: FocusVector,
              route: 'pomodoro',
              metric: (pomodoroRunning || pomodoroOvertime || pomodoroPaused)
                ? (pomodoroOvertime ? `+${Math.floor(overtime / 60)}m` : `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`)
                : `${focusMinutes > 0 ? focusHours : '0'}h`,
              subText: pomodoroOvertime ? 'OVERTIME' : pomodoroPaused ? 'PAUSED' : pomodoroRunning ? mode.toUpperCase() : 'FOCUSED TODAY',
            },
            {
              id: 'finance',
              title: 'Finance',
              Vector: FinanceVector,
              route: 'finance',
              metric: totalPhysical > 0 ? `${Math.round(totalPhysical).toLocaleString()}` : '—',
              subText: 'TOTAL BALANCE',
            },
            {
              id: 'time',
              title: 'Time',
              Vector: TimeVector,
              route: null,
              metric: null, // drawn as dotted digits below instead of text
              subText: 'EGYPT',
            },
          ] as const).map((card) => {
            const isActive = activeCardId === card.id;
            const { Vector } = card;
            const isHovered = hoveredCardId === card.id;
            const isReceded = !!hoveredCardId && !isHovered && !isActive;
            return (
              <div
                key={card.id}
                onClick={() => {
                  setActiveCardId(card.id);
                  setLastManualClickTime(Date.now());
                }}
                // Water is the odd one out: double-click logs a glass instead of opening the page.
                onDoubleClick={(e) => {
                  if (card.id === 'water') addWaterCup(e);
                  else if (card.route) navigate(card.route);
                }}
                onMouseEnter={() => setHoveredCardId(card.id)}
                onMouseLeave={() => setHoveredCardId(null)}
                className={`cursor-pointer transform-gpu relative select-none flex flex-col justify-between p-4 border ${
                  isActive
                    ? 'border-ink text-ink opacity-100'
                    : 'border-dashed border-ink/30 bg-paper/60 text-ink opacity-65 hover:opacity-100 hover:border-ink/60'
                } w-[160px] lg:w-[230px] h-[112px] lg:h-[124px] shrink-0`}
                style={{
                  ...(isActive ? { backgroundColor: 'var(--paper-dark)' } : {}),
                  transform: isReceded ? 'scale(0.97)' : 'scale(1)',
                  opacity: isReceded ? 0.35 : undefined,
                  filter: isReceded ? 'blur(0.6px)' : 'none',
                  transition: 'transform 500ms cubic-bezier(0.23, 1, 0.32, 1), opacity 500ms cubic-bezier(0.23, 1, 0.32, 1), filter 500ms cubic-bezier(0.23, 1, 0.32, 1), border-color 200ms ease',
                }}
              >
                <div className="flex justify-between items-start pointer-events-none">
                  <span className="font-sans-main text-xs font-black tracking-tight uppercase truncate mr-2">
                    {card.title}
                  </span>
                  {Vector && (
                    <div
                      className="shrink-0 text-ink"
                      style={{
                        opacity: isActive || hoveredCardId === card.id ? 1 : 0,
                        transition: 'opacity 0.6s ease',
                      }}
                    >
                      <Vector
                        {...(card.id === 'water' ? { fillLevel: waterFillLevel } : {})}
                        {...(card.id === 'pomodoro' ? { paused: focusPaused } : {})}
                      />
                    </div>
                  )}
                </div>
                <div className="mt-1 pointer-events-none">
                  {card.id === 'time' ? (
                    <span className="flex items-end gap-1.5 h-6 lg:h-[27px] pb-[5px]">
                      <PixelDigits mm={timeCard.hour} ss={timeCard.minute} color="var(--ink)" height="14px" flush />
                      <span className="font-mono-main text-[9px] font-bold leading-none">{timeCard.period}</span>
                    </span>
                  ) : (
                    <span className="font-mono-main text-[16px] lg:text-[18px] font-black block truncate">
                      {card.id === 'finance' && totalPhysical > 0
                        ? <MaskedValue>{card.metric}</MaskedValue>
                        : card.metric}
                    </span>
                  )}
                  <span className={`font-mono-main text-[8px] lg:text-[9px] tracking-wider font-bold uppercase block truncate ${
                    isActive ? 'text-ink/50' : 'text-ink/40'
                  }`}>
                    {card.subText}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Priority arrow — one shared element that springs from card to card instead
              of popping in and out, so the eye can actually track it moving. Position is
              purely computed (cardOrder index * fixed card height+gap), not layoutId-based,
              because the dock switches between a horizontal row (mobile) and vertical stack
              (desktop) and the arrow only ever needs the desktop vertical math anyway. */}
          {systemCardId && (
            <motion.div
              className="hidden lg:block absolute -left-10 z-10 pointer-events-none"
              style={{ top: 0 }}
              animate={{
                y: (124 - 22) / 2 + ['water', 'pomodoro', 'finance', 'time'].indexOf(systemCardId) * (124 + 16),
                opacity: 1,
              }}
              initial={false}
              transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.9 }}
            >
              <SidebarActiveVector />
            </motion.div>
          )}
        </div>

        {/* Active Stage (Center/Right) */}
        <div
          className="flex-1 flex flex-col items-stretch min-h-[280px] lg:min-h-0"
          style={isLgUp ? { height: dockHeight ?? 740 } : undefined}
        >
          <div
            onClick={() => {
              const found = [
                { id: 'pomodoro', route: 'pomodoro' },
                { id: 'water', route: 'water' },
                { id: 'finance', route: 'finance' },
              ].find(c => c.id === activeCardId);
              if (found) navigate(found.route);
            }}
            className="flex-1 flex flex-col justify-between brutalist-card bg-paper p-5 sm:p-8 lg:p-10 relative group cursor-pointer"
          >
              {/* Active Card Body Renderer */}
              <div className="flex-1 flex flex-col" style={{ opacity: bigCardVisible ? 1 : 0, transition: 'opacity 0.2s ease' }}>
              {displayedCardId === 'water' && (
                <WaterCardBody
                  glasses={glasses}
                  fillLevel={waterFillLevel}
                  locked={waterLocked}
                  onAddGlass={addWaterCup}
                />
              )}

              {displayedCardId === 'pomodoro' && (
                <FocusCardBody
                  running={pomodoroRunning}
                  overtime={pomodoroOvertime}
                  paused={pomodoroPaused}
                  mode={mode}
                  overtimeSeconds={overtime}
                  timeLeft={timeLeft}
                  totalSecs={pomodoroTotalSecs}
                  ringPhase={focusRingPhase}
                  ringRotation={focusRingRotation}
                  ringSmoothPct={focusRingSmoothPct}
                  focusDuration={focusDuration}
                  breakDuration={breakDuration}
                  onResume={(e) => { e.stopPropagation(); pomodoroStart(); }}
                  focusMinutes={focusMinutes}
                  focusHours={focusHours}
                  nightLocked={focusNightLocked}
                  fridayLocked={focusFridayLocked}
                  onStart={(e) => { e.stopPropagation(); if (!focusNightLocked && !focusFridayLocked) pomodoroStart(); }}
                />
              )}

              {displayedCardId === 'finance' && <FinanceCardBody totalPhysical={totalPhysical} />}

              {displayedCardId === 'time' && <TimeCardBody clock={timeCard} />}
              </div>
          </div>
        </div>

      </main>

      {/* 3. FOOTER — today's date, in the middle */}
      <footer className="w-full max-w-[1400px] mx-auto mt-6 flex justify-center">
        <PixelDateTile date={getDateParts(now)} width="clamp(56px, 5.5vw, 76px)" />
      </footer>

      <AppModal
        isOpen={errorModal}
        onClose={() => setErrorModal(false)}
        title="Upload failed"
        confirm={{ message: 'Something went wrong while uploading your avatar. Please try again.', confirmText: 'Got it', cancelText: 'Dismiss', onConfirm: () => setErrorModal(false) }}
      />
      <AppModal
        isOpen={logoutModal}
        onClose={() => setLogoutModal(false)}
        title="Timer is running"
        confirm={{ message: 'You have an active Pomodoro session. Logging out will stop your timer and unsaved progress will be lost.', confirmText: 'Log out', cancelText: 'Stay', onConfirm: () => { setLogoutModal(false); signOut(auth); } }}
      />

      {/* MONTHLY FINGERPRINT MODAL */}
      {(() => {
        const year = now.getFullYear();
        const currentMonth = now.getMonth();
        const MONTH_NAMES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        return (
      <AppModal isOpen={showFingerprint} onClose={() => setShowFingerprint(false)} maxWidth="max-w-2xl"
        title={<div>
          <div className="font-mono-main text-[10px] tracking-[0.25em] uppercase mb-1" style={{ color: 'color-mix(in srgb, var(--ink) 30%, transparent)' }}>ANNUAL FINGERPRINT</div>
          <div className="font-sans-main text-2xl font-light tracking-tight" style={{ color: 'color-mix(in srgb, var(--ink) 70%, transparent)' }}>{year}</div>
        </div>}
      >
              <div className="grid grid-cols-4 gap-3">
                {MONTH_NAMES.map((name, i) => {
                  const mk = `${year}-${String(i + 1).padStart(2, '0')}`;
                  const monthDays = Object.fromEntries(
                    Object.entries(dailyHistory).filter(([k]) => k.startsWith(mk))
                  );
                  const isFuture = i > currentMonth;
                  const hasData = Object.keys(monthDays).length > 0;
                  return (
                    <motion.div
                      key={mk}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                      className="flex flex-col items-center gap-2 p-3"
                      style={{
                        background: hasData ? 'color-mix(in srgb, var(--ink) 5%, transparent)' : 'transparent',
                        border: `1px solid color-mix(in srgb, var(--ink) ${hasData ? 10 : 5}%, transparent)`,
                        opacity: isFuture ? 0.25 : 1,
                      }}
                    >
                      {hasData ? (
                        <MonthFingerprint monthKey={mk} days={monthDays} size={72} />
                      ) : (
                        <div style={{ width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div className="w-1 h-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--ink) 15%, transparent)' }} />
                        </div>
                      )}
                      <div className="font-mono-main text-[9px] tracking-[0.2em]" style={{ color: `color-mix(in srgb, var(--ink) ${hasData ? 40 : 20}%, transparent)` }}>{name}</div>
                      {hasData && (
                        <div className="font-mono-main text-[8px]" style={{ color: 'color-mix(in srgb, var(--ink) 25%, transparent)' }}>{Object.keys(monthDays).length}d</div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
      </AppModal>
        );
      })()}

    </div>
  );
};
