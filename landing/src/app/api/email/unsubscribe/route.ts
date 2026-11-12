// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import { tokenEmail, unsubscribe } from '@/lib/email-unsubscribe';

const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' };
export async function GET(request: Request) {
  try {
    const email = tokenEmail(new URL(request.url).searchParams.get('token') || '');
    if (!email) return new Response('Invalid unsubscribe link.', { status: 400, headers });
    await unsubscribe(email);
    return new Response('You are unsubscribed from all xorr emails, including pre-order receipts and updates.', { headers });
  } catch {
    return new Response('Unsubscribe is unavailable. Please try this link again shortly.', { status: 503, headers });
  }
}
export const POST = GET;
