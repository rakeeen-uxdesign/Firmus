import { describe, it, expect } from 'vitest';
import { daysSinceActive, getAbsenceLine, getAchievement, getLiveFocusLine, getProgressLine, getWeatherLine, pickGreetingLine, pickHeader, type GreetingInputs } from '@/domain/greeting';
import { pickPoolLine } from '@/domain/linePool';

describe('daysSinceActive', () => {
  const h = {
    '2026-09-05': { water: 6, focus: 0, workout: 0 },
    '2026-09-06': { water: 0, focus: 0, workout: 0 },
  };
  it('counts from the latest active day before today', () => {
    expect(daysSinceActive(h, '2026-09-09')).toBe(4);
  });
  it('ignores today and empty days, null when nothing was ever logged', () => {
    expect(daysSinceActive({ '2026-09-09': { water: 3, focus: 0, workout: 0 } }, '2026-09-09')).toBeNull();
    expect(daysSinceActive({}, '2026-09-09')).toBeNull();
  });
});

describe('getAbsenceLine', () => {
  it('only after a 2+ day gap and only while today is empty', () => {
    expect(getAbsenceLine(3, true)).toBe('BACK AFTER 3 DAYS ... THE DASHBOARD MISSED YOU ');
    expect(getAbsenceLine(1, true)).toBeNull();
    expect(getAbsenceLine(3, false)).toBeNull();
    expect(getAbsenceLine(null, true)).toBeNull();
  });
});

describe('getProgressLine', () => {
  it('praises real numbers', () => {
    expect(getProgressLine(2, 0, 'push')).toBeNull();
    expect(getProgressLine(2, 135, 'push')).toBe('2H OF FOCUS ALREADY ... LOOK AT YOU GO ');
    expect(getProgressLine(8, 0, 'hunting')).toContain('8 GLASSES');
    expect(getProgressLine(8, 0, 'birdsHome')).toBeNull();
    expect(getProgressLine(3, 20, 'push')).toBeNull();
  });
});

describe('getWeatherLine', () => {
  it('daytime and notable only', () => {
    expect(getWeatherLine({ temp: 40, code: 0 }, 'midday')).toBe('40° OUTSIDE ... DRINK LIKE A CAMEL ON PURPOSE ');
    expect(getWeatherLine({ temp: 20, code: 61 }, 'push')).toContain('RAIN');
    expect(getWeatherLine({ temp: 9, code: 0 }, 'morning')).toContain('SWEATER WEATHER');
    expect(getWeatherLine({ temp: 25, code: 0 }, 'midday')).toBeNull();
    expect(getWeatherLine({ temp: 40, code: 0 }, 'night')).toBeNull();
    expect(getWeatherLine(null, 'midday')).toBeNull();
  });
});

describe('getLiveFocusLine', () => {
  it('stays quiet at the very start and when nothing is running', () => {
    expect(getLiveFocusLine({ elapsedMin: 0, remainingMin: 25, savedTodayMin: 0 })).toBeNull();
    expect(getLiveFocusLine({ elapsedMin: 4, remainingMin: 21, savedTodayMin: 0 })).toBeNull();
  });
  it('notices the session as it grows, in 30-minute steps', () => {
    expect(getLiveFocusLine({ elapsedMin: 12, remainingMin: 38, savedTodayMin: 0 })).toContain('IN THE ZONE');
    expect(getLiveFocusLine({ elapsedMin: 34, remainingMin: 26, savedTodayMin: 0 })).toBe('30 MIN DEEP ... THE WORLD CAN WAIT ');
    expect(getLiveFocusLine({ elapsedMin: 61, remainingMin: 29, savedTodayMin: 0 })).toBe('60 MIN DEEP ... THE WORLD CAN WAIT ');
  });
  it('counts the live session on top of what is already saved today', () => {
    expect(getLiveFocusLine({ elapsedMin: 40, remainingMin: 20, savedTodayMin: 85 })).toBe('2H OF FOCUS TODAY ... YOUR PHONE IS CRYING SOMEWHERE ');
    expect(getLiveFocusLine({ elapsedMin: 100, remainingMin: 0, savedTodayMin: 80 })).toBe('3H OF FOCUS TODAY ... YOUR PHONE IS CRYING SOMEWHERE ');
  });
  it('knows how long is left', () => {
    expect(getLiveFocusLine({ elapsedMin: 21, remainingMin: 3.2, savedTodayMin: 0 })).toBe('4 MIN LEFT ... YOU CAN SEE THE FINISH LINE ');
  });
});

