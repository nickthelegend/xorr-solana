# Pad

The **Pad** tab pairs the XOR phone app with xorrpad firmware **1.0.0** and its
desk. It extends the existing app components, typefaces, colors and floating tab
bar. The existing Approvals screen remains available; desk trade approvals live
in the Pad list because Solana builds hide the existing EVM Approvals route.

## Build and setup

BLE requires a **physical phone and a development client**; Expo Go and the web
cannot pair. Install the dependencies, then generate native projects or build a
development client:

```sh
npm ci
npx expo prebuild
eas build --profile development
npx expo start --dev-client
```

The development profile selects `solana-devnet`. Configure the app's existing
Privy app/client IDs and other normal app settings through your existing secure
development/EAS setup. A full app launch still requires `EXPO_PUBLIC_PRIVY_APP_ID`;
the Pad feature does not supply credentials or an offline authentication path.
Rebuild the native client after installing BLE/MWA dependencies or changing native
plugin settings. No build was submitted to EAS during this task.

1. Start the real desk with `npm run backend` from `xorrpad/desk` (port **8720**).
   Enter provider keys and configure the phone wallet on the desk as described by
   the xorrpad documentation. Obtain the pad token from the desk's trusted setup.
2. Enter its **HTTPS URL** (a Tailscale MagicDNS hostname or public HTTPS URL) and
   pad token in the phone's Pad tab, then tap **Save and connect desk**. Both are
   persisted in SecureStore with device-only, unlocked access. The token is never
   placed in a URL, logs or ordinary app storage. **Forget desk** removes it.
3. Allow local notifications when prompted. Enable Bluetooth, power your pad over
   USB, keep only your trusted pad nearby, and tap **Pair pad**. The scan connects
   to the first nearby device advertising the specified service. BLE v1 has no
   application-level wallet or signing capability; pair only with trusted devices.
4. Read link state, firmware, **USB powered** status, and relay state. Trade signals
   show the desk's actual venue, market, side, USD size, quote price, fee details
   and gate reasons. No market data is invented when the desk is unavailable.

HTTP is accepted only for loopback development URLs. A phone's `127.0.0.1` is the
phone itself; use HTTPS MagicDNS/public routing for a remote desk. The phone must
have access to the tailnet when using MagicDNS. The ESP32 itself does not join
Tailscale in v1. Missing setup appears as `Setup required: <what>`.

## Approvals and signing

The authenticated `/events` WebSocket supplies the real queue snapshot and state
updates. Connections retry with backoff. **Accept** posts `/signals/:id/accept`;
**Refuse** posts `/signals/:id/refuse`. Actions are locked while in flight and
disabled after expiry or when the desk link is unavailable. The desk rechecks the
gate; an accepted state is never displayed as a confirmed receipt.

When acceptance returns a phone-wallet handoff, the app opens the desk's Solana Pay
transaction request through **Android Mobile Wallet Adapter**. It verifies the
authorized owner, requests the transaction through its HTTPS capability URL,
checks its blockhash on the actual Solana devnet RPC, asks the wallet to sign, and
posts the signed bytes to `/signals/:id/sign`. The desk validates, submits and
confirms them. A pending handoff also exposes **Sign in phone wallet** for a
cancelled attempt. Existing Privy signing for other app features is unchanged.

Pad phone signing currently requires **devnet** and an Android MWA wallet. iOS or
web signing, a mainnet signal, or a missing public transaction-request URL reports
the required setup. Mainnet phone signing is deliberately disabled in this pass;
no mainnet transaction was sent. Session-wallet execution and its permissions
remain controlled by the desk, never by BLE or the phone's notification settings.

New awaiting signals post local notifications with **Accept** and **Refuse**
actions where supported. Both bring the app to the foreground; cold-launch actions
fetch a fresh authenticated queue before acting on the named signal. A notification
tap opens `/pad?signal=<id>`. Auto-accepted trades notify only after a real confirmed
receipt, and include its explorer link. Repeated events are deduplicated in the
running session. These are local notifications: a suspended/terminated app cannot
receive desk WebSocket events, and no background-delivery guarantee or remote push
service is claimed.

