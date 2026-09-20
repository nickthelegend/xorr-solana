/**
 * Bring the research book across from the first xorr, once, as data.
 *
 * The original xorr (a Python paper-trading engine) ran 313 strategies through a walk-forward
 * gauntlet: in-sample, out-of-sample, a parameter sensitivity sweep, a double-commission stress
 * test and a cross-asset check. Ten survived. That book is the most honest thing either project
 * owns and it was sitting in a JSON file on one machine.
 *
 * This reads it and writes `src/strategies/library.json`, which is committed. It is a build-time
 * import, not a runtime dependency: the Solana executor never reaches into another repo, and a
 * clone of THIS repo has the whole catalogue.
 *
 * ## What it refuses to do
 *
 * There is no per-strategy equity curve and no per-strategy trade list anywhere in the source —
 * `terminal.db` holds the live paper book, which is a different thing and only 46 trades. So none
 * is invented here. What a strategy has is what it gets: the sweep is real, the two splits are
 * real, and a field the source does not carry comes through as null rather than as a shape.
 *
 * Usage:  node scripts/import-strategy-library.mjs [path-to-xorr-repo]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ?? '/Volumes/Extreme SSD/Projects/xorr';
const OUT = join(HERE, '..', 'src', 'strategies', 'library.json');

/** Where a family's name and idea come from when the generated variants carry neither. */
const FAMILIES = {
  b100: { name: 'Breadth-100', file: 'breadth100.py' },
  b200: { name: 'Breadth-200', file: 'breadth100b.py' },
  deep: { name: 'Deep Dimensions', file: 'deep_dimensions.py' },
  liq: { name: 'Liquidation Flow', file: 'liq_flow_perp.py' },
  macd: { name: 'MACD', file: 'macd_perp.py' },
  donchian: { name: 'Donchian', file: 'donchian_perp.py' },
  cascade: { name: 'Cascade', file: 'liq_flow_perp.py' },
};

/** A python module docstring, trimmed to something a screen can hold. */
function docstringOf(file) {
  const p = join(SRC, 'backend', 'strategies', file);
  if (!existsSync(p)) return null;
  const m = /^"""([\s\S]*?)"""/m.exec(readFileSync(p, 'utf8'));
  if (!m) return null;
  return m[1].trim().replace(/\s*\n\s*/g, ' ').slice(0, 700);
}

