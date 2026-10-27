import React, { useEffect, useState } from 'react';
import { IconArrowLeft as ArrowLeft, IconChevronRight as ChevronRight } from '@/ui/icons';
import { Tabs } from '@/ui/Tabs';
import { useFinance } from '@/features/finance/useFinance';
import { useGoldPrices } from '@/data/useGoldPrices';
import { upsertById } from '@/domain/finance/collections';
import { applyMove, urgentDebtFor, type MoneyMove } from '@/domain/finance/moves';
import {
  BUCKET_ORDER, applyAssignment, applyIncome, freeMoneyOf, remainderOf, repayUrgent, toPercentages,
} from '@/domain/finance/split';
import type { Debt } from '@/domain/finance/types';
import { BANK_LABELS, BUCKET_META } from '@/features/finance/components/visuals';
import { OverviewTab, type FinanceTab } from '@/features/finance/components/OverviewTab';
import { GoldTab } from '@/features/finance/components/GoldTab';
import { ThndrTab } from '@/features/finance/components/ThndrTab';
import { ThndrMoneyModal, type ThndrMoneyDraft } from '@/features/finance/components/ThndrMoneyModal';
import { currentThndrParts, currentThndrValue } from '@/domain/finance/thndr';
import { SubscriptionsTab } from '@/features/finance/components/SubscriptionsTab';
import { DebtModal, DebtsTab } from '@/features/finance/components/DebtsTab';
import { LogsTab } from '@/features/finance/components/LogsTab';
import { MoneyMoveModal, type MoveDraft } from '@/features/finance/components/MoneyMoveModal';
import { SplitModal, type SplitResult } from '@/features/finance/components/SplitModal';
import { PrivacyToggle } from '@/features/finance/components/PrivacyToggle';

interface FinanceProps {
  navigate: (to: string) => void;
}

// Displayed as "Payit" — the tab id itself stays 'subscriptions' (it's just the UI label that changed).
const TAB_LABELS: Partial<Record<FinanceTab, string>> = { subscriptions: 'Payit' };
const TAB_OPTIONS = (['overview', 'gold', 'thndr', 'subscriptions', 'debts', 'logs'] as const)
  .map((value) => ({ value, label: TAB_LABELS[value] }));

