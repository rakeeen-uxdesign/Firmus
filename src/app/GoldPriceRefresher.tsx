import React, { useEffect, useRef } from 'react';
import { useFirebaseSync } from '@/data/useFirebaseSync';
import { usePrayer } from '@/data/usePrayer';
import { fetchGoldPrices } from '@/data/fetchGoldPrices';
import { GOLD_PRICES_KEY } from '@/data/useGoldPrices';
import { isGoldRefreshDue, type StoredGoldPrices } from '@/domain/finance/goldRefresh';

const CHECK_EVERY_MS = 5 * 60 * 1000;

/**
 * Keeps the gold prices fresh: twice a day, once Fajr has passed and once Maghrib has. It looks at
 * what was last fetched and whether a Fajr or Maghrib has gone by since — so a refresh missed
 * because the app was closed (or the API was down) happens as soon as the app is next open, and
 * the prices stay put in between. The prices go to Firestore, where every screen and the Discord
 * bot read the same copy; nothing else calls the gold API. Renders nothing.
 */
export const GoldPriceRefresher: React.FC = () => {
  const { times } = usePrayer();
  const [stored, setStored, ready] = useFirebaseSync<StoredGoldPrices | null>(GOLD_PRICES_KEY, null);

  // The newest stored prices, readable from the timer below without restarting it on every change.
  const storedRef = useRef(stored);
  useEffect(() => { storedRef.current = stored; }, [stored]);

  const lastAttemptRef = useRef<number | null>(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    // Wait until Firestore has said what's stored (another device may have just refreshed), and
    // until the real prayer times are in — the fallback times would refresh at the wrong moment.
    if (!ready || Object.keys(times).length === 0) return;

    const refreshIfDue = async () => {
      if (fetchingRef.current || !isGoldRefreshDue(storedRef.current, times, lastAttemptRef.current)) return;
      fetchingRef.current = true;
      lastAttemptRef.current = Date.now();
      try {
        const prices = await fetchGoldPrices();
        await setStored({ ...prices, fetchedAt: Date.now() });
      } catch (error) {
        console.warn('Gold prices refresh failed — keeping the stored ones, retrying in an hour:', error);
      } finally {
        fetchingRef.current = false;
      }
    };

    void refreshIfDue();
    const timer = setInterval(refreshIfDue, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [ready, times, setStored]);

  return null;
};
