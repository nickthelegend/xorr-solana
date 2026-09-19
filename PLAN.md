# xorr on Solana — the plan to a verified, submitted product

**Source of truth for what is left.** Written 2026-09-19 from the repo, a live end-to-end run on the fork
(`docs/TESTPLAN-SOLANA.md`), four read-only audits (docs, stubs/fakes, infra, every screen), and the owner's answers
(all defaults, §4). Update the status tags here as work lands; nothing is DONE until its verification has been run.

Superseded plans: `docs/archive/PLAN-solana-migration-2026-09-16.md` (generic port), `PLAN.local-2026-09-17.md`
(untracked Stocklana draft; its "nothing exists" audit is stale).

---

## 1. Executive summary

xorr is a non-custodial trading app: you grant an AI agent a capped, revocable, on-chain permission, and it trades
tokenized US stocks (Backed's **xStocks**, Token-2022) on Solana through **Jupiter** while you stay in control. It is
being submitted to **STOCKLANA** (hackathons.solana.com, Solana Foundation, main track $100K), deadline
**2026-09-25 16:00 ET**. Judging asks one question: *could this be a real app that people will actually use?* —
real user problem, working end-to-end demo, Solana relevance, execution quality.

The repo is a fork of the Base build. The Solana core loop (sign in → fund → grant → buy → agent buys → kill switch
→ withdraw) is proven live on a mainnet fork. Most of the rest of the app (119 routes) still runs Base code: the
Swap tab, strategies, exits, sells, flatten, and ~40 screens reachable from Explore. Nothing Solana is hosted.

**Initial completion: 15 / 50 P0+P1 checklist items verified = 30 %** (P0 alone: 15 / 30 = 50 %). See §9.

## 2. Vision, problem, users

- **Problem.** Handing a bot your money is a trust problem, not a trading problem. Brokerage "robo" products custody
  your assets; crypto bots take your keys. Tokenized stocks trade 24/7 on Solana, but nobody can watch a market
  all night.
- **Product.** The permission is the product: an SPL delegation the chain enforces (a ceiling the bot cannot exceed),
  a daily cap and end date the executor enforces, a one-tap on-chain revoke, and every action on an audit trail with
  explorer links.
- **Target user.** A non-US retail investor who already holds USDC on Solana, wants exposure to US equities around
  the clock, and wants automation without giving up custody. (xStocks are not for US persons.)
- **Core loop.** Fund → grant a capped allowance → hire an agent → it buys xStocks with a stated reason and arms
  exits that actually fire → you can buy and sell yourself → you see Token-2022-aware holdings and P&L → stop it all
  on-chain in one tap → withdraw to an allowlisted address.

## 3. Goals and definitions of done

- **Product done** — every P0 and P1 item in §6 verified in the running app on the fork.
- **Technical done** — app + server typecheck, lint (0 errors), all unit tests, the on-chain fork proofs, and CI green
  on `main`; no production path fabricates data; no Base-only screen reachable in the Solana build.
- **Demo done** — a hosted Solana build a judge can sign into and use (fork-backed), plus a 2–3 minute video of the
  full loop with real signatures visible.
- **Hackathon done** — submitted on hackathons.solana.com before 2026-09-25 16:00 ET with a public GitHub repo,
  hosted demo URL and video link; README is Solana-first.

## 4. Constraints and confirmed decisions (owner, 2026-09-19: "defaults")

| # | Decision |
|---|---|
| D1 | **Scope = focused core + a mix.** Core: fund → grant → hire agent (buys with reasoning; exits fire) → buy **and sell** xStocks (Swap tab becomes xStock buy/sell) → Token-2022 holdings/P&L → kill switch → withdraw. Added: recurring buy (DCA) on xStocks, custom agents with xStock templates, close position, withdraw everything. **Hidden on the Solana build** (not deleted): perps/futures, Aave yield, limit orders, cross-chain, basenames, business, Graph, Approvals, Base strategy templates and the Base swap. |
| D2 | **Clawpump track**: last and walled off — the agent's own token paired with an xStock on Meteora, 75 % fee share buying xStocks, shown only on the agent card. Owner runs the mainnet launch; no real SOL is spent without the owner's go-ahead at that moment. |
| D3 | **Agent pacing**: ≤ 1 entry per symbol per agent per day; position cap per symbol 25 % of the grant; 60-minute cooldown between an agent's entries. |
| D4 | **Selling**: sells the user makes are signed by the user's own wallet. The grant also approves the delegate on each tradable xStock account so the agent's exits can fire unattended. Revoke drops every approval. (Refined from "approve per buy": an autonomous buy has no user present to sign, so the xStock approvals are part of the one grant transaction.) |
| D5 | **Where it runs**: hosted mainnet-fork validator + executor on Railway, web on Vercel, plus a video. **Paid Railway resources need the owner's approval before creation.** No real-money mainnet trading. |
| D6 | **Fills on the fork**: re-clone pools (incl. sell routes) at boot and on a schedule; the labelled vault fallback stays as last resort. |
| D7 | **Deposits**: no MoonPay keys exist → test-USDC faucet + a Solana "receive USDC" QR; card button hidden with its honest message until keys arrive. |
| D8 | **AI**: OpenRouter with a capable model once the owner provides `OPENROUTER_API_KEY`; until then deterministic reasoning, and chat says plainly it has no model. |
| D9 | **Privy**: same app; owner adds the hosted origin and confirms Solana embedded wallets; logins email + Google (X optional). |
| D10 | **Platforms**: hosted web for judges; iOS simulator run in the video; push stays in-app (no EAS project). |
| D11 | **Domains**: Solana build on `xorr-solana.vercel.app` (or `solana.xorr.finance` if the owner adds DNS); README Solana-first; the Base landing untouched except a "Now on Solana" link (landing lives in the xorr-eth repo). |
| D12 | **Video**: scripted 2–3 min, recorded automatically; owner voiceover or captions. |
| D13 | **Compliance**: one-time xStocks disclosure at onboarding; Terms/Risk updated; issuer eligibility check already on the ticket; no geo-block on a fork demo. |
| D14 | **Git**: work in PRs, merge on green CI without review; `ao` workers are idle and left alone. |
| D15 | **Submission**: repo public just before submitting; submission text prepared; owner submits. |

Standing rules (from the repo and the owner): no mocks, fallbacks or stubs in production paths; every price real or
labelled; one spend chokepoint (`guardAndSpend`); kill switch = on-chain revoke; never print a secret; never delete a
Railway service, Postgres or env var; no mainnet action without `ALLOW_MAINNET=yes` and the owner's go-ahead.

## 5. Final product specification

**User types.** Signed-out visitor (can browse markets and prices); signed-in owner (one Privy Solana embedded wallet);
the executor (holds the delegate key; never custody); agents (personas and custom agents — rows the executor runs).

**Screens in the Solana build (everything else hidden):**
- Onboarding: welcome, sign-in, goals, xStocks disclosure, fund, delegate (grant).
- Tabs: Home (balance, setup card, status chip, Agents / Gainers / Stocks tabs), Trade (was Swap: xStock buy/sell),
  Messages (chat drawer).
- Markets, xStocks catalogue, xStock ticket (buy/sell, quote breakdown, backing, eligibility), Search, Watchlist,
  Movers.
- Portfolio, Holdings (no target mix on Solana), position detail + close, P&L, disposals, export.
- Agents: roster, agent profile (hire/fire, strategies, reasoning, Clawpump card last), new agent, risk, basket.
- Strategies: list, recurring buy (xStock DCA), strategy detail, runs.
- Safety (live status, stop, resume), Limits/daily cap, Allowlist, Delegation, Activity, audit entry, inbox,
  notifications settings, Deposit, Send/withdraw, Withdraw everything, Settings, Profile, legal, System/health.

**Backend capabilities.** Privy JWT auth; wallet binding; Solana grant record/revoke verified from chain; daily cap +
expiry + pacing enforced in `guardAndSpend`; Jupiter quotes and routes on the fork (vault fallback labelled);
user-signed sell transactions built server-side; delegate-signed exits; scheduler (DCA, exits, autonomous sweep);
faucet (fork only); withdrawal allowlist with 24 h cooling-off; audit log hash chain; notifications (in-app).

**Data entities.** wallets, delegations, daily_spend, strategies, strategy_runs, positions, disposals, proposals,
agents, withdrawal_addresses, audit_log, notifications, faucet_claims, price_observations.

## 6. The 100 % checklist (P0 / P1 / P2)

Status is evidence, not claims. ✅ verified · ⚠️ partial · ❌ not done / broken · ⛔ blocked on owner.

### P0 — must work live
| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Sign in (email/Google) → Privy Solana wallet | ✅ | TESTPLAN B1/B2 |
| 2 | Wallet bound to executor, unlinked refused | ✅ | B3 |
| 3 | Home balance = chain USDC + xStocks | ✅ | B4 |
| 4 | Test-USDC faucet | ✅ | C1 |
| 5 | Receive-USDC QR on Solana | ❌ | QR hidden on Solana (`depositQrWorks` false) |
| 6 | Grant capped SPL delegation from the app | ✅ | D1–D3 |
| 7 | Kill switch: user-signed revoke from Safety | ✅ | H1, tx `4zgrs5nk…` (2026-09-19) |
| 8 | After revoke every buy refused | ✅ | H2/F3 `delegation_revoked` |
| 9 | Resume (re-grant) from Safety | ❌ | Resume path reads EVM `/approvals` |
| 10 | Buy an xStock from the app | ✅ | F1 (fills may be vault-labelled, see #25) |
| 11 | Sell an xStock from the app (user-signed) | ❌ | "Selling from the phone is not built yet" |
| 12 | Server sell path moves the user's shares | ❌ | `place.ts` sell swaps the vault's xStock |
| 13 | Over-cap / over-allowance refusals | ✅ | F2 |
| 14 | Hire / fire an agent | ✅ | G2 |
| 15 | Agent buys autonomously with its reason shown | ✅ | G2 (template reasoning; LLM ⛔ #37) |
| 16 | Agent exits (stop/take-profit) fire on Solana | ❌ | `order.ts` exits run on EVM `runStrategy` |
| 17 | Agent pacing (D3) | ❌ | bought NVDAx every 10 min to the cap |
| 18 | Withdraw to allowlisted address, cooling-off enforced | ✅ | I1–I3, tx `5MyCZ2dP…` |
| 19 | Trade tab = xStock buy/sell | ❌ | `app/swap.tsx` is 1inch/Base |
| 20 | Home Stocks tab opens a working xStock screen | ❌ | goes to `/oracle` → 404 `not_an_equity` |
| 21 | No Base-only screen reachable on Solana | ❌ | Explore lists ~40 Base screens; Futures tab; Approvals; Yield |
| 22 | Activity / audit trail with explorer links | ✅ | F5 |
| 23 | No computable keys off localnet/fork | ✅ | `solana/keys.ts` refuses seeds off a loopback fork; `keys.test.ts` |
| 24 | Hosted demo (fork + executor + web) | ❌ | nothing Solana hosted |
| 25 | Fork fills Jupiter-routed (pool re-clone, sell routes) | ❌ | pool drift → vault fills; sells not cloned |
| 26 | Demo video | ❌ | only Base videos exist |
| 27 | README Solana-first | ❌ | README top says Base |
| 28 | Submission | ❌ | not submitted |
| 29 | CI green | ✅ | main green; PR #35 |
| 30 | Token-2022 (Scaled UI) holdings and P&L | ✅ | F4 |

### P1 — important
| # | Item | Status | Evidence |
|---|---|---|---|
| 31 | Recurring buy (DCA) on xStocks via Solana path | ❌ | `runStrategy` EVM; validation uses Base `TOKENS` |
| 32 | Custom agents with xStock templates | ❌ | templates WETH/CBBTC |
| 33 | Close a position (Solana) | ❌ | `/positions/close` EVM |
| 34 | Withdraw everything (Solana) | ❌ | crashes (`withdrawEverything.ts:148`) |
| 35 | Holdings: no fixture target mix on Solana | ❌ | TARGET MIX fixture |
| 36 | Holding / Gainers rows open a tradable xStock screen | ❌ | `TRADABLE` Base list → "Not tradable here" |
| 37 | Agent reasoning + chat on a capable model | ⛔ | no `OPENROUTER_API_KEY` |
| 38 | MoonPay card deposit | ⛔ | no MoonPay keys; honest message shown |
| 39 | Withdrawal records correct (xStock sends, destination) | ✅ | `tokenMovement` reads any mint + recipient from the tx; unknown recipient refused; tests |
| 40 | Send: real fee, balance refresh | ❌ | fee hardcoded; balance stale after send |
| 41 | xStocks disclosure + Terms/Risk | ❌ | none |
| 42 | Portfolio history snapshots on Solana | ❌ | `snapshots.ts` EVM |
| 43 | Cap/expiry risk alerts on Solana | ❌ | `alerts/evaluate.ts` EVM `readPolicy` |
| 44 | History screen on Solana (port or hide) | ❌ | reads Base logs |
| 45 | Chat proposals on Solana (port or hide) | ❌ | `propose.ts` WETH/EVM |
| 46 | Allowlist copy base58 on Solana | ❌ | placeholder "0x…" |
| 47 | Solana env example + Solana web build | ❌ | `.env.example`, `build-web.mjs` EVM |
| 48 | iOS simulator run of the Solana build | ❌ | never run |
| 49 | Safety/Settings sub-screens Solana-correct (Flatten, Policy, Recovery) | ❌ | EVM |
| 50 | Networks/fee chips Solana-correct | ❌ | `/networks` lists Base |

### P2 / post-MVP
| # | Item | Status |
|---|---|---|
| 51 | Clawpump agent token (D2) | ⛔ owner mainnet launch + Clawpump key |
| 52 | Push notifications (EAS) | post-MVP |
| 53 | Audit anchoring on Solana | post-MVP (hidden) |
| 54 | Perps, yield, limit orders, cross-chain on Solana | post-MVP (hidden) |

## 7. Architecture and end-to-end flows

- **App** — Expo Router (web + native), Privy (`@privy-io/react-auth/solana` on web, `@privy-io/expo` native).
  `src/chain.ts` `isSolana` gates the build. The user signs grant, revoke, withdrawals and sells with the Privy
  Solana wallet (`src/wallet/solanaSigner.*`); the app broadcasts to the cluster RPC.
- **Executor** — Hono on Node (`server/`), Postgres, scheduler every 30 s. `XORR_CHAIN=solana-fork`. The only spend
  path is `server/src/executor/place.ts` `guardAndSpend`: symbol on cluster → delegation on chain → allowance →
  grant record (cap, expiry) → rules engine (fails closed) → pacing → issuer eligibility → quote → mark broadcast →
  delegate transfer → Jupiter swap (vault fallback, labelled) → refund on failure → count spend.
- **Chain** — `solana-test-validator --clone` of mainnet USDC, xStocks, Jupiter v6, Orca Whirlpool and the route
  pools (`server/src/solana/fork-bootstrap.ts`). The fork's payer is the USDC mint authority (test money only).
- **Flows** (entry → auth → action → backend → chain/DB → UI → failure):
  1. Grant: delegate screen → Privy signs ApproveChecked (USDC + xStock accounts) → `/delegation/record` verifies
     the tx on chain → `delegations` row → Safety LIVE. Failure: signature rejected → "not granted", chain unchanged.
  2. Buy: ticket → `/xstocks/buy` (idempotency key) → `guardAndSpend` → receipt with signature/slot/venue → holdings.
  3. Sell (user): ticket Sell → `/xstocks/sell/prepare` builds a tx (user signs the xStock leg; vault/route the
     USDC leg) → Privy signs → app broadcasts → `/xstocks/sell/record` verifies and books the disposal.
  4. Agent: scheduler sweep → hired personas only → pacing → setup → `guardAndSpend` → exits armed as Solana
     exit-rules → scheduler checks marks → delegate sells the user's xStock (approved at grant) → notification.
  5. Stop: Safety → Privy signs Revoke (USDC + every xStock account) → `/delegation/revoke` verifies → STOPPED.
  6. Withdraw: allowlist (24 h cooling-off, server clock) → Send → Privy signs SPL transfer → `/withdrawals/record`.

## 8. Current codebase state (2026-09-19)

- 119 app routes; ~30 Solana-correct (see the screen audit in §9). Server Solana branches: wallet, balance, tokens,
  delegation (read/params/record/revoke), limits, faucet, withdrawals, market tradable/watchable/stocks/xstocks,
  `/xstocks/buy`, health/metrics, and the autonomous agent. Everything else is Base code.
- Tests: app 2,603 + server 1,346 passing; 4 on-chain fork proofs passing; CI checks run on push/PR, the Solana fork
  suite only on manual dispatch.
- Env: `.env.fork` is Solana (local RPC). No MoonPay, OpenRouter, EAS, Helius or `XORR_KEY_*` values anywhere.

## 9. Gap audit

INITIAL COMPLETION: **30 %** (15 of 50 P0+P1 items verified; P0 15/30 = 50 %).

| Gap | Evidence | Impact | Severity | Fix (phase) |
|---|---|---|---|---|
| Computable delegate/payer/vault keys | `server/src/solana/keys.ts:44-49` | Anyone could spend every user's delegated USDC on a hosted executor | BLOCKER | Refuse seed keys unless cluster is localnet/fork and not public; require `XORR_KEY_*` (P1) |
| Sell swaps the vault's shares | `executor/place.ts` sell branch | Pays USDC while the user keeps shares | BLOCKER | Rebuild sell as user-signed / delegate-signed spend of the user's xStock (P3) |
| No sell in the app | `app/xstock/[symbol].tsx` | Core loop incomplete | BLOCKER | Sell tab on the ticket (P3) |
| Exits never fire | `bot/autonomous.ts` → `order.ts` → EVM `runStrategy` | Agent's stop-loss is a promise | BLOCKER | Solana exit runner + xStock approvals in grant (P3) |
| Swap tab is Base | `app/swap.tsx`, `routes/extra.ts:602` | Main nav button broken | HIGH | Trade tab → xStock buy/sell (P2) |
| Home Stocks tab → oracle 404 | `app/(tabs)/index.tsx`, `oracle/[symbol]` | 2-tap broken screen | HIGH | Route to `/xstock` on Solana (P2) |
| Base screens reachable | `app/explore.tsx`, Futures tab, Approvals, Yield, Flatten… | Judges hit broken screens | HIGH | Chain-aware route guard + nav filtering (P2) |
| Agent over-trades | audit log 2026-09-19 | Looks like a bug | HIGH | Pacing rules (P3) |
| Resume uses EVM approvals | `app/safety.tsx:284,316` | Can't resume after stop | HIGH | Solana resume = re-grant (P3) |
| DCA / strategies EVM | `executor/run.ts`, `routes/strategies.ts:118-146` | Recurring buy broken | HIGH | Solana strategy runner through `guardAndSpend` (P4) |
| Custom-agent templates WETH | `src/strategies/agentStrategies.ts` | Custom agents fail | HIGH | xStock templates (P4) |
| Close position / withdraw everything EVM | `routes/panic.ts`, `withdrawEverything.ts` | Broken flows | HIGH | Solana versions (P3/P4) |
| Target mix fixture; Holdings rows not tradable | `holdings.tsx`, `src/data/tradable.ts` | Fiction on screen | HIGH | Hide mix on Solana; tradable from `/market/tradable` (P2) |
| Withdrawal record wrong destination | `routes/withdrawals.ts:354-400` | Audit trail can lie | HIGH | Read destination from the tx; measure the token sent (P1) |
| Fork pool drift; sells not cloned | TESTPLAN F1 | Vault fills in demo | HIGH | Re-clone at boot + schedule; clone sell routes (P5) |
| Nothing hosted | infra audit | No live demo | BLOCKER | Hosted fork + executor + web (P6, owner approval for paid) |
| Receive-USDC QR hidden | `deposit.tsx` | Can't fund from another wallet | MEDIUM | Solana Pay / address QR (P7) |
| Send fee hardcoded; stale balance | `app/send.tsx:125-141` | Wrong number | LOW | Fee from `getFeeForMessage`; refresh after send (P7) |
| No disclosure / Terms for xStocks | — | Compliance | MEDIUM | P7 |
| Snapshots, alerts, history EVM | `snapshots.ts`, `alerts/evaluate.ts`, `history.ts` | Empty/erroring screens | MEDIUM | Port snapshots + alerts; hide History (P7) |
| Chat proposals EVM | `bot/propose.ts` | Broken cards | MEDIUM | Hide on Solana until ported (P2) |
| Allowlist "0x…" placeholder | `app/allowlist.tsx` | Wrong copy | LOW | P7 |
| README/landing/videos Base | README, `docs/demo/*` | Confuses judges | HIGH | P8 |
| LLM key missing | no `OPENROUTER_API_KEY` | Template reasoning only | MEDIUM | ⛔ owner key (P7 when provided) |
| MoonPay keys missing | none in env | Card deposit hidden | MEDIUM | ⛔ owner keys |

## 10. Implementation phases (status-tagged)

### Phase 1 — Safety and correctness first
Objective: nothing on a hosted executor can be spent by a stranger; records never lie.
- [DONE] **1.1 Key guard.** `server/src/solana/keys.ts`: seed fallback only when `activeClusterKey()` is
  `solana-localnet`/`solana-fork` **and** `XORR_ALLOW_SEED_KEYS=yes` or the RPC is loopback; otherwise throw at boot
  naming the missing `XORR_KEY_*`. Tests: seed refused for devnet/mainnet and for a non-loopback fork without opt-in.
- [DONE] **1.2 Withdrawal record.** `routes/withdrawals.ts`: read destination owner and amount from the
  confirmed tx's token balance deltas for any mint; refuse to record if the destination is not an allowlisted,
  usable address. Tests for USDC and an xStock.
- [DONE] **1.3 Boot guard.** Unknown `XORR_CHAIN` already refuses (`evm/chains.ts`); the Solana mainnet guard
  (`getClusterKey`) existed but was never called — now called at boot; verified: `XORR_CHAIN=solana-mainnet` without
  `ALLOW_MAINNET=yes` refuses to start.
Exit: tests green; executor refuses to boot on a public RPC without real keys.

### Phase 2 — The Solana surface (what a judge can reach)
- [NOT STARTED] **2.1 Route guard.** One list of Base-only routes (`src/nav/solanaHidden.ts`); on Solana a guard in
  `app/_layout.tsx` redirects them to a "Not on Solana" screen; Explore, Settings, Profile, Safety, Portfolio and chat
  shortcuts filter them out. Covers: perps/futures/funding, yield/rates, limit-orders, crosschain, basename,
  business, graph/*, approvals, spend, sponsors, verify/judge, history, audit/anchor, route/crosscheck/tokens,
  order/*, strategy/grid, strategy/yield, flatten, policy, networks, proposals (until ported), earnings (Base tickers).
- [NOT STARTED] **2.2 Trade tab.** On Solana the centre tab opens `/xstocks` → ticket with Buy/Sell.
- [NOT STARTED] **2.3 Home tabs.** Stocks rows → `/xstock/[sym]`; Futures tab hidden on Solana.
- [NOT STARTED] **2.4 Tradable from the executor.** `isTradable` on Solana reads `/market/tradable`; Holdings,
  Gainers and asset rows for xStocks open `/xstock/[sym]`.
- [NOT STARTED] **2.5 Holdings.** Target mix hidden on Solana; positions from `/wallet/tokens`.
Exit: a scripted walk of every reachable route on Solana shows no 4xx/5xx and no Base copy.

### Phase 3 — Selling, exits, pacing, resume
- [NOT STARTED] **3.1 Grant covers xStocks (D4).** `buildGrantTx` adds idempotent ATA creation + ApproveChecked for
  each tradable xStock (Token-2022) to the delegate; `buildRevokeTx` revokes USDC + every xStock ATA that has a
  delegate. Server verifies USDC as today and records which xStock approvals exist.
- [NOT STARTED] **3.2 Server sell.** `guardAndSpend` sell: delegate moves the **user's** xStock (Token-2022
  `transferChecked` as delegate) into the vault/route, swap to USDC, USDC to the user; refuse if no xStock approval
  or balance. Fix the vault-drain bug; fork proof updated.
- [NOT STARTED] **3.3 User sell from the app.** `/xstocks/sell/quote` + `/xstocks/sell/prepare` (server builds a
  tx: user-signed xStock transfer to the vault + vault-signed USDC to the user at a live Jupiter quote, partially
  signed by the vault) → Privy signs → broadcast → `/xstocks/sell/record` verifies and books the disposal.
- [NOT STARTED] **3.4 Solana exits.** Exit-rules strategies on Solana run through a Solana branch in the runner:
  read the live mark, fire stop/target/trailing via 3.2, notify, record.
- [NOT STARTED] **3.5 Pacing (D3)** in `bot/autonomous.ts` + rules; tests.
- [NOT STARTED] **3.6 Resume on Solana** = re-grant from Safety (no `/approvals`).
- [NOT STARTED] **3.7 Close position** on Solana via 3.2; **withdraw everything** on Solana = sell all (3.2) then
  send USDC.
Exit: on the fork — user sell moves the user's shares and credits USDC; a forced stop-loss fires unattended;
revoke drops all approvals; resume works.

### Phase 4 — Strategies and custom agents on Solana
- [NOT STARTED] **4.1** Strategy validation accepts xStocks on Solana (cluster tradable list), refuses Base tokens.
- [NOT STARTED] **4.2** Solana runner branch for `dca` (and `exit-rules` from 3.4) → `guardAndSpend`.
- [NOT STARTED] **4.3** Recurring-buy screen on Solana picks an xStock; custom-agent templates are xStocks.
Exit: a DCA of $10 NVDAx runs on schedule on the fork and appears in runs, holdings, activity.

### Phase 5 — Fork fidelity
- [NOT STARTED] **5.1** Clone sell-direction route accounts; re-clone pool state at bootstrap.
- [NOT STARTED] **5.2** Scheduled pool refresh (restart-free where possible, else documented reset script).
Exit: buy and sell on the fork report `jupiter-route`.

### Phase 6 — Hosting (owner approval for paid resources)
- [NOT STARTED] **6.1** `.env.example` Solana section; Solana-aware `scripts/build-web.mjs` (sets
  `EXPO_PUBLIC_SOLANA_RPC`, API URL, chain), new Vercel project `xorr-solana`.
- [NOT STARTED] **6.2** Fork image (`infra/solana-fork`): current Agave installer, the bootstrap's clones and mint
  overrides, volume, RPC + WS exposed.
- [BLOCKED on owner approval] **6.3** Railway project: fork validator, executor (`XORR_KEY_*` generated and stored as
  Railway secrets), Postgres. `ALLOWED_ORIGINS` set.
- [BLOCKED on owner] **6.4** Privy dashboard: allow the hosted origin; Solana embedded wallets on.
Exit: a fresh account on the hosted URL completes the core loop.

### Phase 7 — Polish and remaining P1
- [NOT STARTED] 7.1 Receive-USDC QR; 7.2 Send fee + refresh; 7.3 xStocks disclosure + Terms/Risk; 7.4 portfolio
  snapshots on Solana; 7.5 cap/expiry alerts on Solana; 7.6 allowlist copy; 7.7 iOS simulator run.
- [BLOCKED] 7.8 OpenRouter model (key); 7.9 MoonPay (keys).

### Phase 8 — Demo and submission
- [NOT STARTED] 8.1 README Solana-first (Base material moved to `docs/base/`); 8.2 demo script; 8.3 recording;
  8.4 submission text; [owner] 8.5 repo public + submit.

### Phase 9 — Clawpump (last, walled off)
- [NOT STARTED] 9.1 launch script (dry-run by default) + agent card reading mainnet; [owner] 9.2 mainnet launch.

## 11. Testing strategy
Unit tests beside every changed module (vitest); the on-chain fork proofs (`fork.chain.test.ts`) extended with sell,
exit, and revoke-all; a scripted browser walk of every Solana-reachable route (status codes + console); the
TESTPLAN-SOLANA items re-run after each phase.

## 12. Deployment and operations
Railway: `server/railway.json` (migrate pre-deploy, `/health` check). Secrets as Railway variables only. Web on
Vercel via `scripts/build-web.mjs`. Health: `/health` (postgres, rpc slot, payer SOL, upstreams).

## 13. Demo strategy
Must work live: sign in, faucet, grant, buy, agent buy with reason, exit firing, user sell, kill switch, withdraw.
Safe to show as labelled: vault fills (if routes fail), template reasoning (if no LLM key).
Must never be faked: signatures, balances, fills, the revoke.

## 14. Critical path and parallel work
Critical path: P1 → P2 → P3 → P6 → P8. Parallel: P4 and P5 alongside P3; P7 alongside P6.

## 15. Risks
Fork drift (P5); Privy iframe needs a visible browser for signing tests; hosting cost/RAM for the validator; the
deadline; Jupiter API rate limits (keyless).

## 16. Execution order
1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 4.x → 5.x → 6.1 → 6.2 →
(owner approval) 6.3 → 7.x → 8.x → 9.x.

## 17. Remaining unknowns
OpenRouter key; MoonPay keys; Railway approval and budget; Privy dashboard changes; Clawpump key and mainnet wallet.
