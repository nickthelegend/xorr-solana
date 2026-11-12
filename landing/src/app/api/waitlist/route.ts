import { ipHash, join, total } from "@/lib/waitlist-server";

/** How many people are in line. Cached at the edge for a few seconds: every visitor reads it. */
export async function GET() {
  try {
    return Response.json({ total: await total() }, { headers: { "cache-control": "public, s-maxage=10, stale-while-revalidate=30" } });
  } catch {
    console.error("[waitlist] count failed");
    return Response.json({ error: "unavailable", detail: "The line is not answering right now." }, { status: 503 });
  }
}

/** Join with an email (and a friend's code, if their link brought you). The same email answers with the same place. */
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'forbidden', detail: 'Use the form on this site.' }, { status: 403 });
  let body: { email?: unknown; ref?: unknown; website?: unknown; source?: unknown };
  try {
    body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid JSON');
  } catch {
    return Response.json({ error: "bad_request", detail: 'Send JSON: { "email": "you@example.com" }.' }, { status: 400 });
  }
  try {
    const result = await join({ email: body.email, ref: body.ref, website: body.website, source: body.source }, ipHash(request));
    if (!result.ok) return Response.json({ error: result.error, detail: result.detail }, { status: result.status });
    return Response.json({ ...result.place, already: !result.created, email: result.email }, { status: result.created ? 201 : 200, headers: { "cache-control": "no-store" } });
  } catch {
    console.error("[waitlist] join failed");
    return Response.json({ error: "unavailable", detail: "Could not save your place. Try again." }, { status: 503 });
  }
}
