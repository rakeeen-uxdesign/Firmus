import { randomUUID } from 'crypto';
import { getDashboardValue, setDashboardValue } from '../lib/firestore.js';
import { formatEGP } from '../lib/format.js';
import { card, row, ButtonStyle } from '../lib/ui.js';

// Kept in sync by hand with src/features/finance/components/visuals.tsx
// (BANK_LABELS, BUCKET_META) and src/features/finance/useFinance.ts (defaults).
const BANK_LABELS = { cib: 'CIB', ahly_main: 'Ahly Main', ahly_meeza: 'Ahly Meeza', bm: 'Banque Misr' };
const DEFAULT_BANKS = { cib: 0, ahly_main: 0, ahly_meeza: 0, bm: 0 };
const BUCKET_LABELS = { tawarr2: "Tawarru'", mustaqbal: 'Future', basmala: 'Basmala', sadaqa: 'Sadaqa' };
const DEFAULT_BUCKETS = { tawarr2: 0, mustaqbal: 0, basmala: 0, sadaqa: 0 };

const sum = (obj) => Object.values(obj).reduce((a, b) => a + (b || 0), 0);
const sumBuckets = (buckets) => Object.keys(BUCKET_LABELS)
  .reduce((total, key) => total + (Number(buckets?.[key]) || 0), 0);

export async function buildHomeView() {
  const [banks, buckets] = await Promise.all([
    getDashboardValue('finance_banks', DEFAULT_BANKS),
    getDashboardValue('finance_buckets', DEFAULT_BUCKETS),
  ]);
  // Buckets are a virtual split of the same bank money, not money on top of
  // it — the real balance is the banks total; buckets just show how it's
  // allocated. Matches Finance.tsx, which shows these as two separate
  // figures and never adds them into one grand total.
  return {
    embeds: [card({
      domain: 'finance',
      headline: 'Real balance (banks) — buckets are how it\'s split, not extra money',
      big: formatEGP(sum(banks)),
      rows: [['Allocated across buckets', formatEGP(sumBuckets(buckets)), true]],
    })],
    components: [row([
      { id: 'finance:banks', label: 'Banks', style: ButtonStyle.Primary },
      { id: 'finance:buckets', label: 'Buckets' },
      { id: 'bommy:home', label: 'Main Menu' },
    ])],
  };
}

export async function buildBanksView() {
  const banks = await getDashboardValue('finance_banks', DEFAULT_BANKS);
  const keys = Object.keys(BANK_LABELS);
  return {
    embeds: [card({
      domain: 'finance',
      headline: 'Pick a bank to deposit or withdraw',
      rows: keys.map((k) => [BANK_LABELS[k], formatEGP(banks[k] || 0), true]),
    })],
    components: [
      row(keys.map((k) => ({ id: `finance:bank:${k}`, label: BANK_LABELS[k] }))),
      row([{ id: 'finance:home', label: 'Back' }]),
    ],
  };
}

export async function buildBankView(bankKey) {
  const banks = await getDashboardValue('finance_banks', DEFAULT_BANKS);
  return {
    embeds: [card({
      domain: 'finance',
      headline: BANK_LABELS[bankKey],
      big: formatEGP(banks[bankKey] || 0),
    })],
    components: [row([
      { id: `finance:deposit:${bankKey}`, label: 'Deposit', style: ButtonStyle.Success },
      { id: `finance:withdraw:${bankKey}`, label: 'Withdraw', style: ButtonStyle.Danger },
      { id: 'finance:banks', label: 'Back' },
    ])],
  };
}

export async function buildBucketsView() {
  const buckets = await getDashboardValue('finance_buckets', DEFAULT_BUCKETS);
  const keys = Object.keys(BUCKET_LABELS);
  return {
    embeds: [card({
      domain: 'finance',
      headline: "How the banks total is split — pick a bank first to move money in or out",
      rows: keys.map((k) => [BUCKET_LABELS[k], formatEGP(buckets[k] || 0), true]),
    })],
    components: [row([{ id: 'finance:home', label: 'Back' }])],
  };
}

