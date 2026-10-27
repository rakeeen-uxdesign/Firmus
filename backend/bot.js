import { Client, GatewayIntentBits } from 'discord.js';
import cron from 'node-cron';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerCommands } from './src/discord/commands.js';
import { routeInteraction } from './src/discord/router.js';
import { sendDailyReport } from './src/features/report/send.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBS_FILE = path.join(__dirname, 'subscriptions.json');

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Without a listener, an 'error' event (a dropped gateway connection, a handshake
// timeout) is an *unhandled* EventEmitter error and crashes the whole process —
// which is what silently killed the daily report for days: the crash let launchd
// restart the process, but the restart's own client.login() hit a transient
// network timeout and gave up for good (see the retry below), so every cron that
// depends on a logged-in client (including the 20:00 report) never ran again even
// though the process itself kept running. discord.js already reconnects on its
// own for ordinary gateway hiccups — this just stops a rough one from taking the
// whole bot down.
client.on('error', (err) => {
  console.error('⚠️ Discord client error (not fatal, discord.js will keep retrying the gateway):', err.message);
});

const CHANNEL_ID = '1501292671753523371';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || 'PUT_YOUR_BOT_TOKEN_HERE';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

async function sendWebhookMessage(content) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('⚠️ No DISCORD_WEBHOOK_URL configured. Skipping Discord alert.');
    return;
  }
  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.error('❌ Failed to send Discord webhook message:', e.message);
  }
}

client.once('clientReady', async () => {
  console.log(`🤖 Discord Water Bot is online as ${client.user.tag}`);

  // Seed subscriptions on startup
  await seedSubscriptions();

  // Dashboard control panel (/bommy /water /focus /finance)
  await registerCommands(client, CHANNEL_ID).catch((err) =>
    console.error('❌ Failed to register slash commands:', err.message)
  );

  // (gold price scheduling moved to app.listen startup block)

  // Daily cleanup cron job at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (channel) {
        console.log(`[${new Date().toLocaleTimeString()}] Running daily cleanup...`);
        let fetched;
        let totalDeleted = 0;
        do {
          fetched = await channel.messages.fetch({ limit: 100 });
          if (fetched.size === 0) break;

          try {
            // First try bulkDelete
            const deleted = await channel.bulkDelete(fetched, true);
            totalDeleted += deleted.size;
            
            // If some messages remain (older than 14 days), delete them manually
            if (deleted.size < fetched.size) {
              const remaining = fetched.filter(msg => !deleted.has(msg.id));
              for (const [id, msg] of remaining) {
                await msg.delete();
                totalDeleted++;
                await new Promise(r => setTimeout(r, 1000)); // Avoid rate limits
              }
            }
          } catch (error) {
            // If bulkDelete fails entirely, fallback to manual delete
            for (const [id, msg] of fetched) {
              await msg.delete();
              totalDeleted++;
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        } while (fetched.size >= 100);
        console.log(`[${new Date().toLocaleTimeString()}] Channel cleaned up successfully! Total deleted: ${totalDeleted}`);
      }
    } catch (error) {
      console.error("Failed to clean up channel:", error);
    }
  });
  
  console.log('🧹 Channel Cleanup Cron Job Scheduled (Runs daily at 02:00 AM)!');

  // Subscription reminders — runs every minute, fires each sub at its own reminderTime (Egypt time UTC+3)
  cron.schedule('* * * * *', async () => {
    try {
      // Use Egypt timezone explicitly
      const nowEgypt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
      const currentDay = nowEgypt.getDate();
      const currentHH = String(nowEgypt.getHours()).padStart(2, '0');
      const currentMM = String(nowEgypt.getMinutes()).padStart(2, '0');
      const currentTime = `${currentHH}:${currentMM}`;

      const due = localSubscriptions.filter(sub => {
        const subTime = sub.reminderTime || '09:00';
        return parseInt(sub.renewalDay) === currentDay && subTime === currentTime;
      });

      if (due.length > 0) {
        console.log(`[${currentTime} Cairo] 🔔 ${due.length} subscription(s) due`);
        for (const sub of due) {
          await sendSubscriptionAlert(sub);
        }
      }
    } catch (error) {
      console.error("Failed to run subscription reminder cron:", error);
    }
  });

  // Daily report at 20:00 Cairo — a summary card plus the full PDF, in the dashboard channel.
  cron.schedule('0 20 * * *', async () => {
    try {
      await sendDailyReport(client, CHANNEL_ID, getGoldPrices);
    } catch (error) {
      console.error('❌ Failed to send the daily report:', error);
    }
  }, { timezone: 'Africa/Cairo' });
  console.log('📄 Daily report scheduled (20:00 Cairo)!');

  // Re-seed subscriptions from Firebase every 30 minutes to stay fresh
  cron.schedule('*/30 * * * *', async () => {
    await seedSubscriptions();
    console.log(`[${new Date().toLocaleTimeString()}] 🔄 Subscriptions re-synced from Firebase`);
  });

  console.log('⏰ Subscriptions Reminder Cron Scheduled (Cairo time, every minute)!');
});

