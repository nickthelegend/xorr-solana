# xorr on Solana — the Loom (about 2:30)

**The whole story in one line:** an AI agent trades tokenized stocks for you, from its own wallet, inside rules you set —
and one tap takes every permission back.

Keep it simple. Short sentences, one idea per scene, show don't explain. Everything on screen is real: the hosted app
(https://xorr-solana.vercel.app) on a copy of Solana mainnet with test money. Say "test money" once, early.

## Before you record (5 minutes)

1. Redeploy the `solana-fork` service on Railway, so trade routes are fresh. (It resets every balance.)
2. Open the app in a clean browser window and sign in with a **new** email.
3. Hide bookmarks and other tabs. Zoom the browser to 110% so text reads on video.
4. Do one practice run of scenes 3–5 so nothing surprises you — then start over with another new email.
5. Have a second tab ready on Solana Explorer for the fork, to show one real transaction.

## The six scenes

| # | Time | Do this | Say this |
|---|---|---|---|
| 1 | 0:00 | Welcome screen | "Stocks now trade on Solana all day, every day. Nobody can watch that. xorr gives the job to an AI agent — without ever holding your money." |
| 2 | 0:15 | Sign in with email → **Deposit** → **Get test USDC** | "I sign in with email and get my own Solana wallet. This runs on a copy of Solana mainnet, so this is test money." |
| 3 | 0:35 | **Let the bot trade** → read the cards → **Sign this permission** → approve the popup | "Here is the key idea. I give the bot a permission, with a daily limit and an end date. That's all it can ever touch. I can take it back anytime." |
| 4 | 0:55 | **Stocks** → **NVDAx** → Buy **$25** → receipt → open it on Explorer | "Buying Nvidia takes one tap. It goes through Jupiter, Solana's biggest exchange. Here's the real transaction." |
| 5 | 1:20 | Home → **Momentum Scout** → **Hire Momentum Scout** → **Fund $100** → **Its rules → Edit**: $20 a trade, NVDAx + TSLAx, 3% max loss → **Save** → **Ask Momentum Scout to look now** | "Each agent gets its own wallet. I put $100 in, and it can never spend more than that. I set its rules: $20 a trade, only these two stocks, a stop 3% under the fill. Now I ask it to look." (Read what it answers — a trade, or why not.) |
| 6 | 1:55 | **Safety** → **Stop all trading** → approve the popup → try to buy → refused | "One tap stops everything, the agent's wallet included. Watch — a buy is refused now, because the permission is gone on the blockchain itself." |
| — | 2:20 | End card: live URL + GitHub | "xorr. Your agent, your rules, your money." |

## If something goes wrong

- **The agent says it won't trade** (market closed, cooldown, no setup): that's fine — read its reason out loud. "It
  tells me exactly why it didn't trade. It keeps checking on its own, and trades from its wallet when the setup is
  there."
- **A buy fails with a route error**: the fork's routes went stale. Stop, redeploy `solana-fork`, start over.
- **A Privy popup hangs**: close it and tap the button again. Nothing is sent until you approve.

## Don't

- Don't say "would" or "will" — everything shown already works.
- Don't explain tech words (SPL, delegate, CPI, Token-2022). Say "permission", "wallet", "the blockchain".
- Don't open any Base or EVM screen.
- Don't go over 3 minutes. If you ran long, cut scene 4's Explorer tab first.
