export type Receipt = { signalId: string; signature: string; explorer: string; cluster?: string };
export type WalletRequest = { handoff?: boolean; transaction?: { requestUrl?: string | null; signWith?: string }; setupRequired?: string | null; error?: string; ok?: boolean };
export type Signal = {
  id: string; state: 'proposed' | 'awaiting' | 'auto_accepted' | 'accepted' | 'signed' | 'executed' | 'refused' | 'expired' | 'failed';
  expiresAt: number; updatedAt?: string; automatic?: boolean; error?: string; receipt?: Receipt;
  proposal: {
    signal: { venue?: string; market?: string; symbol?: string; side: string };
    verdict: { sizeUsd: number; why: string[]; ruleId?: string };
    routing?: { best?: { network?: string; venue?: string; market?: string; price?: number; fees?: unknown; quote?: unknown } } | null;
  };
};
export type SignalState = { signals: Record<string, Signal>; requests: Record<string, WalletRequest> };
export const emptySignals = (): SignalState => ({ signals: {}, requests: {} });
const states = new Set(['proposed','awaiting','auto_accepted','accepted','signed','executed','refused','expired','failed']);
const terminal = new Set(['executed','refused','expired','failed']);
export const validSignalId = (id: unknown): id is string => typeof id === 'string' && !['__proto__','prototype','constructor'].includes(id) && /^[A-Za-z0-9_-]{1,128}$/.test(id);
export function isSignal(value: unknown): value is Signal {
  if (!value || typeof value !== 'object') return false;
  const s = value as Signal;
  return validSignalId(s.id) && states.has(s.state) && Number.isFinite(s.expiresAt) && !!s.proposal?.signal &&
    typeof s.proposal.signal.side === 'string' && Number.isFinite(s.proposal.verdict?.sizeUsd) &&
    Array.isArray(s.proposal.verdict.why) && s.proposal.verdict.why.every(w => typeof w === 'string');
}
export function isReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== 'object') return false;
  const r = value as Receipt;
  if (!validSignalId(r.signalId) || typeof r.signature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(r.signature)) return false;
  try { const url = new URL(r.explorer); return url.protocol === 'https:' && url.hostname === 'explorer.solana.com' && url.pathname === `/tx/${r.signature}` && !url.username && !url.password; } catch { return false; }
}
/** Snapshot replaces the old connection's queue. A state acknowledgment never manufactures a receipt. */
export function reduceSignals(state: SignalState, event: unknown): SignalState {
  if (!event || typeof event !== 'object') return state;
  const e = event as Record<string, unknown>;
  if (e.type === 'snapshot' && Array.isArray(e.signals)) {
    const signals: Record<string, Signal> = {};
    for (const s of e.signals.slice(0, 256)) if (isSignal(s)) signals[s.id] = s;
    return { signals, requests: {} };
  }
  if (e.type === 'signal' && isSignal(e.signal)) {
    const s = e.signal, previous = state.signals[s.id];
    if (previous && ((terminal.has(previous.state) && s.state !== previous.state) ||
      (previous.updatedAt && s.updatedAt && s.updatedAt < previous.updatedAt))) return state;
    const requests = { ...state.requests };
    if (terminal.has(s.state)) delete requests[s.id];
    const signals = { ...state.signals, [s.id]: s };
    if (Object.keys(signals).length > 256) delete signals[Object.keys(signals)[0]!];
    return { signals, requests };
  }
  if (e.type === 'wallet_request' && validSignalId(e.id) && state.signals[e.id]?.state === 'accepted') {
    return { ...state, requests: { ...state.requests, [e.id]: e as WalletRequest } };
  }
  if (e.type === 'receipt' && isReceipt(e.receipt)) {
    const receipt = e.receipt, s = state.signals[receipt.signalId];
    if (s && ['accepted','signed','executed'].includes(s.state)) return { ...state, signals: { ...state.signals, [s.id]: { ...s, state: 'executed', receipt } } };
  }
  return state;
}
export const canAnswer = (s: Signal, now = Date.now()) => s.state === 'awaiting' && now < s.expiresAt;
export function padDeepLink(id: string): string {
  if (!validSignalId(id)) throw new Error('Invalid pad signal id');
  return `/pad?signal=${encodeURIComponent(id)}`;
}
export function transactionRequestUrl(link: string): URL {
  if (!link.startsWith('solana:')) throw new Error('Setup required: a Solana Pay transaction request');
  let url: URL;
  try { url = new URL(decodeURIComponent(link.slice(7))); } catch { throw new Error('Invalid Solana Pay transaction request'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/^\/(?:wallet|pm|perps)\/request\/[a-f0-9]{48}$/.test(url.pathname)) throw new Error('Invalid Solana Pay transaction request');
  return url;
}
