// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
"use client";

import { ConnectionProvider, WalletProvider, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { createTransfer } from '@solana/pay';
import BigNumber from 'bignumber.js';
import QRCode from 'qrcode';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { PAD_BUILDS, PAD_MODELS, PAD_PRICE_NOTE, getPadPrice, type PadSku, type PadBuild, type PadEdition } from '@/lib/pad-pricing';
import type { PreorderConfig } from '@/lib/preorder-config';
import { preorderButton } from './PreorderCheckout';

type Order = {
  id: string; sku: PadSku; build: PadBuild; amount: string; cluster: 'devnet' | 'mainnet'; reference: string;
  recipient: string; mint: string; url: string; status: string; signature: string | null; email?: string;
};
type Props = { sku: PadSku; build: PadBuild; config: PreorderConfig; onClose: () => void };
const inputStyle = 'mt-2 min-h-12 w-full rounded-2xl border border-white/15 bg-white/[0.05] px-4 text-[15px] text-ink placeholder:text-ink/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime';
const storageKey = 'xorrpad:pending-checkout';
async function api(body: object): Promise<Order> {
  const response = await fetch('/api/pad/preorder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Checkout is unavailable. Please try again.');
  return result;
}
function remember(id: string) { try { sessionStorage.setItem(storageKey, id); } catch { /* Checkout also works without storage. */ } }

export default function PreorderSheet(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    node.showModal();
    return () => { node.close(); previous?.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} aria-labelledby="preorder-title" onCancel={props.onClose}
    onClick={event => { if (event.target === event.currentTarget) props.onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_24px)] max-w-[540px] overflow-y-auto rounded-[28px] border border-white/15 bg-[#08080a] p-0 text-ink backdrop:bg-black/80"
    data-lenis-prevent>
    <div className="p-5 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <h2 id="preorder-title" className="font-display text-[28px] font-medium leading-tight tracking-[-0.025em]">Reserve your pad</h2>
        <button type="button" onClick={props.onClose} aria-label="Close pre-order" className="grid size-11 shrink-0 place-items-center rounded-full border border-white/15 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-lime"><Icon name="close" className="size-4" /></button>
      </div>
      <p className="mt-3 text-[14px] text-lime">{props.config.cluster === 'devnet' ? 'Solana devnet · mUSDC test tokens · no real funds' : 'Solana mainnet · real USDC'}</p>
      <ConnectionProvider endpoint={props.config.rpc}><WalletProvider wallets={[]} autoConnect={false}><Checkout {...props} /></WalletProvider></ConnectionProvider>
    </div>
  </dialog>, document.body);
}

function Checkout({ sku, build, config }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [edition, setEdition] = useState<PadEdition>('standard');
  const [email, setEmail] = useState('');
  const [publicName, setPublicName] = useState('');
  const [showPublicly, setShowPublicly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resumeId] = useState(() => { try { return sessionStorage.getItem(storageKey); } catch { return null; } });
  const [resuming, setResuming] = useState(Boolean(resumeId));
  const [resumeFailed, setResumeFailed] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [qr, setQr] = useState('');
  const requestKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const { connection } = useConnection();
  const { wallets, wallet, select, connect, disconnect, publicKey, connected, connecting, sendTransaction } = useWallet();
  const orderId = order?.id;
  const orderStatus = order?.status;

  useEffect(() => {
    let active = true;
    if (!resumeId) return;
    fetch(`/api/pad/preorder?id=${encodeURIComponent(resumeId)}`, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Could not restore checkout. Try reopening the sheet.');
      const saved: Order = await response.json();
      if (active) setOrder(saved); // Recover any outstanding payment before offering another deposit.
    }).catch(err => { if (active) { setError(err.message); setResumeFailed(true); } }).finally(() => { if (active) setResuming(false); });
    return () => { active = false; };
  }, [resumeId]);

  useEffect(() => {
    let active = true;
    if (order?.url) QRCode.toDataURL(order.url, { width: 256, margin: 3, errorCorrectionLevel: 'M' })
      .then(value => { if (active) setQr(value); }).catch(() => { if (active) setError('QR unavailable. Use the wallet payment link below.'); });
    return () => { active = false; };
  }, [order?.url]);

  useEffect(() => {
    if (!orderId || orderStatus !== 'pending') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const result = await api({ action: 'confirm', id: orderId });
        if (stopped) return;
        setOrder(result); setError('');
        if (result.status !== 'pending') return;
      } catch (err) { if (!stopped) setError(err instanceof Error ? err.message : 'Could not check the deposit. Retrying.'); }
      if (!stopped) timer = setTimeout(check, 8000);
    };
    timer = setTimeout(check, 2000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [orderId, orderStatus]);

  async function create(event: FormEvent) {
    event.preventDefault(); if (busy || resumeFailed) return;
    setBusy(true); setError('');
    const fields = { sku, build, edition, email, publicName, showPublicly };
    const fingerprint = JSON.stringify(fields);
    if (requestKey.current?.fingerprint !== fingerprint) requestKey.current = { fingerprint, key: crypto.randomUUID() };
    try { const result = await api({ action: 'create', ...fields, idempotencyKey: requestKey.current.key }); remember(result.id); setOrder(result); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not start checkout. Please try again.'); }
    finally { setBusy(false); }
  }

  async function pay() {
    if (!order || !publicKey || busy || submitted) return;
    setBusy(true); setError('');
    try {
      const tx = await createTransfer(connection, publicKey, { recipient: new PublicKey(order.recipient),
        splToken: new PublicKey(order.mint), reference: new PublicKey(order.reference), amount: new BigNumber(order.amount) });
      await sendTransaction(tx, connection, { preflightCommitment: 'confirmed', skipPreflight: false });
      setSubmitted(true); // Only the server's finalized on-chain verification can change the payment status.
    } catch (err) { setError(err instanceof Error ? err.message : 'Wallet payment failed. Check your wallet before trying again.'); }
    finally { setBusy(false); }
  }

  if (resuming) return <p role="status" className="mt-6 text-[14px] text-ink/70">Checking for an existing checkout…</p>;
  return <>
    {!order ? <form onSubmit={create} className="mt-6 space-y-5">
      <p className="text-[15px] text-ink/80">{PAD_MODELS[sku].name} · {PAD_BUILDS[build].name}</p>
      <label className="block text-[14px]">Edition<select value={edition} onChange={event => setEdition(event.target.value as PadEdition)} className={inputStyle}>
        <option value="standard">Standard · ${getPadPrice(sku, build)}</option><option value="founder">Founder · ${getPadPrice(sku, build, 'founder')}</option>
      </select></label>
      <label className="block text-[14px]">Email for shipping updates<input required type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} className={inputStyle} placeholder="you@email.com" /></label>
      <label className="block text-[14px]">Public name <span className="text-ink/70">(optional)</span><input autoComplete="nickname" maxLength={80} value={publicName} onChange={event => setPublicName(event.target.value)} className={inputStyle} /></label>
      <label className="flex items-start gap-3 text-[14px] leading-relaxed"><input type="checkbox" checked={showPublicly} onChange={event => setShowPublicly(event.target.checked)} className="mt-1 size-4 shrink-0 accent-lime" />Show my public name on the backers wall. Otherwise, use my shortened wallet address.</label>
      <p className="text-[14px] leading-relaxed text-ink/70">Your ${PAD_MODELS[sku].deposit} deposit is refundable before the order ships. Final refund terms pending approval. Everyone who pre-orders appears on the backers wall; your email stays private.</p>
      <button disabled={busy || resumeFailed} type="submit" className={`${preorderButton} w-full`}>{busy ? 'Creating checkout…' : 'Pay deposit with Solana Pay'}</button>
    </form> : order.status === 'paid' || order.status === 'shipped' || order.status === 'refunded' ? <div role="status" className="mt-6 space-y-4">
      <p className="font-display text-[24px] text-lime">{order.status === 'refunded' ? 'Deposit refunded' : 'Deposit confirmed'}</p>
      <p className="text-[15px] text-ink/80">{PAD_MODELS[order.sku].name} · {PAD_BUILDS[order.build].name} · {Number(order.amount)} {order.cluster === 'devnet' ? 'mUSDC (test tokens)' : 'USDC'}</p>
      <a href={`https://explorer.solana.com/tx/${order.signature}?cluster=${order.cluster === 'devnet' ? 'devnet' : 'mainnet-beta'}`} target="_blank" rel="noreferrer" className="block text-[14px] text-lime underline underline-offset-4">View verified transfer</a>
      <p className="text-[14px] text-ink/70">{order.email === 'sent' ? 'Your receipt was sent by email.' : 'Your payment is saved. Email delivery is pending.'}</p>
    </div> : <div className="mt-6 space-y-4">
      <p className="text-[15px] text-ink/80">{Number(order.amount)} {order.cluster === 'devnet' ? 'mUSDC' : 'USDC'} · {PAD_MODELS[order.sku].name} · {PAD_BUILDS[order.build].name}</p>
      <p className="text-[14px] text-ink/70">Connect a wallet, or scan with a Solana Pay wallet on {order.cluster}. Pay once; this sheet checks for final confirmation automatically.</p>
      {qr && <div className="mx-auto w-fit rounded-2xl bg-white p-1"><Image unoptimized src={qr} width={256} height={256} alt={`Solana Pay QR for ${Number(order.amount)} ${order.cluster === 'devnet' ? 'mUSDC on devnet' : 'USDC on mainnet'}`} className="h-auto max-w-full" /></div>}
      <a href={order.url} className="block text-center text-[14px] text-lime underline underline-offset-4">Open in a Solana Pay wallet</a>
      {!connected ? <>
        <label className="block text-[14px]">Wallet<select aria-label="Wallet" className={inputStyle} value={wallet?.adapter.name || ''} onChange={event => select(wallets.find(item => item.adapter.name === event.target.value)?.adapter.name || null)}>
          <option value="">Select a wallet</option>{wallets.map(item => <option key={item.adapter.name} value={item.adapter.name}>{item.adapter.name}</option>)}
        </select></label>
        <button type="button" disabled={!wallet || connecting} className={`${preorderButton} w-full`} onClick={() => { setError(''); connect().catch(err => setError(err.message || 'Could not connect. Open your wallet and try again.')); }}>{connecting ? 'Connecting…' : 'Connect wallet'}</button>
        {!wallets.length && <p className="text-[13px] text-ink/70">No browser wallet detected. Use the QR or wallet link above.</p>}
      </> : <>
        <p className="break-all text-[13px] text-ink/70">Connected: {publicKey?.toBase58()}</p>
        <button type="button" disabled={busy || submitted} onClick={pay} className={`${preorderButton} w-full`}>{submitted ? 'Submitted · waiting for final confirmation' : busy ? 'Approve in your wallet…' : `Pay ${Number(order.amount)} ${order.cluster === 'devnet' ? 'mUSDC' : 'USDC'} deposit`}</button>
        <button type="button" className="min-h-11 text-[13px] text-ink/70 underline underline-offset-4" onClick={() => disconnect().catch(() => setError('Could not disconnect. Try again.'))}>Disconnect wallet</button>
      </>}
      <p role="status" className="text-center text-[13px] text-ink/70">Waiting for a finalized deposit. Keep your order ID below.</p>
      <p className="break-all text-[12px] text-ink/70">Order: {order.id}</p>
    </div>}
    {error && <p role="alert" className="mt-4 text-[14px] text-[#ff8a8a]">{error}</p>}
    <p className="mt-5 text-[13px] leading-relaxed text-ink/70">{PAD_PRICE_NOTE}</p>
    <a href={`mailto:${config.refundEmail}?subject=${encodeURIComponent(`xorrpad refund request${order ? ` ${order.id}` : ''}`)}`} className="mt-4 inline-flex min-h-11 items-center text-[14px] text-lime underline underline-offset-4">Request refund</a>
  </>;
}
