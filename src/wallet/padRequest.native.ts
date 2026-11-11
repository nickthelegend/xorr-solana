import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import { Connection, PublicKey, VersionedTransaction, clusterApiUrl } from '@solana/web3.js';
import { transactionRequestUrl, type WalletRequest } from '../pad/signals';

/** Open the desk's Solana Pay request through MWA. The desk validates and submits the signed bytes. */
export async function signPadRequest(request: WalletRequest, network?: string): Promise<string> {
  if (network !== 'devnet') throw new Error('Setup required: a devnet signal; mainnet signing is disabled');
  if (Platform.OS !== 'android') throw new Error('Setup required: an Android Mobile Wallet Adapter wallet');
  if (request.setupRequired) throw new Error(request.setupRequired);
  const transaction = request.transaction;
  if (!transaction?.requestUrl || !transaction.signWith) throw new Error('Setup required: a Solana Pay request from the desk');
  const url = transactionRequestUrl(transaction.requestUrl), owner = new PublicKey(transaction.signWith);
  try {
    const { transact } = await import('@solana-mobile/mobile-wallet-adapter-protocol-web3js');
    return await transact(async wallet => {
      const authorization = await wallet.authorize({ chain: 'solana:devnet', identity: { name: 'xorr', uri: 'https://xorr.finance', icon: 'favicon.ico' } });
      if (!authorization.accounts.some(a => Buffer.from(a.address, 'base64').equals(owner.toBuffer()))) throw new Error('Setup required: select the phone wallet configured on the desk');
      const response = await fetch(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: owner.toBase58() }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Setup required: a fresh Solana Pay transaction request');
      const body = await response.json();
      if (typeof body.transaction !== 'string' || body.transaction.length > 4096) throw new Error('Invalid desk transaction');
      const tx = VersionedTransaction.deserialize(Buffer.from(body.transaction, 'base64'));
      if (!tx.message.staticAccountKeys[0]?.equals(owner)) throw new Error('Desk transaction owner differs');
      const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
      if (!(await connection.isBlockhashValid(tx.message.recentBlockhash)).value) throw new Error('Setup required: a fresh transaction on Solana devnet');
      const asked = Buffer.from(tx.message.serialize());
      const [signed] = await wallet.signTransactions({ transactions: [tx] });
      if (!signed || !Buffer.from(signed.message.serialize()).equals(asked)) throw new Error('Wallet returned another transaction');
      return Buffer.from(signed.serialize()).toString('base64');
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Setup required:')) throw error;
    throw new Error('Setup required: approve the devnet request in a compatible Mobile Wallet Adapter wallet');
  }
}
