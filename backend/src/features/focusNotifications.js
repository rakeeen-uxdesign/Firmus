import { watchDashboardValue } from '../lib/firestore.js';
import { formatDurationText } from '../lib/format.js';
import { postToWebhook } from '../lib/alerts.js';
import { NAME_MARKED } from '../lib/brand.js';

// The focus timer's messages to Discord. The web app doesn't post them itself (that would put a
// webhook — a secret — inside the website): it writes each event to Firestore, and this turns it
// into a message through the webhook the bot keeps in its own .env.

const KEY = 'focus_notification';
/** An event older than this is not announced — e.g. one written while the bot was off. */
const FRESH_FOR_MS = 2 * 60 * 1000;
const FOOTER = { text: `${NAME_MARKED} Productivity System` };
const GREEN = 0x7ca982;
const GOLD = 0xc8a96e;

/** The Discord embed for an event, or null for a kind of event that has no message. */
export function embedFor(event) {
  const goal = formatDurationText(event.focusMinutes);
  switch (event.type) {
    case 'focus_timer_up':
      return { title: '🔔 Focus Session Finished!', description: `You finished **${goal}**, take a break.`, color: GREEN, footer: FOOTER };
    case 'focus_complete': {
      const overtime = event.overtimeSeconds || 0;
      return {
        title: '🧠 Focus Session Logged',
        description: `Excellent! You've logged **${formatDurationText(event.focusMinutes + Math.floor(overtime / 60))}** of deep work.`,
        fields: [
          { name: 'Base Goal', value: goal, inline: true },
          { name: 'Overtime', value: `${Math.floor(overtime / 60)}m ${overtime % 60}s`, inline: true },
        ],
        color: GREEN,
        footer: FOOTER,
      };
    }
    case 'break_complete':
      return { title: '☕ Break Time Over', description: 'Your break is done? Time to get back to work! 🚀', color: GOLD, footer: FOOTER };
    default:
      return null;
  }
}

/** Whether `event` is one to announce now: a new, recent one that we haven't already posted. */
export function isToAnnounce(event, lastPostedId, now = Date.now()) {
  if (!event?.id || event.id === lastPostedId) return false;
  return now - Date.parse(event.at) <= FRESH_FOR_MS;
}

/** Starts posting the focus timer's events to `webhookUrl`; does nothing without one. */
export function watchFocusNotifications(webhookUrl) {
  if (!webhookUrl) {
    console.log('⚠️ DISCORD_POMODORO_WEBHOOK_URL is not set — focus timer messages are off');
    return;
  }
  let lastPostedId = null;
  let connected = false;

  watchDashboardValue(KEY, async (event) => {
    // The first snapshot is whatever was already there when the bot started — never announce that.
    if (!connected) {
      connected = true;
      lastPostedId = event?.id ?? null;
      return;
    }
    if (!isToAnnounce(event, lastPostedId)) return;
    lastPostedId = event.id;
    const embed = embedFor(event);
    if (!embed) return;
    try {
      await postToWebhook(webhookUrl, { embeds: [{ ...embed, timestamp: new Date().toISOString() }] });
      console.log(`[${new Date().toLocaleTimeString()}] 🎯 Posted a focus message (${event.type})`);
    } catch (error) {
      console.error('❌ Failed to post the focus message:', error.message);
    }
  });
  console.log('🎯 Watching the focus timer for Discord messages');
}
