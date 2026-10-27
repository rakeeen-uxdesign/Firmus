import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { THNDR_PARTS, egp, signedEgp, duration, countdown } from './data.js';

// The daily report as a PDF, kept as quiet as the dashboard itself: no boxes, just hairlines and
// a lot of space; small mono caps for labels, large light numerals for the figures, and one accent
// (the lime) used sparingly. Built-in PDF fonts only — nothing to install.

// The dashboard's dark palette (src/styles/global.css), kept in sync by hand.
const C = { bg: '#0D0D0D', ink: '#E7E8E1', muted: '#7F8370', hair: '#2B2D25', accent: '#C2DC3F', warn: '#E2664A', soft: '#4A4D40' };

const F = { sans: 'Helvetica', sansBold: 'Helvetica-Bold', mono: 'Courier', monoBold: 'Courier-Bold' };
const PAGE = { w: 595.28, h: 841.89 };
const M = 54;
const W = PAGE.w - M * 2;
const BOTTOM = PAGE.h - 70;
/** Height of one row of a list: its text and the hairline under it. */
const ROW = 22;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The mark's path data, read from the web app's own favicon so the two can't drift apart. */
function loadLogo() {
  try {
    const svg = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'public', 'favicon.svg'), 'utf8');
    const box = (svg.match(/viewBox="([^"]+)"/) || [])[1]?.split(/\s+/).map(Number);
    const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    return box && paths.length ? { box, paths } : null;
  } catch { return null; }
}
const LOGO = loadLogo();

// ─── Pieces ─────────────────────────────────────────────────────────────────

function logo(doc, x, y, size) {
  if (!LOGO) return;
  const [bx, by, bw] = LOGO.box;
  doc.save().translate(x, y).scale(size / bw).translate(-bx, -by);
  for (const d of LOGO.paths) doc.path(d).fill(C.ink);
  doc.restore();
}

/** Small mono caps label. */
function label(doc, text, x, y, { color = C.muted, size = 6.5, width, align = 'left' } = {}) {
  doc.font(F.mono).fontSize(size).fillColor(color).text(text.toUpperCase(), x, y, { characterSpacing: 1.8, lineBreak: false, width, align });
}

/** A figure: large and light. */
function figure(doc, text, x, y, size, { color = C.ink, width, align = 'left' } = {}) {
  doc.font(F.sans).fontSize(size).fillColor(color).text(text, x, y, { lineBreak: false, width, align });
}

/** A large amount with its small "EGP" beside it. */
function bigAmount(doc, value, x, y, size, color) {
  const digits = egp(value).replace(' EGP', '');
  figure(doc, digits, x, y, size, { color });
  note(doc, 'EGP', x + doc.font(F.sans).fontSize(size).widthOfString(digits) + 6, y + size * 0.58, { size: 8.5 });
}

function line(doc, x1, y, x2, { color = C.hair, weight = 0.6 } = {}) {
  doc.save().lineWidth(weight).strokeColor(color).moveTo(x1, y).lineTo(x2, y).stroke().restore();
}

function note(doc, text, x, y, { color = C.muted, size = 7.5, width, align = 'left' } = {}) {
  doc.font(F.mono).fontSize(size).fillColor(color).text(text, x, y, { lineBreak: false, width, align });
}

/** A section: its label, a hairline to the margin, and where the content starts. */
function section(doc, title, y) {
  label(doc, title, M, y, { color: C.ink });
  const textW = title.length * (0.6 * 6.5 + 1.8);
  line(doc, M + textW + 12, y + 3.5, M + W);
  return y + 26;
}

/** Label on the left, figure on the right, a hairline under. */
function row(doc, name, value, x, y, w, { color = C.ink, sub } = {}) {
  doc.font(F.sans).fontSize(9.5).fillColor(C.ink).text(name, x, y + 5, { lineBreak: false, width: w * 0.6 });
  if (sub) note(doc, sub, x + w * 0.45, y + 6.5, { size: 7 });
  doc.font(F.sans).fontSize(9.5).fillColor(color).text(value, x, y + 5, { lineBreak: false, width: w, align: 'right' });
  line(doc, x, y + ROW, x + w);
  return y + ROW;
}

