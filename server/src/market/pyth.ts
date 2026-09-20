/**
 * The Nasdaq print, read from Pyth's price account on Solana mainnet.
 *
 * `market/nasdaq.ts` needs a second, independent opinion on what a share is worth, because the
 * whole off-hours guard is the distance between two numbers: what the token costs in a Solana pool
 * and what the underlying listing is actually worth. Until now that second number was the issuer's
 * own `stockData` mark, published beside the pool price by the same endpoint that gives us the pool
 * price. One vendor, two fields — if it is wrong, it is wrong in both, and the guard measures
 * nothing. That file's own header said the quiet part out loud: "There is no free Nasdaq feed this
 * project can reach."
 *
 * There is. Pyth publishes `Equity.US.<TICKER>/USD` and pushes it on-chain, and the account is a
 * plain `getMultipleAccounts` read away — no key, no account, no vendor relationship. It is the
 * aggregate of Pyth's equity publishers rather than one issuer's mark, it carries a confidence
 * interval, and it carries the timestamp of the print it describes.
 *
 * ## Why an account read and not the HTTP API
 *
 * Hermes, Pyth's HTTP service, now answers `401 unauthorized` without a key. The on-chain feed is
 * the same data and needs nothing, which matters for a project that must still work when a judge
 * clones it. It is also the more honest version of the claim this app makes: the reference price
 * for a trade that settles on Solana is itself an account on Solana, read at the same block height
 * as everything else.
 *
 * ## Two shards, and why both are read
 *
 * The push oracle writes each feed to a sharded PDA, and the shards are maintained independently by
 * whoever pays for the updates. Shard 0's equity feeds are abandoned — NVDA there was last written
 * on 2026-08-26, a month stale, and AAPL on 2026-08-14. Shard 1 is live and was written at Friday's
 * close for ten of our eleven tickers. Picking a shard by number would be picking one on the
 * evidence of a single afternoon, so both are read and the fresher print wins. COIN has no live
 * shard at all today and correctly resolves to null rather than to a month-old number.
 *
 * ## Staleness, which is not what it looks like
 *
 * An equity feed that has not moved in sixteen hours is not broken, it is Tuesday night. The
 * exchange is shut and there is nothing to publish — and that is precisely the moment the guard is
 * for, because the pool goes on trading 24/7 with nothing arbitraging it back. So the age limit is
 * keyed to the session:
 *
 *   - Regular hours: the print must be minutes old. A live session with a silent feed means the
 *     publishers are down, and a price from before lunch is not what the share is worth now.
 *   - Otherwise: the last print stands, up to `ABANDONED_HOURS`. That IS the reference — the close
 *     you are measuring the overnight pool against. Past four days it is not a weekend any more,
 *     it is a feed nobody maintains, which is the shard-0 failure above.
 *
 * A feed whose own confidence interval is wider than `MAX_CONF_BPS` is refused outright at any
 * hour. Pyth saying "somewhere around $220, give or take 3%" is not a number you can measure a 1.2%
 * decoupling against, and pretending otherwise would put a fabricated precision into a verdict an
 * owner's money depends on.
 *
 * Nothing here ever guesses. Every path that cannot produce a print returns null, and
 * `referencePriceUsd` falls back to the issuer's mark, which is still a real number from a real
 * venue — just not an independent one.
 */
import { PublicKey } from '@solana/web3.js';
import { postJson } from '../http/get.js';
import { log } from '../http/request-id.js';
import { underlyingTicker } from './edgar.js';
import { getNasdaqSession } from './nasdaq.js';

/**
 * The program the sponsored price accounts are PDAs of.
 *
 * Note this is NOT the program that owns them — the accounts are owned by the receiver
 * (`rec5EK…`), which is what writes them, but they are addressed under the push oracle. Deriving
 * against the owner is the obvious wrong turn and yields addresses that do not exist.
 */
const PUSH_ORACLE = new PublicKey('pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT');

/** The program that owns a real price account. An account owned by anything else is not one. */
const RECEIVER = 'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ';

/** Read both, take the fresher. See the header. */
const SHARDS = [0, 1];

/**
 * Mainnet, deliberately, and never the fork.
 *
 * The fork is a snapshot with our own test money in it; its Pyth accounts are frozen at whatever
 * block it was cut from. A reference price has to come from the live chain or it is just another
 * copy of the thing it is supposed to check.
 */
function rpcUrl(): string {
  return process.env.PYTH_RPC ?? process.env.MAINNET_RPC ?? 'https://api.mainnet-beta.solana.com';
}

/**
 * `Equity.US.<TICKER>/USD` feed ids, from Pyth's own price-feed index.
 *
 * Hard-coded because they are content addresses — a feed id is derived from the symbol and never
 * changes — and because resolving them at runtime would put the keyed Hermes endpoint back on the
 * critical path to read a constant.
 */
export const EQUITY_FEEDS: Record<string, string> = {
  NVDA: 'b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593',
  TSLA: '16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1',
  AAPL: '49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688',
  MSFT: 'd0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1',
  AMZN: 'b5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a',
  GOOGL: '5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6',
  META: '78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe',
  MSTR: 'e1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09',
  COIN: 'fee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245',
  SPY: '19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5',
  QQQ: '9695e2b96ea7b3859da9ed25b7a46a920a776e2fdae19a7bcfdf2b219230452d',
};

/** A live session with a print older than this means the publishers are down, not that it is quiet. */
const FRESH_TRADING_MS = 15 * 60_000;
/** Past this, a silent feed is not a closed exchange. It is an abandoned shard. */
const ABANDONED_HOURS = 96;
/** Wider than this and the feed is not precise enough to measure a decoupling against. */
const MAX_CONF_BPS = 100;

/** How long a batch of marks is reused. One read serves every symbol in a sweep. */
const TTL_MS = 60_000;

