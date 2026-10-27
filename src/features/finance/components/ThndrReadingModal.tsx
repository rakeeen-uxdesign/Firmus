import React, { useEffect, useState } from 'react';
import { AppModal } from '@/ui/AppModal';
import { formatEGP } from '@/domain/finance/money';
import { THNDR_PARTS, thndrPartsTotal } from '@/domain/finance/thndr';
import type { ThndrEntry, ThndrPart, ThndrParts } from '@/domain/finance/types';
import { Field, ModalForm, TextInput } from '@/features/finance/components/forms';

type Amounts = Record<ThndrPart, string>;

const BLANK: Amounts = { clouds: '', gold: '', funds: '', wallet: '' };

/** What each field shows when the form opens. A reading saved before the wallet existed has no wallet figure: that's 0, not a blank to fill in. */
const amountsOf = (reading: ThndrEntry | null): Amounts =>
  reading?.parts
    ? (Object.fromEntries(THNDR_PARTS.map(({ key }) => [key, String(reading.parts![key] ?? 0)])) as Amounts)
    : BLANK;

const toNumbers = (amounts: Amounts): ThndrParts =>
  Object.fromEntries(THNDR_PARTS.map(({ key }) => [key, parseFloat(amounts[key]) || 0])) as ThndrParts;

/**
 * What Thndr shows right now, typed in by hand: what each part is worth, and the form adds them up.
 * Add and edit share it — pass `initial` to edit. A new reading is stamped with the time it's saved.
 */
export const ThndrReadingModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initial: ThndrEntry | null;
  /** The split as it stands now, shown as a hint beside each field. */
  lastParts: ThndrParts | null;
  onSave: (entry: ThndrEntry) => void;
}> = ({ isOpen, onClose, initial, lastParts, onSave }) => {
  const [amounts, setAmounts] = useState<Amounts>(BLANK);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setAmounts(amountsOf(initial));
    setNote(initial?.note ?? '');
  }, [isOpen, initial]);

  const parts = toNumbers(amounts);
  const total = thndrPartsTotal(parts);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (THNDR_PARTS.some(({ key }) => parts[key] < 0)) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      value: total,
      parts,
      timestamp: initial?.timestamp ?? new Date().toISOString(),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    onClose();
  };

  const hintFor = (part: ThndrPart) =>
    part === 'wallet' ? 'Cash sitting in Thndr, not invested yet' : !initial && lastParts ? `Last: ${formatEGP(lastParts[part])}` : undefined;

  return (
    <AppModal isOpen={isOpen} onClose={onClose} title={initial ? 'Edit Reading' : 'Update Thndr'} raw maxWidth="max-w-sm">
      <ModalForm onSubmit={submit} submitLabel={initial ? 'Save Changes' : 'Save Reading'} disabled={total <= 0}>
        {THNDR_PARTS.map(({ key, label }, index) => (
          <Field key={key} label={`${label} — EGP`} hint={hintFor(key)}>
            <TextInput
              look="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={amounts[key]}
              onChange={(event) => setAmounts((current) => ({ ...current, [key]: event.target.value }))}
              autoFocus={index === 0}
            />
          </Field>
        ))}
        <div className="flex items-baseline justify-between border-t border-ink/12 pt-4">
          <span className="font-mono-main text-[10px] uppercase tracking-[0.25em] text-ink/40">Total</span>
          <span className="font-mono-main text-xl font-black">{formatEGP(total)}</span>
        </div>
        <Field label="Note" optional>
          <TextInput type="text" placeholder="e.g. after buying a fund" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </ModalForm>
    </AppModal>
  );
};