// A deposit/withdraw always moves real money in a bank — a bucket is just an
// optional tag on that same movement (same amount, both change together),
// never money by itself. Matches Finance.tsx's handleAddDeposit/handleWithdraw
// exactly, down to the Tawarru' special case below.
export async function buildBucketChoiceView(action, bankKey) {
  const keys = Object.keys(BUCKET_LABELS);
  const verb = action === 'deposit' ? 'Deposit to' : 'Withdraw from';
  return {
    embeds: [card({
      domain: 'finance',
      headline: `${verb} ${BANK_LABELS[bankKey]} — tag it to a bucket? (optional)`,
    })],
    components: [
      row(keys.map((k) => ({ id: `finance:amount:${action}:${bankKey}:${k}`, label: BUCKET_LABELS[k] }))),
      row([
        { id: `finance:amount:${action}:${bankKey}:none`, label: 'No Bucket', style: ButtonStyle.Secondary },
        { id: `finance:bank:${bankKey}`, label: 'Back' },
      ]),
    ],
  };
}

/**
 * @param {'deposit'|'withdraw'} type
 * @param {string|null} bucketKey
 * @returns {{ ok: true, view: object } | { ok: false, message: string }}
 */
export async function applyBankChange(bankKey, type, amount, bucketKey = null) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: 'Enter a positive number.' };
  }

  const banks = await getDashboardValue('finance_banks', DEFAULT_BANKS);
  const currentBank = banks[bankKey] || 0;
  const nextBank = type === 'deposit' ? currentBank + amount : currentBank - amount;
  if (nextBank < 0) {
    return { ok: false, message: `That would take ${BANK_LABELS[bankKey]} below zero (balance: ${formatEGP(currentBank)}).` };
  }

  let buckets = null;
  let nextBucket = null;
  if (bucketKey) {
    buckets = await getDashboardValue('finance_buckets', DEFAULT_BUCKETS);
    const currentBucket = buckets[bucketKey] || 0;
    nextBucket = type === 'deposit' ? currentBucket + amount : currentBucket - amount;
    if (nextBucket < 0) {
      return { ok: false, message: `That would take ${BUCKET_LABELS[bucketKey]} below zero (balance: ${formatEGP(currentBucket)}).` };
    }
  }

  await setDashboardValue('finance_banks', { ...banks, [bankKey]: nextBank });
  if (bucketKey) await setDashboardValue('finance_buckets', { ...buckets, [bucketKey]: nextBucket });

  const logs = await getDashboardValue('finance_logs', []);
  await setDashboardValue('finance_logs', [
    {
      id: randomUUID(), type, amount, bank: BANK_LABELS[bankKey],
      ...(bucketKey ? { bucket: BUCKET_LABELS[bucketKey] } : {}),
      mode: 'manual', timestamp: new Date().toISOString(),
    },
    ...(logs || []),
  ]);

  // Withdrawing from Tawarru' ("Urgent") always logs it as a debt you owe
  // yourself back — same rule Finance.tsx applies, so the two stay consistent.
  if (type === 'withdraw' && bucketKey === 'tawarr2') {
    const debts = await getDashboardValue('finance_debts', []);
    await setDashboardValue('finance_debts', [
      ...(debts || []),
      {
        id: randomUUID(), personName: 'Urgent', amount, type: 'owed_by_me',
        notes: `Borrowed from Urgent bucket on ${new Date().toLocaleDateString('en-GB')}`,
      },
    ]);
  }

  return { ok: true, view: await buildBankView(bankKey) };
}

export function isKnownBank(key) {
  return Object.prototype.hasOwnProperty.call(BANK_LABELS, key);
}

export function isKnownBucket(key) {
  return Object.prototype.hasOwnProperty.call(BUCKET_LABELS, key);
}

export { BANK_LABELS, BUCKET_LABELS };
