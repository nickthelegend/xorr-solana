// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import { preorderConfig, PreorderError } from '@/lib/preorder-config';
import { confirmPreorder, createPreorder, publicPreorder, readPreorder } from '@/lib/preorder-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
function failure(error: unknown) {
  return Response.json({ error: error instanceof PreorderError ? error.message : 'Checkout is unavailable. Please try again.' }, {
    status: error instanceof PreorderError ? error.status : 503, headers,
  });
}
export async function GET(request: Request) {
  try {
    const config = preorderConfig();
    const id = new URL(request.url).searchParams.get('id');
    return Response.json(id ? publicPreorder(await readPreorder(id)) : { ready: true, ...config }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    preorderConfig();
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new PreorderError('Use checkout on this site.', 403);
    const raw = await request.text();
    if (raw.length > 4096) throw new PreorderError('Checkout request is too large.', 413);
    let input;
    try { input = JSON.parse(raw); } catch { throw new PreorderError('Send a JSON checkout request.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PreorderError('Send a JSON checkout object.');
    if (input.action === 'confirm') return Response.json(await confirmPreorder(input.id), { headers });
    if (input.action !== 'create') throw new PreorderError('Choose create or confirm.');
    return Response.json(await createPreorder(input), { status: 201, headers });
  } catch (error) { return failure(error); }
}
