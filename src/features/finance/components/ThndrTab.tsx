import React, { useEffect, useState } from 'react';
import { AppModal } from '@/ui/AppModal';
import { IconPencil as Pencil, IconTrash2 as Trash2 } from '@/ui/icons';
import { formatEGP } from '@/domain/finance/money';
import { removeById, upsertById } from '@/domain/finance/collections';
import {
  THNDR_PARTS, latestThndrParts, latestThndrValue, thndrPartsTotal, thndrRows, thndrShares, thndrSinceStart,
  type ThndrDelta,
} from '@/domain/finance/thndr';
import type { ThndrEntry, ThndrPart, ThndrParts } from '@/domain/finance/types';
import { Field, ModalForm, TextInput } from '@/features/finance/components/forms';
import { EmptyState, ListCard, ListRow } from '@/features/finance/components/lists';
import { ActionButton } from '@/features/finance/components/ActionButton';
import { captionLabel } from '@/features/finance/components/labels';

/** The one accent Thndr gets — the same amber the Pomodoro ring uses for overtime, so it still
 *  reads as "electric" without stepping outside the app's own palette or its dark/light swap. */
const ACCENT = 'var(--pomo-overtime)';

const stamp = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${formatEGP(Math.abs(n))}`;
const percentLabel = (p: number | null) => (p === null ? '' : ` (${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%)`);

/** ▲ in forest / ▼ in rust, with the amount and percent; a dim dash when there's nothing to compare. */
const DeltaText: React.FC<{ delta: ThndrDelta | null }> = ({ delta }) => {
  if (!delta) return <span className="text-ink/25">——</span>;
  const up = delta.amount >= 0;
  return (
    <span style={{ color: up ? 'var(--forest)' : 'var(--rust)' }}>
      {up ? '▲' : '▼'} {signed(delta.amount)}{percentLabel(delta.percent)}
    </span>
  );
};

/** Add and edit share one form: pass `initial` to edit. The total is the sum of the parts; a new reading is stamped with the time it's saved. */
const ThndrModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initial: ThndrEntry | null;
  lastParts: ThndrParts | null;
  onSave: (entry: ThndrEntry) => void;
}> = ({ isOpen, onClose, initial, lastParts, onSave }) => {
  const [parts, setParts] = useState<Record<ThndrPart, string>>({ clouds: '', gold: '', funds: '' });
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const source = initial?.parts;
    setParts({
      clouds: source ? String(source.clouds) : '',
      gold: source ? String(source.gold) : '',
      funds: source ? String(source.funds) : '',
    });
    setNote(initial?.note ?? '');
  }, [isOpen, initial]);

  const numbers: ThndrParts = {
    clouds: parseFloat(parts.clouds) || 0,
    gold: parseFloat(parts.gold) || 0,
    funds: parseFloat(parts.funds) || 0,
  };
  const total = thndrPartsTotal(numbers);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (THNDR_PARTS.some(({ key }) => numbers[key] < 0)) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      value: total,
      parts: numbers,
      timestamp: initial?.timestamp ?? new Date().toISOString(),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    onClose();
  };

  return (
    <AppModal isOpen={isOpen} onClose={onClose} title={initial ? 'Edit Reading' : 'Update Thndr'} raw maxWidth="max-w-sm">
      <ModalForm onSubmit={submit} submitLabel={initial ? 'Save Changes' : 'Save Reading'} disabled={total <= 0}>
        {THNDR_PARTS.map(({ key, label }, i) => (
          <Field key={key} label={`${label} — EGP`} hint={!initial && lastParts ? `Last: ${formatEGP(lastParts[key])}` : undefined}>
            <TextInput look="amount" type="number" step="0.01" min="0" placeholder="0" value={parts[key]} onChange={(e) => setParts((p) => ({ ...p, [key]: e.target.value }))} autoFocus={i === 0} />
          </Field>
        ))}
        <div className="flex items-baseline justify-between border-t border-ink/12 pt-4">
          <span className="font-mono-main text-[10px] uppercase tracking-[0.25em] text-ink/40">Total</span>
          <span className="font-mono-main text-xl font-black">{formatEGP(total)}</span>
        </div>
        <Field label="Note" optional>
          <TextInput type="text" placeholder="e.g. after buying a fund" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </ModalForm>
    </AppModal>
  );
};

/**
 * Thndr has no API, so its value is a log of readings typed in by hand, split into clouds, gold
 * and funds — same card system as the rest of Finance (Gold, Debts, …), with one accent colour
 * and a couple of terminal-ish touches (">" captions, THNDR.EXE) as the only nod to where this
 * screen started.
 */
export const ThndrTab: React.FC<{
  entries: ThndrEntry[];
  setEntries: (next: ThndrEntry[]) => Promise<void>;
}> = ({ entries, setEntries }) => {
  const [modal, setModal] = useState<{ open: boolean; entry: ThndrEntry | null }>({ open: false, entry: null });

  const rows = thndrRows(entries);
  const latest = latestThndrValue(entries);
  const latestParts = latestThndrParts(entries);
  const shares = latestParts ? thndrShares(latestParts) : null;
  const sinceLast = rows[0]?.delta ?? null;
  const sinceStart = thndrSinceStart(entries);

  return (
    <div className="space-y-6">
      {/* Portfolio value + how it moved, beside the split — same two-panel shape as Gold */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="thndr-scan brutalist-card no-lift bg-paper-dark p-6 md:col-span-2 flex flex-col justify-between gap-6">
          <div className="flex items-center justify-between">
            <p className={captionLabel}>Thndr.exe — portfolio value<span className="thndr-cursor ml-0.5" style={{ color: ACCENT }}>_</span></p>
            <p className="font-mono-main text-[9px] uppercase tracking-[0.2em] text-ink/25">{entries.length} {entries.length === 1 ? 'reading' : 'readings'}</p>
          </div>
          <div>
            <p className="font-mono-main text-4xl font-black" style={{ color: entries.length ? ACCENT : undefined }}>
              {entries.length === 0 ? <span className="text-ink/25">—</span> : formatEGP(latest)}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className={`${captionLabel} mb-1`}>Since previous</p>
              <p className="font-mono-main text-[13px]"><DeltaText delta={sinceLast} /></p>
            </div>
            <div>
              <p className={`${captionLabel} mb-1`}>Since first reading</p>
              <p className="font-mono-main text-[13px]"><DeltaText delta={sinceStart} /></p>
            </div>
          </div>
        </div>

        <div className="brutalist-card no-lift bg-paper-dark p-6">
          <p className={`${captionLabel} mb-4`}>Split</p>
          {shares && latestParts ? (
            <div className="space-y-3">
              {THNDR_PARTS.map(({ key, label }) => (
                <div key={key} className="flex justify-between items-baseline gap-3">
                  <span className="font-mono-main text-xs font-bold text-ink/40">{label} <span className="text-ink/25">{shares[key].toFixed(0)}%</span></span>
                  <span className="font-mono-main text-sm font-bold">{formatEGP(latestParts[key])}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-mono-main text-xs text-ink/25">No split recorded yet.</p>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <p className={captionLabel}>Readings</p>
        <ActionButton tone="solid" onClick={() => setModal({ open: true, entry: null })}>Update value</ActionButton>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No readings yet — press "Update value" to add the first.</EmptyState>
      ) : (
        <ListCard>
          {rows.map(({ entry, delta, partDeltas }, i) => (
            <ListRow key={entry.id} first={i === 0}>
              <div className="flex-1 min-w-0">
                <p className="font-mono-main text-[11px] text-ink/40">› {stamp(entry.timestamp)}</p>
                {entry.note && <p className="font-mono-main italic text-[11px] mt-1 text-ink/40">"{entry.note}"</p>}
                {entry.parts && (
                  <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[10px] font-mono-main">
                    {THNDR_PARTS.map(({ key, label }) => (
                      <span key={key} className="text-ink/40">
                        <span className="uppercase">{label} </span>
                        <span className="text-ink/60">{formatEGP(entry.parts![key])}</span>
                        {partDeltas && partDeltas[key].amount !== 0 && (
                          <span style={{ color: partDeltas[key].amount > 0 ? 'var(--forest)' : 'var(--rust)' }}> {partDeltas[key].amount > 0 ? '▲' : '▼'}{formatEGP(Math.abs(partDeltas[key].amount))}</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono-main font-black text-xl">{formatEGP(entry.value)}</p>
                <p className="font-mono-main text-[11px] mt-1"><DeltaText delta={delta} /></p>
              </div>
              <div className="flex items-center gap-3 w-12 justify-end opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => setModal({ open: true, entry })} aria-label="Edit" className="text-ink/25 hover:text-ink transition-colors cursor-pointer"><Pencil size={13} /></button>
                <button onClick={() => setEntries(removeById(entries, entry.id))} aria-label="Delete" className="text-ink/25 hover:text-rust transition-colors cursor-pointer"><Trash2 size={13} /></button>
              </div>
            </ListRow>
          ))}
        </ListCard>
      )}

      <ThndrModal
        isOpen={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        initial={modal.entry}
        lastParts={latestParts}
        onSave={(entry) => setEntries(upsertById(entries, entry))}
      />
    </div>
  );
};
