# xorr — the STOCKLANA video (about 3 minutes, Solana mainnet, agent-first)

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

The story is the agent: you hire it, give it a wallet and rules, and it trades on its own. The manual buy is one short
scene, there to show the pre-IPO market and the price check.

| # | Screen | What happens | Say this |
|---|---|---|---|
| 1 | Film | The night-shift film (`xorr-night-shift.mp4`) | *(the film speaks: "Wall Street closes at 4. Solana doesn't.")* |
| 2 | xorr.finance on the phone | Hero → "Trading you can hand off" → the gates → "Revoke it in one tap" | "xorr gives your trading to AI agents. They buy tokenized US stocks on Solana from their own wallet, inside rules you set." |
| 3 | iPhone | Launch → **Get started** → email → code → Home | "Sign in with email, Google, X, GitHub or a Solana wallet. Privy makes a wallet that is mine. This is mainnet." |
| 4 | iPhone | Home: balance, the four agents, Gainers, a stock and its 1:1 backing | "Four agents ship with the app. Every stock is backed one to one, and the app shows the proof." |
| 5 | iPhone | **Let the bot trade** → $100 a day, 1 day → **Sign this permission** | "The bot gets one permission: a daily cap and an end date the chain enforces." |
| 6 | iPhone | **Hire Momentum Scout** → **Its rules**: $10 a trade, any xStock, 3% max loss → **Fund** $10 → Solana Explorer: −10 / +10 USDC | "Its own wallet, its own rules. I put in ten dollars — that is all it can ever spend." |
| 7 | iPhone | The agent trades by itself: Home says what it bought and why; Activity; the position with its stop and target; the transaction on the explorer | "I didn't press buy. Momentum Scout saw the breakout, bought inside its rules, and set a stop three percent under the fill." |
| 8 | iPhone | Chat: "Why did you buy that?" | "And it tells me why, in plain words." |
| 9 | iPhone | Stocks → **Pre-IPO** → OpenAI → Buy $5 (the ticket warns the pool is above Tessera's mark) | "Pre-IPO too — OpenAI, tokenised by Tessera, checked against Tessera's own mark before I buy." |
| 10 | iPhone | **Safety** → **Stop all trading** → a look is refused | "One tap takes every permission back, the agent's wallet included — on the blockchain, not on our server." |
| 11 | End card | XORR · xorr.finance | "xorr. Your agent, your rules, your money." |

## If something goes wrong

- **The agent says it won't trade** (market closed, cooldown, no setup): read its reason out loud — "it tells me
  exactly why it didn't trade" — skip scene 6, and move on. It keeps checking on its own.
- **A buy says the route could not execute**: nothing was spent and the USDC is back. Try again in a minute.
- **A Privy popup hangs**: close it and tap again. Nothing is sent until you approve.

## Don't

- Don't explain tech words (SPL, delegate, CPI, Token-2022). Say "permission", "wallet", "the blockchain".
- Don't open any Base screen or app.xorr.finance — that is the Base app. The Solana app is https://xorr-solana.vercel.app.
- Don't go over 3 minutes. Cut scene 6 first.
