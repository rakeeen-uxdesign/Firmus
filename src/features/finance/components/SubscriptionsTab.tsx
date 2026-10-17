import React, { useEffect, useState } from 'react';
import { FilterSelect } from '@/ui/FilterSelect';
import { AppModal } from '@/ui/AppModal';
import { formatEGP } from '@/domain/finance/money';
import { removeById, upsertById } from '@/domain/finance/collections';
import { shareAfterSubscriptions, subMatchesFilter, type SubFilter } from '@/domain/finance/subscriptions';
import { MONTHLY_SALARY_EGP } from '@/domain/finance/defaults';
import { countdownLabel, upcomingRenewals } from '@/domain/finance/insights';
import type { FinanceBanks, Subscription } from '@/domain/finance/types';
import { BANK_KEYS, BANK_LABELS, MaskedValue } from '@/features/finance/components/visuals';
import { ChoiceGrid, Field, ModalForm, TextInput } from '@/features/finance/components/forms';
import { EmptyState, RowActions } from '@/features/finance/components/lists';
import { ActionButton } from '@/features/finance/components/ActionButton';
import { captionLabel } from '@/features/finance/components/labels';

type BankKey = keyof FinanceBanks;
const bankKeyOf = (name: string): BankKey => BANK_KEYS.find((k) => BANK_LABELS[k] === name) ?? 'cib';

