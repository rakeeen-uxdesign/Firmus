import React, { useEffect, useState } from 'react';
import { AppModal } from '@/ui/AppModal';
import { formatEGP } from '@/domain/finance/money';
import { removeById, upsertById } from '@/domain/finance/collections';
import type { StoredGoldPrices } from '@/domain/finance/goldRefresh';
import { goldAssetValue, goldSummary, type GoldPrices } from '@/domain/finance/insights';
import type { GoldAsset } from '@/domain/finance/types';
import { AnimatedValue, MaskedValue } from '@/features/finance/components/visuals';
import { Field, ModalForm, Segmented, TextInput } from '@/features/finance/components/forms';
import { EmptyState, InlineActions, ListCard, ListRow } from '@/features/finance/components/lists';
import { ActionButton } from '@/features/finance/components/ActionButton';
import { captionLabel } from '@/features/finance/components/labels';

type Carat = 24 | 21;

/** When the prices were fetched, as "2026-10-28 06:10". */
const updatedAt = (epochMs: number) => {
  const d = new Date(epochMs);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
};

/** Add and edit share one form: pass `initial` to edit. */
const GoldModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initial: GoldAsset | null;
  prices: GoldPrices | null;
  onSave: (asset: GoldAsset) => void;
}> = ({ isOpen, onClose, initial, prices, onSave }) => {
  const [quantity, setQuantity] = useState('');
  const [carat, setCarat] = useState<Carat>(24);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setQuantity(initial ? String(initial.quantity) : '');
    setCarat(initial?.carat ?? 24);
    setPurchasePrice(initial?.purchasePrice ? String(initial.purchasePrice) : '');
    setNotes(initial?.notes ?? '');
  }, [isOpen, initial]);

  const spot = prices ? (carat === 24 ? prices.price24 : prices.price21) : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) return;
    // A new asset with no price typed is booked at today's spot.
    const price = purchasePrice ? parseFloat(purchasePrice) : initial ? undefined : spot;
    onSave({
      id: initial?.id ?? `${Date.now()}`,
      quantity: qty,
      carat,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(price !== undefined ? { purchasePrice: price } : {}),
    });
    onClose();
  };

  return (
    <AppModal isOpen={isOpen} onClose={onClose} title={initial ? 'Edit Gold' : 'Add Gold Asset'} raw maxWidth="max-w-sm">
      <ModalForm onSubmit={submit} submitLabel={initial ? 'Save Changes' : 'Add Asset'}>
        <Field label="Weight in grams">
          <TextInput look="amount" type="number" step="0.001" placeholder="e.g. 10.500" value={quantity} onChange={(e) => setQuantity(e.target.value)} required autoFocus />
        </Field>
        <Field label="Carat">
          <Segmented options={[{ value: 24, label: '24K' }, { value: 21, label: '21K' }]} value={carat} onChange={setCarat} />
        </Field>
        <Field
          label="Purchase price / gram — EGP"
          optional
          hint={!initial && spot && !purchasePrice ? `Auto-saves spot price (${formatEGP(spot)} / g)` : undefined}
        >
          <TextInput type="number" step="0.01" placeholder={spot ? `Current: ${spot}` : 'e.g. 3800'} value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
        </Field>
        <Field label="Notes / label" optional>
          <TextInput type="text" placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </ModalForm>
    </AppModal>
  );
};

