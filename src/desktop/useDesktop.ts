/**
 * Whether this render is the desktop web app (2026-10-01).
 *
 * The web build used to be the phone app in a 402pt column. On a laptop that read as a mobile build nobody had looked
 * at on a big screen. From `DESKTOP_MIN_WIDTH` up, the web draws its own layout — a top nav and wide, multi-column
 * pages — and below it, including a phone's browser and a narrowed window, it falls back to the phone
 * layout exactly as before. Native never takes the desktop path.
 *
 * Read per render from the window, so resizing a browser moves between the two live.
 */
import { createContext, useContext } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/** A laptop's narrowest useful window; below it the top nav and two columns stop fitting. */
export const DESKTOP_MIN_WIDTH = 1080;

/** Height of the top bar. */
export const TOPBAR_HEIGHT = 68;

/** The widest a page's content grows to before it centres, so rows never stretch across a 4K screen. */
export const CONTENT_MAX_WIDTH = 1320;

/** The width a phone screen is given when it renders inside the desktop shell (a sheet-like panel). */
export const PANEL_WIDTH = 520;

export function isDesktopWidth(width: number): boolean {
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}

/**
 * Inside the shell's phone-width panel (2026-10-01).
 *
 * A route picks its desktop or phone layout from `useDesktop()`. The window alone cannot answer that: a signed-out
 * visitor browsing the market from the sign-in split screen sees each page in the 520pt panel, and the wide desk
 * squeezed into it drew the name one letter per line and the chart as a sliver. The panel is a phone screen, so
 * everything drawn in it takes the phone layout.
 */
const InPanel = createContext(false);
export const PanelScope = InPanel.Provider;

/** Whether this render draws the desktop layout: a wide web window, and not inside the phone-width panel. */
export function useDesktop(): boolean {
  const { width } = useWindowDimensions();
  const inPanel = useContext(InPanel);
  return isDesktopWidth(width) && !inPanel;
}

/** Whether the window is desktop-wide, panel or not — for chrome the desktop shell replaces, like the phone's tab bar. */
export function useDesktopWindow(): boolean {
  const { width } = useWindowDimensions();
  return isDesktopWidth(width);
}
