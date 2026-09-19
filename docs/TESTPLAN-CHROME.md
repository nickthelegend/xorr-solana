# The Chrome plan — every component and flow, and what correct means

Written 2026-09-20, before the run it measures. The subject is the **hosted product**:
web https://xorr-solana.vercel.app, executor https://executor-production-a672.up.railway.app, chain
https://solana-fork-production.up.railway.app (a fork of Solana mainnet: real programs and mints, test money).

Every item below states the exact result that counts as correct. Anything less — a button that responds, a screen that
renders, a flow that "mostly" completes — is a FAIL. **Every item also requires a clean console and no response ≥ 400
on that screen**; a visible error anywhere fails the item whatever the UI shows.

The run uses a **fresh Privy test account** so the first-run path is the real one, and drives the real browser.

## A. Infrastructure

| # | Item | Correct means |
|---|---|---|
| A1 | Web app served | `https://xorr-solana.vercel.app` answers 200 and renders the welcome screen. |
| A2 | Executor health | `/health` is `ok:true`, chain `solana-fork`, and postgres, rpc, gas and upstreams all `up`. |
| A3 | Chain live | The fork RPC answers `getSlot` twice with a higher slot the second time. |
| A4 | Database is real and persisted | Rows written before today's redeploys are still served (`/metrics` counts fills from earlier runs). |

## B. First run, as a new user

| # | Item | Correct means |
|---|---|---|
| B1 | Welcome | Welcome screen with "Get started" and "Sign in"; no console error. |
| B2 | Signed-out deep links | `/portfolio`, `/safety`, `/send` each render a sign-in prompt — never a crash, a spinner that never ends, or invented data. |
| B3 | Goals, empty | With no goal selected the footer reads "0 selected" and Continue is visibly disabled and does nothing when pressed. |
| B4 | Goals, chosen | Selecting a goal and a risk level enables Continue and carries the choice forward. |
| B5 | Email validation | An invalid email leaves "Email me a code" disabled; no request is sent. |
| B6 | Wrong OTP | A wrong code answers "That code is not right. Check it and try again." and no session is created. |
| B7 | Correct OTP | The right code signs in and a Privy Solana embedded wallet exists for the account. |
| B8 | Fund screen | Shows the wallet address and, with no MoonPay key configured, **no card button** — the absence is stated, not hidden. |
| B9 | Faucet, double-clicked | Two rapid clicks mint **exactly once**: chain shows 500 USDC and 0.5 SOL, and the screen states when it is available again. |
| B10 | Risk profile persisted | The risk chosen at B4 is what `/agents/risk-profile` reports as active. |

## C. The permission (the product's core claim)

| # | Item | Correct means |
|---|---|---|
| C1 | Grant screen honesty | Lists what the bot can do, that it can sell the xStocks held, that xStocks are not for US persons, the end date, and one-tap revocation. |
| C2 | Cap stepper | Decrementing floors at $200/day and the cards follow ($600 total for 3 days). |
| C3 | Skip the grant | "Not yet — look around first" reaches Home with a **NOT GRANTED** chip. |
| C4 | Buy with no permission | Refused with a sentence that says no permission was given yet (never "revoked"), plus an action that leads to the grant screen. |
| C5 | Grant signed | Privy signs one transaction; the chain then shows the delegate on USDC for **exactly** cap × days, and a sell approval on each of the five fork xStocks. |
| C6 | Armed | Home shows ARMED and Safety shows LIVE with the cap and days left. |

## D. Trading

| # | Item | Correct means |
|---|---|---|
| D1 | xStocks list | Eleven xStocks, each with an issuer logo, a live price and its sector; a sector filter narrows the list. |
| D2 | Ticket quote | The NVDAx ticket shows pay, expected, price impact, max slippage, venue fee, route and minimum received — all from a live Jupiter quote. |
| D3 | Over daily cap | A buy above the remaining daily cap is refused naming the cap and what is left; no transaction is sent. |
| D4 | Over allowance | A buy above the whole approval is refused naming the allowance remaining — a different sentence from D3. |
| D5 | Buy, double-clicked | Two rapid clicks buy **once**: one fill, USDC falls by exactly the amount, the on-chain approval falls by the same, and the receipt says "Routed by Jupiter" with a signature. |
| D6 | Sell beyond the holding | The quote is capped to what is held, the line says it sells all of it, and the button sells exactly the held amount. |
| D7 | Sell, signed | The owner signs; the sale settles, the receipt names the venue honestly, and the chain shows the shares gone and USDC up. |
| D8 | Unknown symbol | `/xstock/FAKEx` is a "Not listed" screen with a way back to the xStocks list — not a ticket with error text in it. |
| D9 | Holdings and P&L | Portfolio shows the position with entry, size, value and P&L, and no deposit is presented as a gain. |
| D10 | Close part of a position | The preview is the venue's live quote; closing 50% sells half, and the realised figure matches the preview within a cent. |

