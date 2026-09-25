# xorr v1.0.0 — launch checklist

Written 2026-09-23. What exists, what each store needs, and what only the owner can do. Status is evidence, not intent.

## What is built

| | State |
|---|---|
| Web | https://xorr-solana.vercel.app — hosted, **Solana mainnet**, `main`; website https://xorr.finance |
| iOS | v1.0.0 (build 1), bundle `finance.xorr.app`. Release build runs on the iOS simulator against the hosted mainnet executor. |
| Android | v1.0.0 (versionCode 1), package `finance.xorr.app`. Release APK runs on the emulator against the same stack. |
| Build config | `eas.json`: `simulator`, `preview` (internal install), `production` (store) — all pointed at the hosted Solana stack |

## TestFlight (iOS) — the owner's steps

Nothing here can be done without the owner's own accounts; none of it is in the repo.

1. **Apple Developer Program** membership on the account that will own the app (paid, yearly).
2. **App Store Connect**: create the app — name *xorr*, bundle ID `finance.xorr.app`, SKU of your choice. Note its *Apple ID* number.
3. **Expo account**: `eas login` (or create one). Then `eas init` once — it writes the project id into `app.json`.
4. **Privy dashboard**: add the native app identifiers — iOS bundle `finance.xorr.app`, Android package `finance.xorr.app` — under the app's allowed clients, or native sign-in is refused.
5. Build and upload:
   ```bash
   eas build -p ios --profile production
   ```
   ```bash
   eas submit -p ios --latest
   ```
   EAS asks for the Apple ID once and manages the certificate and provisioning profile.
6. In App Store Connect → TestFlight: add internal testers (up to 100, no review), or an external group (a short beta review).

## Google Play (Android)

1. **Google Play Console** developer account (one-time fee) and the app `finance.xorr.app`.
2. `eas build -p android --profile production` → an `.aab`; `eas submit -p android --latest` puts it on the *internal* track (set in `eas.json`).
3. Or, for testers today without Play: `eas build -p android --profile preview` gives an installable `.apk`.

## Before a store review (production, not the hackathon)

- **Mainnet hardening.** The hosted build is on Solana mainnet (since 2026-09-25) with a Helius RPC. A public launch still needs the bot's keys (payer, delegate, vault) in a KMS/HSM rather than environment variables, balance alerts on the payer and vault, and the buy path's vault hop replaced by a route the delegate signs directly.
- **Legal.** Terms, privacy and risk disclosure are drafts. xStocks are not for US persons: a production launch needs geo-restriction and KYC as the issuer requires. Apple and Google both ask about financial features in review.
- **Store listing.** Screenshots (6.7" and 6.1" iPhone, phone for Play), a description, a support URL, a privacy-policy URL, and App Privacy / Data safety forms.
- **Push.** Notifications are in-app only; store push needs an EAS project and APNs/FCM keys.
- **Keys the repo does not have.** `OPENROUTER_API_KEY` (agent reasoning in a model's words; today it is deterministic and says so) and MoonPay keys (card deposits; today hidden with the reason).
- **Security review.** A third-party audit of the spend path (`server/src/executor/place.ts`), the delegate key handling, and the agent wallets.

## For STOCKLANA (deadline 2026-09-25 16:00 ET)

- [ ] Fund the payer and vault with SOL and the demo account with USDC + a little SOL before recording (`docs/DEMO-SCRIPT-SOLANA.md`).
- [ ] Record the demo (`docs/DEMO-SCRIPT-SOLANA.md`) with a fresh account — include funding an agent's wallet, its rules, and "look now".
- [ ] Submit (`docs/SUBMISSION-STOCKLANA.md`): repo (public), live URL, video, team.
- [ ] Optional side tracks the build already fits: **Tessera** (T-OpenAI/T-Kalshi trade through Meteora), **Pyth** (the off-hours guard reads Equity.US feeds on chain).
- [ ] TestFlight link in the submission if the owner completes the iOS steps above.
