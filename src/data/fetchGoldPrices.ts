import type { GoldPrices } from '@/domain/finance/insights';

const TIMEOUT_MS = 8_000;

/**
 * Today's gold spot prices per gram in EGP, straight from goldapi.io. Throws when the request
 * fails or the answer has no prices — callers keep the prices they already have.
 */
export async function fetchGoldPrices(): Promise<GoldPrices> {
  const response = await fetch('https://www.goldapi.io/api/XAU/EGP', {
    headers: { 'x-access-token': import.meta.env.VITE_GOLD_API_KEY || '', 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`goldapi answered ${response.status}`);
  const data = await response.json();
  if (!data.price_gram_24k || !data.price_gram_21k) throw new Error('goldapi answered without prices');
  return { price24: Math.round(data.price_gram_24k), price21: Math.round(data.price_gram_21k) };
}
