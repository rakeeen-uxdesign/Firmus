import { describe, it, expect } from 'vitest';
import { buildPeriodReports, periodMultiplier } from '@/domain/report';

// Saturday 10 Oct 2026, 15:00 — the first day of the week.
const saturday = new Date('2026-10-10T15:00:00');
const key = (iso: string) => new Date(`${iso}T12:00:00`).toDateString();

describe('periodMultiplier', () => {
  it('a day, a week, a month', () => {
    expect([periodMultiplier('week'), periodMultiplier('month'), periodMultiplier('year')]).toEqual([1, 7, 30]);
  });
});

describe('buildPeriodReports', () => {
  const history = {
    [key('2026-10-03')]: 7,   // last Saturday — outside this week, inside this month
    [key('2026-10-05')]: 5,
    [key('2026-09-20')]: 4,
    [key('2025-10-10')]: 99,  // last year — never counted
  };

  it('week runs Saturday to Friday: today is the live value, future days are empty', () => {
    const { week } = buildPeriodReports(history, 9, saturday);
    expect(week.map((d) => d.name)).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(week[0].value).toBe(9);
    expect(week.slice(1).every((d) => d.value === 0)).toBe(true);
  });

  it('finished days of the week come from history', () => {
    const wednesday = new Date('2026-10-14T10:00:00');
    const { week } = buildPeriodReports({ [key('2026-10-12')]: 6 }, 3, wednesday);
    expect(week[2].value).toBe(6);   // Monday 12th
    expect(week[4].value).toBe(3);   // today
    expect(week[5].value).toBe(0);   // Thursday hasn't happened
  });

  it('month: four week-long buckets, today added to its own', () => {
    const { month } = buildPeriodReports(history, 9, saturday);
    expect(month.map((m) => m.name)).toEqual(['Week 1', 'Week 2', 'Week 3', 'Week 4']);
    expect(month[0].value).toBe(12);  // 3rd (7) + 5th (5)
    expect(month[1].value).toBe(9);   // today, the 10th
  });

  it('year: by month, this year only', () => {
    const { year } = buildPeriodReports(history, 9, saturday);
    expect(year).toHaveLength(12);
    expect(year[8].value).toBe(4);    // Sep
    expect(year[9].value).toBe(21);   // Oct: 12 from history + 9 today
  });

  it("today after its close-out: the archived value in history still counts, the zeroed live value adds nothing", () => {
    const evening = new Date('2026-10-14T21:30:00');
    const archived = { [key('2026-10-14')]: 8 };
    const { week, month, year } = buildPeriodReports(archived, 0, evening);
    expect(week[4].value).toBe(8);     // Wednesday, today
    expect(month[1].value).toBe(8);    // 14th → Week 2
    expect(year[9].value).toBe(8);
  });

  it("today's live value and its archived value add up, never double-count a day", () => {
    const evening = new Date('2026-10-14T21:30:00');
    const { week } = buildPeriodReports({ [key('2026-10-14')]: 8 }, 2, evening);
    expect(week[4].value).toBe(10);
  });
});
