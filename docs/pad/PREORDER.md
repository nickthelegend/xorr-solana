# xorrpad pre-orders — S2 (local only)

SPDX-License-Identifier: MIT · Copyright (c) 2026 Nivesh Gajengi

S2 adds the deposit migration, `/api/pad/preorder`, and a sheet inside the existing model chooser.
The branch is `xorrpad-preorder`, following S1 on `xorrpad-v3-attest`. Never push or deploy this work.
S3 (verified backers wall) and S4 (waitlist welcome emails and signed unsubscribe) remain separate sections.

## Configuration

Variable names only; no production secrets were read or copied:

| Variable | Purpose |
| --- | --- |
| `TEST_DATABASE_URL` | Required for development/tests; only loopback Postgres and a database named `xorrpad_…`, without URL query overrides. Takes priority in every environment. |
| `DATABASE_URL` | Production runtime only, when no test URL exists. Nick supplies it; development must never use the owner's production URL. |
| `PREORDER_CLUSTER` | Defaults to devnet. An unsupported cluster fails closed. |
| `PREORDER_TREASURY` | Treasury wallet public key; its USDC associated token account must exist and be initialized. |
| `PREORDER_ALLOW_MAINNET` | Mainnet requires the exact acknowledgement from the brief, together with an explicit mainnet cluster and treasury. |
| `PREORDER_REFUND_EMAIL` | Required real refund inbox for the admin-free “Request refund” email link. |
| `RESEND_API_KEY` | Receipt delivery through Resend; missing configuration is recorded as `skipped_setup`. |
| `EMAIL_FROM` | Verified sender for receipt delivery. Missing sender also records `skipped_setup`. |

RPC endpoints are fixed by cluster. Devnet mint: `3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ` (six decimals).
The Solana Pay URL contains the treasury **wallet**, mint, exact amount and unique reference; wallets derive the treasury ATA.
The response also exposes `recipientAta` for inspection. Email addresses and opt-in names never go in the URL or on chain.
The server generates a reference key but **never signs a payment**. Only the buyer's connected wallet signs.

## Local Postgres and build

Postgres 16.15 runs on loopback port 55432, data under `landing/.pgdata/` (gitignored).
The local database used here is `xorrpad_preorder_test`. Export its connection as `TEST_DATABASE_URL` yourself.
No script loads dotenv, and no development command falls back to a hosted database.

From `landing/`, with the local test URL exported:

```sh
/opt/homebrew/bin/pg_ctl -D .pgdata -l .pgdata/server.log -o '-h 127.0.0.1 -p 55432' start
npm run migrate:preorders:local
npm test
npm run build:local
npm run start:local -- -p 4319
```

For a fresh checkout, first initialize `.pgdata/` with `/opt/homebrew/bin/initdb -D .pgdata -A trust --no-locale -E UTF8`,
then start Postgres as above and create `xorrpad_preorder_test` with `createdb -h 127.0.0.1 -p 55432`.
This session stopped its local preview servers and Postgres after verification; the ignored data directory remains available.

`build:local` and `dev:local` copy only source, public assets and named build configuration into
`landing/.next-local/app/`, then execute Next there. They exclude every environment file and remove any
inherited `DATABASE_URL`; a validated local test URL replaces it for the existing waitlist route.
The normal `npm run build` script remains available for deployment. Do not run it directly in the original
landing directory while `.env.local` is present: Next automatically reads that file.
The isolated build uses webpack for the pinned legacy web3 wallet adapter and Solana Pay APIs.
The existing Neon HTTP waitlist adapter cannot serve local Postgres; its failure remains honest (no invented count).
Waitlist production logic was left for S4.

Production migration for **Nick to review and run himself**: `landing/migrations/001_preorders.sql`.
It creates `preorders`, a unique signature constraint, unique references and checkout idempotency keys,
plus the receipt-only `email_events` outbox. It is transactional and safe to apply again.
S4 must extend the receipt-only outbox for waitlist events and unsubscribe handling.
There is no automatic migration at application startup or build time.

## Payment behavior

- `GET /api/pad/preorder`: public checkout configuration or HTTP 503 `Setup required: …`.
- `POST` with `action: "create"`: validated SKU/build/edition, email, optional name, explicit name consent and UUID idempotency key.
  Amounts always come from `pad-pricing.ts`. Repeated identical submissions return the same order/reference;
  changed details under the same key return HTTP 409. A new checkout always gets a new reference.
- `GET` with an unguessable order `id`: payment fields only, never the stored email or private name.
- `POST` with `action: "confirm"` and `id`: finalized `findReference` then `validateTransfer`.
  The additional guard requires the correct mint, six decimals, canonical treasury ATA, exact instruction amount
  and exact balance increase. The library alone permits overpayment, so it is insufficient by itself.
  Payer identity comes from the token source's on-chain owner, never a supplied wallet field.
