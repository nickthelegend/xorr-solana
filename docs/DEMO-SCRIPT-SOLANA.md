# xorr on Solana — demo script (2:45)

For the STOCKLANA video. Everything shown is the hosted build (https://xorr-solana.vercel.app) on the hosted mainnet
fork: real mainnet programs and mints, test money, real signed transactions. Say "fork" once, early, and never "would".

**Before recording:** redeploy the fork (fresh Jupiter routes: `railway up` of `infra/solana-fork`), sign in with a fresh
account, keep the Solana Explorer tab pointed at the fork (`?cluster=custom&customUrl=<fork RPC>`).

| t | On screen | Say |
|---|---|---|
| 0:00 | Welcome | "xStocks trade on Solana around the clock. Nobody can watch a market all night — so xorr lets an agent do it, without ever holding your money." |
| 0:12 | Sign in with email → wallet created | "Sign in with email. Privy makes a Solana wallet that is yours; we never see its key." |
| 0:22 | Deposit → Get 500 test USDC | "This runs on a mainnet fork, so the money is test USDC. Everything else is mainnet's own: USDC, the xStocks, Jupiter." |
| 0:32 | Grant screen: the cards | "The permission is the product. One transaction: the bot may spend this much USDC, and sell the xStocks you hold so a stop-loss can fire. The chain enforces the total; we enforce the daily cap and the end date." |
| 0:50 | Privy sheet → Approve → Home ARMED | "Signed. Armed." |
| 0:55 | Trade tab → NVDAx ticket | "Any xStock, with the real Jupiter quote: price impact, slippage, the route, the least it can fill at — and what backs the token: the attestation, the issuer's controls, whether this wallet is eligible." |
| 1:15 | Buy $25 → receipt with signature | "Bought, through Jupiter. That's the signature on the fork — open it." (Explorer tab: the Route instruction, the Whirlpool CPI.) |
| 1:30 | Home → hire Momentum Scout | "Hire an agent. It watches the xStocks, and when a setup appears it buys — and says why." |
| 1:40 | Activity: the agent's buy + reason + "Exit set" | "It bought NVDAx, told me the setup and the numbers, and armed a stop and a target. Those fire on their own, through the sell approval I granted." |
| 1:55 | Portfolio: holding with Scaled-UI units, P&L | "Holdings use the token's own multiplier, so a dividend or split moves the number the way the issuer meant." |
| 2:05 | Ticket → Sell → Privy → receipt | "And I can sell myself — one transaction I sign." |
| 2:15 | Safety → Stop all trading → STOPPED, "confirmed on-chain" | "One tap stops everything: an SPL revoke on every account that names the bot. Stop-losses included. It works with our server down." |
| 2:28 | Ticket → Buy → refused | "Try to buy now — refused, because the chain says so." |
| 2:35 | Send → allowlisted address | "Withdrawals go only to addresses you saved a day ago." |
| 2:42 | Closing card: repo + URL | "xorr. The permission is the product." |

**Show one refusal** (0:28 over-cap or 2:28 after the stop). **Never** show a Base screen — the Solana build hides them.
