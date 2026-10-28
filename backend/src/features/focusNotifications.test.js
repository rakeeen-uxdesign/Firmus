import { describe, it, expect } from 'vitest';
import { embedFor, isToAnnounce } from './focusNotifications.js';

const event = (over = {}) => ({ id: 'e1', type: 'focus_complete', focusMinutes: 25, overtimeSeconds: 0, at: new Date(1_000_000).toISOString(), ...over });

describe('embedFor', () => {
  it('a finished timer asks for a break', () => {
    expect(embedFor(event({ type: 'focus_timer_up' }))).toMatchObject({ title: '🔔 Focus Session Finished!', description: 'You finished **25m**, take a break.' });
  });

  it('a logged session adds the overtime to the goal', () => {
    const embed = embedFor(event({ overtimeSeconds: 7 * 60 + 5 }));
    expect(embed.description).toContain('**32m**');
    expect(embed.fields).toEqual([
      { name: 'Base Goal', value: '25m', inline: true },
      { name: 'Overtime', value: '7m 5s', inline: true },
    ]);
  });

  it('a session with no overtime says so', () => {
    expect(embedFor(event()).fields[1].value).toBe('0m 0s');
  });

  it('the end of a break sends you back to work', () => {
    expect(embedFor(event({ type: 'break_complete' })).title).toBe('☕ Break Time Over');
  });

  it('an event it does not know has no message', () => {
    expect(embedFor(event({ type: 'focus_started' }))).toBeNull();
  });
});

describe('isToAnnounce', () => {
  const now = 1_000_000 + 30_000;

  it('announces a new, recent event', () => {
    expect(isToAnnounce(event(), null, now)).toBe(true);
  });

  it('never announces the same event twice', () => {
    expect(isToAnnounce(event(), 'e1', now)).toBe(false);
  });

  it('skips one that is stale — written while the bot was off', () => {
    expect(isToAnnounce(event(), null, 1_000_000 + 3 * 60_000)).toBe(false);
  });

  it('ignores an empty document', () => {
    expect(isToAnnounce(null, null, now)).toBe(false);
  });
});
