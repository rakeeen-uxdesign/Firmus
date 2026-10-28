import { useFirebaseSync } from '@/data/useFirebaseSync';
import type { StoredGoldPrices } from '@/domain/finance/goldRefresh';

/** The Firestore document the prices live in — the web app writes it, and the Discord bot reads it. */
export const GOLD_PRICES_KEY = 'gold_prices';

/**
 * The latest gold spot prices (EGP per gram) and when they were fetched. They are refreshed at
 * Fajr and Maghrib by `GoldPriceRefresher`; this only reads, so every screen shows the same
 * numbers until the next refresh. Null until the first fetch.
 */
export function useGoldPrices(): StoredGoldPrices | null {
  const [stored] = useFirebaseSync<StoredGoldPrices | null>(GOLD_PRICES_KEY, null);
  return stored?.price24 ? stored : null;
}
