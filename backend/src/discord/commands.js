import { SlashCommandBuilder, REST, Routes } from 'discord.js';
import { buildHubView } from '../features/hub.js';
import { buildWaterView } from '../features/water.js';
import { buildFocusView } from '../features/focus.js';
import { buildHomeView as buildFinanceHomeView } from '../features/finance.js';
import { scheduleExpire, cancelExpire } from '../lib/expire.js';
import { dashboardConfigured } from '../lib/firestore.js';

const NOT_CONFIGURED = {
  embeds: [],
  content: '`backend/serviceAccountKey.json` is missing — dashboard control isn\'t set up yet.',
  components: [],
};

async function reply(interaction, view, { persistent = false } = {}) {
  if (!dashboardConfigured()) {
    await interaction.reply({ ...NOT_CONFIGURED, ephemeral: true });
    return;
  }
  await interaction.reply(view);
  const message = await interaction.fetchReply();
  // Focus is the one card meant to be left open and checked back on (status,
  // Start, Discard) rather than glanced at once — so it's the only one that
  // doesn't self-delete.
  if (persistent) cancelExpire(message);
  else scheduleExpire(message);
}

// setDefaultMemberPermissions('0') hides these from the slash-command
// autocomplete for everyone except server Administrators (Discord always
// lets Administrators bypass this). It's a UI nicety, not the real boundary
// — the actual authorization check runs per interaction in access.js, since
// Discord's own command-visibility setting doesn't stop a click on an
// already-posted button.
const ownerOnly = (builder) => builder.setDefaultMemberPermissions('0');

export const commands = [
  {
    data: ownerOnly(new SlashCommandBuilder().setName('bommy').setDescription('Open the Firmus control panel')),
    execute: (i) => reply(i, buildHubView()),
  },
  {
    data: ownerOnly(new SlashCommandBuilder().setName('water').setDescription('Water tracker')),
    execute: async (i) => reply(i, await buildWaterView()),
  },
  {
    data: ownerOnly(new SlashCommandBuilder().setName('focus').setDescription('Focus session status')),
    execute: async (i) => reply(i, await buildFocusView(), { persistent: true }),
  },
  {
    data: ownerOnly(new SlashCommandBuilder().setName('finance').setDescription('Finance overview')),
    execute: async (i) => reply(i, await buildFinanceHomeView()),
  },
];

/**
 * Guild-scoped registration propagates instantly (global commands can take up
 * to an hour), and needs no extra config — the guild id comes from whichever
 * channel the bot is already configured to post the subscription alerts in.
 */
export async function registerCommands(client, anchorChannelId) {
  const channel = await client.channels.fetch(anchorChannelId).catch(() => null);
  const guildId = channel?.guild?.id;
  if (!guildId) {
    console.warn('⚠️ Could not resolve a guild to register commands in — skipping slash command registration.');
    return;
  }
  const rest = new REST({ version: '10' }).setToken(client.token);
  const ours = commands.map((c) => c.data.toJSON());
  const ourNames = new Set(ours.map((c) => c.name));

  // Another app (the Discord bot) registers its own slash commands under
  // this same bot token. The guild commands endpoint is a full overwrite, so
  // without this merge step, whichever process registers last wipes out the
  // other's commands. Preserve anything we don't recognize as our own.
  const route = Routes.applicationGuildCommands(client.application.id, guildId);
  const existing = await rest.get(route).catch(() => []);
  const foreign = (Array.isArray(existing) ? existing : [])
    .filter((cmd) => !ourNames.has(cmd.name))
    .map(({ name, description, options, type }) => ({ name, description, options, type }));

  await rest.put(route, { body: [...ours, ...foreign] });
  console.log(`🎛️  Slash commands registered (/bommy /water /focus /finance, +${foreign.length} preserved from other integrations) in guild ${guildId}`);
}
