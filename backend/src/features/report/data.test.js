import { describe, it, expect } from 'vitest';
import { buildLogs, buildReport, buildWater, buildFocus, nextRenewal, monthlySubscriptionCost, duration, countdown, isoKey } from './data.js';

// Saturday 17 Oct 2026, 20:00 — after both the Maghrib and Isha close-outs.
const now = new Date(2026, 9, 17, 20, 0, 0);
const key = (d) => new Date(2026, 9, d).toDateString();

describe('water', () => {
  it("takes the most any record has for today — after Maghrib the live counter is zeroed", () => {
    const raw = { glasses: 0, hydrationHistory: { [key(17)]: 11 }, dailyHistory: { '2026-10-17': { water: 9 } } };
    expect(buildWater(raw, now).glasses).toBe(11);
  });
  it('is seven days ending today, oldest first', () => {
    const week = buildWater({ glasses: 3, dailyHistory: { '2026-10-14': { water: 12 } } }, now).week;
    expect(week).toHaveLength(7);
    expect(week[0].label).toBe('Sun');          // Sun 11 Oct
    expect(week[6]).toMatchObject({ label: 'Sat', isToday: true, value: 3 });
    expect(week[3].value).toBe(12);             // Wed 14 Oct
  });
});

describe('focus', () => {
  it("counts the archived day when the live week was zeroed at Isha", () => {
    const week = Array.from({ length: 7 }, () => ({ sessions: 0, minutes: 0 }));
    const raw = { pomodoroWeek: week, pomodoroHistory: { [key(17)]: { sessions: 4, minutes: 200 } } };
    const f = buildFocus(raw, now);
    expect(f.minutes).toBe(200);
    expect(f.sessions).toBe(4);
  });
  it('uses the live day before the close-out (Saturday is index 5, Monday-first)', () => {
    const week = Array.from({ length: 7 }, (_, i) => (i === 5 ? { sessions: 2, minutes: 75 } : { sessions: 0, minutes: 0 }));
    expect(buildFocus({ pomodoroWeek: week }, now)).toMatchObject({ minutes: 75, sessions: 2 });
  });
});

describe('subscriptions', () => {
  const sub = (over) => ({ id: 'x', name: 'Netflix', cost: 300, renewalDay: 20, reminderTime: '09:00', bank: 'CIB', intervalMonths: 1, startDate: '2026-01-01', ...over });
  it('next renewal is the coming renewal day', () => {
    expect(nextRenewal(sub({ renewalDay: 20 }), now).getDate()).toBe(20);
    expect(nextRenewal(sub({ renewalDay: 10 }), now).getMonth()).toBe(10); // November
  });
  it('spreads cost over the billing cycle', () => {
    expect(monthlySubscriptionCost([sub({ cost: 100 }), sub({ cost: 1200, intervalMonths: 12 })])).toBe(200);
  });
});

describe('buildReport', () => {
  const raw = {
    glasses: 0, hydrationHistory: { [key(17)]: 12 },
    pomodoroWeek: Array.from({ length: 7 }, () => ({ sessions: 0, minutes: 0 })),
    pomodoroHistory: { [key(17)]: { sessions: 5, minutes: 610 } },
    banks: { cib: 1000, ahly_main: 2000, ahly_meeza: 0, bm: 500 },
    buckets: { mustaqbal: 1500, tawarr2: 500, basmala: 0, sadaqa: 0, mariam: 250 },
    gold: [{ id: 'g', quantity: 10, carat: 21 }],
    thndr: [
      { id: 'a', value: 10000, timestamp: '2026-10-03T10:00:00.000Z', parts: { clouds: 6000, gold: 3000, funds: 1000 } },
      { id: 'b', value: 11000, timestamp: '2026-10-10T10:00:00.000Z', parts: { clouds: 6600, gold: 3200, funds: 1200 } },
    ],
    subscriptions: [{ id: 's', name: 'Spotify', cost: 100, renewalDay: 18, reminderTime: '09:00', bank: 'CIB', intervalMonths: 1, startDate: '2026-01-01' }],
    debts: [{ id: 'd', personName: 'Ali', amount: 300, type: 'owed_by_me' }],
    logs: [
      { id: 'l1', type: 'deposit', amount: 700, bank: 'CIB', timestamp: new Date(2026, 9, 17, 11, 0).toISOString() },
      { id: 'l2', type: 'assign', amount: 200, bank: '', timestamp: new Date(2026, 9, 17, 12, 0).toISOString() },
      { id: 'l3', type: 'withdraw', amount: 50, bank: 'CIB', timestamp: new Date(2026, 9, 16, 12, 0).toISOString() },
    ],
  };
  const report = buildReport(raw, now, { price24: 5000, price21: 4400 });

  it('puts the date in words', () => {
    expect(report.date).toMatchObject({ iso: '2026-10-17', weekday: 'Saturday', time: '20:00' });
  });
  it('banks, buckets and free money', () => {
    expect(report.finance.banksTotal).toBe(3500);
    expect(report.finance.bucketsTotal).toBe(2000);
    expect(report.finance.free).toBe(1500);
  });
  it('the future fund is cash + gold + Thndr', () => {
    expect(report.finance.future).toEqual({ cash: 1500, gold: 44000, thndr: 11000, total: 56500 });
  });
  it('Thndr: latest value, its move since the previous reading, and the split', () => {
    expect(report.finance.thndr.sincePrevious.amount).toBe(1000);
    expect(report.finance.thndr.parts).toEqual({ clouds: 6600, gold: 3200, funds: 1200 });
  });
  it("Hamed's Share is the salary less the monthly subscriptions", () => {
    expect(report.finance.share).toEqual({ salary: 7000, monthlySubs: 100, amount: 6900 });
  });
  it("only today's deposits and withdrawals count as movements", () => {
    expect(report.finance.today).toMatchObject({ deposits: 700, withdrawals: 0 });
    expect(report.finance.today.entries).toHaveLength(1);
  });
  it('highlights the goals reached and what renews soon', () => {
    const text = report.highlights.map((h) => h.text).join(' | ');
    expect(text).toContain('Water goal reached');
    expect(text).toContain('Focus target reached');
    expect(text).toContain('Spotify (tomorrow)');
  });
});