// A failed login used to be permanent — a single transient timeout connecting to
// discord.com left the bot running but disconnected from Discord forever, since
// nothing ever tried again. This retries every 30s until it gets in.
function loginWithRetry() {
  client.login(BOT_TOKEN).catch(err => {
    console.error('❌ Failed to login, retrying in 30s:', err.message);
    setTimeout(loginWithRetry, 30_000);
  });
}
loginWithRetry();

client.on('interactionCreate', routeInteraction);

// ============================================================
// EMBED ALERTS HELPERS
// ============================================================
async function sendDiscordEmbed(embed, alternativeText) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('⚠️ No DISCORD_WEBHOOK_URL configured. Skipping Discord embed alert.');
    return;
  }
  try {
    const payload = {
      embeds: [{
        ...embed,
        timestamp: new Date().toISOString()
      }]
    };
    
    // Attempt sending via client fetch channel first
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (channel) {
        await channel.send({ embeds: [payload.embeds[0]] });
        console.log(`[${new Date().toLocaleTimeString()}] Sent Discord Embed via Client!`);
        return;
      }
    } catch (err) {
      // Fallback
    }

    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`[${new Date().toLocaleTimeString()}] Sent Discord Embed via Webhook!`);
  } catch (e) {
    console.error('❌ Failed to send Discord embed:', e.message);
    await sendWebhookMessage(alternativeText);
  }
}

async function sendSubscriptionAlert(sub) {
  const nowEgypt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  const dateStr = nowEgypt.toLocaleDateString('en-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const embed = {
    title: 'Subscription Renewal Due',
    color: 0xF0C040, // Gold/amber
    description: `**${sub.name}** is renewing today — make sure it's covered.`,
    fields: [
      { name: 'Amount', value: `\`${sub.cost.toLocaleString('en-EG')} EGP\``, inline: true },
      { name: 'Bank', value: sub.bank || '—', inline: true },
      { name: 'Date', value: dateStr, inline: false },
    ],
    footer: { text: 'Rakeeen · Finance · Subscriptions' },
    thumbnail: { url: 'https://cdn-icons-png.flaticon.com/512/2088/2088617.png' }
  };

  const altText = `**Subscription Due: ${sub.name}**\n${sub.cost.toLocaleString('en-EG')} EGP · ${sub.bank || 'Unknown'}\n${dateStr}`;
  await sendDiscordEmbed(embed, altText);
}

// ============================================================
// GOLD PRICE CACHE — fetched 3x/day via goldapi.io
// ============================================================
const GOLD_CACHE_FILE = path.join(__dirname, 'gold_cache.json');

let cachedGoldPrices = (() => {
  try {
    if (fs.existsSync(GOLD_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(GOLD_CACHE_FILE, 'utf8'));
    }
  } catch {}
  return { price24: 0, price21: 0, lastUpdated: null };
})();

