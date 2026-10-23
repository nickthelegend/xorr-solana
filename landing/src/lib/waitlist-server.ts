import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { BOOST_PER_REFERRAL, type Place } from "@/lib/waitlist";

/*
 * The xorr.finance waitlist, server side (2026-10-23).
 *
 * The line: signup order, and every person someone brings in moves them BOOST_PER_REFERRAL places up. A row's score is
 * its signup number minus the boost; its place is one plus the rows scoring lower (an equal score goes to whoever came
 * first), never below 1.
 */

/** Joins one address may make in JOIN_WINDOW_MINUTES. Counted in the database: serverless instances share no memory. */
const JOIN_LIMIT = 8;
const JOIN_WINDOW_MINUTES = 10;

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

/** One person, one row: trimmed and lowercased. Undefined when it is not an email address. */
export function normalizeEmail(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return undefined;
  // One @, something before it, a dotted domain after it, no spaces. Deliverability is the inbox's to prove.
  return /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(email) ? email : undefined;
}

/** Codes are 8 characters from an alphabet with no look-alikes (no 0/O, 1/I/L), so one read aloud survives. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newRefCode(bytes: Buffer = randomBytes(8)): string {
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function isRefCode(raw: unknown): raw is string {
  return typeof raw === "string" && /^[A-HJ-KM-NP-Z2-9]{8}$/.test(raw);
}

/** The caller's address, hashed with a per-deployment salt so the table never holds an IP. */
export function ipHash(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const salt = process.env.WAITLIST_IP_SALT ?? process.env.DATABASE_URL ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

const PLACE_SQL = `
  WITH ranked AS (
    SELECT w.id, w.ref_code,
           (SELECT count(*) FROM waitlist r WHERE r.referred_by = w.ref_code)::int AS referrals
      FROM waitlist w
  ), scored AS (
    SELECT id, ref_code, referrals, id - referrals * ${BOOST_PER_REFERRAL} AS score FROM ranked
  )
  SELECT me.ref_code AS "refCode",
         me.referrals,
         (SELECT count(*) FROM scored o WHERE o.score < me.score OR (o.score = me.score AND o.id < me.id))::int + 1 AS position,
         (SELECT count(*) FROM waitlist)::int AS total
    FROM scored me
   WHERE me.ref_code = $1`;

export async function total(): Promise<number> {
  const rows = (await db().query("SELECT count(*)::int AS total FROM waitlist")) as { total: number }[];
  return rows[0]?.total ?? 0;
}

export async function placeOf(code: string): Promise<Place | undefined> {
  const rows = (await db().query(PLACE_SQL, [code])) as Place[];
  return rows[0];
}

export type JoinResult =
  | { ok: true; place: Place; created: boolean }
  | { ok: false; status: number; error: string; detail: string };

export async function join(input: { email: unknown; ref: unknown; website: unknown }, ip: string): Promise<JoinResult> {
  // A field no person sees. A form that fills it is a bot.
  if (typeof input.website === "string" && input.website.length > 0) {
    return { ok: false, status: 400, error: "bad_request", detail: "That did not look like a person." };
  }
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, status: 400, error: "invalid_email", detail: "That does not look like an email address." };

  const sql = db();
  // Already in line: the same place, not a second one.
  const existing = (await sql.query("SELECT ref_code FROM waitlist WHERE email = $1", [email])) as { ref_code: string }[];
  if (existing[0]) return { ok: true, place: (await placeOf(existing[0].ref_code))!, created: false };

  const recent = (await sql.query(
    `SELECT count(*)::int AS n FROM waitlist WHERE ip_hash = $1 AND created_at > now() - interval '${JOIN_WINDOW_MINUTES} minutes'`,
    [ip],
  )) as { n: number }[];
  if ((recent[0]?.n ?? 0) >= JOIN_LIMIT) {
    return { ok: false, status: 429, error: "rate_limited", detail: "Too many signups from here. Give it a few minutes." };
  }

  // A friend's code counts only when it is real; a typo is not a reason to refuse someone.
  let referrer: string | null = null;
  if (isRefCode(input.ref)) {
    const found = (await sql.query("SELECT ref_code FROM waitlist WHERE ref_code = $1", [input.ref])) as { ref_code: string }[];
    referrer = found[0]?.ref_code ?? null;
  }

  // A code collision is one in 30^8; try again rather than fail the person.
  for (let attempt = 0; attempt < 3; attempt++) {
    const inserted = (await sql.query(
      `INSERT INTO waitlist (email, ref_code, referred_by, ip_hash, source)
       VALUES ($1, $2, $3, $4, 'landing')
       ON CONFLICT DO NOTHING
       RETURNING ref_code`,
      [email, newRefCode(), referrer, ip],
    )) as { ref_code: string }[];
    if (inserted[0]) return { ok: true, place: (await placeOf(inserted[0].ref_code))!, created: true };
    // Lost a race with the same email arriving twice at once: answer with that row.
    const raced = (await sql.query("SELECT ref_code FROM waitlist WHERE email = $1", [email])) as { ref_code: string }[];
    if (raced[0]) return { ok: true, place: (await placeOf(raced[0].ref_code))!, created: false };
  }
  return { ok: false, status: 503, error: "unavailable", detail: "Could not save your place. Try again." };
}