## E. Agents and strategies

| # | Item | Correct means |
|---|---|---|
| E1 | Hire | An agent moves to HIRED and the trail records it. |
| E2 | Recurring buy created | A weekly buy is created and listed with its next run. |
| E3 | Run now | It fills through Jupiter, the chain moves, and the run is recorded. |
| E4 | Same period twice | A second Run now answers "Already ran this period" and **no** USDC moves. |
| E5 | Pause and resume | Pausing takes it out of the running count; resuming puts it back. |
| E6 | Custom agent | Make agent is disabled until named with a persona and a strategy; once made it is hired and its strategy is live. |
| E7 | Cadence stated honestly | The agent's strategy row states the amount per its own cadence ("a week" for a weekly buy). |
| E8 | Exit armed and fired | A take-profit armed from Auto Close creates a live `exit-rules` strategy, and when the price crosses it the executor sells **unattended**: the holding goes to zero on chain and the trail says what fired and where it filled. |

## F. Safety

| # | Item | Correct means |
|---|---|---|
| F1 | Stop | One signed transaction removes the delegate from **every** account (USDC and all five xStocks); Safety reads STOPPED. |
| F2 | Refused after stop | A buy answers 409 `delegation_revoked` and nothing moves. |
| F3 | Strategies say so | While stopped, the Strategies screen states that the permission is revoked and nothing runs. |
| F4 | Resume | One signed transaction restores the delegate on all six accounts; Safety reads LIVE and the banner clears. |
| F5 | Cancel a signature | Closing Privy's sheet leaves the chain untouched and the app says the signature was cancelled — not a connection error. |

## G. Money out

| # | Item | Correct means |
|---|---|---|
| G1 | Invalid address | An Ethereum address is refused with "Solana addresses are base58 public keys" and cannot be added. |
| G2 | Add address | A valid address is added as Pending with the hour it unlocks. |
| G3 | Send blocked | With only a pending address, Send refuses ("No address is unlocked yet") and the server refuses the same address with 409 `cooling_off`. |
| G4 | Withdraw everything | Names the exact positions it would sell, states that none is unlocked yet, and gates on the allowlist. |
| G5 | Key export | Recovery opens Privy's own export window for this wallet; the app never sees the key. |

## H. Information screens

| # | Item | Correct means |
|---|---|---|
| H1 | Activity | Every action recorded with its own local time, an amount where money moved, and an explorer link for on-chain events. |
| H2 | Runs | Each fill with its strategy, amount and units. |
| H3 | Audit chain | States the number of entries and that the hash chain is unbroken. |
| H4 | Sources | Names only the sources this build reads: the chain, xorr, Jupiter, Backed, CoinGecko, EDGAR, Privy. |
| H5 | Venues / Permission / Network | Venue is Jupiter; the permission shows cap, expiry and delegate; the network screen names solana-fork. |
| H6 | Export | Produces a real file and says how many rows. |
| H7 | Risk disclosure | Reachable, states xStock issuer powers and that stopping revokes on-chain. |
| H8 | Alerts | The new-alert screen opens on an xStock with a level seeded from its live price; the alert is created and listed. |

## I. Integrations

| # | Item | Correct means |
|---|---|---|
| I1 | Privy | Email OTP sign-in, wallet creation, signing sheets and key export all work against the real Privy app. |
| I2 | Jupiter | Quotes and fills come from Jupiter; a fill says so and the transaction shows the Jupiter program. |
| I3 | Backed proof of reserves | The ticket shows what backs the token with the attestation's age. |
| I4 | Token-2022 Scaled UI | Holdings and prices use the token's multiplier. |
| I5 | LLM chat | With no model key the agent says it cannot answer rather than inventing one. **Untestable as a real answer** without `OPENROUTER_API_KEY`. |
| I6 | MoonPay | **Untestable** without MoonPay keys; the app must say card deposits are not configured. |

## J. Cross-cutting

| # | Item | Correct means |
|---|---|---|
| J1 | Console | No error in the console on any screen walked in this run. |
| J2 | Network | No response ≥ 400 on any screen walked in this run. |
| J3 | No mocks | No mock, stub, fake, dummy, placeholder or TODO in any production path. |
| J4 | Suites and CI | App and server suites pass; CI green on main. |
| J5 | Route guard | No Base-only screen is reachable; a hidden route lands on "Not on Solana". |
