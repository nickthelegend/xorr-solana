/**
 * sharedTags.ts — the names two screens agree on, so one element can travel between them.
 *
 * A shared transition only runs when the element leaving and the element arriving carry the SAME tag, character for
 * character. Written out by hand at each end, a typo on one side would not fail anything: the transition would simply
 * never run, and the tap would look exactly as it did before, with nothing to say why. So both ends call this.
 *
 * A tag must also be unique on a screen, or reanimated has two candidates and picks one. That is why only screens
 * where a symbol appears exactly once pass it — the market list, and the asset screen's own header.
 */

/** The tag for an asset's mark: the row that was tapped, and the header of the screen it opened. */
export function assetMarkTag(symbol: string): string {
  return `asset-mark:${symbol.trim().toUpperCase()}`;
}
