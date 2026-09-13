# Security review — PLAN.md 13.11

Scope: the delegation primitive, key storage, the executor's blast radius, and the client/server
trust boundary. Written against the code as it stands, not against intentions.

## 1. The delegation primitive — the thing standing between a bug and someone's capital

**What it is.** SPL Token `approve(ownerTokenAccount, delegate, amount)`. Implemented in
`server/src/solana/delegation.ts`; proven in `delegation.chain.test.ts` against a real Solana
runtime.

**What the delegate CAN do**
- Transfer up to the approved amount, from one specific token account.

**What the delegate CANNOT do — enforced by the token program, not by our code**
- Exceed the approved amount. Proven: an over-cap transfer throws, and the allowance is unchanged.
- Touch any other token account, mint, or the SOL balance.
- Close the account or reassign its owner.
- Survive a revoke. Proven: after `revoke`, a 1-cent transfer fails.

**Residual risk**
- The approved amount is a TOTAL allowance, not a per-day one. The executor enforces the daily
  boundary (`daily_spend` + `rules/engine.ts`), and that half IS executor-side. An executor
  compromise could spend the remaining on-chain allowance within a single approval window.
  *Mitigation in place:* the approval is sized to the daily cap and re-approved per period, so the
  on-chain exposure equals one day's cap rather than the account balance.
  *Not yet done:* moving the day boundary itself on-chain would need a custom program (Anchor).
  Tracked as a known limitation, not a silent one.

## 2. Key storage

| Key | Where it lives | Blast radius if stolen |
|---|---|---|
| Owner (user) | The user's device. `expo-secure-store` in the app; `server/.keys` on a dev machine ONLY, gitignored. | Total loss of that wallet. Hence `app/recovery.tsx` states plainly that xorr cannot recover it. |
| Delegate (bot) | The executor host. | Bounded by §1: at most the remaining approved allowance. Cannot withdraw. |
| Payer | The executor host. | Transaction fees only. |

`server/.keys` is written `0o600` and is in `.gitignore`. **Before any deployment carrying real
value, the delegate key must move to a KMS or an HSM** — a file on a host is adequate for a
localnet/devnet build and is not adequate beyond that. Recorded as a gap, not as done.

## 3. Client/server trust boundary

**No limit is enforced client-side.** Verified two ways:
- `src/data/repositories.test.ts` fails the build if any screen or component calls `fetch`.
- `server/src/rules/engine.ts` re-evaluates every limit on the server, and
  `executor.chain.test.ts` proves an over-cap run is blocked even when the client asks for it.

The client's stepper sets a *requested* cap; the server decides. A tampered client can ask for
anything and gets the same answer.

## 4. Replay and double-spend

`strategy_runs.period_key` is `UNIQUE`. Claiming a run is an INSERT, so there is no window between
"check" and "act". Proven adversarially: five sequential retries and four concurrent calls against
the same strategy produce exactly one fill.

Proposal decisions use the same shape — the `UPDATE` matches only an undecided, unexpired row, so
a double-approve cannot double-fill.

## 5. The audit trail

Append-only via a database trigger (an `UPDATE` or `DELETE` raises). Hash-chained with canonical
JSON, so a tampered row breaks verification for everything after it. The export carries its own
verification result, so a recipient does not have to trust the exporter.

*Known limitation:* the chain proves internal consistency, not third-party attestation. A party
with database superuser rights could drop the trigger and rebuild the chain. Anchoring a periodic
digest on-chain would close that and is not yet done.

## 6. Biometrics

`expo-local-authentication` gates the kill switch and the delegation grant. If no hardware or no
enrolment is present the app proceeds — a device without biometrics must still be able to STOP its
bot, and blocking the kill switch behind unavailable hardware would be a worse failure than the one
it prevents. Payout paths should not make the same trade; they are gated by the allowlist instead.

## 7. Withdrawal allowlist

Withdrawals may only target an allowlisted address, and a newly added address is unusable for 24
hours. This is what stops a stolen unlocked phone from adding an address and draining the wallet in
one session.

**The list and its clock are the executor's** (PLAN.md 4.9: `server/src/withdrawals/allowlist.ts`,
migration `022-withdrawal-addresses.sql`, routes in `server/src/routes/withdrawals.ts`). It used to be
AsyncStorage on the phone, with the phone's clock deciding when 24 hours had passed — so the device
the rule guards against decided when the rule ended, and moving its date forward a day removed it.
Now:

- Adding an address writes `usable_at = now() + 24 hours` on the database's clock, and every check
  compares `usable_at <= now()` on the same clock. Nothing a client sends moves either end, and the
  24 hours are a constant, not a setting. The app is handed `usable` and `usableAt` and never compares
  a time with its own clock.
- Removal takes effect in the statement that finds the row. The row is kept, with `removed_at`, so the
  book still says which address was usable when; adding the address back is a new row with a new 24
  hours. Adding an address that is already listed is refused, and neither restarts nor ends its wait.
- Every addition and removal is appended to the hash-chained audit trail in the same transaction, and
  pushed to the owner's devices under a kind with no mute switch: a cooling-off only helps someone who
  hears about the new address while it runs.
- Rows are scoped to the chain (`xorr.chain_key`), so an address allowlisted against a fork is not
  allowlisted on Base, although the two share a chain id.

**Where it is enforced**

- The app asks `POST /withdrawal-addresses/check` immediately before it requests a signature for a send
  (`src/wallet/useWithdraw.ts`), so an address still cooling off — or removed from another device while
  a screen was open — is refused before anything is signed. The screens offer only usable addresses
  and say when a pending one becomes usable, and the check does not rely on them.
