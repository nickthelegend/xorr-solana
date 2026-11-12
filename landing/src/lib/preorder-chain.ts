// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import 'server-only';
import { Connection, PublicKey, Transaction, type TransactionResponse } from '@solana/web3.js';
import { decodeInstruction, getAssociatedTokenAddressSync, isTransferCheckedInstruction, isTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { findReference, FindReferenceError, validateTransfer } from '@solana/pay';
import BigNumber from 'bignumber.js';
import { preorderConfig, PreorderError, type PreorderCluster } from './preorder-config';

export type PaymentFields = { cluster: PreorderCluster; recipient: string; mint: string; amount: string; reference: string };
export function preorderConnection(cluster: PreorderCluster) {
  return new Connection(cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com', {
    commitment: 'finalized', disableRetryOnRateLimit: true,
  });
}

export async function verifyPreorderTransfer(fields: PaymentFields, signature: string) {
  const connection = preorderConnection(fields.cluster);
  const tx = await validateTransfer(connection, signature, {
    recipient: new PublicKey(fields.recipient), splToken: new PublicKey(fields.mint),
    amount: new BigNumber(fields.amount), reference: new PublicKey(fields.reference),
  }, { commitment: 'finalized' });
  return { signature, wallet: assertExactTransfer(tx, fields) };
}

/** Kept separate so exactness can also be checked against an unmodified historical chain response. */
export function assertExactTransfer(tx: TransactionResponse, fields: Pick<PaymentFields, 'recipient' | 'mint' | 'amount'>) {
  // The library accepts overpayments and doesn't assert the instruction's destination/amount.
  // Require both an exact treasury credit and an exact final transfer to the canonical USDC ATA.
  const keys = tx.transaction.message.accountKeys;
  const ata = getAssociatedTokenAddressSync(new PublicKey(fields.mint), new PublicKey(fields.recipient));
  const index = keys.findIndex(key => key.equals(ata));
  const before = tx.meta?.preTokenBalances?.find(balance => balance.accountIndex === index);
  const after = tx.meta?.postTokenBalances?.find(balance => balance.accountIndex === index);
  const units = new BigNumber(fields.amount).times(1_000_000);
  if (!after || after.mint !== fields.mint || after.uiTokenAmount.decimals !== 6
      || (before && before.mint !== fields.mint)
      || !new BigNumber(after.uiTokenAmount.amount).minus(before?.uiTokenAmount.amount || '0').eq(units)) {
    throw new PreorderError('The treasury must receive exactly the requested USDC deposit.', 422);
  }
  const instruction = Transaction.populate(tx.transaction.message, tx.transaction.signatures).instructions.at(-1)!;
  const decoded = decodeInstruction(instruction);
  if ((!isTransferInstruction(decoded) && !isTransferCheckedInstruction(decoded))
      || !instruction.programId.equals(TOKEN_PROGRAM_ID) || !decoded.keys.destination.pubkey.equals(ata)
      || decoded.data.amount.toString() !== units.toFixed(0)) {
    throw new PreorderError('The payment instruction does not match this deposit.', 422);
  }
  const sourceIndex = keys.findIndex(key => key.equals(decoded.keys.source.pubkey));
  const source = tx.meta?.preTokenBalances?.find(balance => balance.accountIndex === sourceIndex);
  if (!source?.owner || source.mint !== fields.mint) throw new PreorderError('Payment source wallet could not be verified.', 422);
  return source.owner;
}

export async function findPreorderTransfer(fields: PaymentFields) {
  const config = preorderConfig(); // A later configuration change must not silently re-route an existing order.
  if (fields.cluster !== config.cluster || fields.recipient !== config.recipient || fields.mint !== config.mint) {
    throw new PreorderError('Setup required: this order belongs to a different payment configuration', 503);
  }
  let found;
  try {
    found = await findReference(preorderConnection(fields.cluster), new PublicKey(fields.reference), {
      finality: 'finalized', limit: 100,
    });
  } catch (error) {
    if (error instanceof FindReferenceError) return null;
    throw error;
  }
  try { return await verifyPreorderTransfer(fields, found.signature); }
  catch (error) {
    if (error instanceof Error && error.name === 'ValidateTransferError') {
      throw new PreorderError('The referenced transfer does not match this deposit. Contact us before paying again.', 422);
    }
    throw error;
  }
}