- Only verified deposits transition to `paid`. The unique signature index and conditional update protect concurrent
  confirmations. Receipt events have a unique order constraint, delivery claims and Resend idempotency keys;
  email delivery failure never loses the paid order. Missing mail configuration returns `email: "Setup required: …"`.
- A QR and a connected browser wallet use the **same** request/reference. Session storage remembers an outstanding
  order so reopening checkout cannot silently create another deposit. Failed recovery blocks a new checkout.
- Copy states the deposit is refundable before the order ships; final terms await Nick's approval.
  Refund requests open an email draft. There is no automatic refund or server-side payment signing.

## Evidence — 2026-11-12

- Nine tests pass on local Postgres 16 and **live** devnet RPC; no chain mocks or fabricated payments/backers.
  Coverage: config/DB guards, server prices, metadata privacy, consent, concurrent creation idempotency,
  signature uniqueness, malformed requests, same-origin writes, real unpaid-reference lookup and repeated pending confirmation.
- Live historical `validateTransfer` fixture:
  [56NPRk…EB1nz](https://explorer.solana.com/tx/56NPRk7UtNDmccSuNJGjhRoCB7waPLjQXbw1JsmBnPVTCdJYac9XdeF5Xbe5Duqoe3jT9mEBV2DPPPdyz57EB1nz?cluster=devnet).
  It transferred 1,000 mUSDC on devnet. Tests fetch it afresh and validate the original response;
  wrong amount/mint/recipient checks fail. A new preorder reference also fails validation because this old
  transfer contains no Solana Pay reference. It is **never recorded as a paid preorder**.
- Production Next build passes in the isolated directory; TypeScript and ESLint pass for the changed files.
  Browser checks cover 1440px and 375px, form/QR, Escape dismissal, order recovery, no horizontal overflow,
  and the mainnet gate (HTTP 503, “Pre-orders open soon”, waitlist CTA).
- Screenshots: `docs/pad/screenshots/preorder-s2-{models,sheet,qr,gated}-{1440,375}.png`.
  The QR screenshots show real **unpaid local orders**, not successful deposits. Local screenshot rows are removed afterward.
- Positive paid-confirmation/replay and receipt-delivery integration remain dependent on the funded live test below.
  No paid row was fabricated merely to exercise these paths. Full email/unsubscribe tests belong to S4.

## Live devnet checkout: BLOCKED — funding required

No operator treasury or funded buyer was supplied through the permitted environment.
Dedicated **devnet-only** test wallets were generated locally; no payment was signed/submitted and no faucet was called.
On-chain `getMultipleAccounts` returned `null` for all four accounts below at the time of verification:

| Account to fund/initialize | Public address | Needed |
| --- | --- | --- |
| Test treasury wallet | `AZHQ6w3EcSh8b77KXghr9Ciq4gkFH5Zv1DffAb4TLvXr` | Devnet SOL for wallet/ATA initialization |
| Test treasury mUSDC ATA | `8bubWB6e5VjfUTD2WUnR1Wy5JW9ZD9fiTdCPvT7ETVuG` | Initialize for the exact devnet mint |
| Test buyer wallet | `tnLhTPA4Dxq4XX6srgEeRfby97kLZNyGS42Degy33SP` | Devnet SOL for transaction fees |
| Test buyer mUSDC ATA | `8kdf26dFK9DeVYFNHM6uwC7VDQY8eFQ7AxaHpLGZDfjm` | Initialize and fund with at least 30 mUSDC for a Pro deposit |

Generated test key files remain only in gitignored `landing/.pgdata/devnet-checkout/` with owner-only permissions.
Import the **test buyer** into a browser wallet locally and switch it to devnet; never add either key to the application.
Configure the test treasury and a real refund inbox, open the sheet, pay from that buyer, then confirm the real signature
is saved once and repeat confirmation to verify paid replay and a single receipt event. With Resend absent, verify the
event is `skipped_setup` and the response reports the missing setup. Do not count the historical fixture as this test.

## Nick's go-live checklist

1. Complete the funded devnet wallet/QR flow and paid replay/receipt tests above.
2. Approve DIY/founder pricing, refund terms and refund inbox; confirm deposit balance is accounted for toward the final price.
3. Complete S3 and S4, including reverified backers, signed unsubscribe and mail event tests.
4. Review dependency advisories before any public payment launch. The current landing dependency audit reports
   advisories in the existing Next/sharp stack and the legacy Solana Pay/web3/SPL stack. No unrelated dependency
   migration or automatic audit fix was applied in S2.
5. Review/apply the SQL migration yourself to the intended production database; configure the verified Resend sender.
6. Choose and initialize the intended treasury ATA; verify mint/network and a small real test yourself.
7. Mainnet stays closed until all three brief gates are set deliberately. This S2 session made **no mainnet RPC calls**.
8. Review locally. This task authorizes no push, Vercel change or deployment.