/** A thin segmented line. */
function segments(doc, x, y, w, parts) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  line(doc, x, y, x + w, { color: C.hair, weight: 2 });
  if (total <= 0) return;
  let cx = x;
  parts.forEach((p, i) => {
    const sw = (p.value / total) * w;
    if (sw > 0) doc.save().lineWidth(2).strokeColor(p.color).moveTo(cx + (i ? 1.5 : 0), y).lineTo(cx + sw, y).stroke().restore();
    cx += sw;
  });
}

/** Thin vertical bars for the week; today in the accent. */
function weekBars(doc, x, y, w, h, days, max) {
  const barW = 6;
  const step = (w - barW) / 6;
  days.forEach((d, i) => {
    const bx = x + i * step;
    const bh = Math.max(d.value > 0 ? 2 : 0, (d.value / Math.max(max, 1)) * h);
    doc.save().rect(bx, y, barW, h).fill(C.hair).restore();
    if (bh > 0) doc.save().rect(bx, y + h - bh, barW, bh).fill(d.isToday ? C.accent : C.soft).restore();
    note(doc, d.label[0], bx - 3, y + h + 6, { size: 6, color: d.isToday ? C.ink : C.muted, width: barW + 6, align: 'center' });
  });
}

function dotLegend(doc, x, y, color, name, pct, value) {
  doc.save().circle(x + 2.5, y + 4, 2.5).fill(color).restore();
  label(doc, name, x + 12, y, { color: C.ink, size: 6.2 });
  note(doc, `${pct}%`, x + 12, y + 11, { size: 7 });
  doc.font(F.sans).fontSize(9.5).fillColor(C.ink).text(value, x + 12, y + 22, { lineBreak: false });
}

// ─── Page furniture ─────────────────────────────────────────────────────────

function masthead(doc, report) {
  logo(doc, M, 50, 20);
  doc.font(F.sans).fontSize(10).fillColor(C.ink).text('RAKEEEN', M + 30, 55, { characterSpacing: 5, lineBreak: false });
  label(doc, `${report.date.weekday}  ·  ${report.date.label}`, M, 57, { width: W, align: 'right' });
}

function footers(doc, report) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    label(doc, `Daily report  ·  generated ${report.date.time} Cairo`, M, PAGE.h - 44, { size: 5.8 });
    label(doc, `${i + 1} / ${range.count}`, M, PAGE.h - 44, { size: 5.8, width: W, align: 'right' });
  }
}

// ─── Page one ───────────────────────────────────────────────────────────────

function hero(doc, report, y) {
  label(doc, 'Daily report', M, y);
  figure(doc, report.date.label.replace(/ \d{4}$/, ''), M, y + 16, 44);
  note(doc, `${report.date.weekday}  ·  ${report.date.iso.slice(0, 4)}`, M, y + 72, { size: 8.5 });
  return y + 104;
}

function headlineStats(doc, report, y) {
  const { water, focus, finance } = report;
  const cols = [
    { name: 'Water', value: `${water.glasses}`, unit: `/ ${water.goal}`, sub: water.glasses >= water.goal ? 'goal reached' : `${water.goal - water.glasses} to go` },
    { name: 'Focus', value: duration(focus.minutes), sub: `${focus.sessions} ${focus.sessions === 1 ? 'session' : 'sessions'}  ·  target ${duration(focus.targetMinutes)}` },
    { name: "Hamed's share", amount: finance.share.amount, sub: `${egp(finance.share.salary).replace(' EGP', '')} less Payit`, color: finance.share.amount < 0 ? C.warn : C.ink },
  ];
  const cw = W / 3;
  line(doc, M, y, M + W);
  cols.forEach((c, i) => {
    const x = M + i * cw;
    label(doc, c.name, x, y + 18);
    if (c.amount !== undefined) {
      bigAmount(doc, c.amount, x, y + 34, 30, c.color);
    } else {
      figure(doc, c.value, x, y + 34, 30);
      if (c.unit) note(doc, c.unit, x + doc.font(F.sans).fontSize(30).widthOfString(c.value) + 6, y + 52, { size: 8.5 });
    }
    note(doc, c.sub, x, y + 78, { size: 7 });
  });

  // Under the figures: the water glasses, the focus progress
  const by = y + 98;
  const dot = 7, gap = 3.2;
  for (let i = 0; i < water.goal; i++) {
    const dx = M + i * (dot + gap);
    if (i < water.glasses) doc.save().rect(dx, by, dot, dot).fill(C.accent).restore();
    else doc.save().lineWidth(0.6).rect(dx + 0.3, by + 0.3, dot - 0.6, dot - 0.6).stroke(C.soft).restore();
  }
  const fx = M + cw;
  const fw = cw - 24;
  line(doc, fx, by + 3.5, fx + fw, { color: C.hair, weight: 2 });
  const pct = Math.min(1, focus.minutes / focus.targetMinutes);
  if (pct > 0) line(doc, fx, by + 3.5, fx + fw * pct, { color: C.accent, weight: 2 });
  line(doc, M, y + 124, M + W);
  return y + 124;
}

