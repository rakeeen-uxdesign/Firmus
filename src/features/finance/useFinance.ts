import { useEffect } from 'react';
import { useFirebaseSync } from '@/data/useFirebaseSync';
import { EMPTY_BANKS, EMPTY_BUCKETS } from '@/domain/finance/defaults';
import { BUCKET_ORDER, type Percentages } from '@/domain/finance/split';
import type {
  FinanceBanks, FinanceBuckets,
  GoldAsset, Subscription, FinanceLog, Debt, ThndrEntry,
} from '@/domain/finance/types';

const VALID_BUCKET_KEYS = new Set<string>(BUCKET_ORDER);

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export function useFinance() {
  const [banks, setBanks] = useFirebaseSync<FinanceBanks>('finance_banks', EMPTY_BANKS);
  const [buckets, setBuckets] = useFirebaseSync<FinanceBuckets>('finance_buckets', EMPTY_BUCKETS);
  const [gold, setGold] = useFirebaseSync<GoldAsset[]>('finance_gold', []);
  const [subscriptions, setSubscriptionsSynced] = useFirebaseSync<Subscription[]>('finance_subscriptions', []);
  const [thndr, setThndr] = useFirebaseSync<ThndrEntry[]>('finance_thndr', []);
  const [debts, setDebts] = useFirebaseSync<Debt[]>('finance_debts', []);
  const [logs, setLogs] = useFirebaseSync<FinanceLog[]>('finance_logs', []);
  // How the last income was split (each bucket's share, in percent) — the next one starts from it.
  const [splitTemplate, setSplitTemplate] = useFirebaseSync<Percentages>('finance_split_template', {});

  // Buckets saved under an older set of keys can't be mapped onto the current five, so reset them.
  useEffect(() => {
    if (!buckets) return;
    const hasOldKey = Object.keys(buckets).some(k => !VALID_BUCKET_KEYS.has(k));
    if (hasOldKey) {
      setBuckets(EMPTY_BUCKETS);
    }
  }, [buckets]);

  // The reminder bot reads subscriptions from Firestore itself (on start, then every 30 minutes);
  // this just tells it about an edit straight away. Best-effort — the bot is optional and often
  // off, so a failed push is ignored, and nothing is pushed on load.
  const setSubscriptions = async (next: Subscription[]) => {
    await setSubscriptionsSynced(next);
    fetch(`${BACKEND_URL}/api/subscriptions/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => {});
  };

  const updateBankBalance = async (bankKey: keyof FinanceBanks, amount: number) => {
    await setBanks({ ...banks, [bankKey]: amount });
  };

  const updateBucketBalance = async (bucketKey: keyof FinanceBuckets, amount: number) => {
    await setBuckets({ ...buckets, [bucketKey]: amount });
  };

  const removeLog = async (id: string) => {
    await setLogs(prev => (prev || []).filter(l => l.id !== id));
  };

  const addLog = async (entry: Omit<FinanceLog, 'id' | 'timestamp'>) => {
    const log: FinanceLog = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    await setLogs(prev => [log, ...(prev || [])]);
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
    debts,
    setDebts,
    updateBankBalance,
    updateBucketBalance,
    logs,
    addLog,
    removeLog,
  };
}
