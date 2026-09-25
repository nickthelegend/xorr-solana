# STOCKLANA submission — xorr

Paste-ready text for hackathons.solana.com. Fill the video link and the team on the day. Submissions close Friday 25
September 2026, 4:00 PM ET (1:30 AM IST Saturday); edits are allowed until then, so submit early and edit.

**Name:** xorr

**One line:** An AI agent that trades tokenized stocks (xStocks) on Solana for you, inside an on-chain permission you can
revoke in one tap — it never holds your money.

**Links**
- Website: https://xorr.finance
- Live app: https://xorr-solana.vercel.app (Solana mainnet; sign in with email, Google, X, GitHub or a Solana wallet)
- Repository: https://github.com/nickthelegend/xorr-solana
- Video: [link]
- Verify it yourself: README → "Verify it yourself, on your own machine" (ten minutes, no keys)

**Tracks:** main track, plus **Tessera** (OpenAI and Kalshi T-Tokens trade from the same ticket through Meteora, with the
pool price against Tessera's mark) and **Pyth** (before any agent entry while Nasdaq is shut, the pool is checked against
Pyth's `Equity.US.<TICKER>/USD` feed read from its Solana price account). Not PreStocks: its rules exclude projects that
use other pre-IPO tokens, and these are Tessera's.

**The problem.** Tokenized US stocks trade around the clock on Solana; people do not. Automating it today means handing a
bot your keys or your funds. Handing a bot your money is a trust problem, not a trading problem.

**What xorr does.**
- You grant a permission in one transaction: an SPL `ApproveChecked` on your USDC (daily cap × days) and a sell approval on
  each xStock. The chain enforces the total; xorr's single spend path enforces the daily cap, the end date, the issuer's
  transfer gates and a live quote before anything moves, and refunds you if a swap does not fill.
- A hired agent watches xStocks and buys through Jupiter when a setup appears, states why, and arms a stop-loss and
  take-profit that sell unattended. It is paced: one entry per stock per day, a quarter of the grant per stock.
- **Every agent has its own wallet and its own rules.** The wallet is a USDC token account the user owns, derived from
  their key and the agent's id with `createWithSeed`: funded in one signature, approved to the bot, spent by that agent
  alone and paid back into by its sales. The chain stops each agent at what its wallet holds — a per-agent budget
  enforced by SPL itself, with no custody. On top, the user sets each agent's rules (most per trade and per day,
  allowed stocks, whether it trades while Nasdaq is shut, maximum loss per position), enforced on every entry.
- Pre-IPO: Tessera's T-Tokens (OpenAI, SpaceX, Kalshi) trade from the same ticket through Meteora, with the pool price,
  Tessera's mark and the gap between them shown before anyone buys.
- You can buy and sell any xStock yourself with the real Jupiter quote breakdown, the token's proof of reserves, issuer
  controls and eligibility for your wallet.
- Holdings and P&L use Token-2022's Scaled UI multiplier, so dividends and splits show as the issuer meant.
- One tap stops everything: an SPL `Revoke` on every account that names the bot, stop-losses included — and it works
  with our server down. Withdrawals go only to allowlisted addresses after a 24-hour cooling-off.

**Why Solana.** xStocks are Token-2022 tokens with Scaled UI, pause, freeze and permanent-delegate controls; Jupiter
routes them; an SPL delegation is a native, revocable, capped permission. xorr is built on all of these, and shows each
one to the user.

**Built with.** Solana (SPL Token, Token-2022, `createWithSeed` agent accounts), Backed xStocks, Tessera T-Tokens,
Jupiter v6, Meteora DLMM, Pyth (Equity.US feeds read on-chain), Privy (Solana embedded wallets), Expo,
Hono + Postgres, `solana-test-validator --clone` of mainnet, Railway, Vercel.

**What is real.** Everything. The hosted app runs on Solana mainnet with real USDC: every transaction in the demo is on
Solscan. Every fill, including a sale you sign yourself, is a Jupiter route executed on chain, and a route that cannot
execute fills nothing and returns your money. Anyone can also reproduce the on-chain proofs without money on a local
clone of mainnet (README → Verify it yourself). The limits are listed in the README.

**Team:** [names]
