/**
 * The xorr.finance waitlist (2026-10-23).
 *
 * Three public routes, read and written from the landing page:
 *
 *   GET  /waitlist          how many people are in line
 *   POST /waitlist          join with an email (and a friend's code, if their link brought you); answers with your
 *                           place, your own code and how many you have brought in. Joining again with the same email
 *                           answers with the same row, so a second tap never makes a second place.
 *   GET  /waitlist/:code    your place again, for a returning visitor whose code the page remembered
 *
 * ## The line
 *
 * Signup order, and every person someone brings in moves them `BOOST_PER_REFERRAL` places up. A row's score is its
 * signup number minus the boost; the place is one plus the rows scoring lower (an equal score goes to whoever came
 * first). Never below 1.
 *
 * ## Limits
 *
 * The executor's general limiter counts every signed-out caller in one bucket, so a busy landing page would spend the
 * budget the app's public market reads live on. These routes are left out of it and limited per address here instead.
 */
import { randomBytes } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { one } from '../db/index.js';
import { log } from '../http/request-id.js';

/** Places one referral moves its referrer up the line. */
export const BOOST_PER_REFERRAL = 10;

/** Joins per address per window, and reads per address per window. */
const JOIN_LIMIT = 8;
const READ_LIMIT = 120;
const WINDOW_MS = 10 * 60_000;

/** One person, one row: trimmed and lowercased. Undefined when it is not an email address. */
export function normalizeEmail(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return undefined;
  // One @, something before it, a dotted domain after it, no spaces. Deliverability is the inbox's to prove.
  return /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(email) ? email : undefined;
}

/** Codes are 8 characters from an alphabet with no look-alikes (no 0/O, 1/I/L), so one read aloud survives. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newRefCode(bytes: Buffer = randomBytes(8)): string {
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** Whether a string could be one of our codes, before it is looked up. */
export function isRefCode(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[A-HJ-KM-NP-Z2-9]{8}$/.test(raw);
}

/** The row's place: one plus everyone ahead of it once referrals are counted. */
const PLACE_SQL = `
  WITH scored AS (
    SELECT w.id, w.ref_code,
           (SELECT count(*) FROM waitlist r WHERE r.referred_by = w.ref_code)::int AS referrals
      FROM waitlist w
  ), ranked AS (
    SELECT id, ref_code, referrals, id - referrals * ${BOOST_PER_REFERRAL} AS score FROM scored
  )
  SELECT me.ref_code AS "refCode",
         me.referrals,
         (SELECT count(*) FROM ranked o
           WHERE o.score < me.score OR (o.score = me.score AND o.id < me.id))::int + 1 AS position,
         (SELECT count(*) FROM waitlist)::int AS total
    FROM ranked me
   WHERE me.ref_code = $1`;

export type Place = { refCode: string; referrals: number; position: number; total: number };

async function placeOf(code: string): Promise<Place | undefined> {
  return one<Place>(PLACE_SQL, [code]);
}

/* Per-address windows. In memory and per process, like the executor's other limiters. */
const hits = new Map<string, { count: number; resetAt: number }>();
function limited(c: Context, kind: 'join' | 'read'): Response | undefined {
  const who = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'local';
  const key = `${kind}:${who}`;
  const now = Date.now();
  const row = hits.get(key);
  if (!row || now > row.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else if (++row.count > (kind === 'join' ? JOIN_LIMIT : READ_LIMIT)) {
    c.header('retry-after', String(Math.ceil((row.resetAt - now) / 1000)));
    return c.json({ error: 'rate_limited', detail: 'Too many tries from here. Give it a few minutes.' }, 429);
  }
  if (hits.size > 10_000) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
  return undefined;
}

/** Testing only. */
export function resetWaitlistLimits(): void {
  hits.clear();
}

export const waitlistRoutes = new Hono();

waitlistRoutes.get('/waitlist', async (c) => {
  const refused = limited(c, 'read');
  if (refused) return refused;
  const row = await one<{ total: number }>('SELECT count(*)::int AS total FROM waitlist');
  c.header('cache-control', 'public, max-age=10');
  return c.json({ total: row?.total ?? 0 });
});

waitlistRoutes.get('/waitlist/:code', async (c) => {
  const refused = limited(c, 'read');
  if (refused) return refused;
  const code = c.req.param('code');
  if (!isRefCode(code)) return c.json({ error: 'not_found', detail: 'No place in line with that code.' }, 404);
  const place = await placeOf(code);
  if (!place) return c.json({ error: 'not_found', detail: 'No place in line with that code.' }, 404);
  return c.json(place);
});

waitlistRoutes.post('/waitlist', async (c) => {
  const refused = limited(c, 'join');
  if (refused) return refused;

  let body: { email?: unknown; ref?: unknown; website?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_request', detail: 'Send JSON: { "email": "you@example.com" }.' }, 400);
  }
  // A field no person sees. A form that fills it is a bot.
  if (typeof body.website === 'string' && body.website.length > 0) {
    return c.json({ error: 'bad_request', detail: 'That did not look like a person.' }, 400);
  }
  const email = normalizeEmail(body.email);
  if (!email) return c.json({ error: 'invalid_email', detail: 'That does not look like an email address.' }, 400);

  // Already in line: the same place, not a second one.
  const existing = await one<{ ref_code: string }>('SELECT ref_code FROM waitlist WHERE email = $1', [email]);
  if (existing) {
    const place = await placeOf(existing.ref_code);
    return c.json({ ...place!, already: true });
  }

  // A friend's code counts only when it is real; a typo is not a reason to refuse someone.
  const ref = isRefCode(body.ref) ? body.ref : undefined;
  const referrer = ref ? await one<{ ref_code: string }>('SELECT ref_code FROM waitlist WHERE ref_code = $1', [ref]) : undefined;

  // A code collision is one in 30^8; try again rather than fail the person.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newRefCode();
    const inserted = await one<{ ref_code: string }>(
      `INSERT INTO waitlist (email, ref_code, referred_by, source)
       VALUES ($1, $2, $3, 'landing')
       ON CONFLICT DO NOTHING
       RETURNING ref_code`,
      [email, code, referrer?.ref_code ?? null],
    );
    if (inserted) {
      const place = await placeOf(inserted.ref_code);
      log.info(`[waitlist] joined #${place?.position} of ${place?.total}${referrer ? ` via ${referrer.ref_code}` : ''}`);
      return c.json({ ...place!, already: false }, 201);
    }
    // Lost a race with the same email arriving twice at once: answer with that row.
    const raced = await one<{ ref_code: string }>('SELECT ref_code FROM waitlist WHERE email = $1', [email]);
    if (raced) return c.json({ ...(await placeOf(raced.ref_code))!, already: true });
  }
  return c.json({ error: 'unavailable', detail: 'Could not save your place. Try again.' }, 503);
});

