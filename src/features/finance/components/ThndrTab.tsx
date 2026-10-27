import React, { useEffect, useState } from 'react';
import { AppModal } from '@/ui/AppModal';
import { IconPencil as Pencil, IconTrash2 as Trash2 } from '@/ui/icons';
import { formatEGP } from '@/domain/finance/money';
import { removeById, upsertById } from '@/domain/finance/collections';
import {
  THNDR_PARTS, currentThndrParts, currentThndrValue, thndrPartsTotal, thndrPerformance, thndrShares, thndrTimeline,
  type ThndrDelta,
} from '@/domain/finance/thndr';
import type { ThndrEntry, ThndrFlow, ThndrPart, ThndrParts } from '@/domain/finance/types';
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
 * and funds — plus the money moved in and out, kept apart so a deposit never counts as a gain.
 * Same card system as the rest of Finance (Gold, Debts, …), with one accent colour and a couple
 * of terminal-ish touches (">" captions, THNDR.EXE) as the only nod to where this screen started.
 */
export const ThndrTab: React.FC<{
  entries: ThndrEntry[];
  setEntries: (next: ThndrEntry[]) => Promise<void>;
  flows: ThndrFlow[];
  setFlows: (next: ThndrFlow[]) => Promise<void>;
  /** Opens the money in / out form, which lives in Finance because it can move a bank balance too. */
  onAddMoney: () => void;
}> = ({ entries, setEntries, flows, setFlows, onAddMoney }) => {
  const [modal, setModal] = useState<{ open: boolean; entry: ThndrEntry | null }>({ open: false, entry: null });

  const timeline = thndrTimeline(entries, flows);
  const current = currentThndrValue(entries, flows);
  const parts = currentThndrParts(entries, flows);
  const shares = parts ? thndrShares(parts) : null;
  const performance = thndrPerformance(entries, flows);
  const hasAnything = entries.length > 0 || flows.length > 0;

  return (
    <div className="space-y-6">
      {/* Portfolio value + what's been put in and what it has earned, beside the split — same two-panel shape as Gold */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="thndr-scan brutalist-card no-lift bg-paper-dark p-6 md:col-span-2 flex flex-col justify-between gap-6">
          <div className="flex items-center justify-between">
            <p className={captionLabel}>Thndr.exe — portfolio value<span className="thndr-cursor ml-0.5" style={{ color: ACCENT }}>_</span></p>
            <p className="font-mono-main text-[9px] uppercase tracking-[0.2em] text-ink/25">
              {entries.length} {entries.length === 1 ? 'reading' : 'readings'} · {flows.length} {flows.length === 1 ? 'move' : 'moves'}
            </p>
          </div>
          <div>
            <p className="font-mono-main text-4xl font-black" style={{ color: hasAnything ? ACCENT : undefined }}>
              {hasAnything ? formatEGP(current) : <span className="text-ink/25">—</span>}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className={`${captionLabel} mb-1`}>Invested</p>
              <p className="font-mono-main text-[13px]">{performance ? formatEGP(performance.invested) : <span className="text-ink/25">——</span>}</p>
            </div>
            <div>
              <p className={`${captionLabel} mb-1`}>Gain</p>
              <p className="font-mono-main text-[13px]"><DeltaText delta={performance?.gain ?? null} /></p>
            </div>
          </div>
        </div>

        <div className="brutalist-card no-lift bg-paper-dark p-6">
          <p className={`${captionLabel} mb-4`}>Split</p>
          {shares && parts ? (
            <div className="space-y-3">
              {THNDR_PARTS.map(({ key, label }) => (
                <div key={key} className="flex justify-between items-baseline gap-3">
                  <span className="font-mono-main text-xs font-bold text-ink/40">{label} <span className="text-ink/25">{shares[key].toFixed(0)}%</span></span>
                  <span className="font-mono-main text-sm font-bold">{formatEGP(parts[key])}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-mono-main text-xs text-ink/25">No split recorded yet.</p>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <p className={captionLabel}>Records</p>
        <div className="flex items-center gap-4">
          <ActionButton onClick={onAddMoney}>Money in / out</ActionButton>
          <ActionButton tone="solid" onClick={() => setModal({ open: true, entry: null })}>Update value</ActionButton>
        </div>
      </div>

      {timeline.length === 0 ? (
        <EmptyState>Nothing yet — "Update value" records what Thndr shows; "Money in / out" records money you moved.</EmptyState>
      ) : (
        <ListCard>
          {timeline.map((row, i) => row.kind === 'flow' ? (
            <ListRow key={row.flow.id} first={i === 0}>
              <div className="flex-1 min-w-0">
                <p className="font-mono-main text-[11px] text-ink/40">› {stamp(row.flow.timestamp)}</p>
                {row.flow.note && <p className="font-mono-main italic text-[11px] mt-1 text-ink/40">"{row.flow.note}"</p>}
                <p className="font-mono-main text-[10px] mt-2 uppercase text-ink/40">
                  {row.flow.type === 'deposit' ? 'Money added to' : 'Money taken out of'} {THNDR_PARTS.find((p) => p.key === row.flow.part)!.label}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono-main font-black text-xl" style={{ color: row.flow.type === 'deposit' ? ACCENT : 'var(--rust)' }}>
                  {row.flow.type === 'deposit' ? '+' : '−'}{formatEGP(row.flow.amount)}
                </p>
              </div>
              <div className="flex items-center gap-3 w-12 justify-end opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => setFlows(flows.filter((f) => f.id !== row.flow.id))}
                  aria-label="Delete"
                  title="Removes the record only — your bank balance isn't changed"
                  className="text-ink/25 hover:text-rust transition-colors cursor-pointer"
                ><Trash2 size={13} /></button>
              </div>
            </ListRow>
          ) : (
            <ListRow key={row.entry.id} first={i === 0}>
              <div className="flex-1 min-w-0">
                <p className="font-mono-main text-[11px] text-ink/40">› {stamp(row.entry.timestamp)}</p>
                {row.entry.note && <p className="font-mono-main italic text-[11px] mt-1 text-ink/40">"{row.entry.note}"</p>}
                {row.entry.parts && (
                  <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[10px] font-mono-main">
                    {THNDR_PARTS.map(({ key, label }) => (
                      <span key={key} className="text-ink/40">
                        <span className="uppercase">{label} </span>
                        <span className="text-ink/60">{formatEGP(row.entry.parts![key])}</span>
                        {row.partDeltas && row.partDeltas[key].amount !== 0 && (
                          <span style={{ color: row.partDeltas[key].amount > 0 ? 'var(--forest)' : 'var(--rust)' }}> {row.partDeltas[key].amount > 0 ? '▲' : '▼'}{formatEGP(Math.abs(row.partDeltas[key].amount))}</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono-main font-black text-xl">{formatEGP(row.entry.value)}</p>
                <p className="font-mono-main text-[11px] mt-1">
                  {row.contributed !== 0 ? (
                    <>
                      <span className="text-ink/40">{signed(row.contributed)} {row.contributed > 0 ? 'added' : 'taken out'} · market </span>
                      <DeltaText delta={row.market} />
                    </>
                  ) : (
                    <DeltaText delta={row.delta} />
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3 w-12 justify-end opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => setModal({ open: true, entry: row.entry })} aria-label="Edit" className="text-ink/25 hover:text-ink transition-colors cursor-pointer"><Pencil size={13} /></button>
                <button onClick={() => setEntries(removeById(entries, row.entry.id))} aria-label="Delete" className="text-ink/25 hover:text-rust transition-colors cursor-pointer"><Trash2 size={13} /></button>
              </div>
            </ListRow>
          ))}
        </ListCard>
      )}

      <ThndrModal
        isOpen={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        initial={modal.entry}
        lastParts={parts}
        onSave={(entry) => setEntries(upsertById(entries, entry))}
      />
    </div>
  );
};
