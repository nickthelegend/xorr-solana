import * as SecureStore from 'expo-secure-store';
import { validateSettings, type PadSettings } from './settingsModel';
export { normalizeDeskUrl, validateSettings, type PadSettings } from './settingsModel';
const KEY = 'xorr.pad.v1';
export async function readSettings(): Promise<PadSettings | null> {
  const value = await SecureStore.getItemAsync(KEY);
  return value ? validateSettings(JSON.parse(value)) : null;
}
export async function saveSettings(settings: PadSettings): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(validateSettings(settings)), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
export async function clearSettings(): Promise<void> { await SecureStore.deleteItemAsync(KEY); }
