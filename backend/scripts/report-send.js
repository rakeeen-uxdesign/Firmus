// Sends today's report to the dashboard channel right now — the same thing the 20:00 cron does.
//   node scripts/report-send.js
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits } from 'discord.js';
import { sendDailyReport } from '../src/features/report/send.js';
import { CONTROL_CHANNEL_ID } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let goldPrices = null;
try { goldPrices = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'gold_cache.json'), 'utf8')); } catch { /* no cached prices */ }

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
await client.login(process.env.DISCORD_BOT_TOKEN);
try {
  await sendDailyReport(client, CONTROL_CHANNEL_ID, () => goldPrices);
} finally {
  await client.destroy();
}
process.exit(0);
