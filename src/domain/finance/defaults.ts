import type { FinanceBanks, FinanceBuckets } from '@/domain/finance/types';

/** Every bank at zero — also what stored balances are merged over, since a record can predate a bank being added. */
export const EMPTY_BANKS: FinanceBanks = { cib: 0, ahly_main: 0, ahly_meeza: 0, bm: 0 };

/** Every bucket at zero — likewise merged under stored balances. */
export const EMPTY_BUCKETS: FinanceBuckets = { tawarr2: 0, mustaqbal: 0, basmala: 0, mariam: 0, sadaqa: 0 };

/** Hamed's current monthly salary — temporary, until a share of it is routed to the future fund. */
export const MONTHLY_SALARY_EGP = 7000;
