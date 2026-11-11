import type { PadSettings } from './settingsModel';
export { normalizeDeskUrl, validateSettings, type PadSettings } from './settingsModel';
export async function readSettings(): Promise<PadSettings | null> { return null; }
export async function saveSettings(_settings: PadSettings): Promise<void> { throw new Error('Setup required: the phone app with SecureStore'); }
export async function clearSettings(): Promise<void> {}
