/**
 * Which mints exist on the cluster this executor settles on (2026-09-19).
 *
 * A fork clones the mints it was bootstrapped with and no others, so an xStock can have a live Jupiter price and no mint
 * here at all. The autonomous agent chose SPYx — priced, and absent from the fork — and a buy would have moved the
 * owner's USDC before finding out. Asked once per minute, from the chain.
 */
import { PublicKey } from '@solana/web3.js';
import { connection } from './connection.js';

const TTL_MS = 60_000;
const seen = new Map<string, { exists: boolean; at: number }>();

export async function mintsOnCluster(addresses: readonly string[]): Promise<Set<string>> {
  const now = Date.now();
  const stale = addresses.filter((a) => {
    const hit = seen.get(a);
    return !hit || now - hit.at > TTL_MS;
  });
  if (stale.length > 0) {
    const infos = await connection.getMultipleAccountsInfo(stale.map((a) => new PublicKey(a)), 'confirmed');
    stale.forEach((a, i) => seen.set(a, { exists: infos[i] !== null, at: now }));
  }
  return new Set(addresses.filter((a) => seen.get(a)?.exists));
}
