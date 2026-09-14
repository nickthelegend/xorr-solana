/**
 * The executor API client. The ONLY place in the client that talks to our own server.
 *
 * Base URL comes from EXPO_PUBLIC_API_URL so a device build can point at a deployed executor;
 * it defaults to the local dev server.
 */
import { accessToken } from '@/auth/token';
import { isPublicPath } from './publicPaths';
import { authKnowledge, whenAuthKnown } from '@/auth/authState';
import { API_BASE } from './apiBase';
import { ApiError, NotSignedIn, TimedOut } from './apiError';
import { keyHeaders, type Keyed } from './intentKey';
/*
 * Re-exported, not redefined.
 *
 * These moved to `apiError.ts` so an error can be constructed without pulling in the transport's
 * dependencies — `api.ts` reaches for the Privy token getter, which reaches for expo, so
 * `new NotSignedIn(...)` in a node test dragged in a native module and failed to import. An error
 * type should not need a network stack to exist. Callers still import them from here.
 */
export { NotSignedIn, TimedOut } from './apiError';

export { API_BASE };
export { ApiError, apiReason } from './apiError';

/**
 * Every request carries the Privy access token. The executor rejects anything without one, so a
 * missing token is a bug worth surfacing rather than a request worth sending.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Reads are bounded tighter than writes because they are retried by simply looking again.
 *
 * Both are generous on purpose. This executor settles on a mainnet fork, and its slow calls are
 * genuinely slow: `/positions` has been measured at 31s cold and a swap has to quote, build,
 * simulate, broadcast and wait for a receipt. A bound that fires on a call that would have
 * succeeded turns a slow product into a broken one, which is the worse trade.
 */
const READ_TIMEOUT_MS = 45_000;
/*
 * Deliberately above the slowest write this executor has actually produced — a `POST /orders`
 * measured at 153s while 1inch's lane was congested. A write that gives up EARLIER than the server
 * answers is worse than no bound at all: the trade may well have executed, and a screen that says
 * "did not answer" invites a retry that spends twice. Hence the ceiling, and hence the wording of
 * the error, which never claims nothing happened.
 */
const WRITE_TIMEOUT_MS = 180_000;

/**
 * An id for one request (FEATURES.md #90), sent as `x-request-id`.
 *
 * The executor adopts a well-formed id instead of minting its own (`server/src/http/request-id.ts`) and begins every
 * log line for the request with its first eight characters. So the reference a screen shows under a failure finds the
 * request in the logs — including a timed-out one, which never gets an answer to read an id from. Random hex first, so
 * those eight characters differ from one request to the next. It is a label, not a secret or a token.
 */
function newRequestId(): string {
  const random = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${random}${Date.now().toString(16)}`;
}

/**
 * Run `op` under a deadline, aborting the in-flight fetch when it passes.
 *
 * The deadline covers the WHOLE operation, not just the fetch: `whenAuthKnown()` and the Privy
 * token both sit in front of the request and either can stall, and a hang there looks identical
 * from the screen.
 */
async function withDeadline<T>(
  path: string,
  ms: number,
  requestId: string,
  op: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new TimedOut(path, ms, requestId));
    }, ms);
  });
  try {
    return await Promise.race([op(ctrl.signal), expired]);
  } catch (e) {
    // An abort we caused is the deadline, not a network fault, and it must read as one.
    if (e instanceof Error && e.name === 'AbortError') throw new TimedOut(path, ms, requestId);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const timeoutMs = init?.method && init.method !== 'GET' ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS;
  const requestId = newRequestId();
  return withDeadline(path, timeoutMs, requestId, (signal) => send<T>(path, signal, requestId, init));
}

async function send<T>(path: string, signal: AbortSignal, requestId: string, init?: RequestInit): Promise<T> {
  /*
   * Do not ask a question we KNOW we cannot answer — and only then.
   *
   * Every authenticated call used to fire regardless of whether a token existed, so a signed-out
   * load of the home screen produced a 401 for `/wallet/balance`, `/agents` and `/positions`:
   * three real console errors on the first screen a new user sees.
   *
   * The first version of this skipped whenever `accessToken()` was falsy, which was a worse bug:
   * on a freshly established session the token is briefly unavailable, so reads fired in that
   * window were dropped silently and the screen kept its empty state for good. While the answer is
   * unknown the request goes out — a 401 is visible and recoverable; silence is neither.
   */
  if (!isPublicPath(path)) {
    // While the answer is unknown, wait for it rather than sending a request that cannot carry a
    // token. See `whenAuthKnown` for why an un-retried 401 was worse than a short wait.
    const know = authKnowledge() === 'unknown' ? await whenAuthKnown() : authKnowledge();
    if (know === 'signed-out') throw new NotSignedIn(path);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    signal,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-request-id': requestId,
      ...(await authHeaders()),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // A refusal often carries a REASON — the policy engine's own sentence, the one the user
    // should read. Parse it here so a caller does not have to re-parse an error message.
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    throw new ApiError(res.status, `${res.status} ${res.statusText}${text ? `: ${text}` : ''}`, parsed, requestId);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  /**
   * `write` carries a money action's `Idempotency-Key` (FEATURES.md #29): the executor runs a keyed write once and answers
   * a repeat of it with what the first did. When a key is made, kept and dropped is `intentKey.ts`.
   */
  post: <T,>(path: string, body: unknown, write?: Keyed) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), headers: keyHeaders(write) }),
  patch: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
  async getText(path: string): Promise<string> {
    if (!isPublicPath(path) && authKnowledge() === 'signed-out') throw new NotSignedIn(path);
    const requestId = newRequestId();
    return withDeadline(path, READ_TIMEOUT_MS, requestId, async (signal) => {
      const res = await fetch(`${API_BASE}${path}`, {
        signal,
        headers: { 'x-request-id': requestId, ...(await authHeaders()) },
      });
      if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`, undefined, requestId);
      return res.text();
    });
  },
};