/** `liq_squeeze_break_perp` → `Liq Squeeze Break`. The suffix is a venue, not part of the name. */
function humanise(id) {
  return id
    .replace(/_perp$/, '')
    .split('_')
    .map((w) => (/^\d+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

const gauntlet = JSON.parse(readFileSync(join(SRC, 'backend/data_store/gauntlet_all.json'), 'utf8'));
const backtestAll = JSON.parse(readFileSync(join(SRC, 'backend/data_store/backtest_all.json'), 'utf8'));
const detail = backtestAll.per_strategy_unseen ?? {};
const config = backtestAll.config ?? {};

/* Every strategy file's docstring, so a named strategy can find its own. */
const docs = new Map();
for (const f of readdirSync(join(SRC, 'backend', 'strategies')).filter((f) => f.endsWith('.py'))) {
  const d = docstringOf(f);
  if (d) docs.set(f.replace(/\.py$/, ''), d);
}
const familyDocs = new Map(
  Object.entries(FAMILIES).map(([k, v]) => [k, { name: v.name, about: docstringOf(v.file) }]),
);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const strategies = gauntlet.map((e) => {
  const id = e.strategy;
  const prefix = id.split('_')[0];
  const fam = familyDocs.get(prefix) ?? null;
  const own = docs.get(id) ?? null;
  const pk = e.portfolio_known ?? {};
  const pu = e.portfolio_unknown ?? {};
  const d = detail[id] ?? null;

  return {
    id,
    name: humanise(id),
    family: fam?.name ?? null,
    /* The strategy's own words where it has them, its family's where it does not, null otherwise. */
    about: own ?? fam?.about ?? null,
    aboutSource: own ? 'strategy' : fam?.about ? 'family' : null,
    survives: Boolean(e.survives),
    failedOn: Array.isArray(e.failed_on) ? e.failed_on : [],
    /** BTC-only, the split the gauntlet judges on a portfolio instead when n is thin. */
    single: {
      inSample: { returnPct: num(e.known?.return_pct), maxDdPct: num(e.known?.max_dd_pct), sharpe: num(e.known?.sharpe), expectancyR: num(e.known?.expectancy_r), trades: num(e.known?.trades) },
      outOfSample: { returnPct: num(e.unknown?.return_pct), maxDdPct: num(e.unknown?.max_dd_pct), sharpe: num(e.unknown?.sharpe), expectancyR: num(e.unknown?.expectancy_r), trades: num(e.unknown?.trades) },
    },
    portfolio: {
      inSample: { returnPct: num(pk.return_pct), maxDdPct: num(pk.max_dd_pct), sharpe: num(pk.sharpe), expectancyR: num(pk.expectancy_r), trades: num(pk.trades), winRate: num(pk.win_rate), profitFactor: num(pk.profit_factor), feesUsd: num(pk.fees_usd) },
      outOfSample: {
        returnPct: num(pu.return_pct), maxDdPct: num(pu.max_dd_pct), sharpe: num(pu.sharpe), sortino: num(pu.sortino),
        expectancyR: num(pu.expectancy_r), trades: num(pu.trades), winRate: num(pu.win_rate), wins: num(pu.wins), losses: num(pu.losses),
        profitFactor: num(pu.profit_factor), feesUsd: num(pu.fees_usd), avgWinUsd: num(pu.avg_win_usd), avgLossUsd: num(pu.avg_loss_usd),
        bestTradePct: num(pu.best_trade_pct), worstTradePct: num(pu.worst_trade_pct), avgHoldBars: num(pu.avg_hold_bars),
      },
    },
    /** Five parameter settings, the same edge measured at each. Flat is robust; a spike is a fit. */
    sensitivity: { label: e.sens ?? null, expectancyR: Array.isArray(e.sens_detail) ? e.sens_detail.map(num) : [] },
    /** The same book with commission doubled — the test that kills most of them. */
    doubleCommission: { expectancyR: num(e.comm2x_expectancy_r), returnPct: num(e.comm2x_return_pct) },
    /** Expectancy on assets it was not tuned on. */
    crossAsset: e.multi && typeof e.multi === 'object' ? Object.entries(e.multi).map(([asset, expectancyR]) => ({ asset, expectancyR: num(expectancyR) })) : [],
    /** The deeper book, for the 35 that have one. Null is "not measured", never zero. */
    detail: d
      ? {
          trades: num(d.trades), wins: num(d.wins), losses: num(d.losses), winRate: num(d.win_rate),
          totalPnlUsd: num(d.total_pnl), expectancyR: num(d.expectancy_r), avgWinUsd: num(d.avg_win),
          avgLossUsd: num(d.avg_loss), profitFactor: num(d.profit_factor), maxDrawdownUsd: num(d.max_drawdown_usd),
          totalFeesUsd: num(d.total_fees), avgHoldMinutes: num(d.avg_hold_min),
        }
      : null,
  };
});

/* Survivors first, then by out-of-sample Sharpe. A book is read from the top. */
strategies.sort((a, b) => {
  if (a.survives !== b.survives) return a.survives ? -1 : 1;
  return (b.portfolio.outOfSample.sharpe ?? -99) - (a.portfolio.outOfSample.sharpe ?? -99);
});

const out = {
  /* Said once, here, so no screen has to decide how to phrase it. */
  provenance: {
    source: 'xorr paper-trading research engine',
    method: 'walk-forward gauntlet: in-sample and out-of-sample splits, a five-point parameter sweep, a double-commission stress test and a cross-asset check',
    universe: num(config.symbols),
    interval: config.interval ?? null,
    bars: num(config.bars),
    sizeUsd: num(config.size),
    caveat:
      'These are backtests, not a live track record. The engine that produced them traded on paper only. Two strategies in this book looked profitable on a single split and inverted once tested properly, which is what the out-of-sample column and the survives flag exist to show.',
  },
  counts: { total: strategies.length, survivors: strategies.filter((s) => s.survives).length, withDetail: strategies.filter((s) => s.detail).length },
  strategies,
};

writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
console.log(`wrote ${OUT}`);
console.log(`  ${out.counts.total} strategies · ${out.counts.survivors} survive the gauntlet · ${out.counts.withDetail} with a deeper book`);
console.log(`  with their own words: ${strategies.filter((s) => s.aboutSource === 'strategy').length}; family's: ${strategies.filter((s) => s.aboutSource === 'family').length}; none: ${strategies.filter((s) => !s.aboutSource).length}`);
