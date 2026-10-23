import { API_URL } from "@/lib/links";

/** Your place in line, as the executor answers it. */
export type Place = { refCode: string; referrals: number; position: number; total: number; already?: boolean };

/** Places one referral moves you up. Mirrors BOOST_PER_REFERRAL in server/src/routes/waitlist.ts. */
export const BOOST_PER_REFERRAL = 10;

const STORE_KEY = "xorr.waitlist.code";

export class WaitlistError extends Error {}

async function read<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { detail?: string };
  if (!res.ok) throw new WaitlistError(body.detail ?? "Something went wrong. Try again.");
  return body as T;
}

export async function waitlistTotal(): Promise<number> {
  const { total } = await read<{ total: number }>(await fetch(`${API_URL}/waitlist`));
  return total;
}

export async function joinWaitlist(email: string, ref: string | null, website: string): Promise<Place> {
  const res = await fetch(`${API_URL}/waitlist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, ref: ref ?? undefined, website }),
  });
  const place = await read<Place>(res);
  remember(place.refCode);
  return place;
}

export async function placeFor(code: string): Promise<Place | null> {
  const res = await fetch(`${API_URL}/waitlist/${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  return read<Place>(res);
}

/* The code this browser joined with, so a return visit shows your place instead of the form. */
export function rememberedCode(): string | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

function remember(code: string) {
  try {
    localStorage.setItem(STORE_KEY, code);
  } catch {
    // Private windows refuse storage; the place is still shown for this visit.
  }
}

export function forget() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // Nothing stored.
  }
}

/** The friend's code this visit arrived with (`?ref=ABCD2345`), if any. */
export function arrivedWithRef(): string | null {
  if (typeof window === "undefined") return null;
  const ref = new URLSearchParams(window.location.search).get("ref");
  return ref && /^[A-HJ-KM-NP-Z2-9]{8}$/.test(ref) ? ref : null;
}

export function shareLink(code: string): string {
  return `https://xorr.finance/?ref=${code}`;
}
