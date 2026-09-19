/**
 * The ethers shims, on native only (2026-09-20).
 *
 * They install what React Native lacks on the signing path, and announce themselves with a `console.log('Shims
 * Injected:')` at import time — which on web is a stray log in a production console, from a dependency, over globals
 * the browser already provides. `document` exists on web and nowhere else, so this is the same import on native and
 * silence in the browser. Its own module so the entry stays a list of imports in the order it documents.
 */
if (typeof document === 'undefined') {
  require('@ethersproject/shims');
}