function inBrief(doc, report, y) {
  label(doc, 'In brief', M, y);
  const items = report.highlights.slice(0, 4);
  items.forEach((it, i) => {
    const ly = y + 22 + i * 20;
    doc.save().circle(M + 2.5, ly + 5, 2.2).fill(it.tone === 'good' ? C.accent : it.tone === 'warn' ? C.warn : C.soft).restore();
    doc.font(F.sans).fontSize(10).fillColor(C.ink).text(it.text, M + 16, ly, { lineBreak: false, width: W - 16 });
  });
  return y + 22 + items.length * 20 + 10;
}

function weekRow(doc, report, y) {
  const { water, focus } = report;
  const cw = (W - 40) / 2;
  label(doc, 'Last seven days', M, y);
  const by = y + 24;
  label(doc, 'Water', M, by, { size: 6 });
  weekBars(doc, M, by + 14, cw, 30, water.week, water.goal);
  label(doc, 'Focus', M + cw + 40, by, { size: 6 });
  weekBars(doc, M + cw + 40, by + 14, cw, 30, focus.week, focus.targetMinutes);
  return by + 14 + 30 + 22;
}

function banksAndBuckets(doc, report, y) {
  const { finance } = report;
  const cw = (W - 40) / 2;
  label(doc, 'Banks', M, y);
  label(doc, 'Buckets', M + cw + 40, y);
  let ly = y + 14;
  finance.banks.forEach((b) => { ly = row(doc, b.label, egp(b.balance), M, ly, cw); });
  doc.font(F.sansBold).fontSize(9.5).fillColor(C.ink).text('Total', M, ly + 6, { lineBreak: false });
  doc.font(F.sansBold).fontSize(9.5).fillColor(C.ink).text(egp(finance.banksTotal), M, ly + 6, { lineBreak: false, width: cw, align: 'right' });

  let ry = y + 14;
  finance.buckets.forEach((b) => { ry = row(doc, b.label, egp(b.balance), M + cw + 40, ry, cw); });
  const overdrawn = finance.free < 0;
  doc.font(F.sans).fontSize(9.5).fillColor(C.muted).text(overdrawn ? 'Over-assigned' : 'Free', M + cw + 40, ry + 6, { lineBreak: false });
  doc.font(F.sans).fontSize(9.5).fillColor(overdrawn ? C.warn : C.muted).text(egp(Math.abs(finance.free)), M + cw + 40, ry + 6, { lineBreak: false, width: cw, align: 'right' });
  return Math.max(ly + 24, ry + 24);
}

// ─── Page two ───────────────────────────────────────────────────────────────

function futureFund(doc, report, y) {
  const f = report.finance.future;
  bigAmount(doc, f.total, M, y, 26);
  const colors = [C.ink, C.soft, C.accent];
  const parts = [['Cash', f.cash], ['Gold', f.gold], ['Thndr', f.thndr]];
  segments(doc, M, y + 46, W, parts.map(([, v], i) => ({ value: v, color: colors[i] })));
  const cw = W / 3;
  parts.forEach(([name, value], i) => dotLegend(doc, M + i * cw, y + 58, colors[i], name, f.total > 0 ? Math.round((value / f.total) * 100) : 0, egp(value)));
  return y + 100;
}

