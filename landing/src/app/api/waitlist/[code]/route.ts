import { isRefCode, placeOf } from "@/lib/waitlist-server";

/** Your place again, for a returning visitor whose code the page remembered. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const missing = Response.json({ error: "not_found", detail: "No place in line with that code." }, { status: 404 });
  if (!isRefCode(code)) return missing;
  try {
    const place = await placeOf(code);
    return place ? Response.json(place, { headers: { "cache-control": "no-store" } }) : missing;
  } catch (e) {
    console.error("[waitlist] place failed", e);
    return Response.json({ error: "unavailable", detail: "The line is not answering right now." }, { status: 503 });
  }
}
