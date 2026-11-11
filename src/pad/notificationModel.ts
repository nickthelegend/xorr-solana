import { canAnswer, isReceipt, padDeepLink, validSignalId, type Signal } from './signals';
export const PAD_SIGNAL_KIND = 'pad-signal';
export const PAD_CATEGORY = 'xorrpad-signal-v1';
export const ACCEPT = 'xorrpad.accept';
export const REFUSE = 'xorrpad.refuse';
export type PadNotice = { key: string; title: string; body: string; data: Record<string, string>; categoryIdentifier?: string };
export function noticeFor(signal: Signal): PadNotice | null {
  const data = { kind: PAD_SIGNAL_KIND, signalId: signal.id, route: padDeepLink(signal.id) };
  if (canAnswer(signal)) return { key: `${signal.id}:awaiting`, title: 'xorrpad · trade signal', body: `${signal.proposal.signal.side} ${signal.proposal.signal.market ?? signal.proposal.signal.symbol ?? ''} · $${signal.proposal.verdict.sizeUsd}. Open Pad to review the quote, fees and gate.`, data, categoryIdentifier: PAD_CATEGORY };
  if (signal.automatic && signal.state === 'executed' && isReceipt(signal.receipt)) return { key: `${signal.id}:${signal.receipt.signature}`, title: 'xorrpad · auto-accepted', body: `Confirmed trade · ${signal.receipt.explorer}`, data: { ...data, receipt: signal.receipt.explorer } };
  return null;
}
export function padNotificationAction(data: Record<string, unknown> | undefined, action: string): { id: string; route: string; action?: 'accept' | 'refuse' } | null {
  if (data?.kind !== PAD_SIGNAL_KIND || !validSignalId(data.signalId)) return null;
  return { id: data.signalId, route: padDeepLink(data.signalId), action: action === ACCEPT ? 'accept' : action === REFUSE ? 'refuse' : undefined };
}
