import React from 'react';
import { IconChevronRight as ChevronRight } from '@/ui/icons';
import { formatEGP } from '@/domain/finance/money';
import { countdownLabel, goldSummary, rankBanks, rankBuckets, sumOf, upcomingRenewals } from '@/domain/finance/insights';
import type { GoldPrices } from '@/domain/finance/insights';
import type { Debt, FinanceBanks, FinanceBuckets, GoldAsset, Subscription } from '@/domain/finance/types';
import { BANK_LABELS, BANK_VECTORS, BUCKET_META, BUCKET_VECTORS, MaskedValue } from '@/features/finance/components/visuals';
import type { MoveDraft } from '@/features/finance/components/MoneyMoveModal';
import { ActionButton } from '@/features/finance/components/ActionButton';
import { sectionLabel } from '@/features/finance/components/labels';

export type FinanceTab = 'overview' | 'gold' | 'thndr' | 'subscriptions' | 'debts' | 'logs';

/** A quiet summary in the side column that opens its tab. */
const Glance: React.FC<{ title: string; to: FinanceTab; onOpen: (tab: FinanceTab) => void; children: React.ReactNode }> = ({ title, to, onOpen, children }) => (
  <button type="button" onClick={() => onOpen(to)} className="w-full text-left cursor-pointer group block">
    <div className="flex items-center justify-between mb-4">
      <span className={sectionLabel}>{title}</span>
      <span className="text-ink/25 group-hover:text-ink transition-colors"><ChevronRight size={14} /></span>
    </div>
    {children}
  </button>
);

/**
 * The first screen, kept calm: the total and what you do to it (withdraw, deposit, split an
 * income), the banks, the buckets — and in the margin what's coming up and what you owe.
 * Everything else lives in its tab.
 */
