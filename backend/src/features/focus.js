import { EmbedBuilder } from 'discord.js';
import { getDashboardValue, setDashboardValue } from '../lib/firestore.js';
import { getPomoTodayIdx, isFriday } from '../lib/day.js';
import { isFocusLocked } from '../lib/prayerTimes.js';
import { formatDurationText, formatTime } from '../lib/format.js';
import { card, row, ButtonStyle } from '../lib/ui.js';
import { NAME_MARKED } from '../lib/brand.js';

// Hardcoded in usePomodoro.tsx too (`focusDuration` is a fixed 25m, never user-set).
const FOCUS_MINUTES = 25;
const FOCUS_SECONDS = FOCUS_MINUTES * 60;
const DEFAULT_WEEK = Array.from({ length: 7 }, () => ({ sessions: 0, minutes: 0 }));

// Fixed "writer" tag this bot puts on every checkpoint it writes — see
// `writtenBy` in usePomodoro.tsx. A real tab's own writes carry a random
// per-tab id instead, so an open tab can tell "my own write echoing back"
// apart from "the bot (or another device) genuinely changed this" and
// adopts the latter immediately, even mid-session. That's what makes
// Pause/Resume/Done from here actually take effect live instead of racing
// an open tab's own ticking and silently losing, or double-saving, history.
const WRITER = 'discord-bot';

// Ported from src/domain/focus/session.ts — a break is 20% of the focus time
// just completed, rounded, never shorter than a minute.
const breakMinutesFor = (focusGainedMinutes) => Math.max(1, Math.round(focusGainedMinutes * 0.2));

function normalizeWeek(week) {
  return Array.isArray(week) && week.length === 7 ? week : DEFAULT_WEEK;
}

// Every real "nothing in progress" exit in usePomodoro.tsx — reset(), skipBreak(),
// the natural break-complete branch — writes the checkpoint as exactly `null`,
// never a sentinel value. A value-based guess here (e.g. "timeLeft is still the
// full 25m") breaks the moment someone pauses one second after starting, since
// that's indistinguishable in value from "never started" — so idle is just
// "no checkpoint at all", matching the real system's own convention exactly.
function isIdle(cp) {
  return cp == null;
}

// Same gates Pomodoro.tsx's Start/Resume button checks (nightLocked +
// fridayLocked) — mirrored here so remote control can't do something the
// real page itself wouldn't let you do standing in front of it.
async function isStartBlocked() {
  const now = new Date();
  const [nightLocked, optIns] = await Promise.all([
    isFocusLocked(now),
    getDashboardValue('friday_opt_in', {}),
  ]);
  const fridayLocked = isFriday(now) && !optIns[now.toDateString()];
  if (nightLocked) return 'Reopens at Fajr.';
  if (fridayLocked) return "It's Jumu'ah — opt in from the Water page first.";
  return null;
}

async function readCheckpoint() {
  return getDashboardValue('pomodoro_checkpoint', null);
}

function writeCheckpoint(state) {
  return setDashboardValue('pomodoro_checkpoint', state === null ? null : { ...state, writtenBy: WRITER });
}

export async function buildFocusView() {
  const [week, sessions, checkpoint, blockedReason] = await Promise.all([
    getDashboardValue('pomodoro_week', DEFAULT_WEEK),
    getDashboardValue('pomodoro_sessions', 0),
    readCheckpoint(),
    isStartBlocked(),
  ]);

  const todayIdx = getPomoTodayIdx();
  const normWeek = normalizeWeek(week);
  const minutesToday = Math.round(normWeek[todayIdx]?.minutes || 0);
  const idle = isIdle(checkpoint);

  let status = 'Idle';
  let liveBig = null; // what's actually ticking right now — the headline number when active
  if (checkpoint) {
    if (checkpoint.isOvertime) {
      status = checkpoint.running ? 'OVER-FOCUSING — LIVE' : 'Over-focusing — stopped';
      liveBig = `+${formatTime(checkpoint.overtime || 0)}`;
    } else if (checkpoint.mode === 'break') {
      status = 'ON A BREAK — LIVE';
      liveBig = formatTime(checkpoint.timeLeft || 0);
    } else if (checkpoint.running) {
      status = 'FOCUSING — LIVE';
      liveBig = formatTime(checkpoint.timeLeft || 0);
    } else if (checkpoint.timeLeft > 0) {
      status = 'Paused';
      liveBig = formatTime(checkpoint.timeLeft || 0);
    }
  }
  if (idle && blockedReason) status = blockedReason;

  // "Live" means current as of this snapshot — an open tab heartbeats its
  // state here every ~3s (immediately on any action), so this is seconds-
  // fresh, not the up-to-45s-stale reading it used to be. Discord still can't
  // animate a sent message on its own, so hit Refresh to re-pull the number.
  const rows = [['Sessions today', String(sessions || 0), true]];
  if (!liveBig) rows.push(['Focused today', formatDurationText(minutesToday), true]);

  const primary = [];
  if (idle) {
    primary.push({ id: 'focus:start', label: 'Start Focus', style: ButtonStyle.Success, disabled: !!blockedReason });
  } else if (checkpoint.mode === 'break') {
    primary.push({ id: 'focus:skipbreak', label: 'Skip Break' });
  } else {
    primary.push(
      checkpoint.running
        ? { id: 'focus:pause', label: 'Pause' }
        : { id: 'focus:resume', label: 'Resume', style: ButtonStyle.Success, disabled: !!blockedReason }
    );
    primary.push({ id: 'focus:done', label: 'Done', style: ButtonStyle.Success });
    primary.push({ id: 'focus:discard', label: 'Discard', style: ButtonStyle.Danger });
  }

  return {
    embeds: [card({
      domain: 'focus',
      headline: status,
      big: liveBig ?? formatDurationText(minutesToday),
      rows,
    })],
    components: [
      row(primary),
      row([
        { id: 'focus:refresh', label: 'Refresh' },
        { id: 'bommy:home', label: 'Main Menu', style: ButtonStyle.Secondary },
      ]),
    ],
  };
}