## Protocol and relay

The contract is xorrpad's `docs/v1/PAD-PROTOCOL.md`:

- Nordic UART GATT service `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`, RX/write
  `6E400002-B5A3-F393-E0A9-E50E24DCCA9E`, TX/notify
  `6E400003-B5A3-F393-E0A9-E50E24DCCA9E`.
- Subscribe before writing ping; read the pad's hello. Parse UTF-8 NDJSON only at
  LF, tolerate CRLF and ignore diagnostic lines. Limit each record to 4096 bytes
  including LF. Refuse unsupported versions/types and malformed records.
- Write acknowledged chunks of negotiated ATT MTU minus three bytes, or 20 bytes
  when unknown. Split bytes rather than JavaScript characters. Bound the write
  queue and reset partial records at disconnect; stop the link after a write error.
- The phone bridges validated, otherwise unchanged records in both directions
  through `WS /padlink?device=<stable-id>`. Both sockets authenticate using
  `xorrpad` and `pad-token.<token>` subprotocols. Tokens never enter query strings.
- Only a hello may wait for connection establishment. Trade input is dropped
  while disconnected, not retained or replayed. A fresh hello restores state;
  buffers and stalled links expire. The pad/desk enforce link priority, input
  deduplication, audio-stream sequencing, gates and actual trade receipts.

The BLE and relay sessions live at the app root, so switching tabs does not tear
them down. This is a foreground relay; background BLE/service operation is not
enabled by the Expo plugin.

Implementation references: [BLE library and Expo plugin](https://github.com/dotintent/react-native-ble-plx)
and [Mobile Wallet Adapter](https://github.com/solana-mobile/mobile-wallet-adapter).

## Verification — 2026-11-12

`npm run test:pad` uses `vitest.pad.config.mts`, which does not open `.env` or run
the unrelated executor warmup. It always probes the real desk, without replacing
external services. Optional `XORRPAD_DESK_URL` and `XORRPAD_PAD_TOKEN` come from the
calling environment; supply the token securely without printing it. The live
checks read `/signals`, receive the `/events` snapshot, and exchange a read-only
v1 hello over `/padlink`. They never create proposals, accept trades or sign.

| Check | Observed result |
| --- | --- |
| Pad framing/chunking, reducer, deep-link and notification unit checks | **30 passed** |
| Real desk HTTP, events and relay probes | **3 skipped**: no reachable desk on loopback port 8720; printed setup reason |
| Existing repository unit suite, without reading `.env` | **2,844 passed; 4 skipped** across 285 files |
| `tsc --noEmit` and targeted ESLint | Passed |
| Expo Android JavaScript/Hermes export on devnet | Passed, output in `/tmp/xorr-pad-android` |
| Expo config introspection | BLE plugin applies iOS Bluetooth usage text, Android scan/connect and legacy location permissions |
| Physical BLE pairing, native binary build, notifications and MWA approval | **Not yet tested on hardware** |

The regression invocation disabled the environment loader without modifying the
existing test configuration or weakening its tests:

```sh
node '--import=data:text/javascript,process.loadEnvFile=()=>{}' node_modules/vitest/vitest.mjs run --exclude '**/*.live.test.ts'
```

`node tools/pad-screenshots.mjs` renders the **real** Pad and TabBar components,
with the bundled fonts and no service fixtures. It uses port 8722, cleans its
temporary entry, and stops its own Metro process by PID. Screenshots:

- [Before tab bar](screenshots/before-tab-bar.png) and [after tab bar](screenshots/after-tab-bar.png).
- [Pad screen](screenshots/after-pad.png) and [Bluetooth setup state](screenshots/after-pad-setup.png).
- [Initial full-app launch](screenshots/before-home.png): captured a dependency
  resolution failure before Metro was rebuilt. The rebuilt full app still needs
  Privy configuration, so the component captures above verify the UI extension;
  they do not claim a signed-in full-app or hardware test.
