import { accessToken } from '@/auth/token';
import { authKnowledge, whenAuthKnown } from '@/auth/authState';
import { API_BASE } from './apiBase';
import { isPublicPath } from './publicPaths';

/**
 * A plain `fetch` of an executor path that carries the session, for the loaders that read the raw `Response` and say
 * in words what each status means (backing, eligibility, reserves, yield). They called `fetch` bare, so on an executor
 * that serves them only to a session every panel read "The executor answered 401" — a refusal drawn as a fact.
 */
export async function sessionFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!isPublicPath(path) && authKnowledge() === 'unknown') await whenAuthKnown();
  const token = await accessToken();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
}
