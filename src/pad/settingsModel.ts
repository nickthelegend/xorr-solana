export type PadSettings = { url: string; token: string };
export function normalizeDeskUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.includes('://') ? input.trim() : `https://${input.trim()}`); } catch { throw new Error('Setup required: a valid desk URL'); }
  const loopback = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || !url.hostname || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Setup required: the HTTPS desk URL (HTTP is allowed only on loopback)');
  return url.origin;
}
export function validateSettings(input: PadSettings): PadSettings {
  if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,256}$/.test(input.token)) throw new Error('Setup required: the desk pad token');
  return { url: normalizeDeskUrl(input.url), token: input.token };
}
