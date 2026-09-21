/**
 * Pre-IPO tokens, as the app reads them.
 *
 * Two prices per row and the distance between them, because these track private companies: there is
 * no exchange, so the pool price and the issuer's mark are not two measurements of one number, they
 * are two different claims. Measured on 2026-09-21 the pools sat 8% to 34% above the marks.
 *
 * `transferFeeBps` is charged by the mint on every movement, in and out — it is not a venue fee and
 * no route avoids it.
 */
import { api } from './api';

export type PreStockRow = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  sector: string;
  poolUsd: number | null;
  markUsd: number | null;
  spreadPct: number | null;
  markStale: boolean;
  holders: number | null;
  valuationUsd: number | null;
  transferFeeBps: number;
};

export type PreStockPage = { venue: string; note: string; rows: PreStockRow[] };

export const prestocks = {
  list: () => api.get<PreStockPage>('/market/prestocks'),
};