const SUB_FILTERS: Array<{ value: SubFilter; label: string }> = [
  { value: 'day', label: 'Due today' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

const CYCLES = [1, 2, 3, 12] as const;
const cycleName = (interval: number) => (interval === 1 ? 'Monthly' : interval === 12 ? 'Yearly' : `Every ${interval}m`);

const SubscriptionModal: React.FC<{ isOpen: boolean; onClose: () => void; initial: Subscription | null; onSave: (sub: Subscription) => void }> = ({ isOpen, onClose, initial, onSave }) => {
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [day, setDay] = useState('');
  const [time, setTime] = useState('09:00');
  const [bank, setBank] = useState<BankKey>('cib');
  const [cycle, setCycle] = useState(1);

  useEffect(() => {
    if (!isOpen) return;
    setName(initial?.name ?? '');
    setCost(initial ? String(initial.cost) : '');
    setDay(initial ? String(initial.renewalDay) : '');
    setTime(initial?.reminderTime || '09:00');
    setBank(initial ? bankKeyOf(initial.bank) : 'cib');
    setCycle(initial?.intervalMonths ?? 1);
  }, [isOpen, initial]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !cost || !day) return;
    onSave({
      ...initial,
      id: initial?.id ?? `${Date.now()}`,
      name: name.trim(),
      cost: parseFloat(cost),
      renewalDay: parseInt(day),
      reminderTime: time || '09:00',
      bank: BANK_LABELS[bank],
      intervalMonths: cycle,
      startDate: initial?.startDate ?? new Date().toISOString().slice(0, 10),
    });
    onClose();
  };

  return (
    <AppModal isOpen={isOpen} onClose={onClose} title={initial ? 'Edit Subscription' : 'Add Subscription'} raw maxWidth="max-w-sm">
      <ModalForm onSubmit={submit} submitLabel={initial ? 'Save Changes' : 'Add Subscription'}>
        <Field label="Name">
          <TextInput type="text" placeholder="e.g. Netflix, Spotify" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Cost — EGP">
          <TextInput look="amount" type="number" step="0.01" placeholder="e.g. 250" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Renewal day">
            <TextInput type="number" min="1" max="31" placeholder="e.g. 15" value={day} onChange={(e) => setDay(e.target.value)} required />
          </Field>
          <Field label="Reminder time">
            <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
        </div>
        <Field label="Billing cycle">
          <ChoiceGrid columns={4} options={CYCLES.map((iv) => ({ value: iv, label: iv === 1 ? 'Monthly' : iv === 12 ? 'Yearly' : `${iv}m` }))} value={cycle} onChange={setCycle} />
        </Field>
        <Field label="Payment account">
          <ChoiceGrid options={BANK_KEYS.map((k) => ({ value: k, label: BANK_LABELS[k] }))} value={bank} onChange={setBank} />
        </Field>
      </ModalForm>
    </AppModal>
  );
};

export const SubscriptionsTab: React.FC<{
  subscriptions: Subscription[];
  setSubscriptions: (next: Subscription[]) => Promise<void>;
  privacyMode: boolean;
}> = ({ subscriptions, setSubscriptions, privacyMode }) => {
  // Land on "day" if anything renews today, otherwise "month".
  const [filter, setFilter] = useState<SubFilter>(() =>
    subscriptions.some((sub) => subMatchesFilter(sub, 'day')) ? 'day' : 'month',
  );
  const [modal, setModal] = useState<{ open: boolean; sub: Subscription | null }>({ open: false, sub: null });
  const now = new Date();

  const inWindow = subscriptions.filter((sub) => subMatchesFilter(sub, filter, now));
  const rows = upcomingRenewals(inWindow, now);
  const total = inWindow.reduce((s, sub) => s + sub.cost, 0);
  const totalLabel = filter === 'day' ? "Today's due" : filter === 'month' ? 'Monthly' : 'Yearly';
  const countLabel = filter === 'day'
    ? `${inWindow.length} due today`
    : `${inWindow.length} ${filter === 'month' ? 'monthly' : 'yearly'} of ${subscriptions.length}`;

  const share = shareAfterSubscriptions(MONTHLY_SALARY_EGP, subscriptions);

  const save = (sub: Subscription) => setSubscriptions(upsertById(subscriptions, sub));

  return (
    <div className="space-y-6">
      {subscriptions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="brutalist-card no-lift bg-paper-dark p-6 flex items-baseline justify-between">
            <div>
              <p className={`${captionLabel} mb-1`}>{totalLabel}</p>
              <p className="font-mono-main text-3xl font-black">
                <MaskedValue disabled={!privacyMode}>{formatEGP(total)}</MaskedValue>
              </p>
            </div>
            <p className="font-mono-main text-xs text-ink/25">{countLabel}</p>
          </div>

          <div className="brutalist-card no-lift bg-paper-dark p-6 flex items-baseline justify-between">
            <div>
              <p className={`${captionLabel} mb-1`}>Hamed's Share</p>
              <p className="font-mono-main text-3xl font-black" style={share < 0 ? { color: 'var(--rust)' } : undefined}>
                <MaskedValue disabled={!privacyMode}>{formatEGP(share)}</MaskedValue>
              </p>
            </div>
            <p className="font-mono-main text-xs text-ink/25">{formatEGP(MONTHLY_SALARY_EGP)} − subs / mo</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <FilterSelect label="Showing" value={filter} onChange={setFilter} options={SUB_FILTERS} />
        <ActionButton onClick={() => setModal({ open: true, sub: null })}>Add</ActionButton>
      </div>

      {subscriptions.length === 0 ? (
        <EmptyState>No subscriptions added yet.</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>{filter === 'day' ? 'Nothing renews today.' : `No ${filter === 'month' ? 'monthly' : 'yearly'} subscriptions.`}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {rows.map(({ sub, daysLeft }) => {
            const interval = sub.intervalMonths ?? 1;
            const soon = daysLeft <= 5;
            return (
              <div key={sub.id} className="brutalist-card no-lift flex items-center justify-between group relative bg-paper-dark px-7 py-5">
                <RowActions onEdit={() => setModal({ open: true, sub })} onRemove={() => setSubscriptions(removeById(subscriptions, sub.id))} />
                <div>
                  <p className="font-sans-main font-black text-ink text-base">{sub.name}</p>
                  <p className="font-mono-main text-ink/40 mt-1 text-[11px]">
                    {sub.bank} · Day {sub.renewalDay}{sub.reminderTime ? ` · ${sub.reminderTime}` : ''} · {cycleName(interval)}
                  </p>
                  <p className="font-mono-main font-bold mt-1 text-[11px]" style={{ color: soon ? 'var(--rust)' : 'var(--ink)', opacity: soon ? 1 : 0.35 }}>{countdownLabel(daysLeft)}</p>
                </div>
                <div className="text-right pr-8">
                  <p className="font-mono-main font-black text-xl">{formatEGP(sub.cost)}</p>
                  {interval > 1 && <p className="font-mono-main text-ink/25 mt-0.5 text-[10px]">≈ {formatEGP(Math.round(sub.cost / interval))} /mo</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SubscriptionModal isOpen={modal.open} onClose={() => setModal((m) => ({ ...m, open: false }))} initial={modal.sub} onSave={save} />
    </div>
  );
};
