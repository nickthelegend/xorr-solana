# xorrpad pre-orders — S3 / S4 (local only)

SPDX-License-Identifier: MIT · Copyright (c) 2026 Nivesh Gajengi

S2 adds the deposit migration, `/api/pad/preorder`, and a sheet inside the existing model chooser.
The branch is `xorrpad-preorder`, following S1 on `xorrpad-v3-attest`. Never push or deploy this work.
S3 adds `/pad/backers` and the `/pad` backers strip. S4 adds Resend welcome/receipt delivery, durable mail events and signed unsubscribe.

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
| `RESEND_API_KEY` | Welcome and receipt delivery through Resend; missing configuration is recorded as `skipped_setup`. |
| `EMAIL_FROM` | Verified Resend sender for welcome and receipt delivery. Missing sender records `skipped_setup`. |
| `EMAIL_UNSUBSCRIBE_SECRET` | Stable private signing secret of at least 32 characters; missing/short values record `skipped_setup`. Keep it stable so existing links keep working. |
| `WAITLIST_IP_SALT` | Existing private salt for waitlist rate-limit IP hashing. |

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
inherited `DATABASE_URL`; the validated local test URL serves preorders, mail and the waitlist through the same guarded Postgres pool.
The normal `npm run build` script remains available for deployment. Do not run it directly in the original
landing directory while `.env.local` is present: Next automatically reads that file.
The isolated build uses webpack for the pinned legacy web3 wallet adapter and Solana Pay APIs.
S4 replaces the waitlist-only Neon HTTP adapter with the shared Postgres adapter, preserving ranking and referrals. All local reads/writes use `TEST_DATABASE_URL`.

Production migration for **Nick to review and run himself**: `landing/migrations/001_preorders.sql`.
It creates `preorders`, a unique signature constraint, unique references and checkout idempotency keys,
plus the receipt-only `email_events` outbox. It is transactional and safe to apply again.
`landing/migrations/002_email.sql` extends that outbox for waitlist welcomes, source, provider ID, immutable retry payload and attempt timestamp, and creates the unsubscribe table. It safely reuses an existing waitlist table or creates it locally. Apply 001 then 002; both are transactional and repeatable.
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

- [ ] Complete the funded devnet wallet/QR flow and paid replay/receipt tests above; save the real signature and confirm one paid order, one receipt event and one verified backer.
- [ ] Approve DIY/founder pricing, refund terms and refund inbox; confirm deposit balance is accounted for toward the final price.
- [ ] Review S3/S4 locally; verify a populated backers wall and receipt once a real devnet deposit is available. Configure mail and verify an actual welcome/receipt plus unsubscribe using an inbox you control.
- [ ] Review dependency advisories before any public payment launch. The S2 landing dependency audit reported
   advisories in the existing Next/sharp stack and the legacy Solana Pay/web3/SPL stack. No unrelated dependency
   migration or automatic audit fix was applied in S2.
- [ ] Review/apply both SQL migrations yourself to the intended production database; configure the verified Resend sender.
- [ ] Choose and initialize the intended treasury ATA; verify mint/network and a small real test yourself.
- [ ] Keep mainnet closed until all three brief gates are set deliberately. All preorder verification in this task uses **devnet only**.
- [ ] Review locally before separately authorizing release. This task authorizes no push, Vercel change or deployment.

## S3 — chain-verified backers

Both views use one server query: only `paid` orders on the selected cluster, newest first. Each signature
is fetched and revalidated with Solana Pay plus the exact-transfer guard, including reference, recipient, mint,
amount and payer wallet. Invalid payments are omitted; totals use only the verified rows. Public names require
opt-in; other backers show shortened wallets. Emails and private names never leave the server.
No result is cached. A DB/RPC failure shows verification unavailable rather than a false zero. A successful
empty query shows “Be the first backer” and zero devnet test-token deposits. Mainnet reads honor the existing gates.

S3 verification: ten tests pass with local Postgres and live devnet RPC, including exclusion of pending orders,
empty totals and mainnet gating. Positive populated-wall integration remains blocked on the real funded checkout
above; no paid rows or backers were invented for testing.

S3 production build, TypeScript and changed-file ESLint pass. Screenshots were inspected at 1440px and 375px with no horizontal overflow: `docs/pad/screenshots/preorder-s3-{strip,wall}-{1440,375}.png`.

## S4 — Resend and unsubscribe

Joins from `/pad` pass `source: "pad"`; other joins default to `landing`. The original source is retained on
repeat joins. A welcome includes the saved place and referral link. A paid receipt includes model, build,
amount, network-labelled signature link and the refundable-before-shipping note with the refund email link.
Pending payments cannot send receipts. No historical transfer was converted into a paid order for mail testing.

All mail uses one `email_events` row per logical send (unique waitlist welcome or preorder receipt).
States are `pending`, `sending`, `sent`, `failed`, `skipped_setup`, and `unsubscribed`. A `sent` result means
Resend accepted the request with a provider ID; it does not claim inbox delivery. Missing `RESEND_API_KEY`
makes no provider request, records `skipped_setup`, and returns exactly `email: "Setup required: RESEND_API_KEY"`
on a join or paid confirmation. Missing sender/signing secret is also reported honestly. The UI preserves the
saved place/payment and explains mail setup, failure or unsubscribe rather than claiming delivery.

