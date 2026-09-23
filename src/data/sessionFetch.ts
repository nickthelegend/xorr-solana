import { accessToken } from '@/auth/token';
import { authKnowledge, whenAuthKnown } from '@/auth/authState';
import { API_BASE } from './apiBase';
import { NotSignedIn } from './apiError';
import { isPublicPath } from './publicPaths';

/**
 * A plain `fetch` of an executor path that carries the session, for the loaders that read the raw `Response` and say
 * in words what each status means (backing, eligibility, reserves, yield). They called `fetch` bare, so on an executor
 * that serves them only to a session every panel read "The executor answered 401" — a refusal drawn as a fact.
 */
export async function sessionFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!isPublicPath(path)) {
    const know = authKnowledge() === 'unknown' ? await whenAuthKnown() : authKnowledge();
    // A request certain to be refused is not sent, as in `api.ts`: signed out, it was a 401 in the console per panel.
    if (know === 'signed-out') throw new NotSignedIn(path);
  }
  const token = await accessToken();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
}
