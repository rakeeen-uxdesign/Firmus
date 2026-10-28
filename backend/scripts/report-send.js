// Sends today's report to the dashboard channel right now — the same thing the 20:00 cron does.
//   node scripts/report-send.js
import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { CONTROL_CHANNEL_ID } from '../src/config.js';
import { sendDailyReport } from '../src/features/report/send.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
await client.login(process.env.DISCORD_BOT_TOKEN);
try {
  await sendDailyReport(client, CONTROL_CHANNEL_ID);
} finally {
  await client.destroy();
}
process.exit(0);
