/** The shapes finance data takes. No behaviour — just contracts. */

export interface FinanceBanks {
  cib: number;
  ahly_main: number;
  ahly_meeza: number;
  bm: number;
}

export interface FinanceBuckets {
  tawarr2: number;
  mustaqbal: number;
  basmala: number;
  sadaqa: number;
}

export interface GoldAsset {
  id: string;
  quantity: number;
  carat: 24 | 21;
  notes?: string;
  purchasePrice?: number; // price per gram at time of purchase
}

export interface Subscription {
  id: string;
  name: string;
  cost: number;
  renewalDay: number;
  reminderTime: string;   // "HH:MM"
  bank: string;
  intervalMonths: number; // 1 = monthly, 3 = quarterly, 12 = yearly …
  startDate?: string;     // "YYYY-MM-DD"
}

/** One reading of the Thndr portfolio's value, typed in by hand (Thndr has no API to read it from). */
/** What the money inside Thndr is split across. */
/** `wallet` is the cash sitting in Thndr that hasn't been invested yet. */
export type ThndrPart = 'clouds' | 'gold' | 'funds' | 'wallet';
export type ThndrParts = Record<ThndrPart, number>;

/** Money the user moved into (deposit) or out of (withdraw) Thndr, or between its parts — as opposed to the portfolio growing or shrinking on its own. */
export interface ThndrFlow {
  id: string;
  /** `transfer` moves money between two parts inside Thndr (wallet → funds, say): the total doesn't change. */
  type: 'deposit' | 'withdraw' | 'transfer';
  amount: number;
  /** Which part of the portfolio it went into / came out of (for a transfer: where it went). */
  part: ThndrPart;
  /** A transfer's source part. */
  from?: ThndrPart;
  timestamp: string;      // ISO
  note?: string;
}

export interface ThndrEntry {
  id: string;
  /** Portfolio value in EGP at that moment — the sum of `parts` when they're recorded. */
  value: number;
  /** How that value was split. Absent on readings saved before the split existed. */
  parts?: ThndrParts;
  timestamp: string;      // ISO
  note?: string;
}

export interface FinanceLog {
  id: string;
  /** `assign` moves money between buckets only (the bank doesn't change); its amount is negative when taking out. */
  type: 'deposit' | 'withdraw' | 'assign';
  amount: number;
  /** Empty for `assign`. */
  bank: string;
  bucket?: string;
  mode?: 'split' | 'manual' | 'reconcile';
  category?: string;      // 'Salary' | 'Freelance' for split deposits, 'Thndr' for money moved to / from Thndr
  timestamp: string;      // ISO
}

export interface Debt {
  id: string;
  personName: string;
  amount: number;
  type: 'owed_to_me' | 'owed_by_me';
  notes?: string;
}
