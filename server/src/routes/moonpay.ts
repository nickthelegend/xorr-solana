/**
 * MoonPay fiat on-ramp integration for Solana USDC deposits (PLAN.md §5, §8.5).
 *
 * Keys are accessed strictly via environment variables (MOONPAY_API_KEY, MOONPAY_SECRET_KEY, MOONPAY_WEBHOOK_KEY),
 * sandbox mode is enforced, and secret keys are never exposed to clients or committed.
 *
 * With no key configured the on-ramp is off and says so (`/config` answers `configured: false`; a checkout URL is 503). It used to fall back to
 * `pk_test_xorr_dev_sandbox`, a key MoonPay never issued, so the widget opened and failed inside MoonPay's own page.
 * The webhook is accepted only with a valid `Moonpay-Signature-V2`: unsigned, anyone could post "completed" and have a
 * deposit that never happened written to a wallet's audit trail (2026-09-19).
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { currentWallet } from './wallet-context.js';
import { append } from '../audit/log.js';
import { one } from '../db/index.js';
import { isValidAddress, formatAddress } from '../withdrawals/allowlist.js';

export const moonpayRoutes = new Hono();

const MOONPAY_SANDBOX_BASE = 'https://buy-sandbox.moonpay.com';
/** The publishable key, or null when none is configured — never a stand-in. */
export function getMoonPayApiKey(): string | null {
  return process.env.MOONPAY_API_KEY || process.env.EXPO_PUBLIC_MOONPAY_API_KEY || null;
}

const NOT_CONFIGURED = {
  error: 'moonpay_not_configured',
  detail: 'Card deposits are not set up on this server: no MoonPay key is configured.',
} as const;

/** How old a signed webhook may be before it is refused as a replay. */
const WEBHOOK_TOLERANCE_S = 300;

/**
 * Whether a webhook body carries MoonPay's signature: `Moonpay-Signature-V2: t=<unix>,s=<hex>`, where `s` is
 * HMAC-SHA256 over `<t>.<raw body>` with the webhook key.
 */
