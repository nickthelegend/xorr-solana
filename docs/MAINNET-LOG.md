# xorr on Solana mainnet — transaction log

Every transaction below is on Solana mainnet and can be opened on Solscan. Each was read back from the chain before it
was written here. The owner's personal funding wallet is left out on purpose.

## Deployment (2026-09-25)

| When (UTC) | What | Verified on chain |
|---|---|---|
| 2026-09-25 | Executor switched to `solana-mainnet`, Helius RPC | `/health`: `rpc up`, Pyth `Equity.US` feeds live, Tessera marks live |
| 2026-09-25 | Payer funded with 0.08 SOL | [`6usPSsyc…`](https://solscan.io/account/6usPSsycKfrcmEc8zxmRmjVvUCGu2Ygf89RHk7peauhc) balance 0.08 SOL |
| 2026-09-25 | Venue vault funded with 0.07 SOL | [`CZ1JQUm7…`](https://solscan.io/account/CZ1JQUm7CbTrvUimxzpZZAPRbe65d5SV2R91yjAa82i9) balance 0.07 SOL |

## The demo

Recorded as the demo runs: the grant, the agent-wallet funding, the agent's own trade, the owner's pre-IPO buy and sale,
and the stop — each with its signature.

The demo account is [`ChZuNgqv…`](https://solscan.io/account/ChZuNgqv2ACbc7X4ymxtAe51gY7ALDjdSfWmejQ3Z7Vb), a Privy
wallet made with an email sign-in. Momentum Scout's own wallet is
[`87oWjdNW…`](https://solscan.io/account/87oWjdNWYKTkiRhbHS7Mq6K4eACKaNpVh1cvEKCvicVG), a USDC account the owner owns.

| When (UTC) | What | Transaction |
|---|---|---|
| 2026-09-25 15:20 | The owner signs the permission: $100 a day for one day, the bot's key as delegate on their USDC | [`2vSM5dsQ…`](https://solscan.io/tx/2vSM5dsQJzmPmTPcxHgiAvNpkQVis7JPxVvdwTmq6M3mcMMrry2PNUxaexEPHB3YByZNaJjtH7Cj3m5QefNaYAyE) |
| 2026-09-25 15:22 | Momentum Scout buys $24 of METAx through Jupiter — from the main account, because it had no wallet of its own yet. A bug: fixed the same evening (an agent now spends only from its own funded wallet, `0152206`) | [`m7BQ4MCY…`](https://solscan.io/tx/m7BQ4MCYa2dmBrHMvL4gCKxJFU1ZErNVMn2KH2tg5jn5g9N3koXKumnHzEuw1NEy3RpVqMXM155GKzMVeWEkHJA) |
| 2026-09-25 15:38 | The owner sells the METAx back to USDC: a Jupiter swap the owner alone signs ($23.89 back; the round trip cost $0.11) | [`5pHJSS7P…`](https://solscan.io/tx/5pHJSS7P2kYmaDvQ5nL5rsz384FAmPQErHWZWMvZqPQotwmK4nBbi9m6AZ44wEtCUHF2y9Me9APB4QXjx68pKvMf) |
| 2026-09-25 15:42 | The owner funds Momentum Scout's wallet with $10: the account is created with a seed from the owner's key, $10 USDC moves in, and the bot is approved on it | [`4sUvrbgd…`](https://solscan.io/tx/4sUvrbgd68Rk8f5TQqAHTTcw49jGuyq4vzr8HsQygRx4pZG6zHgTw3GZEu5eHuNEQeyYViP3FCi5RZXZQpxqpW9q) |
| 2026-09-25 15:48 | The owner buys $5 of T-OpenAI (Tessera, pre-IPO) through Jupiter; 0.004794622 T-OpenAI lands in the owner's wallet. The ticket warned the pool was 28.3% above Tessera's mark | [`3pS6houV…`](https://solscan.io/tx/3pS6houVi93TRUyz2y5H1xBPShRc8jJ6PVR3EbqNSR2pwumEgchEeLKY29Z9emG6hJYq2g1qAfeLRGp5VZcjUsZA) |
| 2026-09-25 16:22 | **Momentum Scout buys $10 of AAPLx on its own**, from its own wallet, through Jupiter — nobody pressed buy. It set a stop 3% under the $340.11 fill | [`4ct3teXX…`](https://solscan.io/tx/4ct3teXX5nfMK3tV2UfaQVVA3BgrETPFq8Tuv1LPN9mbZNHqh1Ld4u5FvFpPkCN9wwVUQQRfn4iZXQiU6rnueeuX) |
| 2026-09-25 16:27 | The owner presses Stop all trading: every approval revoked on-chain, the agent's wallet included | [`2bhMmCDs…`](https://solscan.io/tx/2bhMmCDsXV9R8ZMfkjAjeWEosWPwS1HRD9UduKpgSgHr2zPCKwyefwkXUzb2EMdtmw5awGS4WdaUMttFByCh7wYK) |
| 2026-09-25 17:39 | The owner sells the AAPLx position ($9.98), a Jupiter swap the owner signs | [`2XnAtMZx…`](https://solscan.io/tx/2XnAtMZx8Ya6SyiNaUcAmeEqsXYWi2UzjBP9osYb9N8w8xEYYKbhKKHsGEC43WyKGNa69MZH5fE6TuD8Rqg86bRu) |
| 2026-09-25 17:42 | The owner grants the permission again: $100 a day for one day | [`oScKNCnx…`](https://solscan.io/tx/oScKNCnxWzonP7RJUNEgW2UD6jExCAFhJR7ynBDMBDrjApqDXjmLaSL2J9Dbo9VqjX22pQMXcM5eUTkMJzMirGy) |
| 2026-09-25 17:44 | The owner funds Momentum Scout's wallet with $10 again | [`3uaKFyeQ…`](https://solscan.io/tx/3uaKFyeQdX59E9sfxzRXQq17qkqEwR5g9r1QXgF4fGS67F6xfmZrjb3b5T5uzTZ5d7iGJzrVpSdMryRB1rrSwVKf) |