function thndr(doc, report, y) {
  const t = report.finance.thndr;
  if (!t) {
    note(doc, 'No readings yet. Add one from Finance > Thndr.', M, y, { size: 8 });
    return y + 20;
  }
  bigAmount(doc, t.value, M, y, 26);
  const move = t.sincePrevious;
  if (move) {
    const pct = move.percent === null ? '' : `  ${move.percent >= 0 ? '+' : '-'}${Math.abs(move.percent).toFixed(1)}%`;
    note(doc, `${signedEgp(move.amount)}${pct}`, M, y + 8, { size: 9, color: move.amount >= 0 ? C.accent : C.warn, width: W, align: 'right' });
  }
  const stamp = new Date(t.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const gainPct = t.gain.percent === null ? '' : `  ${t.gain.percent >= 0 ? '+' : '-'}${Math.abs(t.gain.percent).toFixed(1)}%`;
  note(doc, `Updated ${stamp}   ·   invested ${egp(t.invested)}   ·   gain ${signedEgp(t.gain.amount)}${gainPct}`, M, y + 28, { size: 7 });
  if (!t.parts) return y + 50;
  const colors = [C.ink, C.accent, C.soft, C.muted];
  const total = THNDR_PARTS.reduce((s, [k]) => s + t.parts[k], 0);
  segments(doc, M, y + 52, W, THNDR_PARTS.map(([k], i) => ({ value: t.parts[k], color: colors[i] })));
  const cw = W / THNDR_PARTS.length;
  THNDR_PARTS.forEach(([k, name], i) => dotLegend(doc, M + i * cw, y + 64, colors[i], name, total > 0 ? Math.round((t.parts[k] / total) * 100) : 0, egp(t.parts[k])));
  return y + 106;
}

function subscriptions(doc, report, y) {
  const rows = report.finance.upcoming;
  const s = report.finance.share;
  if (!rows.length) {
    note(doc, 'Nothing renews in the next 30 days.', M, y, { size: 8 });
    y += ROW;
  }
  rows.forEach((r) => {
    doc.font(F.sans).fontSize(9.5).fillColor(C.ink).text(r.name, M, y + 5, { lineBreak: false, width: 200 });
    note(doc, `${r.bank || ''}  ·  day ${r.renewalDay}`, M + 190, y + 6.5, { size: 7 });
    note(doc, countdown(r.daysLeft), M + 330, y + 6.5, { size: 7.5, color: r.daysLeft <= 5 ? C.warn : C.muted });
    doc.font(F.sans).fontSize(9.5).fillColor(C.ink).text(egp(r.cost), M, y + 5, { lineBreak: false, width: W, align: 'right' });
    line(doc, M, y + ROW, M + W);
    y += ROW;
  });
  // The month in one line
  note(doc, `Per month  ${egp(s.monthlySubs)}   ·   salary ${egp(s.salary)}   ·   left`, M, y + 12, { size: 7.5 });
  doc.font(F.sansBold).fontSize(9.5).fillColor(s.amount < 0 ? C.warn : C.accent).text(egp(s.amount), M, y + 10, { lineBreak: false, width: W, align: 'right' });
  return y + 34;
}

function twoColumns(y, left, right) {
  const cw = (W - 40) / 2;
  const a = left(M, y, cw);
  const b = right(M + cw + 40, y, cw);
  return Math.max(a, b);
}

function debts(doc, report, y) {
  const d = report.finance.debts;
  const list = (name, entries, total, color) => (x, ly, w) => {
    label(doc, name, x, ly);
    let cy = ly + 14;
    (entries.length ? entries : [{ personName: 'Nobody', amount: 0, none: true }]).forEach((e) => {
      cy = row(doc, e.personName, e.none ? '-' : egp(e.amount), x, cy, w);
    });
    doc.font(F.sansBold).fontSize(9.5).fillColor(color).text('Total', x, cy + 6, { lineBreak: false });
    doc.font(F.sansBold).fontSize(9.5).fillColor(color).text(egp(total), x, cy + 6, { lineBreak: false, width: w, align: 'right' });
    return cy + 26;
  };
  return twoColumns(y, list('Owed to me', d.toMe, d.owedToMe, C.accent), list('I owe', d.byMe, d.owedByMe, d.owedByMe > 0 ? C.warn : C.ink));
}

function logs(doc, report, y) {
  const { focus } = report.logs;
  const { today } = report.finance;
  const focusCol = (x, ly, w) => {
    label(doc, 'Focus sessions today', x, ly);
    let cy = ly + 14;
    if (!focus.entries.length) { note(doc, 'None logged.', x, cy + 6, { size: 8 }); cy += ROW; }
    focus.entries.forEach((e) => {
      doc.font(F.mono).fontSize(8).fillColor(C.muted).text(e.time || '-', x, cy + 6, { lineBreak: false });
      doc.font(F.sans).fontSize(9.5).fillColor(C.ink).text(duration(e.minutes), x, cy + 5, { lineBreak: false, width: w, align: 'right' });
      line(doc, x, cy + ROW, x + w);
      cy += ROW;
    });
    note(doc, `${focus.count} ${focus.count === 1 ? 'session' : 'sessions'}`, x, cy + 8, { size: 7.5 });
    doc.font(F.sansBold).fontSize(9.5).fillColor(C.ink).text(duration(focus.total), x, cy + 6, { lineBreak: false, width: w, align: 'right' });
    return cy + 26;
  };
  const moneyCol = (x, ly, w) => {
    label(doc, 'Money movements today', x, ly);
    let cy = ly + 14;
    if (!today.entries.length) { note(doc, 'None today.', x, cy + 6, { size: 8 }); cy += ROW; }
    today.entries.forEach((l) => {
      const t = new Date(l.timestamp);
      const out = l.type === 'withdraw';
      doc.font(F.mono).fontSize(8).fillColor(C.muted).text(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`, x, cy + 6, { lineBreak: false });
      doc.font(F.sans).fontSize(9.5).fillColor(C.ink).text(out ? 'Withdraw' : 'Deposit', x + 40, cy + 5, { lineBreak: false });
      doc.font(F.sans).fontSize(9.5).fillColor(out ? C.warn : C.accent).text(`${out ? '-' : '+'}${egp(l.amount)}`, x, cy + 5, { lineBreak: false, width: w, align: 'right' });
      line(doc, x, cy + ROW, x + w);
      cy += ROW;
    });
    note(doc, `in ${egp(today.deposits)}  ·  out ${egp(today.withdrawals)}`, x, cy + 8, { size: 7.5 });
    return cy + 26;
  };
  return twoColumns(y, focusCol, moneyCol);
}

function thndrReadings(doc, report, y) {
  report.logs.thndr.forEach((r) => {
    const stamp = new Date(r.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    note(doc, stamp, M, y + 7, { size: 8 });
    if (r.delta && r.delta.amount !== 0) note(doc, signedEgp(r.delta.amount), M + 120, y + 7, { size: 7.5, color: r.delta.amount >= 0 ? C.accent : C.warn });
    doc.font(F.sans).fontSize(9.5).fillColor(C.ink).text(egp(r.value), M, y + 5, { lineBreak: false, width: W, align: 'right' });
    line(doc, M, y + ROW, M + W);
    y += ROW;
  });
  return y;
}

// ─── The document ───────────────────────────────────────────────────────────

/** Renders the report to a PDF; resolves with the file's bytes. */
export function renderReportPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', margin: 0, bufferPages: true,
      info: { Title: `Rakeeen daily report - ${report.date.iso}`, Author: 'Rakeeen', Subject: 'Daily report' },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const paintPage = () => doc.save().rect(0, 0, PAGE.w, PAGE.h).fill(C.bg).restore();
    paintPage();
    doc.on('pageAdded', paintPage);

    // Page one: who and when, the three figures, what's worth knowing, the week, the money.
    masthead(doc, report);
    let y = hero(doc, report, 112);
    y = headlineStats(doc, report, y) + 22;
    y = inBrief(doc, report, y) + 14;
    line(doc, M, y, M + W);
    y = weekRow(doc, report, y + 22) + 6;
    line(doc, M, y, M + W);
    banksAndBuckets(doc, report, y + 22);

    // Page two: the long-term money, then what's coming up and what happened.
    doc.addPage();
    masthead(doc, report);
    y = 110;
    const place = (needed, title, draw) => {
      if (y + 26 + needed > BOTTOM) {
        doc.addPage();
        masthead(doc, report);
        y = 110;
      }
      y = section(doc, title, y);
      y = draw(y) + 14;
    };
    place(100, 'Future fund', (at) => futureFund(doc, report, at));
    place(report.finance.thndr?.parts ? 106 : 40, 'Thndr', (at) => thndr(doc, report, at));
    place(Math.max(1, report.finance.upcoming.length) * ROW + 36, 'Payit  ·  next 30 days', (at) => subscriptions(doc, report, at));
    const d = report.finance.debts;
    if (d.toMe.length || d.byMe.length) place(Math.max(d.toMe.length, d.byMe.length, 1) * ROW + 50, 'Debts', (at) => debts(doc, report, at));
    place(Math.max(1, report.logs.focus.entries.length, report.finance.today.entries.length) * ROW + 50, 'Logs', (at) => logs(doc, report, at));
    if (report.logs.thndr.length >= 2) place(report.logs.thndr.length * ROW, 'Thndr readings', (at) => thndrReadings(doc, report, at));

    footers(doc, report);
    doc.end();
  });
}
