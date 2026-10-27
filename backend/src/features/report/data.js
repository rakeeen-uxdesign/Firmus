// Turns the raw dashboard values (what the web app keeps in Firestore under `dashboard/*`)
// into everything the daily report shows. Pure: no Firestore, no clock of its own — `raw` and
// `now` come in, a plain object goes out. The finance and focus rules are ported by hand from
// src/domain/** (subscriptions, thndr, insights, report) — same reason as the rest of the bot:
// the two codebases don't share a build.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

export const WATER_GOAL = 12;
export const FOCUS_TARGET_MINUTES = 10 * 60;
/** Hamed's monthly salary — read from the same file the web app uses (src/constants/finance.json), so it is only ever changed in one place. */
export const MONTHLY_SALARY = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../src/constants/finance.json', import.meta.url)), 'utf8'),
).monthlySalaryEGP;

const BANK_LABELS = { cib: 'CIB', ahly_main: 'Ahly Main', ahly_meeza: 'Ahly Meeza', bm: 'Banque Misr' };
const BUCKET_LABELS = { mustaqbal: 'Future', tawarr2: "Tawarru'", basmala: 'Basmala', sadaqa: 'Sadaqa' };
export const THNDR_PARTS = [['clouds', 'Clouds'], ['gold', 'Gold'], ['funds', 'Funds']];

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const pad = (n) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` of the local calendar date — the key `daily_history` uses. */
export const isoKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mondayFirst = (d) => (d.getDay() + 6) % 7;

// ─── Water & focus ──────────────────────────────────────────────────────────

/**
 * The last seven days, oldest first, ending today. Each day takes the highest value any of the
 * app's records has for it: the daily snapshot, the Maghrib/Isha archives, and — for today — the
 * live counters. (After a day's close-out the live counter is zeroed and only the archive has it.)
 */
function lastSevenDays(raw, now, pick) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfDay(now).getTime() - (6 - i) * DAY_MS);
    return { label: WEEKDAYS[date.getDay()], date, isToday: i === 6, ...pick(date, i === 6) };
  });
}

export function buildWater(raw, now) {
  const days = lastSevenDays(raw, now, (date, isToday) => {
    const snapshot = raw.dailyHistory?.[isoKey(date)]?.water || 0;
    const archived = raw.hydrationHistory?.[date.toDateString()] || 0;
    const live = isToday ? Number(raw.glasses) || 0 : 0;
    return { value: Math.max(snapshot, archived, live) };
  });
  return { glasses: days[6].value, goal: WATER_GOAL, week: days };
}

export function buildFocus(raw, now) {
  const todayIdx = mondayFirst(now);
  const liveDay = Array.isArray(raw.pomodoroWeek) && raw.pomodoroWeek.length === 7 ? raw.pomodoroWeek[todayIdx] : null;
  const days = lastSevenDays(raw, now, (date, isToday) => {
    const snapshot = raw.dailyHistory?.[isoKey(date)]?.focus || 0;
    const archived = raw.pomodoroHistory?.[date.toDateString()]?.minutes || 0;
    const live = isToday ? Math.round(liveDay?.minutes || 0) : 0;
    return { value: Math.max(snapshot, archived, live) };
  });
  const archivedSessions = raw.pomodoroHistory?.[now.toDateString()]?.sessions || 0;
  return {
    minutes: days[6].value,
    sessions: Math.max(liveDay?.sessions || 0, archivedSessions),
    targetMinutes: FOCUS_TARGET_MINUTES,
    week: days,
  };
}

// ─── Finance ────────────────────────────────────────────────────────────────

/** Next renewal of a subscription from `now` (see src/domain/finance/subscriptions.ts). */
export function nextRenewal(sub, now) {
  const interval = sub.intervalMonths || 1;
  const start = sub.startDate ? new Date(sub.startDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMonthIdx = start.getFullYear() * 12 + start.getMonth();
  const [rh, rm] = (sub.reminderTime || '09:00').split(':').map(Number);
  for (let offset = 0; offset <= 24; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, sub.renewalDay, rh, rm, 0);
    const monthsFromStart = d.getFullYear() * 12 + d.getMonth() - startMonthIdx;
    if (monthsFromStart >= 0 && monthsFromStart % interval === 0 && d >= now) return d;
  }
  return new Date(now.getFullYear(), now.getMonth() + interval, sub.renewalDay);
}

export const monthlySubscriptionCost = (subs) => subs.reduce((s, sub) => s + sub.cost / Math.max(1, sub.intervalMonths || 1), 0);

const byTimeAsc = (a, b) => String(a.timestamp).localeCompare(String(b.timestamp));
const delta = (newer, older) => ({ amount: newer - older, percent: older === 0 ? null : ((newer - older) / older) * 100 });

function buildThndr(entries, now) {
  const series = [...(entries || [])].sort(byTimeAsc);
  if (!series.length) return null;
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const withParts = [...series].reverse().find((e) => e.parts);
  return {
    value: last.value,
    updatedAt: last.timestamp,
    daysSinceUpdate: Math.floor((startOfDay(now) - startOfDay(new Date(last.timestamp))) / DAY_MS),
    sincePrevious: prev ? delta(last.value, prev.value) : null,
    parts: withParts ? Object.fromEntries(THNDR_PARTS.map(([k]) => [k, withParts.parts[k] || 0])) : null,
  };
}

export function buildFinance(raw, now, goldPrices) {
  const banks = Object.entries(BANK_LABELS).map(([key, label]) => ({ label, balance: Number(raw.banks?.[key]) || 0 }));
  const buckets = Object.entries(BUCKET_LABELS).map(([key, label]) => ({ key, label, balance: Number(raw.buckets?.[key]) || 0 }));
  const banksTotal = sum(raw.banks);
  const bucketsTotal = buckets.reduce((total, bucket) => total + bucket.balance, 0);

  const goldValue = (raw.gold || []).reduce((s, g) => s + (goldPrices ? g.quantity * (g.carat === 24 ? goldPrices.price24 : goldPrices.price21) : 0), 0);
  const thndr = buildThndr(raw.thndr, now);
  const cash = Number(raw.buckets?.mustaqbal) || 0;
  const future = { cash, gold: goldValue, thndr: thndr?.value || 0, total: cash + goldValue + (thndr?.value || 0) };

  const subs = raw.subscriptions || [];
  const monthlySubs = monthlySubscriptionCost(subs);
  const upcoming = subs
    .map((sub) => {
      const next = nextRenewal(sub, now);
      return { name: sub.name, cost: sub.cost, bank: sub.bank, renewalDay: sub.renewalDay, daysLeft: Math.round((startOfDay(next) - startOfDay(now)) / DAY_MS) };
    })
    .filter((u) => u.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const debts = raw.debts || [];
  const owed = (type) => debts.filter((d) => d.type === type).sort((a, b) => b.amount - a.amount);
  const owedToMe = owed('owed_to_me');
  const owedByMe = owed('owed_by_me');

  const todayLogs = (raw.logs || []).filter((l) => startOfDay(new Date(l.timestamp)).getTime() === startOfDay(now).getTime());
  const movements = todayLogs.filter((l) => l.type !== 'assign');

  return {
    banks, banksTotal, buckets, bucketsTotal, free: banksTotal - bucketsTotal,
    future, thndr, goldValue,
    share: { salary: MONTHLY_SALARY, monthlySubs, amount: MONTHLY_SALARY - monthlySubs },
    upcoming,
    debts: {
      owedToMe: owedToMe.reduce((s, d) => s + d.amount, 0), owedByMe: owedByMe.reduce((s, d) => s + d.amount, 0),
      toMe: owedToMe.slice(0, 5), byMe: owedByMe.slice(0, 5),
    },
    today: {
      deposits: movements.filter((l) => l.type === 'deposit').reduce((s, l) => s + l.amount, 0),
      withdrawals: movements.filter((l) => l.type === 'withdraw').reduce((s, l) => s + l.amount, 0),
      entries: movements.slice(0, 8),
    },
  };
}

// ─── Logs ───────────────────────────────────────────────────────────────────

/**
 * Today's focus sessions and the latest Thndr readings — the report's record of what happened.
 *
 * `pomodoro_logs` is never cleared and its entries carry only a time of day, no date, so
 * "today's" sessions are the newest ones: as many as today's session count says there were.
 */
export function buildLogs(raw, sessionsToday = 0) {
  const sessions = (Array.isArray(raw.pomodoroLogs) ? raw.pomodoroLogs : [])
    .filter((l) => l && Number(l.duration) > 0)
    .map((l) => ({ time: String(l.time || ''), minutes: Number(l.duration) }))
    .slice(0, Math.max(0, sessionsToday));
  const series = [...(raw.thndr || [])].sort(byTimeAsc);
  const readings = series
    .map((e, i) => ({ timestamp: e.timestamp, value: e.value, delta: i === 0 ? null : delta(e.value, series[i - 1].value), note: e.note || '' }))
    .reverse()
    .slice(0, 6);
  return {
    focus: { entries: sessions.slice(0, 10), total: sessions.reduce((s, e) => s + e.minutes, 0), count: sessions.length },
    thndr: readings,
  };
}

// ─── Words ──────────────────────────────────────────────────────────────────

export const egp = (n) => `${Math.round(n).toLocaleString('en-US')} EGP`;
export const signedEgp = (n) => `${n >= 0 ? '+' : '-'}${egp(Math.abs(n))}`;
export function duration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h === 0 ? `${m}m` : m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
}
export const countdown = (daysLeft) => (daysLeft <= 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `in ${daysLeft} days`);

/** The few lines worth reading first, most important first. `tone` is good / warn / info. */
export function buildHighlights({ water, focus, finance }) {
  const out = [];
  if (water.glasses >= water.goal) out.push({ tone: 'good', text: `Water goal reached: ${water.glasses} of ${water.goal} glasses.` });
  else out.push({ tone: water.glasses < water.goal / 2 ? 'warn' : 'info', text: `Water: ${water.glasses} of ${water.goal} glasses, ${water.goal - water.glasses} short.` });

  if (focus.minutes >= focus.targetMinutes) out.push({ tone: 'good', text: `Focus target reached: ${duration(focus.minutes)}.` });
  else if (focus.minutes === 0) out.push({ tone: 'warn', text: 'No focus time logged today.' });
  else out.push({ tone: 'info', text: `Focus: ${duration(focus.minutes)} across ${focus.sessions} ${focus.sessions === 1 ? 'session' : 'sessions'}.` });

  const soon = finance.upcoming.filter((u) => u.daysLeft <= 3);
  if (soon.length) out.push({ tone: 'warn', text: `Renewing soon: ${soon.map((u) => `${u.name} (${countdown(u.daysLeft).toLowerCase()})`).join(', ')}.` });
  if (finance.share.amount < 0) out.push({ tone: 'warn', text: `Hamed's Share is negative (${signedEgp(finance.share.amount)}): Payit costs more than the salary.` });
  if (finance.free < 0) out.push({ tone: 'warn', text: `The buckets hold ${egp(Math.abs(finance.free))} more than the banks do.` });

  const t = finance.thndr;
  if (t?.sincePrevious && t.sincePrevious.amount !== 0) out.push({ tone: 'info', text: `Thndr moved ${signedEgp(t.sincePrevious.amount)} since the previous reading.` });
  if (t && t.daysSinceUpdate >= 14) out.push({ tone: 'info', text: `Thndr was last updated ${t.daysSinceUpdate} days ago.` });
  return out;
}

/** Everything the report shows, from the raw dashboard values. */
export function buildReport(raw, now = new Date(), goldPrices = null) {
  const water = buildWater(raw, now);
  const focus = buildFocus(raw, now);
  const finance = buildFinance(raw, now, goldPrices);
  return {
    generatedAt: now,
    date: {
      iso: isoKey(now),
      weekday: now.toLocaleDateString('en-GB', { weekday: 'long' }),
      label: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    },
    water, focus, finance,
    logs: buildLogs(raw, focus.sessions),
    highlights: buildHighlights({ water, focus, finance }),
  };
}
