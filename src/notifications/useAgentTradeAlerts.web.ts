/**
 * No banner on the web (2026-09-26).
 *
 * The native hook posts a local notification when an agent trades; the web build never imports `expo-notifications`
 * (see `index.web.ts`), and Home's status line already says the same thing in the page. Same no-op shape as
 * `useNotificationRoute.web.ts`.
 */
export function useAgentTradeAlerts(): void {
  // Deliberately empty.
}
