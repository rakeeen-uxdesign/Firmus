// The nightly tidy-up of the dashboard channel, so it doesn't fill with old cards.

const PAGE_SIZE = 100;
const RATE_LIMIT_PAUSE_MS = 1_000;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Deletes messages one at a time (Discord only bulk-deletes ones under 14 days old). */
async function deleteEach(messages) {
  let deleted = 0;
  for (const message of messages.values()) {
    await message.delete();
    deleted++;
    await pause(RATE_LIMIT_PAUSE_MS);
  }
  return deleted;
}

/** Empties the channel; returns how many messages were removed. */
export async function cleanChannel(channel) {
  let total = 0;
  let page;
  do {
    page = await channel.messages.fetch({ limit: PAGE_SIZE });
    if (!page.size) break;
    try {
      const removed = await channel.bulkDelete(page, true);
      total += removed.size;
      total += await deleteEach(page.filter((message) => !removed.has(message.id)));
    } catch {
      total += await deleteEach(page);
    }
  } while (page.size >= PAGE_SIZE);
  return total;
}
