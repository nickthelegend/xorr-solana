# Task: the XOR app pairs with xorrpad v1

The xorrpad spec and its pad protocol live in the other repo:
- `/Volumes/Extreme SSD/Projects/xorrpad/docs/v1/SPEC.md`
- `/Volumes/Extreme SSD/Projects/xorrpad/docs/v1/PAD-PROTOCOL.md`, once T4 has written it.

Read both. The protocol is the contract between the app and the pad.

## Hard rules
- **Don't restyle the approved UI.** This app won the Stocklana hackathon; its look is approved. Add a Pad screen and functional pieces only, using the app's existing components, tokens and fonts. Take before/after screenshots of any screen you touch.
- **Stage only your own files**, by path (`git add <paths>`), never `git add -A`. Leave the untracked mp4s, `.claude/` and the `*.local-*` files alone.
- **No push.** Commit per logical diff, each message describing only its own diff, ending `Co-Authored-By: Codex <noreply@openai.com>`.
- **Secrets:** never open or print them. No mainnet transactions.
- **No mocks of external services, no fake data.** Missing setup shows `Setup required: <what>`.
- **Don't remove any existing feature or test.** Kill your processes by PID.

## Build
1. **Pad tab.** Add a Pad tab: a screen that pairs with the pad over BLE (`react-native-ble-plx` with an Expo config plugin; this needs a dev client, so document `npx expo prebuild` / `eas build --profile development`).
   - It scans for the pad's GATT service, connects, and exchanges the v1 JSON protocol with MTU-aware chunking.
   - It shows link state, firmware version and battery-free power status ("USB powered").
2. **Desk link.** The user enters the desk URL (the Tailscale MagicDNS name or the public URL) and the pad token, kept in SecureStore.
   - The app subscribes to the desk's `/events` WebSocket.
   - Pending trade signals appear in the existing approvals screen, or in a new list styled like it. Each shows venue, market, side, size, quote, fees and the gate's reason.
   - **Accept** posts `/signals/:id/accept`. **Refuse** posts `/signals/:id/refuse`.
   - If the signal needs a phone-wallet signature, accepting opens the Solana Pay transaction request through the app's existing wallet path (Mobile Wallet Adapter).
3. **Notifications.** A new signal fires a local notification through the existing `expo-notifications`, with Accept and Refuse actions where the platform supports them.
   - Auto-accepted trades post an "auto-accepted" notification with the receipt link.
4. **Relay.** The phone relays pad ↔ desk when the pad is on BLE and the desk is remote: phone BLE → desk WS.
5. **Tests.**
   - Unit tests (vitest, already set up) for protocol framing and chunking, the signal reducer, and the deep link.
   - A live test against a running xorrpad desk (`npm run backend` in xorrpad on port 8720) when it is reachable; otherwise skip with a printed reason.
6. **Documentation.** Add a Pad section to `docs/pad/README.md` and a line to `FEATURES.md`.