The sender uses [Resend's send API](https://resend.com/docs/api-reference/emails/send-email), a stored payload,
a stable idempotency key and database transaction locks. Its delivery claim and first-attempt timestamp are
committed before the provider call; active claims have a five-minute lease. Retries keep the same payload.
[Resend retains idempotency keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys), so
ambiguous attempts older than 23 hours stay `failed` for Nick to reconcile with Resend manually, avoiding an
automatic duplicate after that window. Retrying a join or paid confirmation retries setup-skipped/failed mail
within that window; there is no background queue or bulk send to the existing list.

Each message contains `https://xorr.finance/api/email/unsubscribe?token=…` with a versioned, email-scoped HMAC-SHA256
signature and timing-safe verification. GET supports the requested direct unsubscribe link; POST supports
one-click mail headers. Invalid/tampered tokens return 400; DB/setup errors return 503. Responses disable caching
and referrer propagation. Tokens intentionally do not expire; rotating the signing secret invalidates old links.
Keep the secret stable, including during key rotation at Resend. Unsubscribe persists an address-level suppression
and stops **all** future mail, including receipts and updates, across future orders and repeat joins. It never
resubscribes on another signup. It does not cancel a pre-order or remove its public backer entry.
The sender and unsubscribe serialize with the same transaction lock; a message already accepted by Resend
cannot be recalled, but no new send starts after unsubscribe completes.

S4 verification uses only loopback Postgres and live devnet for chain tests. The transport-failure test deliberately
throws before any email is accepted and never marks a send successful. Actual Resend welcome/receipt delivery is
**BLOCKED** until Nick supplies `RESEND_API_KEY`, a verified `EMAIL_FROM`, stable `EMAIL_UNSUBSCRIBE_SECRET`,
and an inbox he controls. The live paid receipt and populated-wall check also need the funded devnet accounts
listed above. No `.env.local` was read, no production migration/write occurred, and no mainnet RPC was called.

Final S3/S4 evidence (2026-11-12): 18 tests pass, including live historical devnet validation and local Postgres
order/wall/mail integration; the isolated production build (same `next build` with webpack), TypeScript and
changed-file ESLint pass. At 1440px and 375px the browser submitted the real `/pad` form: HTTP 201,
`email: "Setup required: RESEND_API_KEY"`, database `source = pad`, event `skipped_setup`, no provider ID,
no browser exceptions or horizontal overflow. Screenshots inspected:
`docs/pad/screenshots/preorder-s4-{models,sheet,email}-{1440,375}.png`, plus the S3 strip/wall evidence above.
The pictured waitlist places are local test signups; their rows/events were deleted after capture. No deposit
was made and there are still zero paid backers. Preview servers and local Postgres were stopped after QA.

## S4 done-means acceptance rerun — 2026-11-12

Verified the existing S1–S4 implementation at `566a7af` on local `xorrpad-preorder`, descended from
`xorrpad-v3-attest`. This acceptance pass changes only QA tooling and evidence; site components and styling are unchanged.

- **PASS:** complete `npm test` run: 18 passed, zero failed/skipped, using local Postgres 16.15 via
  `TEST_DATABASE_URL`. This includes the live historical devnet `validateTransfer` fixture, unpaid-reference
  lookup, order creation/idempotency, verified-backers query, email `skipped_setup`, signed unsubscribe and mainnet gates.
- **PASS:** `npm run build:local`, followed by the literal `npm run build -- --webpack` in its allowlisted
  `landing/.next-local/app/` copy with inherited `DATABASE_URL` removed and only the loopback test URL supplied.
  Both production builds pass, including TypeScript. No environment files were copied or loaded.
- **PASS:** real local production-preview screenshots at viewport widths **1440** and **375**:
  `screenshots/preorder-s4-final-{models,sheet,sheet-bottom,strip,wall}-{1440,375}.png`.
  Every image was opened and visually inspected. Document width equals viewport width; the sheet has no horizontal
  overflow and its bottom content remains reachable by vertical scrolling. No browser exceptions occurred.
  All four model/build choices and Escape dismissal were exercised. Measurements are in
  [the browser QA report](screenshots/preorder-s4-final-qa.json).
- **BLOCKED — live devnet paid preorder:** no configured treasury/funded buyer is available. A fresh finalized
  devnet query at **2026-11-12 11:57:31 UTC**, slot **521455255**, returned `null` for all four exact accounts
  in the funding table above. ATAs were independently re-derived from the treasury/buyer and devnet mint.
  [Account evidence](preorder-devnet-accounts.json) records their addresses, existence and funding needs.
  Fund/initialize those accounts before the live payment, paid replay, receipt and populated-wall checks.
- **BLOCKED — actual mail delivery:** the permitted environment has no Resend key, verified sender or unsubscribe
  secret. The setup-skipped and failure paths pass; an accepted welcome/paid receipt still needs the configuration
  and controlled inbox described above. No successful email delivery is claimed.

To repeat the screenshots, start the isolated preview with the local database, `PREORDER_CLUSTER=devnet`,
the documented **test treasury** and a local test refund address, then run from the repository root:

```sh
node tools/pad-preorder-qa.mjs http://127.0.0.1:4319
```

The QA tool refuses non-loopback previews and non-devnet checkout configuration. It does not submit checkout forms,
sign payments, send emails or create backers. No new orders or waitlist rows were created by this capture pass.
The historical transfer remains a validation fixture only. No `.env.local` was read, no production database was
accessed, and no mainnet RPC, push, deployment or Vercel action occurred. Local preview and Postgres were stopped
after the rerun. The unchecked go-live items above remain Nick's release gates.
