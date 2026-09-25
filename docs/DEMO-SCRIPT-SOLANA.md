# xorr — the STOCKLANA video (about 3 minutes, Solana mainnet)

**The story in one line:** stocks trade on Solana all night; nobody can watch them. xorr gives the job to an AI agent that
trades from its own wallet, inside rules you set, and one tap takes every permission back.

Judges ask one question: *could this be a real app people will actually use?* This one runs on **Solana mainnet with
real money** — every scene is a real transaction on Solscan. Short sentences. Never say "would".

## Before you record (10 minutes)

1. **The iPhone simulator** is open with the xorr app (Claude builds and installs it).
2. **Your demo account holds real funds.** Sign in once (email + code), copy the address from **Deposit**, and send it
   **about $25 USDC and 0.02 SOL** from your own wallet. Sign out again, so the sign-in happens on camera.
3. **Browser** for the landing: https://xorr.finance, full screen, bookmarks hidden, zoom 110%.
4. Keep https://solscan.io open in a tab to show one transaction.

Amounts are small on purpose: the permission, the agent's wallet and its rules all cap what can move.

## The scenes

| # | Time | Screen | Do this | Say this |
|---|---|---|---|---|
| 1 | 0:00 | Film | The night-shift film, as is (`xorr-night-shift.mp4`, 20 s) | *(the film speaks: "Wall Street closes at 4. Solana doesn't.")* |
| 2 | 0:20 | xorr.finance | Slow scroll: hero → the four agents → "How it works" | "xorr is an AI agent that trades tokenized US stocks for you on Solana — from its own wallet, inside rules you set, and a permission you take back in one tap." |
| 3 | 0:35 | iPhone | Open xorr → **Get started** → email → code → Home shows your USDC | "I sign in with email — or Google, X, GitHub, or a Solana wallet. Privy gives me a Solana wallet that is mine; xorr never sees its key. This is mainnet, real USDC." |
| 4 | 0:55 | iPhone | **Let the bot trade** → set **$200 a day** (the minimum) and **1 Day** → read the cards → **Sign this permission** → approve | "Here's the key idea. The bot gets a permission: a daily limit, one day, and a total the chain itself enforces — and it can never move more than the wallet holds. That's all it can ever touch." |
| 5 | 1:15 | iPhone | Home → **Momentum Scout** → **Hire Momentum Scout** → **Fund** $10 → **Its rules → Edit**: $5 a trade, only NVDAx and TSLAx, 3% max loss → **Save** → **Ask Momentum Scout to look now** | "Every agent gets its own wallet. I put in $10 — the chain stops it there. Its rules: $5 a trade, only these two stocks, a stop 3% under the fill. Now I ask it to look." *(Read its answer: a trade with the receipt, or exactly why not.)* |
| 6 | 2:05 | iPhone → Solscan | If it traded: tap the receipt's transaction → show it on Solscan | "That's a real Jupiter swap on mainnet." |
| 7 | 2:15 | iPhone | **Stocks** → **Pre-IPO** → **OpenAI** → Buy **$5** | "Pre-IPO too — OpenAI, tokenised by Tessera. It shows the pool price against Tessera's own mark before I buy. And while Nasdaq is shut, the agent won't enter if the pool has drifted from Pyth's price for the real share." |
| 8 | 2:35 | iPhone | **Safety** → **Stop all trading** → approve → try a buy → refused | "One tap stops everything, the agent's wallet included — a revoke on the blockchain, and it works even if our server is down. Watch: a buy is refused." |
| 9 | 2:55 | End card | Last 3 s of the film (XORR · xorr.finance) | "xorr. Your agent, your rules, your money." |

## If something goes wrong

- **The agent says it won't trade** (market closed, cooldown, no setup): read its reason out loud — "it tells me
  exactly why it didn't trade" — skip scene 6, and move on. It keeps checking on its own.
- **A buy says the route could not execute**: nothing was spent and the USDC is back. Try again in a minute.
- **A Privy popup hangs**: close it and tap again. Nothing is sent until you approve.

## Don't

- Don't explain tech words (SPL, delegate, CPI, Token-2022). Say "permission", "wallet", "the blockchain".
- Don't open any Base screen or app.xorr.finance — that is the Base app. The Solana app is https://xorr-solana.vercel.app.
- Don't go over 3 minutes. Cut scene 6 first.