export const OverviewTab: React.FC<{
  banks: FinanceBanks;
  buckets: FinanceBuckets;
  gold: GoldAsset[];
  goldPrices: GoldPrices | null;
  /** Latest Thndr reading (0 when none yet). */
  thndrValue: number;
  subscriptions: Subscription[];
  debts: Debt[];
  privacyMode: boolean;
  /** Banks total minus buckets total: your free money; negative when the buckets claim more than the banks hold. */
  free: number;
  onMove: (draft: MoveDraft) => void;
  onSplit: (mode: 'income' | 'assign') => void;
  onOpenTab: (tab: FinanceTab) => void;
}> = ({ banks, buckets, gold, goldPrices, thndrValue, subscriptions, debts, privacyMode, free, onMove, onSplit, onOpenTab }) => {
  const goldValue = goldSummary(gold, goldPrices).value;
  const banksRanked = rankBanks(banks);
  const bucketsRanked = rankBuckets(buckets, goldValue + thndrValue);
  const upNext = upcomingRenewals(subscriptions, new Date(), 3);
  const iOwe = debts.filter((d) => d.type === 'owed_by_me').sort((a, b) => b.amount - a.amount);
  const masked = (value: React.ReactNode, className = '', align?: 'start' | 'end') => (
    <MaskedValue disabled={!privacyMode} className={className} align={align}>{value}</MaskedValue>
  );

  return (
    // Rows line up across the two columns: the total ↔ what's coming up, the banks ↔ what you owe.
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-16 gap-y-12">

      {/* The total, and what you do to it */}
      <section className="order-1 lg:col-start-1 lg:row-start-1 lg:col-span-2 brutalist-card no-lift bg-paper-dark px-8 py-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-8">
        <div>
          <p className={`${sectionLabel} mb-3`}>Total in banks</p>
          {masked(formatEGP(sumOf(banks)), 'font-mono-main text-4xl md:text-5xl font-black tracking-tight')}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <ActionButton onClick={() => onMove({ type: 'deposit', bank: null })}>Money in / out</ActionButton>
          <ActionButton tone="solid" onClick={() => onSplit('income')}>Split income</ActionButton>
        </div>
      </section>

      {/* Banks — one card, a row each; a row is a shortcut to move money in that bank */}
      <section className="order-2 lg:col-start-1 lg:row-start-2 lg:col-span-2">
        <p className={`${sectionLabel} mb-4`}>Banks</p>
        <div className="brutalist-card no-lift bg-paper-dark overflow-hidden !p-0">
          {banksRanked.map(({ key, balance }, i) => {
            const Vector = BANK_VECTORS[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => onMove({ type: 'deposit', bank: key })}
                data-tip={`Move money in ${BANK_LABELS[key]}`}
                className={`w-full text-left cursor-pointer group flex items-center gap-5 px-8 py-6 transition-colors hover:bg-ink/5 ${i > 0 ? `border-t border-ink/12` : ''}`}
              >
                <div className="shrink-0 text-ink/60 group-hover:text-ink transition-colors duration-500"><Vector balance={balance} /></div>
                <p className="flex-1 font-sans-main text-[11px] font-black uppercase tracking-widest text-ink/60">{BANK_LABELS[key]}</p>
                {masked(formatEGP(balance), 'font-mono-main text-2xl font-black tracking-tight', 'end')}
              </button>
            );
          })}
        </div>
      </section>

      {/* Buckets — how the same money is split. One card, hairlines between */}
      <section className="order-3 lg:col-start-1 lg:row-start-3 lg:col-span-2">
        <p className={`${sectionLabel} mb-4`}>Buckets</p>
        <div className="brutalist-card no-lift bg-paper-dark overflow-hidden !p-0">
          {/* md:grid-cols-4 matches BUCKET_ORDER's current length (4) — Tailwind needs a literal
              class, so bump this by hand if a bucket is ever added or removed again. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink/12">
            {bucketsRanked.map(({ key, balance }) => {
              const Vector = BUCKET_VECTORS[key];
              return (
                <div key={key} className="bg-paper-dark px-6 py-7 flex flex-col gap-4 group">
                  <div className="text-ink/60 group-hover:text-ink transition-colors duration-500"><Vector balance={balance} /></div>
                  <div>
                    <p className="font-sans-main text-[11px] font-black uppercase tracking-widest text-ink/60">{BUCKET_META[key].en}</p>
                    {masked(formatEGP(balance), 'font-mono-main text-lg font-black tracking-tight block mt-1.5')}
                    {key === 'mustaqbal' && (goldValue > 0 || thndrValue > 0) && (
                      <div className="font-mono-main text-[10px] mt-3 space-y-1 text-ink/40">
                        <p className="flex justify-between gap-3"><span>Cash</span>{masked(formatEGP(buckets.mustaqbal || 0), '', 'end')}</p>
                        <p className="flex justify-between gap-3"><span>Gold</span>{masked(formatEGP(goldValue), '', 'end')}</p>
                        <p className="flex justify-between gap-3"><span>Thndr</span>{masked(formatEGP(thndrValue), '', 'end')}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Free money is yours, kept in a bank on purpose — only a shortfall needs sorting out */}
          <div className={`flex items-center justify-between gap-4 px-8 py-5 border-t border-ink/12`}>
            <p className="font-mono-main text-[11px] text-ink/60">
              {free >= 0 ? 'Free — in the banks, in no bucket' : 'The buckets hold more than the banks do'}
            </p>
            <div className="flex items-center gap-4">
              {masked(formatEGP(Math.abs(free)), 'font-mono-main text-sm font-black', 'end')}
              {Math.abs(free) >= 1 && (
                <ActionButton onClick={() => onSplit('assign')}>{free > 0 ? 'Assign' : 'Sort out'}</ActionButton>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* In the margin: what's coming up, and what you owe */}
      <div className="order-4 lg:col-start-3 lg:row-start-1">
        <Glance title="Up next" to="subscriptions" onOpen={onOpenTab}>
          {upNext.length === 0 ? (
            <p className="font-mono-main text-xs text-ink/25">No Payit yet.</p>
          ) : (
            <ul className="space-y-5">
              {upNext.map(({ sub, daysLeft }) => (
                <li key={sub.id} className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-sans-main text-sm font-black truncate">{sub.name}</p>
                    <p className="font-mono-main text-[10px] font-bold mt-0.5" style={{ color: daysLeft <= 5 ? 'var(--rust)' : 'var(--ink)', opacity: daysLeft <= 5 ? 1 : 0.35 }}>
                      {countdownLabel(daysLeft)}
                    </p>
                  </div>
                  <span className="font-mono-main text-sm font-black shrink-0">{formatEGP(sub.cost)}</span>
                </li>
              ))}
            </ul>
          )}
        </Glance>
      </div>

      {iOwe.length > 0 && (
        <div className="order-5 lg:col-start-3 lg:row-start-2">
          <Glance title="I owe" to="debts" onOpen={onOpenTab}>
            <ul className="space-y-5">
              {iOwe.slice(0, 3).map((debt) => (
                <li key={debt.id} className="flex items-baseline justify-between gap-3">
                  <p className="font-sans-main text-sm font-black truncate">{debt.personName}</p>
                  {masked(formatEGP(debt.amount), 'font-mono-main text-sm font-black shrink-0', 'end')}
                </li>
              ))}
            </ul>
            {iOwe.length > 3 && (
              <p className="font-mono-main text-[10px] mt-4 text-ink/40">+{iOwe.length - 3} more</p>
            )}
          </Glance>
        </div>
      )}
    </div>
  );
};
