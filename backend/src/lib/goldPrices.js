import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Gold spot prices (EGP per gram), fetched from goldapi.io a few times a day and kept in a small
// file so they survive a restart. The web app reads them over HTTP; the daily report and the
// finance panel read them from here.

const CACHE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'gold_cache.json');
const NO_PRICES = { price24: 0, price21: 0, lastUpdated: null };
const REQUEST_TIMEOUT_MS = 8_000;

let cached = readCacheFile();

function readCacheFile() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return NO_PRICES;
  }
}

/** The latest prices we have; zeros (and no `lastUpdated`) until the first fetch succeeds. */
export const getGoldPrices = () => cached;

/** Whether the cache is older than `maxAgeMs` — or has never been filled. */
export const goldPricesAreStale = (maxAgeMs) => !cached.lastUpdated || Date.now() - cached.lastUpdated > maxAgeMs;

/** Fetches fresh prices and caches them. Never throws: a failure just leaves the old prices in place. */
export async function fetchGoldPrices() {
  const apiKey = process.env.GOLD_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ GOLD_API_KEY not set in .env');
    return;
  }
  try {
    const res = await fetch('https://www.goldapi.io/api/XAU/EGP', {
      headers: { 'x-access-token': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`goldapi HTTP ${res.status}`);
    const data = await res.json();
    const price24 = Math.round(data.price_gram_24k);
    const price21 = Math.round(data.price_gram_21k);
    if (!price24 || !price21) return;
    cached = { price24, price21, lastUpdated: Date.now() };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cached), 'utf8');
    console.log(`✨ Gold prices updated: 24K=${price24} EGP, 21K=${price21} EGP`);
  } catch (error) {
    console.error('⚠️ Failed to fetch gold prices:', error.message);
  }
}