export const Finance: React.FC<FinanceProps> = ({ navigate }) => {
  const {
    banks, buckets, setBuckets,
    splitTemplate, setSplitTemplate,
    gold, setGold,
    thndr, setThndr,
    thndrFlows, setThndrFlows,
    subscriptions, setSubscriptions,
    debts, setDebts,
    updateBankBalance, updateBucketBalance,
    logs, addLog, removeLog,
  } = useFinance();

  const [tab, setTab] = useState<FinanceTab>('overview');
  const [privacyMode, setPrivacyMode] = useState(true);
  const [moveModal, setMoveModal] = useState<{ open: boolean; draft: MoveDraft }>({ open: false, draft: { type: 'deposit', bank: null } });
  const [splitModal, setSplitModal] = useState<{ open: boolean; mode: 'income' | 'assign' }>({ open: false, mode: 'income' });
  const [thndrMoneyOpen, setThndrMoneyOpen] = useState(false);
  const [debtModal, setDebtModal] = useState<{ open: boolean; debt: Debt | null; type: Debt['type'] }>({ open: false, debt: null, type: 'owed_to_me' });
  // Spot prices are cached; they're only re-fetched while the Gold tab is open.
  const { prices: goldPrices, loading: loadingPrices } = useGoldPrices(tab === 'gold');

  useEffect(() => { document.title = 'Rakeeen — Finance'; }, []);

  const openMove = (draft: MoveDraft) => setMoveModal({ open: true, draft });

  const saveDebt = (debt: Debt) => setDebts(upsertById(debts ?? [], debt));

  const handleMove = async (move: MoneyMove) => {
    const next = applyMove(banks, buckets, move);
    await Promise.all([
      updateBankBalance(move.bank, next.banks[move.bank]),
      move.bucket ? updateBucketBalance(move.bucket, next.buckets[move.bucket]) : Promise.resolve(),
    ]);
    await addLog({
      type: move.type,
      amount: move.amount,
      bank: BANK_LABELS[move.bank],
      ...(move.bucket ? { bucket: BUCKET_META[move.bucket].en } : {}),
      mode: move.mode ?? 'manual',
      ...(move.category ? { category: move.category } : {}),
    });
    const debt = urgentDebtFor(move, crypto.randomUUID());
    if (debt) await setDebts((prev) => [...(prev || []), debt]);
  };

  /** Money into / out of Thndr: recorded as a flow (so it isn't a gain), and — if asked — moved out of / back into the bank. */
  const handleThndrMoney = async ({ flow, move }: ThndrMoneyDraft) => {
    if (move) await handleMove(move);
    await setThndrFlows((prev) => [{ ...flow, id: crypto.randomUUID(), timestamp: new Date().toISOString() }, ...(prev || [])]);
  };

  const free = freeMoneyOf(banks, buckets);

  /** Moves free money into buckets, or takes it back out of them — the bank itself doesn't change. */
  const assignToBuckets = async (result: Extract<SplitResult, { kind: 'assign' }>) => {
    await setBuckets(applyAssignment(buckets, result.allocations, result.direction));
    for (const key of BUCKET_ORDER) {
      const amount = result.allocations[key];
      if (amount) await addLog({ type: 'assign', amount: amount * result.direction, bank: '', bucket: BUCKET_META[key].en, mode: 'manual' });
    }
  };

  /** An income lands in a bank and is divided across buckets; what isn't given to one stays free. */
  const receiveIncome = async (result: Extract<SplitResult, { kind: 'income' }>) => {
    const next = applyIncome(banks, buckets, result);
    await Promise.all([updateBankBalance(result.bank, next.banks[result.bank]), setBuckets(next.buckets)]);

    const bank = BANK_LABELS[result.bank];
    for (const key of BUCKET_ORDER) {
      const amount = result.allocations[key];
      if (amount) await addLog({ type: 'deposit', amount, bank, bucket: BUCKET_META[key].en, mode: 'split' });
    }
    const unsplit = remainderOf(result.amount, result.allocations);
    if (unsplit > 0) await addLog({ type: 'deposit', amount: unsplit, bank, mode: 'split' });

    const toTawarru = result.allocations.tawarr2;
    if (result.repayUrgent && toTawarru) await setDebts((prev) => repayUrgent(prev || [], toTawarru).debts);
    await setSplitTemplate(toPercentages(result.allocations, result.amount));
  };

  const handleSplit = (result: SplitResult) => (result.kind === 'income' ? receiveIncome(result) : assignToBuckets(result));

  return (
    <div className="min-h-screen bg-bg text-ink py-6 md:py-12 px-6 md:px-12 lg:px-20 font-sans-main transition-colors duration-300">

      {/* HEADER — the same Home › Page breadcrumb Water and Focus use; the tabs sit on the title's line */}
      <header className="w-full max-w-[1400px] mx-auto mb-10 md:mb-12">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('home')}
              className="flex items-center gap-2 text-ink/40 hover:text-ink transition-colors group cursor-pointer"
            >
              <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="font-mono-main text-[10px] uppercase tracking-[0.25em] font-bold">Home</span>
            </button>
            <ChevronRight size={12} className="text-ink/25" />
            <span className="font-mono-main text-[10px] uppercase tracking-[0.25em] font-bold text-ink/60">Finance</span>
          </div>

          <PrivacyToggle
            privateMode={privacyMode}
            onToggle={() => setPrivacyMode((p) => !p)}
            disabled={tab === 'thndr'}
          />
        </div>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <h1 className="font-sans-main text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight">FINANCES</h1>
          <Tabs layoutId="financeTab" ruled value={tab} onChange={setTab} options={TAB_OPTIONS} className="md:mb-1" />
        </div>
      </header>

      <div className="w-full max-w-[1400px] mx-auto">
        {tab === 'overview' && (
          <OverviewTab
            banks={banks}
            buckets={buckets}
            gold={gold ?? []}
            goldPrices={goldPrices}
            thndrValue={currentThndrValue(thndr ?? [], thndrFlows ?? [])}
            subscriptions={subscriptions ?? []}
            debts={debts ?? []}
            privacyMode={privacyMode}
            free={free}
            onMove={openMove}
            onSplit={(mode) => setSplitModal({ open: true, mode })}
            onOpenTab={setTab}
          />
        )}
        {tab === 'gold' && (
          <GoldTab gold={gold ?? []} setGold={setGold} prices={goldPrices} loadingPrices={loadingPrices} privacyMode={privacyMode} />
        )}
        {tab === 'thndr' && (
          <ThndrTab
            entries={thndr ?? []}
            setEntries={setThndr}
            flows={thndrFlows ?? []}
            setFlows={setThndrFlows}
            onAddMoney={() => setThndrMoneyOpen(true)}
          />
        )}
        {tab === 'subscriptions' && (
          <SubscriptionsTab subscriptions={subscriptions ?? []} setSubscriptions={setSubscriptions} privacyMode={privacyMode} />
        )}
        {tab === 'debts' && (
          <DebtsTab
            debts={debts ?? []}
            setDebts={setDebts}
            privacyMode={privacyMode}
            onEdit={(debt) => setDebtModal({ open: true, debt, type: debt.type })}
            onAdd={(type) => setDebtModal({ open: true, debt: null, type })}
          />
        )}
        {tab === 'logs' && <LogsTab logs={logs ?? []} removeLog={removeLog} />}
      </div>

      <DebtModal
        isOpen={debtModal.open}
        onClose={() => setDebtModal((m) => ({ ...m, open: false }))}
        initial={debtModal.debt}
        defaultType={debtModal.type}
        onSave={saveDebt}
      />

      <SplitModal
        isOpen={splitModal.open}
        onClose={() => setSplitModal((m) => ({ ...m, open: false }))}
        mode={splitModal.mode}
        buckets={buckets}
        free={free}
        template={splitTemplate ?? {}}
        debts={debts ?? []}
        onConfirm={handleSplit}
      />

      <ThndrMoneyModal
        isOpen={thndrMoneyOpen}
        onClose={() => setThndrMoneyOpen(false)}
        banks={banks}
        buckets={buckets}
        parts={currentThndrParts(thndr ?? [], thndrFlows ?? [])}
        value={currentThndrValue(thndr ?? [], thndrFlows ?? [])}
        onConfirm={handleThndrMoney}
      />

      <MoneyMoveModal
        isOpen={moveModal.open}
        onClose={() => setMoveModal((m) => ({ ...m, open: false }))}
        initial={moveModal.draft}
        banks={banks}
        buckets={buckets}
        onConfirm={handleMove}
      />
    </div>
  );
};
