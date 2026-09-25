/**
 * What an xStock order costs, shown before anyone agrees to it.
 *
 * The order ticket has always shown a size and a button. Between them is everything that decides
 * what the person ends up holding — the venue's price impact at this size, the tolerance the swap
 * would be sent with, the pools it routes through — and none of it was on screen. A ticket that
 * hides those asks somebody to agree to a number it has not shown them.
 *
 * Every figure here comes from a real Jupiter quote for the real size, re-asked as the size changes
 * and debounced so the aggregator is not queried on every keypress. A figure the venue did not
 * report says "Not reported"; it never becomes a zero, which on this screen would read as a cost
 * that was measured and found to be nothing.
 *
 * Buying is here since 2026-09-19: `POST /xstocks/buy` is a door to `executor/place.ts`, the only path that can spend,
 * held by everything that path checks — the permission, the rules, the chain, the issuer's gates, a live quote. The
 * button is enabled only for a symbol this cluster can settle and a size a quote has priced; the receipt is the
 * transaction the chain confirmed, with where it filled.
 *
 * Selling is here since 2026-09-19, signed by the owner: the executor builds one transaction — the owner's shares into
 * the venue vault, the vault's USDC to the owner at Jupiter's live quote — and co-signs its leg; the owner signs theirs
 * in Privy and it is broadcast; the executor reads it back from the chain before booking it.
 *
 * Pre-IPO tokens trade here too since 2026-09-23. The executor already bought, sold, closed and swept Tessera's
 * T-Tokens through the same spend path, and nothing on screen could open one: `/pre-ipo` was a catalogue of rows that
 * went nowhere. They get this ticket rather than a second one because the money path is identical; what differs is
 * what the person needs to read first. An xStock has an attestation, issuer gates and a dividend to show. A T-Token has
 * none of those — it has a pool price, the issuer's own mark, the gap between them and a fee on the mint — so that is
 * what its ticket shows in their place.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  AssetMark,
  Button,
  Fill,
  CloseButton,
  SignInButton,
  FailureNote,
  Tag,
  Keypad,
  Pill,
  Price,
  Screen,
  Segmented,
  Text,
  colors,
  money,
  price as fmtPrice,
  quantity,
  size,
  space,
} from '@/ui';
import { useAsync } from '@/data/useAsync';
import { useLogo } from '@/data/useLogos';
import { assetGradient } from '@/design/gradients';
import { useDebounced } from '@/data/useDebounced';
import { useStore } from '@/state/store';
import { system, type XStockBuyOutcome, type XStockSellOutcome } from '@/data/system';
import { walletTokens } from '@/data/walletTokens';
import { useXStockSell } from '@/markets/useXStockSell';
import { useIntentKeys } from '@/data/useIntentKeys';
import { errorText } from '@/data/apiError';
import { useSignedOut } from '@/auth/useSignedOut';
import { breakdownRows, worstCase } from '@/markets/breakdown';
import { useAuth } from '@/auth/useAuth';
import { BackingBadge } from '@/ui/BackingBadge';
import { BackingDrawer } from '@/ui/BackingDrawer';
import { EligibilityNotice } from '@/ui/EligibilityNotice';
import { fetchBacking } from '@/data/backing';
import { fetchBackingDetail } from '@/data/backingDetail';
import { fetchReservesHistory } from '@/data/reservesHistory';
import { fetchYield } from '@/data/dividendYield';
import { fetchEligibility, mayBuy } from '@/data/eligibility';
import { preIpo, type PreIpoRow } from '@/data/preIpo';
import { percent } from '@/format';

const SIDES = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
] as const;

/**
 * The quick amounts, sized to what the wallet can spend (2026-09-25).
 *
 * They were $100 / $250 / $500 for everyone and the amount opened at $250, so over a wallet holding $14 every chip and
 * the default were orders it could not pay for, and the first quote a new user saw was for money they did not have.
 * The largest ladder that fits whole is offered; a wallet smaller than every ladder gets the rungs of the smallest that
 * fit, and one smaller than those keeps the smallest ladder rather than a row of nothing. Unknown — signed out, or the
 * chain not read yet — keeps the ladder it always had.
 */
const LADDERS: readonly (readonly number[])[] = [
  [100, 250, 500],
  [25, 50, 100],
  [5, 10, 25],
];

