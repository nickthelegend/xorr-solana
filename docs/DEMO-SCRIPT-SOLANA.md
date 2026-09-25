# xorr — the STOCKLANA video (about 3 minutes)

**The story in one line:** stocks trade on Solana all night; nobody can watch them. xorr gives the job to an AI agent that
trades from its own wallet, inside rules you set, and one tap takes every permission back.

Judges ask one question: *could this be a real app people will actually use?* Every scene answers it by doing the thing,
live. Short sentences. Say "test money" once. Never say "would" — everything shown works.

## Before you record

1. **Timing.** The test network restarts every day at **04:00 UTC (9:30 AM IST)** with fresh markets, and test
   balances start over. Record after it, never across it (not between 9:20 and 9:45 AM IST).
2. **iPhone simulator** open with the xorr app installed (Claude builds and installs it). Sign up there with a **new**
   email — you enter the email and the code yourself.
3. **Browser** for the landing: https://xorr.finance, full screen, bookmarks hidden, zoom 110%.
4. One quiet practice run of scenes 5–6, then start over with another new email.

## The scenes

| # | Time | Screen | Do this | Say this |
|---|---|---|---|---|
| 1 | 0:00 | Film | The night-shift film, as is (`xorr-night-shift.mp4`, 20 s) | *(the film speaks: "Wall Street closes at 4. Solana doesn't.")* |
| 2 | 0:20 | xorr.finance | Slow scroll: hero → the four agents → "How it works" | "xorr is an AI agent that trades tokenized US stocks for you on Solana — from its own wallet, inside rules you set, and a permission you take back in one tap." |
| 3 | 0:35 | iPhone | Open xorr → **Get started** → email → code → wallet appears → **Deposit** → **Get 500 test USDC** | "I sign up with email. Privy makes a Solana wallet that is mine — xorr never sees its key. This is a copy of Solana mainnet, so it's test money; the stocks, USDC and Jupiter are mainnet's own." |
| 4 | 1:05 | iPhone | **Let the bot trade** → read the cards → **Sign this permission** → approve | "Here's the key idea. The bot gets a permission: a daily limit, an end date, and a total the chain itself enforces. That's all it can ever touch." |
| 5 | 1:20 | iPhone | Home → **Momentum Scout** → **Hire Momentum Scout** → **Fund** $100 → **Its rules → Edit**: $20 a trade, only NVDAx and TSLAx, 3% max loss → **Save** → **Ask Momentum Scout to look now** | "Every agent gets its own wallet. I put in $100 — the chain stops it there. Its rules: $20 a trade, only these two stocks, a stop 3% under the fill. Now I ask it to look." *(Read its answer: a trade with the receipt, or exactly why not.)* |
| 6 | 2:10 | iPhone | **Stocks** → **Pre-IPO** → **OpenAI** → Buy **$10** | "Pre-IPO too — OpenAI, tokenised by Tessera. It shows the pool price against Tessera's own mark before I buy. And while Nasdaq is shut, the agent won't enter if the pool has drifted from Pyth's price for the real share." |
| 7 | 2:30 | iPhone | **Safety** → **Stop all trading** → approve → try a buy → refused | "One tap stops everything, the agent's wallet included — it's a revoke on the blockchain, and it works even if our server is down. Watch: a buy is refused." |
| 8 | 2:50 | End card | Last 3 s of the film (XORR · xorr.finance) | "xorr. Your agent, your rules, your money." |

## If something goes wrong

- **The agent says it won't trade** (market closed, cooldown, no setup): read its reason out loud — "it tells me
  exactly why it didn't trade" — and move on. It keeps checking on its own.
- **A buy says the route could not execute**: the markets went stale; nothing was spent and the money is back. Record
  after the next 04:00 UTC refresh, or ask Claude to refresh the fork now (it resets balances).
- **A Privy popup hangs**: close it and tap again. Nothing is sent until you approve.

## Don't

- Don't explain tech words (SPL, delegate, CPI, Token-2022). Say "permission", "wallet", "the blockchain".
- Don't open any Base screen, and don't show app.xorr.finance — that is the Base app. The Solana app is
  https://xorr-solana.vercel.app.
- Don't go over 3 minutes. Cut scene 6's Pyth sentence first.
