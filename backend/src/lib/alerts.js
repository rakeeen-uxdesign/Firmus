// Posting an embed to the dashboard channel: through the logged-in client when it can, through the
// webhook when it can't, and as plain text through the webhook as a last resort.

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

/** POSTs a message body to a Discord webhook; throws if Discord doesn't accept it. */
export async function postToWebhook(url, body) {
  if (!url) throw new Error('no webhook URL configured');
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/**
 * @param {import('discord.js').Client} client
 * @param {string} channelId
 * @param {object} embed - a plain embed object; it is timestamped here
 * @param {string} fallbackText - what to send as text if the embed can't be delivered
 */
export async function sendEmbed(client, channelId, embed, fallbackText) {
  const stamped = { ...embed, timestamp: new Date().toISOString() };
  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [stamped] });
    return;
  } catch {
    // The client isn't logged in or can't see the channel — try the webhook next.
  }
  try {
    await postToWebhook(WEBHOOK_URL, { embeds: [stamped] });
  } catch (error) {
    console.error('❌ Failed to send the Discord embed:', error.message);
    await postToWebhook(WEBHOOK_URL, { content: fallbackText }).catch((e) => console.error('❌ Failed to send the text fallback:', e.message));
  }
}
