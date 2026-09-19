# xorr-solana — end-to-end test plan (Stocklana build)

Written 2026-09-19 before any item was run. Every item is checked in a real browser against the real running app
(web build, `EXPO_PUBLIC_XORR_CHAIN=solana-fork`) talking to the real executor on a real `solana-test-validator`
mainnet fork, with real Postgres. An item **PASSes** only when the observed result matches its "Correct means" column
exactly **and** the browser console shows no error and the network tab shows no failed (4xx/5xx/blocked) request
for that step, other than a refusal the item itself expects.

Statuses: **PASS** · **FAIL** (with the fix, then re-run) · **UNTESTABLE** (a named external dependency is missing —
never counted as a pass).

Environment for every run:
- Fork: `npx tsx infra/solana-fork/fork-bootstrap.ts` → `http://127.0.0.1:8899`, cloning mainnet USDC
  (`EPjFWdd…`), NVDAx (`Xsc9qvG…`, Token-2022), Jupiter v6, Orca Whirlpool and the USDC/NVDAx pool.
- Executor: `server/`, `XORR_CHAIN=solana-fork`, `DATABASE_URL=…/xorr_solana`, `PORT=8788`.
- App: Expo web on `localhost`, `EXPO_PUBLIC_XORR_CHAIN=solana-fork`, `EXPO_PUBLIC_API_URL=http://localhost:8788`.
- Test identity: a Privy test account (OTP read from Privy's test-credentials API, typed into the real form).

---

## A. Infrastructure

| # | Item | Correct means |
|---|---|---|
| A1 | Fork bootstrap (README step 3) | Command exits 0; afterwards the validator still answers `getSlot` on 8899; dev owner USDC ATA reads 25,000 and NVDAx reads 10 × the mint's live Scaled-UI multiplier. |
| A2 | Executor boots on `solana-fork` | Process listens on `PORT`; `GET /health` answers 200 and reports the **Solana** cluster, RPC reachable, slot > 0 — no EVM RPC / delegation-contract probe marking it degraded. |
| A3 | Web app loads | `/` renders the welcome screen; console has zero errors; every network request from the page is 2xx/3xx (media 206 allowed). |
| A4 | Chain agreement | App and executor both report `solana-fork`; a mismatch would render the network-mismatch screen (checked by reading `/health` vs the app's chain). |

## B. Sign-in and the user's wallet

| # | Item | Correct means |
|---|---|---|
| B1 | Email sign-in | Welcome → Sign in → email → code (from Privy test credentials) → session established; no console error. |
| B2 | Solana embedded wallet | After sign-in the account holds a **Privy Solana embedded wallet** (base58 address, 32–44 chars); no raw key is written to `localStorage`/SecureStore by the app. |
| B3 | Wallet bound to executor | `POST /wallet/connect` with the base58 address → 200; `wallets.address` row in Postgres equals it; the executor refuses an address not linked to the Privy user (403). |
| B4 | Home balance | Home shows the wallet's real fork USDC balance (equal to `getTokenAccountBalance` on its USDC ATA, or `$0.00` with an explicit "no USDC yet" state when the ATA does not exist); `GET /wallet/balance` 200. |
| B5 | Sign out / sign back in | Sign out clears the session; signing back in shows the same base58 address (the wallet is the account's, not the browser's). |

## C. Funding

| # | Item | Correct means |
|---|---|---|
| C1 | Fork funding (test money) | On the fork, "Get test USDC" mints real USDC to the user's ATA through the fork's mint authority; balance rises by exactly the requested amount, read back from chain; labelled as fork copy money, never as real. |
| C2 | MoonPay sandbox handoff | "Buy with card" opens a MoonPay **sandbox** URL for `usdc_sol` to the user's base58 address, signed with the real sandbox secret. No hard-coded fallback key anywhere. |
| C3 | MoonPay webhook | Only a request carrying a valid MoonPay signature is accepted; an unsigned/forged POST → 401 and writes nothing. |

## D. Permission (grant) — the non-custodial core

| # | Item | Correct means |
|---|---|---|
| D1 | Grant | Delegate screen: user sets a daily cap, taps Grant, the **user's Privy Solana wallet signs an SPL `Approve`** (USDC, classic Token program) naming the executor's delegate with amount = cap; tx confirmed on fork; signature shown with a Solana explorer link. |
| D2 | Executor reads the grant from chain | `GET /delegation` returns delegate = executor delegate pubkey and `delegatedAmount` = cap, read from the token account (not a DB echo). |
| D3 | Safety shows LIVE | `/safety` shows trading live with the on-chain cap; the kill-switch chip reads "armed" from the chain. |
| D4 | Rejecting the signature | Cancelling the wallet prompt leaves no grant (chain unchanged), shows a calm "not granted" message, no console error. |
| D5 | Grant over balance / zero / non-number | Cap of 0, negative, non-numeric → Grant disabled with the reason; no transaction. |

## E. Markets (xStocks)

| # | Item | Correct means |
|---|---|---|
| E1 | Catalog | `/xstocks` lists the xStocks from `GET /market/xstocks` with live Jupiter prices; a symbol Jupiter cannot price shows "No price", never a number. |
| E2 | Detail + quote | `/xstock/NVDAx` shows a live Jupiter quote breakdown (in, out, price impact, route) from `GET /market/xstocks/quote`. |
| E3 | Backing / reserves / eligibility / yield | Each panel loads from its route with real data or states plainly that it is unavailable; no 5xx. |
| E4 | Search | Search "nvda" finds NVDAx. |

## F. Trading from the app

| # | Item | Correct means |
|---|---|---|
| F1 | Buy NVDAx | On `/xstock/NVDAx`, entering $25 and tapping Buy runs the executor's single spend path (`guardAndSpend`): delegate pulls USDC from the user's ATA within the grant, Jupiter routes USDC→NVDAx; the receipt shows the real signature + slot + venue (`jupiter-route` or, honestly labelled, `venue-vault`); user's NVDAx balance on chain rises. |
| F2 | Over the cap | A buy larger than the remaining on-chain allowance is refused before any transfer, with the reason; chain balances unchanged. |
| F3 | No grant | With no delegation, Buy is refused ("grant the bot a permission first"); no transfer. |
| F4 | Holdings | The position appears in Holdings with Scaled-UI-correct units (raw × multiplier) and cost basis = USDC spent. |
| F5 | Activity + notification | Activity shows the buy with its signature; a notification/inbox row exists for it. |

## G. Autonomous agent

| # | Item | Correct means |
|---|---|---|
| G1 | Off-hours reference price | Outside Nasdaq regular hours the guard compares against a **Solana-native** reference (xStocks issuer mark via Jupiter `stockData`), not 1inch/Base; with a reference present it can return `buy`. |
| G2 | Agent selects and buys | One scheduler tick with a live grant: the agent records its chosen strategy + reason, places through `guardAndSpend`, fill booked to positions, notification sent. |
| G3 | Stop all / resume | Stop → the next tick places nothing (recorded as stopped); Resume → it can place again. |

## H. Kill switch

| # | Item | Correct means |
|---|---|---|
| H1 | Revoke | `/safety` → Stop: the **user's wallet signs an SPL `Revoke`**; confirmed; the token account shows no delegate. |
| H2 | After revoke | F1 now refuses with "no permission"; the agent tick places nothing; `/safety` reads not trading. |

## I. Withdrawals

| # | Item | Correct means |
|---|---|---|
| I1 | Allowlist add | A valid base58 address is added with a 24h cooling-off shown; an `0x` address or garbage is rejected with the reason. |
| I2 | Withdraw before cooling-off | Refused with the time remaining; no transaction. |
| I3 | Withdraw after cooling-off | User's wallet signs an SPL transfer of the amount; confirmed; source falls and destination rises by exactly that amount on chain. |

## J. Robustness

| # | Item | Correct means |
|---|---|---|
| J1 | Executor down | With the executor stopped, screens say they cannot reach it (no blank screens, no fabricated numbers), and recover when it returns. |
| J2 | Rules engine error | If the rules engine throws, `guardAndSpend` **refuses** (fails closed) — never places. |
| J3 | Quote failure mid-buy | If the quote fails, no USDC has left the user (the transfer happens only after a valid quote). |

---

## Results

_Filled in as items are run. Each FAIL lists its root cause and fix, then the re-run._

Run on 2026-09-19 against the local mainnet fork (`solana-test-validator --clone`, USDC + NVDAx + Jupiter + Orca), the
executor on `:8788` (`XORR_CHAIN=solana-fork`, Postgres `xorr_solana`) and the web app on `:8090`, signed in as the
Privy test account (Solana wallet `GiKwSk…sHJM`). Every on-chain step is a real signed transaction on the fork.

| # | Status | Evidence / notes |
|---|---|---|
| A1 | PASS | After the fix below, the validator outlives the bootstrap; USDC and NVDAx (Scaled UI ×1.0017) read from the fork. |
| A2 | PASS | `/health` 200: `solana-fork`, postgres/rpc/gas/upstreams up, delegate `CZqa…soeu`. Startup banner now names the cluster. |
| A3 | PASS | Every same-origin and API request 2xx on a walk of Home, Markets, xStocks, ticket, Safety, Deposit, Activity, agent, Search. The only status-0 entries are Privy's cross-origin iframe, which browsers always report as 0. The one 503 (MoonPay config) was fixed to a 200 state. |
| A4 | PASS | App (`EXPO_PUBLIC_XORR_CHAIN`) and `/health` both `solana-fork`. |
| B1 | PASS | Email sign-in through Privy with the test account's code. |
| B2 | PASS | Privy Solana embedded wallet `GiKwSk…`; no key material in `localStorage` (the raw-keypair wallet was deleted). |
| B3 | PASS | `/wallet/connect` 200 for the linked base58 wallet (row in `wallets`); 403 `wallet_not_linked` for an unlinked address. |
| B4 | PASS | Home total equals chain USDC + NVDAx at the live price ($501.3x = 400 USDC + 0.45 NVDAx). |
| B5 | PASS | Hosted: Settings → Sign out (two taps) cleared the session and landed on Welcome; a fresh sign-in went through the email code (HS10). |
| C1 | PASS | 500 USDC minted by the fork's mint authority (tx `bi7GDJh1…`); once-a-day lock shown. |
| C2 | BLOCKED | No MoonPay key exists in the repo or env. With none, the app now says card deposits are not set up (it used to open MoonPay with a made-up key). |
| C3 | PASS (unit) | Unsigned or badly-signed webhooks 401, stale ones refused, off with no key; covered by `moonpay.test.ts`. No live MoonPay event without a key. |
| D1 | PASS | ApproveChecked `UuhSDqyn…` signed by the user's Privy wallet: delegate `CZqa…`, 600 USDC. |
| D2 | PASS | `/delegation` and `/limits` read the delegate and allowance from the chain. |
| D3 | PASS | Safety LIVE with cap used and days left; Home chip ARMED. |
| D4 | PASS | Hosted: closing Privy's sheet under Stop all trading leaves all six delegations on chain and Safety LIVE; after the fix the app says "You cancelled the signature, so nothing changed." (it showed Privy's "Failed to connect to wallet"). |
| D5 | PASS | The grant screen's stepper is bounded; the server refuses 0, negative, non-numeric, past end date, and a signature not on chain. |
| E1 | PASS | 11 xStocks with live Jupiter prices. |
| E2 | PASS | `/xstock/NVDAx`: real quote (pay, expected, impact, slippage, route Whirlpool, minimum). |
| E3 | PASS | After the fix: backing 1.0013× from the attestor, issuer controls, multiplier, "nothing to measure yet" for yield, eligibility checked. |
| E4 | PASS | "nvda" finds NVDAx; after the fix, Base's NVDAc no longer appears on Solana. |
| F1 | PASS | Buys routed by Jupiter on the fork (`49oyfkjC…`, `2wyDC4mh…`). Re-run after the `place.ts` changes: a $10 buy filled (`5jKTeg8t…`). It went through the venue vault, and the receipt says so: the fork's Whirlpool snapshot has drifted from live mainnet, so Jupiter's route fails simulation with `InvalidTickArraySequence`. **Re-bootstrap the fork right before the demo** to get Jupiter-routed fills again. |
| F2 | PASS | $180 over a $175 remainder refused; balance unchanged. Re-run: $150 → `daily_cap` "$90.00 is left"; $5,000 → `allowance` "440.00 USDC … is left". |
| F3 | PASS | Hosted HS8: a buy after the stop → 409 `delegation_revoked`, nothing moved. |
| F4 | PASS | Holdings show NVDAx units and average cost from the fills. |
| F5 | PASS | Activity rows with Solana Explorer links. Push notifications need a device. |
| G1 | PASS | Reference is the issuer's mark; off-hours widens slippage; no reference means hold. |
| G2 | PASS | After the fixes: no trade while nothing was hired; once Momentum Scout was hired it bought NVDAx (`5BTLmiHK…`), booked and counted. |
| G3 | PASS | `/agents/stop` at 01:48: nothing placed after the cooldown ended (0 trades by 01:59). `/agents/resume` at 02:00:10: Momentum Scout bought NVDAx at 02:00:35 (`4ssTkgNV…`). The app has no separate pause control; Safety's stop is the on-chain revoke (H1). |
| H1 | PASS | Local second run and hosted HS7: Stop all trading → one signed Revoke; every USDC and xStock account reads delegate none; Safety STOPPED. |
| H2 | PASS | Hosted HS8 (refused after stop) and HS9 (Resume re-approves all six accounts; Safety LIVE). |
| I1–I3 | PASS | Local second run: allowlist add, 24h lock, withdrawal to an unlocked address, withdraw-everything. Hosted HS11: a pending address is refused in the app and by the server (409 `cooling_off`). |
| J1 | PASS | Executor stopped: Home shows dashes and "Couldn't load", Markets says it can't reach xorr, Safety keeps the stop. Restarted: recovered unaided. |
| J2 | PASS (unit) | `place.test.ts`: a throwing rules engine → `rules_unavailable`, no quote, no transfer. |
| J3 | PASS (unit) | `place.test.ts`: a failed quote → `no_quote`, no broadcast mark, no transfer; order is quote → mark → spend. |

### Failures found and fixed

1. **Validator died with the bootstrap:** it was spawned attached, with kill-on-exit. It is now detached (`persist`).
2. **`/health` probed EVM on Solana:** it now has a Solana branch (postgres, rpc slot, payer SOL, upstreams).
3. **Web crashed on `Buffer`:** fixed with `buffer-global.js`. Missing `@solana/kit` peers installed.
4. **Raw keypair in `localStorage` (the old `solanaWallet.ts`):** replaced by the Privy Solana wallet; it signs, and the app broadcasts.
5. **`/wallet/connect` 403 on a fresh wallet:** Privy is eventually consistent, so reads are retried.
6. **Delegation, balance, tokens, limits, activity, faucet, market routes assumed EVM:** each has a Solana branch that reads the chain.
7. **The daily cap was never counted:** `recordSpend` now runs after each fill.
8. **A first buy fell back to the vault:** the owner had no NVDAx account. It is created before the swap.
9. **Home chip read the EVM contract:** it now reads the SPL delegate on the USDC account.
10. **The autonomous sweep never ran:** it ordered by `updated_at`, a column that doesn't exist. Fixed, and the error is now logged.
11. **Backing, eligibility, reserves and yield panels:** they were built but not mounted anywhere, and their loaders sent no session (401). Both fixed.
12. **Markets and Search listed Base's NVDAc/AAPLc… on Solana with dashes:** the Stocks class is now the xStocks.
13. **MoonPay fell back to a made-up `pk_test_xorr_dev_sandbox`, and the webhook was unauthenticated and booked a default $100:** the key is now real or absent, and the webhook requires a verified V2 signature.
14. **Safety's executor-down fallback only accepted EVM addresses:** it now has a Solana chain-only read.
15. **The autonomous agent traded for a wallet that had hired no one:** it now trades only as hired personas.
16. **The autonomous pre-check had a made-up cap and expiry:** it called `readDelegation` with the wrong signature. It now reads `readSolanaPolicy`.
17. **The agent picked SPYx, which has no mint on the fork:** setups and `guardAndSpend` now require the mint on the cluster.
18. **Jupiter fallback `public.jupiterapi.com` added a 20 bps fee, then refused to build the swap:** replaced with `lite-api.jup.ag`.
19. **A failed quote threw (500):** it is now a `no_quote` refusal.
20. **The Home "First trade" step ignored fills that weren't strategy runs:** positions now count.
21. **Over-allowance refusal was labelled `daily_cap` and quoted the whole grant's remaining allowance as today's:** it is now `allowance`, with its own sentence.
22. **Chain proofs 3 and 4 used vitest's 5s default:** they make real network calls, so each now has an explicit 120s timeout.

### Hosted run (HS) — 2026-09-19

Against the hosted build: web https://xorr-solana.vercel.app, executor and mainnet fork on Railway. Fresh Privy test
accounts, with the Browser pane visible so Privy's sheets ran. Every chain claim was read back from the fork's RPC.

| # | Status | Evidence |
|---|---|---|
| HS1 | PASS | Get started → goals → email code → Solana wallet `4Egw…jCDA` created and connected, no 403. |
| HS2 | PASS | Faucet: chain shows 500 USDC and 0.5 SOL. |
| HS3 | PASS | Grant: USDC delegate `ACikuh…` for 4,800, and a sell approval on each of the 5 xStocks; Home ARMED. |
| HS4 | PASS | $25 NVDAx buy "Routed by Jupiter" (`63C9yaMJ…`): programs JUP6 + Whirlpool, err null; Activity row persisted. |
| HS5 | PASS | User-signed sell of 0.0447 NVDAx for $9.91 (`3kkqYxhf…`): USDC 475 → 484.91, NVDAx 0.1126 → 0.0679. |
| HS6 | PASS | Hired Momentum Scout, which bought MSFTx on its own through Jupiter (`5DzmPJhy…`). The agent record shows 1 trade (after the fix). |
| HS7 | PASS | Stop: all six accounts read delegate none; Safety STOPPED. |
| HS8 | PASS | A buy after the stop → 409 `delegation_revoked`. |
| HS9 | PASS | Resume: all six accounts name `ACikuh…` again; Safety LIVE. |
| HS10 | PASS | Sign out, then a fresh account (`6dCg…1vo6`): chose Aggressive; the fund screen shows no card button; faucet; grant (six delegations on chain); `/agents/risk-profile` active = aggressive. |
| HS11 | PASS | Allowlist add → Pending, "usable from … in 24 h"; Send refuses ("No address is unlocked yet"); server `/withdrawal-addresses/check` → 409 `cooling_off`. |
| HS12 | PASS | Recovery → Export private key opens Privy's own export window for the right wallet (the key was not revealed). |
| HS14 | PASS | Cancel: see D4. |
| HS15 | PASS | Close preview at the venue's quote: "Realises −$0.01 and frees $24.99 at the venue's live quote" for half of 0.2251 NVDAx; the executor's prepared sale for the same units priced $24.988 (the old mark-based preview would have said +$0.16). The live signature was not sent (Browser pane hidden); the earlier hosted close (#33) is the signed proof. |
| HS16 | PASS | xStock logos: `/market/logos` answers each xStock from Jupiter's registry (`source: jupiter`, issuer icon); hosted Watchlist, xStocks list, Home Stocks, ticket header, Portfolio cards and position screen all render `NVDAx.png`…`QQQx.png`. |
| HS17 | PASS | Watchlist: Stocks tab first on Solana; its own tab choice (no longer Home's index); 11 prices, 23 sparkline paths, sparkline skeleton while loading; no response ≥ 400. |
| HS18 | PASS | xStock charts: `/market/ohlc?symbol=NVDAx&days=1` → 27 half-hour rows from recorded Jupiter prices; Portfolio cards draw a chart ("No price history yet" gone). |
| HS19 | PASS | 24h change: absent on hosted (record < 1 day, correctly), present locally (NVDAx, COINx…) where the record spans a day. |
| HS20 | PASS | Home Gainers on Solana: hosted says "Gainers show once a full day of xStock prices is recorded."; ranking unit-tested; local data ranks COINx 6.97%, MSTRx 2.77%… The ranked list was not viewed live (local session signed out, pane hidden). |
| HS13 | PASS | Screen audit (Home, xStocks, ticket, Portfolio, Activity, Safety, agent, Deposit, Explore, Send, Watchlist): no API response ≥ 400 after load. |

Hosted fixes made during the run:
- The fund screen offered a MoonPay card button with no MoonPay configured.
- The Goals risk choice never reached the agent.
- The agent traded on a 15-cent band from minutes of data and called it "the past month". It now needs 24h of observations and a band at least 1% wide.
- The agent record counted none of its own entries.
- The watchlist drew a dash for every xStock (it asked the crypto feed).
- Markets and Search showed Base classes and Hyperliquid perps; they now open the xStocks market.
- Movers (perps) is hidden.

### Still open

- C2 (a live MoonPay purchase) is BLOCKED: no MoonPay keys exist.