export function verifyMoonPayWebhook(
  rawBody: string,
  header: string | undefined,
  key: string,
  nowS: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const sig = parts.s;
  if (!Number.isFinite(t) || !sig || Math.abs(nowS - t) > WEBHOOK_TOLERANCE_S) return false;
  const expected = crypto.createHmac('sha256', key).update(`${parts.t}.${rawBody}`).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function signMoonPayUrl(urlToSign: string, secretKey?: string): string {
  const secret = secretKey ?? process.env.MOONPAY_SECRET_KEY;
  if (!secret) return urlToSign;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(urlToSign)
    .digest('base64');

  const separator = urlToSign.includes('?') ? '&' : '?';
  return `${urlToSign}${separator}signature=${encodeURIComponent(signature)}`;
}

export function buildMoonPayUrl(params: {
  walletAddress: string;
  currencyCode?: string;
  baseCurrencyCode?: string;
  baseCurrencyAmount?: number;
  apiKey: string;
  secretKey?: string;
}): string {
  const apiKey = params.apiKey;
  const currencyCode = params.currencyCode ?? 'usdc_sol';
  const baseCurrencyCode = params.baseCurrencyCode ?? 'usd';
  const amount = params.baseCurrencyAmount ?? 100;

  const searchParams = new URLSearchParams({
    apiKey,
    currencyCode,
    baseCurrencyCode,
    baseCurrencyAmount: amount.toString(),
    walletAddress: params.walletAddress,
  });

  const unsignedUrl = `${MOONPAY_SANDBOX_BASE}?${searchParams.toString()}`;
  return signMoonPayUrl(unsignedUrl, params.secretKey);
}

const MoonPayUrlInput = z.object({
  walletAddress: z.string().trim().refine((addr) => isValidAddress(addr, 'solana-fork') || isValidAddress(addr), {
    message: 'Must be a valid Solana base58 or EVM address',
  }),
  currencyCode: z.string().optional().default('usdc_sol'),
  baseCurrencyCode: z.string().optional().default('usd'),
  baseCurrencyAmount: z.number().positive().optional().default(100),
});

/**
 * GET /deposit/moonpay/config
 * Returns client-safe configuration for MoonPay dev sandbox.
 */
moonpayRoutes.get('/deposit/moonpay/config', (c) => {
  const apiKey = getMoonPayApiKey();
  // Not set up is a state the screen shows, not a failure: 200 with `configured: false`, so no console error.
  if (!apiKey) return c.json({ configured: false, detail: NOT_CONFIGURED.detail });
  return c.json({
    configured: true,
    environment: 'sandbox',
    currencyCode: 'usdc_sol',
    baseCurrencyCode: 'usd',
    apiKey,
    sandboxUrl: MOONPAY_SANDBOX_BASE,
  });
});

/**
 * POST /deposit/moonpay/url
 * Returns a signed MoonPay sandbox checkout URL for the user's wallet.
 */
moonpayRoutes.post('/deposit/moonpay/url', async (c) => {
  const apiKey = getMoonPayApiKey();
  if (!apiKey) return c.json(NOT_CONFIGURED, 503);
  const body = await c.req.json().catch(() => ({}));
  let targetAddress = body.walletAddress;
  if (!targetAddress) {
    try {
      const wallet = await currentWallet(c);
      targetAddress = wallet?.address;
    } catch {
      // Not authenticated or no wallet
    }
  }

  if (!targetAddress) {
    return c.json(
      {
        status: 'error',
        detail: 'walletAddress is required, or user must be signed in with a wallet.',
      },
      400,
    );
  }

  const parseResult = MoonPayUrlInput.safeParse({
    ...body,
    walletAddress: targetAddress,
  });

  if (!parseResult.success) {
    const detail = parseResult.error.issues?.[0]?.message ?? parseResult.error.message ?? 'Invalid input';
    return c.json(
      {
        status: 'error',
        detail,
      },
      400,
    );
  }

  const input = parseResult.data;
  const formattedAddress = formatAddress(input.walletAddress);
  const url = buildMoonPayUrl({
    apiKey,
    walletAddress: formattedAddress,
    currencyCode: input.currencyCode,
    baseCurrencyCode: input.baseCurrencyCode,
    baseCurrencyAmount: input.baseCurrencyAmount,
  });

  return c.json({
    status: 'ok',
    environment: 'sandbox',
    currencyCode: input.currencyCode,
    walletAddress: formattedAddress,
    url,
  });
});

/**
 * POST /deposit/moonpay/webhook
 * A transaction update from MoonPay, accepted only with a valid signature. A completed buy is written to the audit
 * trail of the wallet it paid into, found by address; one for an address no wallet here holds is acknowledged and
 * recorded nowhere. The deposit itself is the USDC MoonPay sends on chain — this records that it happened, it moves
 * nothing.
 */
moonpayRoutes.post('/deposit/moonpay/webhook', async (c) => {
  const key = process.env.MOONPAY_WEBHOOK_KEY;
  if (!key) return c.json(NOT_CONFIGURED, 503);
  const raw = await c.req.text();
  if (!verifyMoonPayWebhook(raw, c.req.header('moonpay-signature-v2'), key)) {
    return c.json({ error: 'bad_signature', detail: 'The webhook signature did not verify.' }, 401);
  }
  let body: Record<string, any>;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: 'bad_body', detail: 'The webhook body is not JSON.' }, 400);
  }
  const event = body.data ?? {};
  const amount = Number(event.baseCurrencyAmount);
  if (body.type === 'transaction_updated' && event.status === 'completed' && event.walletAddress && Number.isFinite(amount)) {
    const wallet = await one<{ id: string }>('SELECT id FROM wallets WHERE address = $1', [event.walletAddress]);
    if (wallet) {
      const currencyCode = event.currency?.code ?? event.cryptoCurrency?.code ?? 'unknown';
      await append({
        walletId: wallet.id,
        agent: 'MoonPay',
        action: 'Card deposit completed',
        detail: `MoonPay reports $${amount.toFixed(2)} bought as ${currencyCode} for ${event.walletAddress}.`,
        kind: 'trade',
        payload: {
          provider: 'moonpay',
          environment: 'sandbox',
          currencyCode,
          walletAddress: event.walletAddress,
          amount,
          txId: event.id,
          cryptoTransactionId: event.cryptoTransactionId ?? null,
        },
      });
    }
  }
  return c.json({ received: true });
});