export const GoldTab: React.FC<{
  gold: GoldAsset[];
  setGold: (next: GoldAsset[]) => Promise<void>;
  /** The spot prices and when they were fetched; null before the first fetch. */
  prices: StoredGoldPrices | null;
  privacyMode: boolean;
}> = ({ gold, setGold, prices, privacyMode }) => {
  const [modal, setModal] = useState<{ open: boolean; asset: GoldAsset | null }>({ open: false, asset: null });
  const summary = goldSummary(gold, prices);

  const save = (asset: GoldAsset) => setGold(upsertById(gold, asset));

  return (
    <div className="space-y-6">
      {/* Portfolio first; the spot price it's valued at beside it */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="brutalist-card no-lift bg-paper-dark p-6 md:col-span-2 flex flex-col justify-between gap-4">
          <p className={captionLabel}>Portfolio value</p>
          {prices ? (
            <div>
              <MaskedValue disabled={!privacyMode} className="font-mono-main text-4xl font-black text-ink">{formatEGP(summary.value)}</MaskedValue>
              <p className="font-mono-main text-[10px] text-ink/25 mt-2">{summary.weight.toFixed(2)}g total weight</p>
              {summary.pnl !== null && (
                <p className="font-mono-main text-[11px] font-bold mt-1" style={{ color: summary.pnl >= 0 ? 'var(--forest)' : '#C0392B' }}>
                  {summary.pnl >= 0 ? '▲ ' : '▼ '}
                  <MaskedValue disabled={!privacyMode}>{formatEGP(Math.abs(summary.pnl))}</MaskedValue>
                  {' '}{summary.pnl >= 0 ? 'profit' : 'loss'}
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="font-mono-main text-4xl font-black text-ink/25">—</p>
              <p className="font-mono-main text-[9px] text-ink/25 mt-1">Prices offline</p>
            </div>
          )}
        </div>

        <div className="brutalist-card no-lift bg-paper-dark p-6">
          <p className={`${captionLabel} mb-4`}>Spot / gram</p>
          {prices ? (
            <div className="space-y-3">
              {([['24K', prices.price24], ['21K', prices.price21]] as const).map(([k, value]) => (
                <div key={k} className="flex justify-between items-baseline">
                  <span className="font-mono-main text-xs font-bold text-ink/40">{k}</span>
                  <AnimatedValue value={value} className="font-mono-main text-xl font-black" />
                </div>
              ))}
              <p className="font-mono-main text-[9px] text-ink/25 pt-1">Updated {updatedAt(prices.fetchedAt)}</p>
            </div>
          ) : (
            <p className="font-mono-main text-xs text-ink/25">— not fetched yet</p>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <p className={captionLabel}>Assets</p>
        <ActionButton onClick={() => setModal({ open: true, asset: null })}>Add</ActionButton>
      </div>

      {gold.length === 0 ? (
        <EmptyState>No gold assets added yet.</EmptyState>
      ) : (
        <ListCard>
          {gold.map((g, i) => {
            const current = goldAssetValue(g, prices);
            const paid = g.purchasePrice ? g.purchasePrice * g.quantity : null;
            const pnl = paid !== null && prices ? current - paid : null;
            return (
              <ListRow key={g.id} first={i === 0}>
                <div className="flex-1 min-w-0">
                  <p className="font-mono-main font-black text-xl">
                    {g.quantity}g <span className="font-bold text-xs ml-1 text-ink/40">{g.carat}K</span>
                  </p>
                  {g.notes && <p className="font-mono-main italic text-[11px] mt-1 text-ink/40">{g.notes}</p>}
                </div>
                <div className="text-right">
                  <p className="font-mono-main font-black text-xl">{formatEGP(current)}</p>
                  {paid !== null && (
                    <p className="font-mono-main text-[11px] mt-1 text-ink/40">
                      Paid {formatEGP(paid)}
                      {pnl !== null && (
                        <span className="font-bold ml-2" style={{ color: pnl >= 0 ? 'var(--forest)' : '#C0392B' }}>{pnl >= 0 ? '+' : ''}{formatEGP(pnl)}</span>
                      )}
                    </p>
                  )}
                </div>
                <InlineActions onEdit={() => setModal({ open: true, asset: g })} onRemove={() => setGold(removeById(gold, g.id))} />
              </ListRow>
            );
          })}
        </ListCard>
      )}

      <GoldModal
        isOpen={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        initial={modal.asset}
        prices={prices}
        onSave={save}
      />
    </div>
  );
};
