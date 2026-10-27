import { useEffect } from 'react';
import { useFirebaseSync } from '@/data/useFirebaseSync';
import { EMPTY_BANKS, EMPTY_BUCKETS } from '@/domain/finance/defaults';
import { BUCKET_ORDER, type Percentages } from '@/domain/finance/split';
import type {
  FinanceBanks, FinanceBuckets,
  GoldAsset, Subscription, FinanceLog, Debt, ThndrEntry, ThndrFlow,
} from '@/domain/finance/types';

const VALID_BUCKET_KEYS = new Set<string>(BUCKET_ORDER);

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export function useFinance() {
  const [banks, setBanks] = useFirebaseSync<FinanceBanks>('finance_banks', EMPTY_BANKS);
  const [buckets, setBuckets] = useFirebaseSync<FinanceBuckets>('finance_buckets', EMPTY_BUCKETS);
  const [gold, setGold] = useFirebaseSync<GoldAsset[]>('finance_gold', []);
  const [subscriptions, setSubscriptionsSynced] = useFirebaseSync<Subscription[]>('finance_subscriptions', []);
  const [thndr, setThndr] = useFirebaseSync<ThndrEntry[]>('finance_thndr', []);
  // Money the user put into / took out of Thndr — kept apart from the readings so a deposit never looks like a gain.
  const [thndrFlows, setThndrFlows] = useFirebaseSync<ThndrFlow[]>('finance_thndr_flows', []);
  const [debts, setDebts] = useFirebaseSync<Debt[]>('finance_debts', []);
  const [logs, setLogs] = useFirebaseSync<FinanceLog[]>('finance_logs', []);
  // How the last income was split (each bucket's share, in percent) — the next one starts from it.
  const [splitTemplate, setSplitTemplate] = useFirebaseSync<Percentages>('finance_split_template', {});

  // A bucket removed from BUCKET_ORDER (e.g. Mariam) can still be sitting in an older stored
  // doc — strip just that stray key, keeping every real balance intact. This used to reset
  // the WHOLE record to EMPTY_BUCKETS the moment any one unrecognized key showed up, which
  // would have zeroed every other bucket's real balance along with it.
  useEffect(() => {
    if (!buckets) return;
    const staleKeys = Object.keys(buckets).filter((key) => !VALID_BUCKET_KEYS.has(key));
    if (staleKeys.length === 0) return;
    const cleaned: Record<string, number> = { ...buckets };
    for (const key of staleKeys) delete cleaned[key];
    setBuckets({ ...EMPTY_BUCKETS, ...cleaned });
  }, [buckets, setBuckets]);

  // The reminder bot keeps its own copy of the list (in memory and in a file), so every edit is
  // pushed to it straight away. Best-effort — the bot is optional and often off, so a failed push is
  // ignored, and nothing is pushed on load.
  const setSubscriptions = async (next: Subscription[]) => {
    await setSubscriptionsSynced(next);
    fetch(`${BACKEND_URL}/api/subscriptions/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => {});
  };

  // Functional updates, so two changes in a row build on each other instead of on a stale render.
  const updateBankBalance = (bankKey: keyof FinanceBanks, amount: number) =>
    setBanks((current) => ({ ...current, [bankKey]: amount }));

  const updateBucketBalance = (bucketKey: keyof FinanceBuckets, amount: number) =>
    setBuckets((current) => ({ ...current, [bucketKey]: amount }));

  const removeLog = (id: string) => setLogs((current) => (current || []).filter((log) => log.id !== id));

  const addLog = (entry: Omit<FinanceLog, 'id' | 'timestamp'>) => {
    const log: FinanceLog = { ...entry, id: crypto.randomUUID(), timestamp: new Date().toISOString() };
    return setLogs((current) => [log, ...(current || [])]);
  };

  return {
    banks,
    buckets,
    setBuckets,
    splitTemplate,
    setSplitTemplate,
    gold,
    setGold,
    subscriptions,
    setSubscriptions,
    thndr,
    setThndr,
    thndrFlows,
    setThndrFlows,
    debts,
    setDebts,
    updateBankBalance,
    updateBucketBalance,
    logs,
    addLog,
    removeLog,
  };
}
