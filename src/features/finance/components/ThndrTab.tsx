import React, { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AppModal } from '@/ui/AppModal';
import { IconPencil as Pencil, IconTrash2 as Trash2 } from '@/ui/icons';
import { formatEGP } from '@/domain/finance/money';
import { removeById, upsertById } from '@/domain/finance/collections';
import {
  THNDR_PARTS, latestThndrParts, latestThndrValue, thndrPartsTotal, thndrRows, thndrSeries, thndrShares, thndrSinceStart,
  type ThndrDelta,
} from '@/domain/finance/thndr';
import type { ThndrEntry, ThndrPart, ThndrParts } from '@/domain/finance/types';
import { MaskedValue } from '@/features/finance/components/visuals';
import { Field, ModalForm, TextInput } from '@/features/finance/components/forms';
import { ActionButton } from '@/features/finance/components/ActionButton';

const CRT_FG = '#ffb84d';
const CRT_DIM = '#8c5f22';

const stamp = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${formatEGP(Math.abs(n))}`;
const percentLabel = (p: number | null) => (p === null ? '' : ` (${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%)`);

/** ▲ in the screen's amber / ▼ in red-orange, with the amount and percent; a dim dash when there's nothing to compare. */
const DeltaText: React.FC<{ delta: ThndrDelta | null }> = ({ delta }) => {
  if (!delta) return <span className="crt-dim">——</span>;
  const up = delta.amount >= 0;
  return (
    <span className={up ? '' : 'crt-warn'}>
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

/** One block pattern per part, so the bar reads without colour: solid, half-tone, hatched. */
const PART_FILL: Record<ThndrPart, React.CSSProperties> = {
  clouds: { background: 'var(--crt-fg)' },
  gold: { background: 'color-mix(in srgb, var(--crt-fg) 45%, transparent)' },
  funds: { background: 'repeating-linear-gradient(45deg, var(--crt-fg) 0 2px, transparent 2px 6px)', border: '1px solid var(--crt-fg)' },
};

const CrtTooltip: React.FC<{ active?: boolean; payload?: Array<{ value: number; payload: { label: string } }> }> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0f0a04', border: `1px solid ${CRT_DIM}`, color: CRT_FG, padding: '6px 10px', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
      <div style={{ color: CRT_DIM }}>{payload[0].payload.label}</div>
      <div>{formatEGP(payload[0].value)}</div>
    </div>
  );
};

/**
 * Thndr has no API, so its value is a log of readings typed in by hand, split into clouds, gold
 * and funds. The page is dressed as an amber-phosphor terminal (the `retro-crt` panel) — the one
 * retro screen in the app, for now.
 */
export const ThndrTab: React.FC<{
  entries: ThndrEntry[];
  setEntries: (next: ThndrEntry[]) => Promise<void>;
  privacyMode: boolean;
}> = ({ entries, setEntries, privacyMode }) => {
  const [modal, setModal] = useState<{ open: boolean; entry: ThndrEntry | null }>({ open: false, entry: null });

  const rows = thndrRows(entries);
  const series = thndrSeries(entries);
  const latest = latestThndrValue(entries);
  const latestParts = latestThndrParts(entries);
  const shares = latestParts ? thndrShares(latestParts) : null;
  const sinceLast = rows[0]?.delta ?? null;
  const sinceStart = thndrSinceStart(entries);
  const chartData = series.map((e) => ({ label: stamp(e.timestamp), value: e.value }));

  const masked = (node: React.ReactNode, className = '') => <MaskedValue disabled={!privacyMode} className={className}>{node}</MaskedValue>;

  return (
    <div className="space-y-6">
      {/* The screen: current value, how it moved, the split, and the curve */}
      <section className="retro-crt">
        <div className="flex items-center justify-between px-5 py-2 border-b crt-rule text-[10px] uppercase tracking-[0.25em]">
          <span>THNDR.EXE — PORTFOLIO MONITOR</span>
          <span className="crt-dim">{entries.length} {entries.length === 1 ? 'READING' : 'READINGS'}</span>
        </div>

        <div className="px-6 py-8 md:px-10 md:py-10">
          <p className="text-[10px] uppercase tracking-[0.25em] crt-dim mb-3">&gt; PORTFOLIO VALUE</p>
          <p className="text-4xl md:text-6xl font-black tracking-tight leading-none">
            {entries.length === 0 ? '—' : masked(formatEGP(latest))}
            <span className="crt-cursor" aria-hidden />
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-x-10 gap-y-4 text-[12px]">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] crt-dim mb-1">Last update</p>
              <p>{rows[0] ? stamp(rows[0].entry.timestamp) : '——'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] crt-dim mb-1">Since previous</p>
              <p>{masked(<DeltaText delta={sinceLast} />)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] crt-dim mb-1">Since first reading</p>
              <p>{masked(<DeltaText delta={sinceStart} />)}</p>
            </div>
          </div>

          {latestParts && shares && (
            <div className="mt-8">
              <p className="text-[10px] uppercase tracking-[0.2em] crt-dim mb-3">&gt; DISTRIBUTION</p>
              <div className="flex h-5 gap-px" role="img" aria-label="Distribution of the Thndr portfolio">
                {THNDR_PARTS.filter(({ key }) => shares[key] > 0).map(({ key }) => (
                  <div key={key} style={{ width: `${shares[key]}%`, ...PART_FILL[key] }} />
                ))}
              </div>
              <ul className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-x-10 gap-y-3 text-[12px]">
                {THNDR_PARTS.map(({ key, label }) => (
                  <li key={key} className="flex items-center gap-3">
                    <span className="inline-block w-3 h-3 shrink-0" style={PART_FILL[key]} aria-hidden />
                    <span className="uppercase tracking-[0.15em]">{label}</span>
                    <span className="crt-dim tabular-nums">{shares[key].toFixed(0)}%</span>
                    <span className="ml-auto font-bold tabular-nums">{masked(formatEGP(latestParts[key]))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {series.length >= 2 && !privacyMode && (
            <div className="mt-8 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={CRT_DIM} strokeOpacity={0.2} strokeDasharray="2 4" />
                  <XAxis dataKey="label" hide />
                  <YAxis domain={['dataMin', 'dataMax']} hide />
                  <Tooltip content={<CrtTooltip />} cursor={{ stroke: CRT_DIM }} />
                  <Line type="stepAfter" dataKey="value" stroke={CRT_FG} strokeWidth={2} dot={{ r: 3, fill: CRT_FG, stroke: CRT_FG }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <div className="flex justify-between items-center">
        <p className="font-mono-main text-[9px] uppercase tracking-[0.25em] text-ink/25">Records</p>
        <ActionButton tone="solid" onClick={() => setModal({ open: true, entry: null })}>Update value</ActionButton>
      </div>

      {/* The log: one line per reading */}
      <section className="retro-crt">
        <div className="px-5 py-2 border-b crt-rule text-[10px] uppercase tracking-[0.25em]">&gt; READINGS.LOG</div>
        {rows.length === 0 ? (
          <p className="px-6 py-10 text-[12px] crt-dim">NO READINGS YET. PRESS “UPDATE VALUE” TO ADD THE FIRST<span className="crt-cursor" aria-hidden /></p>
        ) : (
          <ul>
            {rows.map(({ entry, delta, partDeltas }, i) => (
              <li key={entry.id} className={`group flex flex-wrap items-baseline gap-x-6 gap-y-1 px-6 py-4 text-[12px] ${i > 0 ? 'border-t crt-rule border-dashed' : ''}`}>
                <span className="crt-dim tabular-nums">{stamp(entry.timestamp)}</span>
                <span className="font-black text-base tabular-nums">{masked(formatEGP(entry.value))}</span>
                <span className="tabular-nums">{masked(<DeltaText delta={delta} />)}</span>
                {entry.note && <span className="crt-dim italic">“{entry.note}”</span>}
                {entry.parts && (
                  <span className="basis-full flex flex-wrap gap-x-6 gap-y-1 text-[11px] tabular-nums">
                    {THNDR_PARTS.map(({ key, label }) => (
                      <span key={key}>
                        <span className="crt-dim uppercase">{label} </span>
                        {masked(formatEGP(entry.parts![key]))}
                        {partDeltas && partDeltas[key].amount !== 0 && (
                          <span className={partDeltas[key].amount > 0 ? '' : 'crt-warn'}> {partDeltas[key].amount > 0 ? '▲' : '▼'}{formatEGP(Math.abs(partDeltas[key].amount))}</span>
                        )}
                      </span>
                    ))}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity crt-dim">
                  <button onClick={() => setModal({ open: true, entry })} aria-label="Edit" className="cursor-pointer hover:text-[var(--crt-fg)]"><Pencil size={13} /></button>
                  <button onClick={() => setEntries(removeById(entries, entry.id))} aria-label="Delete" className="cursor-pointer hover:text-[var(--crt-warn)]"><Trash2 size={13} /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