async function fetchGoldPrices() {
  const apiKey = process.env.GOLD_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ GOLD_API_KEY not set in .env');
    return;
  }
  try {
    const res = await fetch('https://www.goldapi.io/api/XAU/EGP', {
      headers: { 'x-access-token': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`goldapi HTTP ${res.status}`);
    const data = await res.json();
    const p24 = Math.round(data.price_gram_24k);
    const p21 = Math.round(data.price_gram_21k);
    if (p24 && p21) {
      cachedGoldPrices = { price24: p24, price21: p21, lastUpdated: Date.now() };
      fs.writeFileSync(GOLD_CACHE_FILE, JSON.stringify(cachedGoldPrices), 'utf8');
      console.log(`✨ Gold prices updated: 24K=${p24} EGP, 21K=${p21} EGP`);
    }
  } catch (e) {
    console.error('⚠️ Failed to fetch gold prices:', e.message);
  }
}

function getGoldPrices() {
  return cachedGoldPrices;
}

// ============================================================
// FIREBASE SUBSCRIPTION SYNC & SEEDING
// ============================================================

// Load subscriptions from local file (persisted across restarts)
function loadSubscriptionsFromFile() {
  try {
    if (fs.existsSync(SUBS_FILE)) {
      const raw = fs.readFileSync(SUBS_FILE, 'utf8');
      const subs = JSON.parse(raw);
      if (Array.isArray(subs) && subs.length > 0) {
        console.log(`📂 Loaded ${subs.length} subscriptions from local file`);
        return subs;
      }
    }
  } catch (err) {
    console.error('⚠️ Failed to load subscriptions from file:', err.message);
  }
  return [];
}

function saveSubscriptionsToFile(subs) {
  try {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), 'utf8');
  } catch (err) {
    console.error('⚠️ Failed to save subscriptions to file:', err.message);
  }
}

let localSubscriptions = loadSubscriptionsFromFile();

async function seedSubscriptions() {
  // Subscriptions are kept in memory and persisted to file via /api/subscriptions/sync
  // Firebase REST seeding is skipped (requires auth not available in backend)
  console.log(`📋 Current subscriptions in memory: ${localSubscriptions.length}`);
}

// ============================================================
// FINANCE WEBHOOK SERVER
// ============================================================
const app = express();
const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT || '3001');

app.use(express.json());
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/gold-prices', (_req, res) => {
  res.json(getGoldPrices());
});

app.post('/api/subscriptions/sync', (req, res) => {
  if (Array.isArray(req.body)) {
    localSubscriptions = req.body;
    saveSubscriptionsToFile(localSubscriptions);
    console.log(`🔄 Synced & saved ${localSubscriptions.length} subscriptions from client`);
  }
  res.json({ status: 'ok', count: localSubscriptions.length });
});

app.listen(WEBHOOK_PORT, () => {
  console.log(`🌐 Finance webhook server running on port ${WEBHOOK_PORT}`);

  // Schedule gold price fetches 3x/day independent of Discord connection
  cron.schedule('0 11 * * *', () => fetchGoldPrices(), { timezone: 'Africa/Cairo' });
  cron.schedule('0 18 * * *', () => fetchGoldPrices(), { timezone: 'Africa/Cairo' });
  cron.schedule('0 23 * * *', () => fetchGoldPrices(), { timezone: 'Africa/Cairo' });
  console.log('💰 Gold price cron scheduled (11:00, 18:00, 23:00 Cairo — 3 calls/day, ~90/month)');

  // Fetch on startup if cache is older than 8 hours
  const eightHours = 8 * 60 * 60 * 1000;
  if (!cachedGoldPrices.lastUpdated || (Date.now() - cachedGoldPrices.lastUpdated > eightHours)) {
    fetchGoldPrices().catch(console.error);
  }
});