describe('pickGreetingLine', () => {
  const quiet: GreetingInputs = {
    phase: 'push', liveFocus: null, prayerImminent: false, occasion: null,
    absence: null, weekPattern: 'neutral', weather: null, progress: null,
    // Minute isn't a multiple of 5, so the live-focus yield window (below) doesn't
    // interfere with these otherwise-unrelated priority-order checks.
    glasses: 5, focusMinutes: 30, focusRunning: false, isFriday: false, now: new Date('2026-10-07T14:02:00'),
  };
  const pick = (over: Partial<GreetingInputs>) => pickGreetingLine({ ...quiet, ...over });

  it('falls back to the phrase for this part of the day', () => {
    expect(pick({})).toBe(pickPoolLine('push', quiet.now));
    expect(pick({ phase: 'deepNight' })).toBe(pickPoolLine('deepNight', quiet.now));
  });

  it('a running focus session beats an occasion, unless a prayer is minutes away', () => {
    expect(pick({ liveFocus: 'LIVE ', occasion: 'OCC ' })).toBe('LIVE ');
    expect(pick({ liveFocus: 'LIVE ', occasion: 'OCC ', prayerImminent: true })).toBe('OCC ');
  });

  it('follows the documented priority order', () => {
    expect(pick({ occasion: 'OCC ', absence: 'ABS ' })).toBe('OCC ');
    expect(pick({ absence: 'ABS ', weather: 'WX ' })).toBe('ABS ');
    expect(pick({ weather: 'WX ', progress: 'PROG ' })).toBe('WX ');
    expect(pick({ progress: 'PROG ', glasses: 1 })).toBe('PROG ');
  });

  it('nudges about low water and no focus only in the right phases', () => {
    expect(pick({ glasses: 1, focusMinutes: 30 })).toBe('YOUR WATER BOTTLE IS FEELING LONELY ... ');
    expect(pick({ glasses: 1, phase: 'morning', focusMinutes: 30 })).toBe(pickPoolLine('morning', quiet.now));
    expect(pick({ focusMinutes: 0 })).toBe("NO FOCUS YET ... THE TIMER IS GETTING BORED ");
    expect(pick({ focusMinutes: 0, focusRunning: true })).toBe(pickPoolLine('push', quiet.now));
  });

  it('the week\'s trend only frames the morning and never buries the rest of the day', () => {
    expect(pick({ phase: 'morning', weekPattern: 'rising' })).toBe("THINGS ARE LOOKING UP ... KEEP THE STREAK WARM ");
    expect(pick({ phase: 'hunting', weekPattern: 'fading' })).toBe('YOU HAVE BEEN QUIET LATELY ... COME SAY HI ');
    expect(pick({ phase: 'push', weekPattern: 'rising' })).toBe(pickPoolLine('push', quiet.now));
    expect(pick({ phase: 'night', weekPattern: 'slump' })).toBe(pickPoolLine('night', quiet.now));
  });

  it('the trend yields to anything more specific', () => {
    expect(pick({ phase: 'morning', weekPattern: 'rising', progress: 'PROG ' })).toBe('PROG ');
    expect(pick({ phase: 'morning', weekPattern: 'rising', isFriday: true })).toBe("HAPPY JUMU'AH ... SURAT AL-KAHF IS WAITING ");
  });

  it('Friday outranks the plain phrase', () => {
    expect(pick({ isFriday: true })).toBe("HAPPY JUMU'AH ... SURAT AL-KAHF IS WAITING ");
  });

  it('a focus session running all day still yields the header once every few minutes', () => {
    const everyFiveMin = new Date('2026-10-07T14:05:00');
    const otherMinute = new Date('2026-10-07T14:06:00');
    // On the yield minute, something else gets a turn instead of the focus line...
    expect(pick({ liveFocus: 'LIVE ', weather: 'WX ', now: everyFiveMin })).toBe('WX ');
    // ...but falls straight back to it if nothing else has anything to say that minute.
    expect(pick({ liveFocus: 'LIVE ', now: everyFiveMin })).toBe('LIVE ');
    // Any other minute, the focus line is back to winning outright.
    expect(pick({ liveFocus: 'LIVE ', weather: 'WX ', now: otherMinute })).toBe('LIVE ');
  });
});

describe('getAchievement', () => {
  it('12 glasses or 10 hours of focus — water first', () => {
    expect(getAchievement(12, 0)).toEqual({ kind: 'water', count: 12 });
    expect(getAchievement(3, 600)).toEqual({ kind: 'focus', count: 10 });
    expect(getAchievement(12, 600)).toEqual({ kind: 'water', count: 12 });
    expect(getAchievement(11, 599)).toBeNull();
  });
});

describe('pickHeader', () => {
  const base: GreetingInputs = {
    phase: 'push', liveFocus: null, prayerImminent: false, occasion: null,
    absence: null, weekPattern: 'neutral', weather: null, progress: null,
    glasses: 12, focusMinutes: 30, focusRunning: false, isFriday: false, now: new Date('2026-10-07T14:00:00'),
  };
  const water = { kind: 'water', count: 12 } as const;

  it('a reached goal replaces the sentence with vectors and a blessing', () => {
    const h = pickHeader({ ...base, achievement: water, liveFocus: 'LIVE ', weather: 'WX ' });
    expect(h.achievement).toEqual(water);
    expect(h.text).toMatch(/MASHALLAH|ALHAMDULILLAH|BARAKALLAH/);
  });

  it('an occasion still outranks it, and without a goal it is the plain line', () => {
    expect(pickHeader({ ...base, achievement: water, occasion: 'EID ' })).toEqual({ text: 'EID ', achievement: null });
    expect(pickHeader({ ...base, achievement: null }).achievement).toBeNull();
  });
});