function quickAmounts(budget: number | undefined): readonly number[] {
  const largest = LADDERS[0]!;
  const smallest = LADDERS[LADDERS.length - 1]!;
  if (budget === undefined) return largest;
  const whole = LADDERS.find((ladder) => ladder[ladder.length - 1]! <= budget);
  if (whole) return whole;
  const fits = smallest.filter((usd) => usd <= budget);
  return fits.length > 0 ? fits : smallest;
}

/** The most a ticket opens at, when the wallet can pay it. */
const OPENING_USD = 250;

const FORMAT = { money, quantity, price: fmtPrice };

/**
 * What somebody needs before buying a private company's token, in place of the xStock's backing panels.
 *
 * Both prices and the gap, because neither is "the" price: the pool is what a buy fills at, the mark is what the
 * issuer says the company is worth, and nothing independent sits between them. Then the fee, which the mint charges on
 * every transfer — this buy and the sale after it — whatever the route.
 */
function PreIpoFacts({ row }: { row: PreIpoRow }) {
  const gap =
    row.spreadPct === null
      ? null
      : `The pool is ${percent(Math.abs(row.spreadPct), { digits: 1, explicitSign: false })} ${row.spreadPct >= 0 ? 'above' : 'below'} the issuer's mark.`;
  return (
    <View style={{ marginTop: space.s8, gap: space.s4 }} testID="preipo-facts">
      <Text variant="footnote" color={colors.sheet.muted}>
        {`${row.name} · ${row.sector} · private, tokenised by Tessera`}
      </Text>
      <Text variant="footnote" color={colors.sheet.ink} figure="market">
        {row.markUsd === null
          ? `Pool ${row.poolUsd === null ? 'has no route' : fmtPrice(row.poolUsd)} · Tessera publishes no mark right now`
          : `Pool ${row.poolUsd === null ? 'has no route' : fmtPrice(row.poolUsd)} · Tessera mark ${fmtPrice(row.markUsd)}${row.markStale ? ' (last known)' : ''}`}
      </Text>
      {gap ? (
        <Text variant="footnote" color={Math.abs(row.spreadPct ?? 0) >= 10 ? colors.warn : colors.sheet.muted}>
          {gap}
        </Text>
      ) : null}
      <Text variant="footnote" color={colors.sheet.muted}>
        {`The mint charges ${row.transferFeeBps} bps on every transfer, in and out. No route avoids it.`}
      </Text>
    </View>
  );
}