describe('Thndr: money moved in is not a gain', () => {
  const entries = [
    { id: 'a', value: 10000, timestamp: '2026-10-01T10:00:00.000Z', parts: { clouds: 6000, gold: 3000, funds: 1000 } },
    { id: 'b', value: 12100, timestamp: '2026-10-10T10:00:00.000Z', parts: { clouds: 8000, gold: 3000, funds: 1100 } },
  ];
  const deposit = (amount, day, part = 'clouds') => ({ id: `d${day}`, type: 'deposit', amount, part, timestamp: `2026-10-${String(day).padStart(2, '0')}T15:00:00.000Z` });
  const report = (flows) => buildReport({ thndr: entries, thndrFlows: flows }, now).finance.thndr;

  it('the gain is the value against what was put in', () => {
    const t = report([deposit(2000, 5)]);   // 2,000 of the 2,100 rise was a deposit
    expect(t.invested).toBe(12000);
    expect(t.value).toBe(12100);
    expect(t.gain.amount).toBe(100);
  });
  it("the previous-reading move is the market's own", () => {
    expect(report([deposit(2000, 5)]).sincePrevious.amount).toBe(100);
    expect(report([]).sincePrevious.amount).toBe(2100);
  });
  it('a deposit after the latest reading raises the value and that part, without a new reading', () => {
    const t = report([deposit(500, 14, 'gold')]);
    expect(t.value).toBe(12600);
    expect(t.parts).toEqual({ clouds: 8000, gold: 3500, funds: 1100 });
  });
  it('and it shows up in the future fund total', () => {
    const r = buildReport({ buckets: { mustaqbal: 0 }, thndr: entries, thndrFlows: [deposit(500, 14)] }, now);
    expect(r.finance.future.thndr).toBe(12600);
  });
});

describe('words', () => {
  it('durations and countdowns', () => {
    expect(duration(200)).toBe('3h 20m');
    expect(duration(120)).toBe('2h');
    expect(duration(0)).toBe('0m');
    expect(countdown(0)).toBe('Today');
    expect(countdown(1)).toBe('Tomorrow');
    expect(countdown(9)).toBe('in 9 days');
  });
  it('iso keys are local dates', () => {
    expect(isoKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('logs', () => {
  it("lists today's focus sessions — the newest ones, as many as today's session count — with their total", () => {
    const pomodoroLogs = [{ time: '3:10 PM', duration: 30 }, { time: '1:00 PM', duration: 25 }, { time: '9:00 AM', duration: 50 }];
    const logs = buildLogs({ pomodoroLogs }, 2);
    expect(logs.focus.entries).toEqual([{ time: '3:10 PM', minutes: 30 }, { time: '1:00 PM', minutes: 25 }]);
    expect(logs.focus).toMatchObject({ total: 55, count: 2 });
  });
  it('no sessions today means no entries, however long the stored log is', () => {
    expect(buildLogs({ pomodoroLogs: [{ time: '3:10 PM', duration: 30 }] }, 0).focus.entries).toEqual([]);
  });
  it('tolerates a missing log', () => {
    expect(buildLogs({}).focus).toMatchObject({ entries: [], total: 0, count: 0 });
  });
  it('Thndr readings: newest first, each against the one before it', () => {
    const thndr = [
      { timestamp: '2026-10-03T10:00:00Z', value: 10000 },
      { timestamp: '2026-10-10T10:00:00Z', value: 11000 },
    ];
    const rows = buildLogs({ thndr }).thndr;
    expect(rows.map((r) => r.value)).toEqual([11000, 10000]);
    expect(rows[0].delta.amount).toBe(1000);
    expect(rows[1].delta).toBeNull();
  });
});