export type PythMark = {
  /** The ticker as Pyth names it, e.g. NVDA. */
  ticker: string;
  usd: number;
  /** Pyth's own uncertainty, in basis points of the price. */
  confBps: number;
  /** When the print this describes was made. */
  publishedAt: Date;
  /** The account it was read from, so a verdict can be checked against the chain. */
  account: string;
  shard: number;
};

/**
 * The address Pyth's push oracle writes this feed to on this shard.
 *
 * Exported so a test can assert the derivation against a known-good address rather than against
 * this function's own output, which would only prove it is consistent with itself.
 */
export function priceAccount(feedId: string, shard: number): PublicKey {
  const seed = Buffer.alloc(2);
  seed.writeUInt16LE(shard);
  return PublicKey.findProgramAddressSync([seed, Buffer.from(feedId, 'hex')], PUSH_ORACLE)[0];
}

/**
 * One `PriceUpdateV2` account, or null if these bytes are not one.
 *
 * The struct's header is variable width — `VerificationLevel` is a one-byte enum for `Full` and two
 * for `Partial` — so the fields are located by finding the feed id we asked for rather than by
 * trusting a fixed offset. Requiring that it land where one of the two headers would put it is what
 * stops that search from matching a coincidence deeper in the account.
 */
export function decodePriceUpdate(data: Buffer, feedId: string): Omit<PythMark, 'ticker' | 'account' | 'shard'> | null {
  const want = Buffer.from(feedId, 'hex');
  const at = data.indexOf(want);
  if (at !== 41 && at !== 42) return null;
  let p = at + 32;
  if (data.length < p + 44) return null;
  const price = Number(data.readBigInt64LE(p));
  p += 8;
  const conf = Number(data.readBigUInt64LE(p));
  p += 8;
  const expo = data.readInt32LE(p);
  p += 4;
  const publishTime = Number(data.readBigInt64LE(p));
  const usd = price * 10 ** expo;
  if (!Number.isFinite(usd) || usd <= 0 || publishTime <= 0) return null;
  return {
    usd,
    confBps: price > 0 ? (conf / price) * 10_000 : Number.POSITIVE_INFINITY,
    publishedAt: new Date(publishTime * 1000),
  };
}

/**
 * Whether a print may stand in for "what the share is worth" right now.
 *
 * Separated from the read so the policy can be tested against a clock instead of against the
 * market being open while the suite runs.
 */
export function markIsUsable(mark: { confBps: number; publishedAt: Date }, now: Date = new Date()): boolean {
  if (!(mark.confBps <= MAX_CONF_BPS)) return false;
  const ageMs = now.getTime() - mark.publishedAt.getTime();
  if (ageMs < 0) return false;
  if (ageMs > ABANDONED_HOURS * 3_600_000) return false;
  if (getNasdaqSession(now).session === 'regular') return ageMs <= FRESH_TRADING_MS;
  return true;
}

type AccountValue = { data: [string, string]; owner: string } | null;
type AccountsResponse = { result?: { value?: AccountValue[] }; error?: { message?: string } };

let cache: { at: number; marks: Map<string, PythMark> } | null = null;

/** Testing only — the module-level cache would otherwise carry one case into the next. */
export function clearPythCache(): void {
  cache = null;
}

/**
 * Every equity mark Pyth has on chain right now, keyed by ticker.
 *
 * One request for the whole universe. Twenty-two accounts (eleven tickers across two shards) is one
 * `getMultipleAccounts`, which is the difference between a polite read and twenty-two of them every
 * time the agent evaluates a sweep.
 */
export async function pythEquityMarks(now: Date = new Date()): Promise<Map<string, PythMark>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.marks;

  const wanted: { ticker: string; feedId: string; shard: number; account: string }[] = [];
  for (const [ticker, feedId] of Object.entries(EQUITY_FEEDS)) {
    for (const shard of SHARDS) {
      wanted.push({ ticker, feedId, shard, account: priceAccount(feedId, shard).toBase58() });
    }
  }

  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getMultipleAccounts',
    params: [wanted.map((w) => w.account), { encoding: 'base64', commitment: 'confirmed' }],
  };

  const marks = new Map<string, PythMark>();
  try {
    const res = await postJson<AccountsResponse>(rpcUrl(), payload, TTL_MS, 12_000);
    const values = res.result?.value ?? [];
    wanted.forEach((w, i) => {
      const v = values[i];
      if (!v || v.owner !== RECEIVER) return;
      const decoded = decodePriceUpdate(Buffer.from(v.data[0], 'base64'), w.feedId);
      if (!decoded || !markIsUsable(decoded, now)) return;
      const mark: PythMark = { ticker: w.ticker, account: w.account, shard: w.shard, ...decoded };
      /*
       * The fresher shard wins. Neither is authoritative — one is simply being paid for and the
       * other is not, and which is which has changed before and will again.
       */
      const held = marks.get(w.ticker);
      if (!held || mark.publishedAt > held.publishedAt) marks.set(w.ticker, mark);
    });
  } catch (e) {
    log.info(`[pyth] no equity marks this pass: ${e instanceof Error ? e.message : e}`);
    return cache?.marks ?? new Map();
  }

  cache = { at: Date.now(), marks };
  return marks;
}

/**
 * Pyth's price for the share behind an xStock, or null when it has no usable one.
 *
 * Takes the token symbol (`NVDAx`) rather than the ticker, because that is what every caller has.
 */
export async function pythEquityPrice(symbol: string, now: Date = new Date()): Promise<PythMark | null> {
  const ticker = underlyingTicker(symbol);
  if (!EQUITY_FEEDS[ticker]) return null;
  const marks = await pythEquityMarks(now);
  return marks.get(ticker) ?? null;
}