- The executor applies the same check to anything it prepares. `POST /withdrawals/prepare-all`, the
  whole-balance transfer that "withdraw everything" ends with, refuses before it reads anything else. A
  refusal at either point is written to the trail as a `block`.
- `POST /withdrawals/record` reads back each transaction the owner reports and writes every outgoing
  transfer to the trail, with whether its destination was usable. One that was not is written as a
  `risk`: the app will not ask for that signature, so it was signed somewhere else.
- The app builds the transfer it signs from the address the person chose, and it checks what the
  executor prepares (`src/wallet/withdrawEverything.ts`): a transfer is signed only if it moves exactly
  the prepared amount to exactly the chosen address, and an Aave exit only if it is addressed to the
  Aave pool, for the whole position, paying the owner. The executor cannot redirect a withdrawal by
  rewriting calldata.
- "Withdraw everything" runs in one order — sells through the permission's close path, then the
  owner-signed Aave exit, then the owner-signed transfer — and stops at the first step that fails.

**What this does not stop — recorded as gaps**

- The owner's key can still sign a transfer anywhere. The check is the app asking the executor, not the
  chain or the wallet refusing, so a tampered build, or another client holding the same key, goes
  around it. Binding the key itself needs a destination policy on the user's own Privy wallet
  (PLAN.md 4.13), which does not exist yet.
- The list now lives with the executor, so a compromised executor could insert an address and mark it
  usable. The owner would still have to choose it and sign the transfer — the app shows the address and
  Privy's sheet shows the recipient — and the insertion would have to bypass the trail to go
  unrecorded. Having the owner's wallet sign each entry, so the app can check the list without trusting
  the server that stores it, would close this. It is not done.

## 8. Network

- The app talks to exactly one first-party origin (`EXPO_PUBLIC_API_URL`) plus two public price
  APIs. No user data is sent to either price API.
- The server refuses to start against `mainnet-beta` without an explicit `ALLOW_MAINNET=yes`.
- Certificate pinning is not implemented. Required before a production release.

## 9. What this review did NOT cover

- A third-party audit of the delegation flow. PLAN.md 13.11 calls for one and it has not happened.
- Jailbreak/root detection.
- Rate limiting and authentication on the executor API: the dev server is single-user and has no
  auth. **This is the largest open item** and is tracked as PLAN.md 11.3 / [G21].

---

# Addendum — key handling on Base

## The well-known-key incident

During setup the deployer address quoted in a status report was `0xf39Fd6…92266` — **anvil's
default account #0**, whose private key (`0xac09…ff80`) appears in every Foundry tutorial. Testnet
funds were sent there before that was caught.

The funds were swept to a freshly generated key
(`0x364d7Bbc139541e0e37450D527ae154B5C292581`) in tx `0xb98293…4ab1`, and nothing was lost. But the
lesson is worth writing down rather than quietly fixing:

- **Never quote an anvil/hardhat default address as a funding target.** Sweeper bots watch those
  addresses on every public chain and drain them within seconds.
- Keys used on a public network are generated locally into `.keys/` (mode 600, gitignored) and have
  never been published.

## Delegate key

`0xe992FE56589d1111d0b7Bb7c4Ca3946d4d53E403` signs scheduled trades. Its blast radius is bounded by
`XorrDelegation`: capped per day, venue-allowlisted, time-boxed, and revocable by the user without
this server's cooperation. **Before any deployment carrying real value it must move to a KMS or an
HSM** — a file on a host is adequate for a testnet demo and is not adequate beyond that.

## Env var naming

`CHAIN` was renamed to `XORR_CHAIN` because Foundry auto-loads `.env` from the working directory and
interprets `CHAIN` as its own `--chain` flag, which broke every `cast`/`forge` command in the repo.

## The delegate key

`server/src/evm/client.ts` loads the bot's signing key from `DELEGATE_PRIVATE_KEY`, or generates
one into `server/.keys/delegate.key` (mode 600, gitignored) when that is unset.

**A file on a host is adequate for a local fork and is not adequate beyond one.** Anyone who reads
that file can sign as the delegate. What they *cannot* do is the point of the whole design:

- they cannot exceed the daily cap, which the contract enforces
- they cannot trade anywhere the user has not allowlisted
- they cannot send funds to an address of their choosing — there is no code path for it
- they cannot stop the user revoking, which needs one signature and no cooperation from us

So the blast radius of a stolen delegate key is "the bot trades badly inside limits the user set,
until the user revokes". That is a real incident and a bounded one. It is bounded by the contract,
not by our operational hygiene, which is why the contract is where the enforcement lives.

### Before any mainnet deployment

1. Move the key to a KMS or HSM — AWS KMS, GCP KMS, or a Turnkey/Fireblocks signer. The executor
   only needs `signTransaction`, so the key never has to be in process memory.
2. Give it its own IAM principal with signing permission and nothing else.
3. Alert on any `Spent` or `Closed` event whose transaction the executor did not initiate. The
   subgraph already indexes both, so this is a query rather than new infrastructure.
4. Rotate by granting a new delegate and revoking the old one. `grant()` overwrites the delegate
   for that owner, so rotation is one user signature and does not require our cooperation either.

### What is deliberately NOT protected

The owner key. Privy holds it on the user's device and xorr never sees it. That is why the
executor cannot grant itself permission, cannot move funds out, and cannot prevent a revoke — and
it is why a compromise of everything in this repository still cannot take a user's money.
