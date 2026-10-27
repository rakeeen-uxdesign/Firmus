import React, { useState } from 'react';
import { IconTrash2 as Trash2 } from '@/ui/icons';
import { formatEGP, formatSignedEGP, formatSignedPercent } from '@/domain/finance/money';
import { removeById, upsertById } from '@/domain/finance/collections';
import {
  THNDR_PARTS, currentThndrParts, currentThndrValue, thndrPartLabel, thndrPerformance, thndrShares, thndrTimeline,
  type ThndrDelta, type ThndrTimelineRow,
} from '@/domain/finance/thndr';
import type { ThndrEntry, ThndrFlow } from '@/domain/finance/types';
import { ThndrReadingModal } from '@/features/finance/components/ThndrReadingModal';
import { EmptyState, InlineActions, ListCard, ListRow } from '@/features/finance/components/lists';
import { ActionButton } from '@/features/finance/components/ActionButton';
import { captionLabel } from '@/features/finance/components/labels';

/** The one accent Thndr gets — the same amber the Pomodoro ring uses for overtime, so it still
 *  reads as "electric" without stepping outside the app's own palette or its dark/light swap. */
const ACCENT = 'var(--pomo-overtime)';
const UP = 'var(--forest)';
const DOWN = 'var(--rust)';

const two = (n: number) => String(n).padStart(2, '0');
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
};

/** ▲ in forest / ▼ in rust, with the amount and percent; a dim dash when there's nothing to compare. */
const Delta: React.FC<{ delta: ThndrDelta | null }> = ({ delta }) => {
  if (!delta) return <span className="text-ink/25">——</span>;
  return (
    <span style={{ color: delta.amount >= 0 ? UP : DOWN }}>
      {delta.amount >= 0 ? '▲' : '▼'} {formatSignedEGP(delta.amount)}{delta.percent === null ? '' : ` (${formatSignedPercent(delta.percent)})`}
    </span>
  );
};

const Stamp: React.FC<{ iso: string; note?: string }> = ({ iso, note }) => (
  <>
    <p className="font-mono-main text-[11px] text-ink/40">› {stamp(iso)}</p>
    {note && <p className="font-mono-main italic text-[11px] mt-1 text-ink/40">"{note}"</p>}
  </>
);

const flowSummary = (flow: ThndrFlow) =>
  flow.type === 'transfer'
    ? `Moved ${flow.from ? thndrPartLabel(flow.from) : '?'} → ${thndrPartLabel(flow.part)}`
    : `${flow.type === 'deposit' ? 'Money added to' : 'Money taken out of'} ${thndrPartLabel(flow.part)}`;

/** Money the user moved in, out, or between parts — never a gain, so it has its own row. */
const FlowRow: React.FC<{ flow: ThndrFlow; first: boolean; onRemove: () => void }> = ({ flow, first, onRemove }) => {
  const color = flow.type === 'deposit' ? ACCENT : flow.type === 'withdraw' ? DOWN : undefined;
  const sign = flow.type === 'deposit' ? '+' : flow.type === 'withdraw' ? '−' : '↔ ';
  return (
    <ListRow first={first}>
      <div className="flex-1 min-w-0">
        <Stamp iso={flow.timestamp} note={flow.note} />
        <p className="font-mono-main text-[10px] mt-2 uppercase text-ink/40">{flowSummary(flow)}</p>
      </div>
      <p className="font-mono-main font-black text-xl text-right shrink-0" style={{ color }}>{sign}{formatEGP(flow.amount)}</p>
      <div className="flex items-center gap-3 w-12 justify-end opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={onRemove}
          aria-label="Delete"
          data-tip="Removes the record only — your bank balance isn't changed"
          className="text-ink/25 hover:text-rust transition-colors cursor-pointer"
        ><Trash2 size={13} /></button>
      </div>
    </ListRow>
  );
};

type ReadingRowData = Extract<ThndrTimelineRow, { kind: 'reading' }>;

