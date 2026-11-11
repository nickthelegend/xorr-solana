import type { WalletRequest } from '../pad/signals';
export async function signPadRequest(_request: WalletRequest, _network?: string): Promise<string> {
  throw new Error('Setup required: an Android development build and a Mobile Wallet Adapter wallet');
}
