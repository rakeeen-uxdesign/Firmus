import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendEmbed } from '../lib/alerts.js';

// Payit (subscription) renewal reminders. The web app owns the list; it pushes every edit to the
// bot, which keeps it in memory and in a small file so a restart doesn't forget it.

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'subscriptions.json');
const TIME_ZONE = 'Africa/Cairo';
const DEFAULT_REMINDER_TIME = '09:00';

let subscriptions = loadFromFile();

function loadFromFile() {
  try {
    const stored = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (Array.isArray(stored)) {
      console.log(`📂 Loaded ${stored.length} Payit from the local file`);
      return stored;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('⚠️ Failed to load Payit from file:', error.message);
  }
  return [];
}

export const getSubscriptions = () => subscriptions;

/** Replaces the list with what the web app just saved, and remembers it. */
export function replaceSubscriptions(next) {
  subscriptions = next;
  try {
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch (error) {
    console.error('⚠️ Failed to save Payit to file:', error.message);
  }
}

/** The wall-clock time in Cairo, as plain numbers. */
export function cairoClock(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  );
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

const daysInMonth = (year, month) => new Date(year, month, 0).getDate();
const pad = (n) => String(n).padStart(2, '0');

/**
 * Whether a subscription's reminder is due at this minute: its renewal day (the last day of a
 * short month, if it falls on a 31st), its reminder time — and a month it actually renews in. A
 * quarterly or yearly plan only renews every `intervalMonths` from its start month.
 */
export function isDueAt(sub, clock) {
  const renewalDay = Math.min(Number(sub.renewalDay), daysInMonth(clock.year, clock.month));
  if (clock.day !== renewalDay) return false;
  if ((sub.reminderTime || DEFAULT_REMINDER_TIME) !== `${pad(clock.hour)}:${pad(clock.minute)}`) return false;

  const interval = sub.intervalMonths || 1;
  if (!sub.startDate) return true;
  const start = new Date(sub.startDate);
  const monthsFromStart = (clock.year - start.getFullYear()) * 12 + (clock.month - 1 - start.getMonth());
  return monthsFromStart >= 0 && monthsFromStart % interval === 0;
}

/** Posts today's reminder for one subscription. */
export async function sendSubscriptionAlert(client, channelId, sub, now = new Date()) {
  const date = now.toLocaleDateString('en-EG', { timeZone: TIME_ZONE, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const amount = `${sub.cost.toLocaleString('en-EG')} EGP`;
  await sendEmbed(client, channelId, {
    title: 'Payit Renewal Due',
    color: 0xF0C040,
    description: `**${sub.name}** is renewing today — make sure it's covered.`,
    fields: [
      { name: 'Amount', value: `\`${amount}\``, inline: true },
      { name: 'Bank', value: sub.bank || '—', inline: true },
      { name: 'Date', value: date, inline: false },
    ],
    footer: { text: 'Firmus · Finance · Payit' },
    thumbnail: { url: 'https://cdn-icons-png.flaticon.com/512/2088/2088617.png' },
  }, `**Payit Due: ${sub.name}**\n${amount} · ${sub.bank || 'Unknown'}\n${date}`);
}

/** Run once a minute: sends a reminder for every subscription that is due right now. */
export async function remindDueSubscriptions(client, channelId, now = new Date()) {
  const clock = cairoClock(now);
  const due = subscriptions.filter((sub) => isDueAt(sub, clock));
  if (!due.length) return;
  console.log(`[${pad(clock.hour)}:${pad(clock.minute)} Cairo] 🔔 ${due.length} Payit due`);
  for (const sub of due) await sendSubscriptionAlert(client, channelId, sub, now);
}