export default function XStockTicket() {
  const { symbol = '' } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const logo = useLogo(symbol || undefined);
  const goBack = useGoBack();

  // The same store the order ticket types into, so moving between the two keeps the amount.
  const orderAmt = useStore((s) => s.orderAmt);
  const pressKey = useStore((s) => s.pressKey);
  const setOrderAmt = useStore((s) => s.setOrderAmt);
  const side = useStore((s) => s.side);
  const setSide = useStore((s) => s.setSide);

  const amount = parseFloat(orderAmt || '0') || 0;

  /*
   * Debounced, and not as a nicety.
   *
   * Every keypress would otherwise be a real quote at the aggregator, and the order ticket learned
   * this the expensive way: the swap an order needed queued behind the quotes drawn for its own
   * decoration, and one measured buy waited 153 seconds before failing on a price that had moved.
   */
  const quoted = useDebounced(amount);

  const signedOut = useSignedOut();
  const keys = useIntentKeys();
  // Tradable is a fact about this cluster: on a fork, the xStocks whose mint it cloned (`/market/tradable`).
  const tradable = useAsync(() => system.tradable(), []);
  /** Every xStock this build lists, to tell "not listed at all" from "listed but not settleable on this cluster". */
  const catalog = useAsync(() => system.xstocks(), []);
  /*
   * Nothing is asked about a symbol until the catalogue says it exists (2026-09-20). `/xstock/FAKEx` fired the quote
   * and all four panels before the screen could know better: four 404s and a 502 in the network tab, for a token this
   * build does not list. Undefined while the catalogue is still answering, so a listed symbol waits only for one
   * cached read before its own reads start.
   */
  const isXStock = catalog.data ? catalog.data.rows.some((r) => r.symbol === symbol) : undefined;
  /*
   * A T-Token is named `T-<Company>` by its issuer; only such a symbol waits on the pre-IPO catalogue, so an xStock
   * ticket asks nothing extra. Nothing is read for either class until its own catalogue has said the symbol exists.
   */
  const maybePreIpo = symbol.startsWith('T-');
  const preIpoCatalog = useAsync(() => (maybePreIpo ? preIpo.list() : Promise.resolve(null)), [maybePreIpo]);
  const preIpoRow: PreIpoRow | undefined = preIpoCatalog.data?.rows.find((r) => r.symbol === symbol);
  const isPreIpo = !!preIpoRow;
  const listed: boolean | undefined = isPreIpo
    ? true
    : maybePreIpo
      ? preIpoCatalog.data || preIpoCatalog.error
        ? false
        : undefined
      : isXStock;
  /** The issuer-specific panels — attestation, reserves, dividends, holder gates — exist for xStocks only. */
  const hasBacking = listed === true && !isPreIpo;
  const canSettle = !!tradable.data?.some((t) => t.symbol === symbol);
  const [buying, setBuying] = useState(false);

  // What backs the token, and whether the issuer's own gates let this wallet hold it — each read from its route, each
  // saying so in words when it could not be read.
  const { address } = useAuth();
  /*
   * The executor serves the backing panels to a session only, so a signed-out visitor is not sent four requests that
   * are certain to be refused (2026-09-23: four 401s in the console, and a "Backing unverified" badge that was really
   * "not asked"). The badge says what is missing instead.
   */
  const readBacking = hasBacking && !signedOut;
  const backing = useAsync(() => (readBacking ? fetchBacking(symbol) : Promise.resolve(undefined)), [symbol, readBacking]);
  const detail = useAsync(() => (readBacking ? fetchBackingDetail(symbol) : Promise.resolve(null)), [symbol, readBacking]);
  const history = useAsync(() => (readBacking ? fetchReservesHistory(symbol) : Promise.resolve(null)), [symbol, readBacking]);
  const income = useAsync(() => (readBacking ? fetchYield(symbol) : Promise.resolve(undefined)), [symbol, readBacking]);
  const eligibility = useAsync(
    () => (hasBacking && address ? fetchEligibility(symbol, address) : Promise.resolve(undefined)),
    [symbol, address, hasBacking],
  );
  const [showBacking, setShowBacking] = useState(false);

  // What the owner holds of this xStock, read from the chain — a sale is never sized past it.
  const tokens = useAsync(() => (address ? walletTokens() : Promise.resolve(null)), [address, side]);
  const held = tokens.data?.tokens.find((t) => t.symbol === symbol);
  const heldUnits = held?.units ?? 0;
  const heldUsd = held?.usd ?? 0;
  /*
   * The USDC a buy can spend, from the same read: `/wallet/tokens` lists USDC only when there is some, so absent from
   * an answered read is none. Undefined until the chain has answered.
   */
  const usdc = tokens.data ? (tokens.data.tokens.find((t) => t.symbol === 'USDC')?.units ?? 0) : undefined;
  /** What the chips are sized to: the USDC for a buy, the holding's worth for a sale. */
  const quick = quickAmounts(side === 'buy' ? usdc : tokens.data ? heldUsd : undefined);

  /*
   * The amount opens at what the wallet can pay (2026-09-25): at most $250, and never more than the USDC it holds,
   * rounded down to the dollar. Once per visit, the first time the balance is known on the buy side, and only if the
   * person has not already typed or picked an amount here. An amount carried in that the wallet can pay is left alone.
   */
  const touched = useRef(false);
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || touched.current || side !== 'buy' || usdc === undefined) return;
    opened.current = true;
    const affordable = Math.min(OPENING_USD, Math.floor(usdc));
    if (amount > affordable) setOrderAmt(String(affordable));
  }, [usdc, side, amount, setOrderAmt]);
  /** An amount the person chose. From here on the opening amount is theirs, not the balance's. */
  const choose = (usd: string) => {
    touched.current = true;
    setOrderAmt(usd);
  };
  const press = (key: string) => {
    touched.current = true;
    pressKey(key);
  };
  /*
   * A sale is never sized past the holding, so the breakdown is not quoted past it either (2026-09-20). Typing $1,009
   * against 0.4499 NVDAx drew "Expected 997.52 USDC" over a button that would sell $100 of shares: the panel described
   * a trade that could not happen. Only once the chain has answered — until then the typed amount stands.
   */
  const cappedToHolding = side === 'sell' && !!tokens.data && heldUsd > 0 && quoted > heldUsd;
  const quoteUsd = cappedToHolding ? heldUsd : quoted;
  const quote = useAsync(
    () =>
      // A quote is drawn for a session; signed out it is not asked for, and the sheet says why.
      quoteUsd > 0 && listed && !signedOut
        ? system.xstockQuote({ symbol, side, usd: quoteUsd })
        : Promise.resolve(null),
    [symbol, side, quoteUsd, listed, signedOut],
  );
  const { sell: sellShares, selling, ready: canSell } = useXStockSell();
  const [sold, setSold] = useState<XStockSellOutcome>();
  const [sellError, setSellError] = useState<string>();
  /** Shares this sale is for: what the quote says the dollar amount buys back, never more than is held. */
  /*
   * Everything held, when that is what was asked (2026-09-23). The quote sizes shares from dollars at the quote's own
   * price, which sits a hair off the mark the holding is valued at — so "You hold 0.0876 NVDAx, so this sells all of
   * it" sat over a button selling 0.0874 and leaving 0.0002 behind. An amount at or past the holding sells the holding.
   */
  const sellingAll = cappedToHolding || (side === 'sell' && heldUsd > 0 && quoted >= heldUsd - 0.01);
  const sellUnits = side === 'sell' && quote.data ? (sellingAll ? heldUnits : Math.min(quote.data.pay, heldUnits)) : 0;

  async function sell() {
    if (selling || !(sellUnits > 0)) return;
    setSellError(undefined);
    setSold(undefined);
    try {
      setSold(await sellShares(symbol, sellUnits));
      tokens.reload();
    } catch (e) {
      setSellError(errorText(e));
    }
  }
  const [result, setResult] = useState<XStockBuyOutcome>();
  const [buyError, setBuyError] = useState<string>();

  async function buy() {
    if (buying || !(amount > 0)) return;
    setBuying(true);
    setBuyError(undefined);
    setResult(undefined);
    try {
      setResult(await keys.send(`xstock-buy:${symbol}:${amount}`, (idempotencyKey) => system.xstockBuy({ symbol, usd: amount }, { idempotencyKey })));
    } catch (e) {
      setBuyError(errorText(e));
    } finally {
      setBuying(false);
    }
  }

  const rows = useMemo(
    () => (quote.data ? breakdownRows(quote.data, FORMAT) : []),
    [quote.data],
  );

  /*
   * A symbol this build does not list at all (2026-09-20). `/xstock/FAKEx` drew the whole ticket — backing unverified,
   * eligibility unknown, a quote refusal with its error reference — for a token that does not exist. That is a
   * not-found, and it says so once the catalogue has answered. A LISTED xStock whose mint this cluster lacks keeps its
   * ticket and its own "cannot settle here" line; the two are different facts.
   */
  if (listed === false) {
    return (
      <Screen light gutter="sheet">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="sheetTitle" color={colors.sheet.ink}>
            Not listed
          </Text>
          <CloseButton onPress={() => goBack()} light />
        </View>
        <Fill style={{ justifyContent: 'center', gap: space.s12 }}>
          <Text variant="body" color={colors.sheet.muted} align="center">
            {maybePreIpo ? `There is no pre-IPO token called ${symbol} here.` : `There is no xStock called ${symbol} here.`}
          </Text>
          <Button
            label={maybePreIpo ? 'See the pre-IPO tokens' : 'See the xStocks'}
            onPress={() => router.replace(maybePreIpo ? '/pre-ipo' : '/xstocks')}
            testID="xstock-not-listed"
          />
        </Fill>
      </Screen>
    );
  }

  return (
    <Screen light gutter="sheet">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s10, flexShrink: 1 }}>
          <AssetMark gradient={assetGradient(symbol)} {...logo} size={30} />
          <Text variant="sheetTitle" color={colors.sheet.ink}>
            {symbol}
          </Text>
        </View>
        <CloseButton onPress={() => goBack()} light />
      </View>

      {maybePreIpo ? (
        preIpoRow ? (
          <PreIpoFacts row={preIpoRow} />
        ) : null
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8, marginTop: space.s8, flexWrap: 'wrap' }}>
          {signedOut ? (
            // The sheet's own grey: the neutral tone is drawn for black screens and vanishes on this white one.
            <Tag
              label="Sign in to check backing"
              colors={{ bg: colors.sheet.fill, fg: colors.sheet.muted }}
              small
              testID="xstock-backing"
            />
          ) : (
            <>
              <BackingBadge backing={backing.data ?? undefined} testID="xstock-backing" />
              <Pill
                label={showBacking ? 'Hide backing' : 'What backs it'}
                light
                onPress={() => setShowBacking((v) => !v)}
                testID="xstock-backing-toggle"
              />
            </>
          )}
        </View>
      )}
      {address && !maybePreIpo ? (
        <EligibilityNotice eligibility={eligibility.data ?? undefined} style={{ marginTop: space.s8 }} testID="xstock-eligibility" />
      ) : null}

      <Segmented
        options={SIDES}
        value={side}
        onChange={setSide}
        light
        height={size.segThumb}
        style={{ marginTop: space.s18 }}
      />

      <View style={{ alignItems: 'center', marginTop: space.s20, gap: space.s6 }}>
        {/* Being typed, so never masked: an order its author cannot read is not private, it is unusable. */}
        <Price variant="heroAmount" color={colors.sheet.ink} figure="input">
          ${orderAmt}
        </Price>
        <Text variant="body" color={colors.sheet.muted}>
          {quote.data ? worstCase(quote.data, FORMAT) : `${side === 'buy' ? 'Buying' : 'Selling'} ${symbol}`}
        </Text>
      </View>

      <View
        style={{ flexDirection: 'row', gap: space.s8, marginTop: space.s16, justifyContent: 'center' }}
      >
        {quick.map((usd) => (
          <Pill key={usd} label={`$${usd}`} light onPress={() => choose(String(usd))} />
        ))}
        {side === 'sell' && heldUsd > 0 ? (
          // Everything held, at the chain's balance and the live price; the quote then sizes the shares exactly.
          <Pill label="All" light onPress={() => choose(String(Math.floor(heldUsd * 100) / 100))} testID="xstock-sell-all" />
        ) : null}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: space.s12 }}
        style={{ flex: 1, marginTop: space.s12 }}
      >
        {showBacking ? (
          <View style={{ marginBottom: space.s12 }} testID="xstock-backing-drawer">
            <BackingDrawer
              detail={detail.loading ? undefined : detail.data ?? null}
              history={history.loading ? undefined : history.data ?? null}
              income={income.data ?? undefined}
            />
          </View>
        ) : null}
        {amount <= 0 ? (
          <Text variant="secondary" color={colors.sheet.muted} align="center" style={{ paddingVertical: space.s20 }}>
            Enter an amount to see what it costs.
          </Text>
        ) : signedOut ? (
          <Text variant="secondary" color={colors.sheet.muted} align="center" style={{ paddingVertical: space.s20 }}>
            Sign in to see what this costs at the pool right now.
          </Text>
        ) : quote.error ? (
          /*
            No quote is a real answer, and `failures.ts` already knows how to say which kind it is —
            nobody would price this, or the ask never landed. A breakdown of zeroes in its place
            would read as a free trade.
          */
          <FailureNote error={quote.error} light style={{ marginTop: space.s10 }} />
        ) : quote.loading || !quote.data ? (
          <Text variant="secondary" color={colors.sheet.muted} align="center" style={{ paddingVertical: space.s20 }}>
            Asking the venue…
          </Text>
        ) : (
          rows.map((r) => (
            <View
              key={r.label}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                paddingVertical: space.s10,
                gap: space.s12,
              }}
            >
              <Text variant="secondary" color={colors.sheet.muted}>
                {r.label}
              </Text>
              <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                {/* Market figures, not this person's money: they stay legible while balances are hidden. */}
                <Price
                  variant="secondary"
                  color={r.cost ? colors.down : colors.sheet.ink}
                  figure="market"
                  numberOfLines={1}
                >
                  {r.value}
                </Price>
                {r.note ? (
                  <Text
                    variant="footnote"
                    color={colors.sheet.muted}
                    align="right"
                    style={{ marginTop: space.s2 }}
                    figure="market"
                  >
                    {r.note}
                  </Text>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Keypad light onPress={press} />

      {side === 'buy' ? (
        <View style={{ paddingTop: space.s12, gap: space.s8 }}>
          {result?.status === 'filled' ? (
            <View style={{ gap: space.s4 }}>
              <Text variant="rowPrimary" color={colors.sheet.ink} align="center">
                {`Bought ${quantity(result.units)} ${result.symbol} at ${fmtPrice(result.price)}`}
              </Text>
              <Text variant="footnote" color={colors.sheet.muted} align="center">
                {`${result.venue === 'jupiter-route' ? 'Routed by Jupiter' : 'Filled from the venue vault, not a Jupiter swap'} · slot ${result.slot}`}
              </Text>
              <Text
                variant="footnote"
                color={colors.sheet.ink}
                align="center"
                onPress={() => void Linking.openURL(result.explorer)}
                accessibilityRole="link"
              >
                {`Transaction ${result.signature.slice(0, 8)}…${result.signature.slice(-6)}`}
              </Text>
            </View>
          ) : result?.status === 'blocked' ? (
            <View style={{ gap: space.s8 }}>
              <Text variant="footnote" color={colors.down} align="center">
                {result.message}
              </Text>
              {/* A refusal the person can act on gets the door to act on it, rather than a sentence and a dead end. */}
              {result.reason === 'no_permission' || result.reason === 'delegation_revoked' ? (
                <Pill
                  label="Give permission"
                  light
                  onPress={() => router.push('/delegate')}
                  testID="xstock-grant-cta"
                />
              ) : null}
            </View>
          ) : buyError ? (
            <Text variant="footnote" color={colors.down} align="center">
              {buyError}
            </Text>
          ) : !tradable.data || canSettle ? null : (
            <Text variant="footnote" color={colors.sheet.muted} align="center">
              {`${symbol} cannot settle on this network yet, so it can be priced here but not bought.`}
            </Text>
          )}
          {signedOut ? (
            <SignInButton label="Sign in to buy" />
          ) : (
            <Button
              label={buying ? 'Buying' : `Buy ${money(amount)} of ${symbol}`}
              loading={buying}
              disabled={!(amount > 0) || !quote.data || !canSettle || (!!eligibility.data && !mayBuy(eligibility.data))}
              onPress={buy}
            />
          )}
        </View>
      ) : (
        <View style={{ paddingTop: space.s12, gap: space.s8 }}>
          {sold?.status === 'filled' ? (
            <View style={{ gap: space.s4 }}>
              <Text variant="rowPrimary" color={colors.sheet.ink} align="center">
                {`Sold ${quantity(sold.units)} ${sold.symbol} for ${money(sold.usd)}`}
              </Text>
              <Text variant="footnote" color={colors.sheet.muted} align="center">
                {/* A Jupiter swap you signed (2026-09-24); "against the venue vault" was the fork-era wording. */}
                {`Swapped through Jupiter, signed by you · slot ${sold.slot}`}
              </Text>
              <Text
                variant="footnote"
                color={colors.sheet.ink}
                align="center"
                onPress={() => void Linking.openURL(sold.explorer)}
                accessibilityRole="link"
              >
                {`Transaction ${sold.signature.slice(0, 8)}…${sold.signature.slice(-6)}`}
              </Text>
            </View>
          ) : sold?.status === 'blocked' ? (
            <Text variant="footnote" color={colors.down} align="center">
              {sold.message}
            </Text>
          ) : sellError ? (
            <Text variant="footnote" color={colors.down} align="center">
              {sellError}
            </Text>
          ) : (
            <Text variant="footnote" color={colors.sheet.muted} align="center">
              {tokens.data
                ? heldUnits > 0
                  ? cappedToHolding
                    ? `You hold ${quantity(heldUnits)} ${symbol}, so this sells all of it.`
                    : `You hold ${quantity(heldUnits)} ${symbol}.`
                  : `You hold no ${symbol} to sell.`
                : `Reading what you hold…`}
            </Text>
          )}
          {signedOut ? (
            <SignInButton label="Sign in to sell" />
          ) : (
            <Button
              label={selling ? 'Selling' : sellUnits > 0 ? `Sell ${quantity(sellUnits)} ${symbol}` : `Sell ${symbol}`}
              loading={selling}
              disabled={!(sellUnits > 0) || !canSell}
              onPress={sell}
              testID="xstock-sell"
            />
          )}
        </View>
      )}
    </Screen>
  );
}
