import React, { useEffect, useState } from 'react';
import { AppModal } from '@/ui/AppModal';
import { formatEGP } from '@/domain/finance/money';
import { moveError, type MoneyMove } from '@/domain/finance/moves';
import { BUCKET_ORDER } from '@/domain/finance/split';
import { THNDR_PARTS, thndrPartLabel } from '@/domain/finance/thndr';
import type { FinanceBanks, FinanceBuckets, ThndrFlow, ThndrPart, ThndrParts } from '@/domain/finance/types';
import { BANK_KEYS, BANK_LABELS, BUCKET_META } from '@/features/finance/components/visuals';
import { AmountInput, ChoiceGrid, Field, ModalForm, Segmented, TextInput, type Choice } from '@/features/finance/components/forms';

type BucketChoice = keyof FinanceBuckets | 'none';
type Source = 'bank' | 'manual';

/** What the form hands back: the flow to record, and — when the money is to move in the app — the bank movement that goes with it. */
export interface ThndrMoneyDraft {
  flow: Omit<ThndrFlow, 'id' | 'timestamp'>;
  move: MoneyMove | null;
}

/**
 * Money going into Thndr from a bank (or coming back out of it), or moving between Thndr's own parts
 * (wallet → funds, say). It is recorded as a flow — not as a change in the portfolio's value — so it
 * never counts as a gain. The bank side is optional: either the app moves the money out of the bank
 * for you, or you've already adjusted the bank by hand and only the Thndr side is recorded.
 */
export const ThndrMoneyModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  banks: FinanceBanks;
  buckets: FinanceBuckets;
  /** What each part of the portfolio holds now — a withdrawal can't exceed it. */
  parts: ThndrParts | null;
  /** The portfolio's total now. */
  value: number;
  onConfirm: (draft: ThndrMoneyDraft) => Promise<void>;
}> = ({ isOpen, onClose, banks, buckets, parts, value, onConfirm }) => {
  const [type, setType] = useState<ThndrFlow['type']>('deposit');
  const [amount, setAmount] = useState('');
  const [part, setPart] = useState<ThndrPart>('wallet');
  const [from, setFrom] = useState<ThndrPart>('wallet');
  const [source, setSource] = useState<Source>('bank');
  const [bank, setBank] = useState<keyof FinanceBanks | null>(null);
  // Thndr is part of the Future fund, so by default the money comes out of Future's cash and the fund's total stays put.
  const [bucket, setBucket] = useState<BucketChoice>('mustaqbal');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setType('deposit');
    setAmount('');
    setPart('wallet');
    setFrom('wallet');
    setSource('bank');
    setBank(null);
    setBucket('mustaqbal');
    setNote('');
  }, [isOpen]);

  const value_ = parseFloat(amount);
  const depositing = type === 'deposit';
  const transferring = type === 'transfer';
  // Putting money into Thndr takes it out of the bank; taking it out of Thndr puts it back in. Moving between parts touches no bank.
  const move: MoneyMove | null = !transferring && source === 'bank' && bank && Number.isFinite(value_) && value_ > 0
    ? { type: depositing ? 'withdraw' : 'deposit', amount: value_, bank, bucket: bucket === 'none' ? null : bucket, category: 'Thndr' }
    : null;

  let error: string | null = null;
  if (!Number.isFinite(value_) || value_ <= 0) error = 'Enter an amount';
  else if (transferring && from === part) error = 'Pick two different parts';
  else if (transferring && (parts ? value_ > parts[from] : value_ > value)) error = `More than ${thndrPartLabel(from)} holds`;
  else if (type === 'withdraw' && parts && value_ > parts[part]) error = `More than ${thndrPartLabel(part)} holds`;
  else if (type === 'withdraw' && !parts && value_ > value) error = 'More than Thndr holds';
  else if (!transferring && source === 'bank' && !bank) error = 'Pick a bank';
  else if (move) error = moveError(move, banks, buckets);

  const partOptions: Choice<ThndrPart>[] = THNDR_PARTS.map(({ key, label }) => ({ value: key, label: key === 'wallet' ? 'Wallet (cash)' : label, sub: parts ? formatEGP(parts[key]) : undefined }));
  const bankOptions: Choice<keyof FinanceBanks>[] = BANK_KEYS.map((key) => ({ value: key, label: BANK_LABELS[key], sub: formatEGP(banks[key] || 0) }));
  const bucketOptions: Choice<BucketChoice>[] = [
    { value: 'none', label: 'No bucket' },
    ...BUCKET_ORDER.map((key) => ({ value: key, label: BUCKET_META[key].en, sub: formatEGP(buckets[key] || 0) })),
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (error || saving) return;
    setSaving(true);
    try {
      await onConfirm({ flow: { type, amount: value_, part, ...(transferring ? { from } : {}), ...(note.trim() ? { note: note.trim() } : {}) }, move });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal isOpen={isOpen} onClose={onClose} title="Money in / out" raw maxWidth="max-w-sm">
      <ModalForm
        onSubmit={submit}
        scrollable
        tone={type === 'withdraw' ? 'danger' : 'primary'}
        disabled={!!error || saving}
        submitLabel={error ?? (transferring ? `Move to ${thndrPartLabel(part)}` : depositing ? 'Add to Thndr' : 'Take out of Thndr')}
      >
        <Segmented
          options={[{ value: 'deposit', label: 'Add' }, { value: 'withdraw', label: 'Take out' }, { value: 'transfer', label: 'Move' }]}
          value={type}
          onChange={setType}
        />
        <Field label="Amount"><AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
        {transferring && (
          <Field label="Moves out of" hint="Money stays in Thndr — the total and what you've invested don't change.">
            <ChoiceGrid options={partOptions} value={from} onChange={setFrom} />
          </Field>
        )}
        <Field label={transferring ? 'Moves into' : depositing ? 'Goes into' : 'Comes out of'}>
          <ChoiceGrid options={partOptions} value={part} onChange={setPart} />
        </Field>
        {!transferring && (
          <Field
            label={depositing ? 'Where it comes from' : 'Where it goes'}
            hint={source === 'manual' ? "Only Thndr is recorded — your bank balance is left exactly as you've set it." : undefined}
          >
            <Segmented
              options={[{ value: 'bank', label: depositing ? 'Take from a bank' : 'Put in a bank' }, { value: 'manual', label: "I've adjusted it" }]}
              value={source}
              onChange={setSource}
            />
          </Field>
        )}
        {!transferring && source === 'bank' && (
          <>
            <Field label="Bank account"><ChoiceGrid options={bankOptions} value={bank} onChange={setBank} /></Field>
            <Field
              label="Bucket"
              optional
              hint={bucket === 'mustaqbal' ? "Future's cash moves into Thndr, so the Future fund's total stays the same." : undefined}
            >
              <ChoiceGrid options={bucketOptions} value={bucket} onChange={setBucket} />
            </Field>
          </>
        )}
        <Field label="Note" optional>
          <TextInput type="text" placeholder="e.g. new fund" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </ModalForm>
    </AppModal>
  );
};