/** @returns {{ ok: true } | { ok: false, message: string }} */
export async function startFocusRemote() {
  const [checkpoint, blockedReason] = await Promise.all([readCheckpoint(), isStartBlocked()]);
  if (blockedReason) return { ok: false, message: blockedReason };
  if (!isIdle(checkpoint)) {
    return { ok: false, message: 'A focus session is already in progress.' };
  }
  await writeCheckpoint({ timeLeft: FOCUS_SECONDS, overtime: 0, isOvertime: false, running: true, mode: 'focus' });
  return { ok: true };
}

export async function pauseFocusRemote() {
  const cp = await readCheckpoint();
  if (!cp || !cp.running || cp.mode === 'break') return { ok: false, message: 'Nothing running to pause.' };
  await writeCheckpoint({ ...cp, running: false });
  return { ok: true };
}

export async function resumeFocusRemote() {
  const cp = await readCheckpoint();
  if (!cp || cp.running || cp.mode === 'break' || isIdle(cp)) return { ok: false, message: 'Nothing paused to resume.' };
  const blockedReason = await isStartBlocked();
  if (blockedReason) return { ok: false, message: blockedReason };
  await writeCheckpoint({ ...cp, running: true });
  return { ok: true };
}

/** Saves the session so far and starts a break — same math as saveProgress()/startBreak() in usePomodoro.tsx. */
export async function doneFocusRemote() {
  const cp = await readCheckpoint();
  if (!cp || cp.mode === 'break' || isIdle(cp)) return { ok: false, message: 'Nothing to save right now.' };

  const timeLeft = cp.timeLeft || 0;
  const overtime = cp.overtime || 0;
  const focusGained = cp.isOvertime
    ? FOCUS_MINUTES + Math.floor(overtime / 60)
    : Math.max(1, Math.floor((FOCUS_SECONDS - timeLeft + overtime) / 60));
  const breakMins = breakMinutesFor(focusGained);

  const [sessions, week, logs] = await Promise.all([
    getDashboardValue('pomodoro_sessions', 0),
    getDashboardValue('pomodoro_week', DEFAULT_WEEK),
    getDashboardValue('pomodoro_logs', []),
  ]);

  await setDashboardValue('pomodoro_sessions', (sessions || 0) + 1);

  const nowTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  await setDashboardValue('pomodoro_logs', [{ time: nowTime, duration: focusGained }, ...(logs || [])]);

  const todayIdx = getPomoTodayIdx();
  const updatedWeek = normalizeWeek(week).map((d, i) =>
    i === todayIdx ? { ...d, sessions: (d.sessions || 0) + 1, minutes: (d.minutes || 0) + focusGained } : d
  );
  await setDashboardValue('pomodoro_week', updatedWeek);

  await writeCheckpoint({ timeLeft: breakMins * 60, overtime: 0, isOvertime: false, running: true, mode: 'break' });
  // Caller (router.js) uses these to post the same "session logged" notice the
  // real system sends on every save — same fields (base 25m + raw overtime),
  // so a save from here looks like a save from the System, not a lesser copy.
  return { ok: true, focusGained, overtimeSeconds: overtime };
}

// Mirrors the "focus_complete" notification usePomodoro.tsx sends on every
// real save (startBreak/saveProgress) — same fields, same total, so a save
// made from here is indistinguishable in the channel from one made in the
// System, just without that file's emoji (kept out everywhere in this bot).
export function buildSessionLoggedNotice(focusGained, overtimeSeconds) {
  return new EmbedBuilder()
    .setColor(0x7ca982)
    .setTitle('Focus Session Logged')
    .setDescription(`You've logged **${formatDurationText(focusGained)}** of deep work.`)
    .addFields(
      { name: 'Base Goal', value: formatDurationText(FOCUS_MINUTES), inline: true },
      { name: 'Overtime', value: `${Math.floor(overtimeSeconds / 60)}m ${overtimeSeconds % 60}s`, inline: true },
    )
    .setFooter({ text: `${NAME_MARKED} Productivity System` })
    .setTimestamp();
}

/** Stops the session with nothing saved — same as reset() in usePomodoro.tsx. */
export async function discardFocusRemote() {
  const cp = await readCheckpoint();
  if (!cp || isIdle(cp)) return { ok: false, message: 'Nothing to discard.' };
  await writeCheckpoint(null);
  return { ok: true };
}

export async function skipBreakFocusRemote() {
  const cp = await readCheckpoint();
  if (!cp || cp.mode !== 'break') return { ok: false, message: 'Not on a break.' };
  await writeCheckpoint(null);
  return { ok: true };
}
