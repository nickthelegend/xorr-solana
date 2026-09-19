/**
 * `Buffer`, as a global, before anything Solana loads (2026-09-19).
 *
 * `@solana/web3.js` and `@solana/spl-token` use Node's `Buffer` at import time. Neither a browser nor React Native has
 * one, so the web build died on its first screen with "Buffer is not defined" the moment `src/wallet/solanaWallet.ts`
 * was imported. The `buffer` package is the same implementation Node exposes; installed once, here, it is there for
 * every module that follows. A module of its own because `import` statements are hoisted: an assignment written inside
 * `index.js` would run after `expo-router/entry` had already loaded the app.
 */
import { Buffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = Buffer;