/** What Thndr showed at a moment: the total, each part, and how it moved — split into money added and the market's own move. */
const ReadingRow: React.FC<{ row: ReadingRowData; first: boolean; onEdit: () => void; onRemove: () => void }> = ({ row, first, onEdit, onRemove }) => {
  const { entry, partDeltas } = row;
  // An empty wallet isn't worth a line on every reading.
  const shownParts = THNDR_PARTS.filter(({ key }) => key !== 'wallet' || entry.parts?.wallet || partDeltas?.wallet.amount);
  return (
    <ListRow first={first}>
      <div className="flex-1 min-w-0">
        <Stamp iso={entry.timestamp} note={entry.note} />
        {entry.parts && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[10px] font-mono-main">
            {shownParts.map(({ key, label }) => {
              const move = partDeltas?.[key].amount ?? 0;
              return (
                <span key={key} className="text-ink/40">
                  <span className="uppercase">{label} </span>
                  <span className="text-ink/60">{formatEGP(entry.parts![key] || 0)}</span>
                  {move !== 0 && <span style={{ color: move > 0 ? UP : DOWN }}> {move > 0 ? '▲' : '▼'}{formatEGP(Math.abs(move))}</span>}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="font-mono-main font-black text-xl">{formatEGP(entry.value)}</p>
        <p className="font-mono-main text-[11px] mt-1">
          {row.contributed === 0 ? (
            <Delta delta={row.delta} />
          ) : (
            <>
              <span className="text-ink/40">{formatSignedEGP(row.contributed)} {row.contributed > 0 ? 'added' : 'taken out'} · market </span>
              <Delta delta={row.market} />
            </>
          )}
        </p>
      </div>
      <InlineActions onEdit={onEdit} onRemove={onRemove} />
    </ListRow>
  );
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Thndr has no API, so its value is a log of readings typed in by hand, split into clouds, gold,
 * funds and the wallet — plus the money moved in and out, kept apart so a deposit never counts as a
 * gain. Same card system as the rest of Finance (Gold, Debts, …), with one accent colour and a
 * couple of terminal-ish touches (">" captions, THNDR.EXE) as the only nod to where this screen started.
 */
export const ThndrTab: React.FC<{
  entries: ThndrEntry[];
  setEntries: (next: ThndrEntry[]) => Promise<void>;
  flows: ThndrFlow[];
  setFlows: (next: ThndrFlow[]) => Promise<void>;
  /** Opens the money in / out form, which lives in Finance because it can move a bank balance too. */
  onAddMoney: () => void;
}> = ({ entries, setEntries, flows, setFlows, onAddMoney }) => {
  const [editing, setEditing] = useState<{ open: boolean; entry: ThndrEntry | null }>({ open: false, entry: null });

  const timeline = thndrTimeline(entries, flows);
  const value = currentThndrValue(entries, flows);
  const parts = currentThndrParts(entries, flows);
  const shares = parts ? thndrShares(parts) : null;
  const performance = thndrPerformance(entries, flows);
  const hasRecords = entries.length > 0 || flows.length > 0;

  return (
    <div className="space-y-6">
      {/* Portfolio value + what's been put in and what it has earned, beside the split — same two-panel shape as Gold */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="thndr-scan brutalist-card no-lift bg-paper-dark p-6 md:col-span-2 flex flex-col justify-between gap-6">
          <div className="flex items-center justify-between">
            <p className={captionLabel}>Thndr.exe — portfolio value<span className="thndr-cursor ml-0.5" style={{ color: ACCENT }}>_</span></p>
            <p className="font-mono-main text-[9px] uppercase tracking-[0.2em] text-ink/25">
              {plural(entries.length, 'reading')} · {plural(flows.length, 'move')}
            </p>
          </div>
          <p className="font-mono-main text-4xl font-black" style={{ color: hasRecords ? ACCENT : undefined }}>
            {hasRecords ? formatEGP(value) : <span className="text-ink/25">—</span>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className={`${captionLabel} mb-1`}>Invested</p>
              <p className="font-mono-main text-[13px]">{performance ? formatEGP(performance.invested) : <span className="text-ink/25">——</span>}</p>
            </div>
            <div>
              <p className={`${captionLabel} mb-1`}>Gain</p>
              <p className="font-mono-main text-[13px]"><Delta delta={performance?.gain ?? null} /></p>
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
          <ActionButton tone="solid" onClick={() => setEditing({ open: true, entry: null })}>Update value</ActionButton>
        </div>
      </div>

      {timeline.length === 0 ? (
        <EmptyState>Nothing yet — "Update value" records what Thndr shows; "Money in / out" records money you moved.</EmptyState>
      ) : (
        <ListCard>
          {timeline.map((row, index) => row.kind === 'flow' ? (
            <FlowRow key={row.flow.id} flow={row.flow} first={index === 0} onRemove={() => setFlows(flows.filter((f) => f.id !== row.flow.id))} />
          ) : (
            <ReadingRow
              key={row.entry.id}
              row={row}
              first={index === 0}
              onEdit={() => setEditing({ open: true, entry: row.entry })}
              onRemove={() => setEntries(removeById(entries, row.entry.id))}
            />
          ))}
        </ListCard>
      )}

      <ThndrReadingModal
        isOpen={editing.open}
        onClose={() => setEditing((current) => ({ ...current, open: false }))}
        initial={editing.entry}
        lastParts={parts}
        onSave={(entry) => setEntries(upsertById(entries, entry))}
      />
    </div>
  );
};
