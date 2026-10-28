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
/** `wallet` is cash sitting in Thndr, not invested yet. */
export const THNDR_PARTS = [['clouds', 'Clouds'], ['gold', 'Gold'], ['funds', 'Funds'], ['wallet', 'Wallet']];

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
function lastSevenDays(now, pick) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfDay(now).getTime() - (6 - i) * DAY_MS);
    return { label: WEEKDAYS[date.getDay()], date, isToday: i === 6, ...pick(date, i === 6) };
  });
}

export function buildWater(raw, now) {
  const days = lastSevenDays(now, (date, isToday) => {
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
  const days = lastSevenDays(now, (date, isToday) => {
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

/** Net money put into Thndr (negative: taken out) by the flows after `afterIso` and up to `untilIso` — see src/domain/finance/thndr.ts. */
const netFlows = (flows, afterIso, untilIso = null) => flows
  .filter((f) => (afterIso === null || f.timestamp > afterIso) && (untilIso === null || f.timestamp <= untilIso))
  .reduce((s, f) => s + (f.type === 'deposit' ? f.amount : f.type === 'withdraw' ? -f.amount : 0), 0);   // a transfer between parts moves no money in or out

/**
 * The Thndr portfolio now. A reading is what it's worth; a flow is money the user moved in or out,
 * so the value is the latest reading plus the flows since, and the gain is measured against what
 * was put in — a deposit is never a gain. (Ported from src/domain/finance/thndr.ts.)
 */
function buildThndr(entries, flows, now) {
  const series = [...(entries || [])].sort(byTimeAsc);
  const moves = flows || [];
  if (!series.length) return null;
  const first = series[0];
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const value = last.value + netFlows(moves, last.timestamp);
  const invested = first.value + netFlows(moves, first.timestamp);

  const base = [...series].reverse().find((e) => e.parts);
  const parts = base ? Object.fromEntries(THNDR_PARTS.map(([k]) => [k, base.parts[k] || 0])) : null;
  if (parts) {
    for (const f of moves.filter((x) => x.timestamp > base.timestamp).sort(byTimeAsc)) {
      if (f.type === 'transfer') {
        if (f.from) parts[f.from] = Math.max(0, parts[f.from] - f.amount);
        parts[f.part] += f.amount;
      } else {
        parts[f.part] = Math.max(0, parts[f.part] + (f.type === 'deposit' ? f.amount : -f.amount));
      }
    }
  }

  return {
    value,
    invested,
    gain: delta(value, invested),
    updatedAt: last.timestamp,
    daysSinceUpdate: Math.floor((startOfDay(now) - startOfDay(new Date(last.timestamp))) / DAY_MS),
    // The market's own move since the previous reading — money put in between is not part of it.
    sincePrevious: prev ? delta(last.value, prev.value + netFlows(moves, prev.timestamp, last.timestamp)) : null,
    parts,
  };
}

const sumOf = (items, amountOf) => items.reduce((total, item) => total + amountOf(item), 0);

/** What the gold held is worth at today's spot prices (0 when there are none). */
export const goldValueOf = (gold, prices) =>
  prices ? sumOf(gold || [], (g) => g.quantity * (g.carat === 24 ? prices.price24 : prices.price21)) : 0;

/** The Future fund in its three forms: the bucket's cash, the gold held, and the Thndr portfolio. */
export function futureFundOf(raw, now = new Date()) {
  const cash = Number(raw.buckets?.mustaqbal) || 0;
  const gold = goldValueOf(raw.gold, raw.goldPrices);
  const thndr = buildThndr(raw.thndr, raw.thndrFlows, now)?.value || 0;
  return { cash, gold, thndr, total: cash + gold + thndr };
}

/** Subscriptions renewing within `withinDays`, soonest first. */
function upcomingRenewals(subs, now, withinDays = 30) {
  return subs
    .map((sub) => ({
      name: sub.name, cost: sub.cost, bank: sub.bank, renewalDay: sub.renewalDay,
      daysLeft: Math.round((startOfDay(nextRenewal(sub, now)) - startOfDay(now)) / DAY_MS),
    }))
    .filter((renewal) => renewal.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

function summariseDebts(debts) {
  const biggestFirst = (type) => debts.filter((d) => d.type === type).sort((a, b) => b.amount - a.amount);
  const toMe = biggestFirst('owed_to_me');
  const byMe = biggestFirst('owed_by_me');
  return {
    owedToMe: sumOf(toMe, (d) => d.amount), owedByMe: sumOf(byMe, (d) => d.amount),
    toMe: toMe.slice(0, 5), byMe: byMe.slice(0, 5),
  };
}

/** Today's money in and out. Assignments only shuffle money between buckets, so they don't count. */
function summariseToday(logs, now) {
  const today = startOfDay(now).getTime();
  const movements = logs.filter((l) => l.type !== 'assign' && startOfDay(new Date(l.timestamp)).getTime() === today);
  const total = (type) => sumOf(movements.filter((l) => l.type === type), (l) => l.amount);
  return { deposits: total('deposit'), withdrawals: total('withdraw'), entries: movements.slice(0, 8) };
}

export function buildFinance(raw, now) {
  const banks = Object.entries(BANK_LABELS).map(([key, label]) => ({ label, balance: Number(raw.banks?.[key]) || 0 }));
  const buckets = Object.entries(BUCKET_LABELS).map(([key, label]) => ({ key, label, balance: Number(raw.buckets?.[key]) || 0 }));
  const banksTotal = sum(raw.banks);
  const bucketsTotal = sumOf(buckets, (bucket) => bucket.balance);
  const subs = raw.subscriptions || [];
  const monthlySubs = monthlySubscriptionCost(subs);

  return {
    banks, banksTotal, buckets, bucketsTotal, free: banksTotal - bucketsTotal,
    future: futureFundOf(raw, now),
    thndr: buildThndr(raw.thndr, raw.thndrFlows, now),
    goldValue: goldValueOf(raw.gold, raw.goldPrices),
    share: { salary: MONTHLY_SALARY, monthlySubs, amount: MONTHLY_SALARY - monthlySubs },
    upcoming: upcomingRenewals(subs, now),
    debts: summariseDebts(raw.debts || []),
    today: summariseToday(raw.logs || [], now),
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
  if (t?.sincePrevious && t.sincePrevious.amount !== 0) out.push({ tone: 'info', text: `Thndr's market moved ${signedEgp(t.sincePrevious.amount)} since the previous reading.` });
  if (t && t.daysSinceUpdate >= 14) out.push({ tone: 'info', text: `Thndr was last updated ${t.daysSinceUpdate} days ago.` });
  return out;
}

/** Everything the report shows, from the raw dashboard values. */
export function buildReport(raw, now = new Date()) {
  const water = buildWater(raw, now);
  const focus = buildFocus(raw, now);
  const finance = buildFinance(raw, now);
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
