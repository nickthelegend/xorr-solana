import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  moonpayRoutes,
  buildMoonPayUrl,
  signMoonPayUrl,
  verifyMoonPayWebhook,
} from './moonpay.js';
import crypto from 'node:crypto';

describe('MoonPay integration', () => {
  const testWallet = '7v91N7iZEdMoQg6zJ5pA9oG3eF1n3hXyZ1W2v3u4t5s6';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    // A key of the shape MoonPay issues; the routes only pass it through.
    vi.stubEnv('MOONPAY_API_KEY', 'pk_test_sample');
  });

  it('builds a sandbox buy URL targeting usdc_sol on Solana', () => {
    const url = buildMoonPayUrl({
      walletAddress: testWallet,
      apiKey: 'pk_test_sample',
      baseCurrencyAmount: 150,
    });

    expect(url).toContain('https://buy-sandbox.moonpay.com');
    expect(url).toContain('apiKey=pk_test_sample');
    expect(url).toContain('currencyCode=usdc_sol');
    expect(url).toContain(`walletAddress=${testWallet}`);
    expect(url).toContain('baseCurrencyAmount=150');
    expect(url).toContain('baseCurrencyCode=usd');
  });

  it('signs url with HMAC-SHA256 signature when secretKey is present', () => {
    const secret = 'sk_test_secret_key_123';
    const signed = buildMoonPayUrl({
      walletAddress: testWallet,
      apiKey: 'pk_test_sample',
      secretKey: secret,
    });

    expect(signed).toContain('&signature=');
  });

  it('GET /deposit/moonpay/config returns sandbox config', async () => {
    const app = new Hono();
    app.route('/', moonpayRoutes);

    const res = await app.request('/deposit/moonpay/config');
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, any>;
    expect(body.environment).toBe('sandbox');
    expect(body.currencyCode).toBe('usdc_sol');
    expect(body.baseCurrencyCode).toBe('usd');
    expect(body.sandboxUrl).toBe('https://buy-sandbox.moonpay.com');
  });

  it('POST /deposit/moonpay/url validates address and returns URL', async () => {
    const app = new Hono();
    app.route('/', moonpayRoutes);

    const res = await app.request('/deposit/moonpay/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: testWallet,
        baseCurrencyAmount: 200,
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.status).toBe('ok');
    expect(body.environment).toBe('sandbox');
    expect(body.currencyCode).toBe('usdc_sol');
    expect(body.walletAddress).toBe(testWallet);
    expect(body.url).toContain('https://buy-sandbox.moonpay.com');
    expect(body.url).toContain('currencyCode=usdc_sol');
  });

  it('POST /deposit/moonpay/url rejects invalid address', async () => {
    const app = new Hono();
    app.route('/', moonpayRoutes);

    const res = await app.request('/deposit/moonpay/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: 'invalid-not-an-address',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('is off, and says so, with no key configured — never a stand-in key', async () => {
    vi.stubEnv('MOONPAY_API_KEY', '');
    vi.stubEnv('EXPO_PUBLIC_MOONPAY_API_KEY', '');
    const app = new Hono();
    app.route('/', moonpayRoutes);
    const config = await app.request('/deposit/moonpay/config');
    expect(config.status).toBe(200);
    expect(await config.json()).toMatchObject({ configured: false });
    expect(JSON.stringify(await (await app.request('/deposit/moonpay/config')).json())).not.toMatch(/pk_/);
    const url = await app.request('/deposit/moonpay/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: testWallet }),
    });
    expect(url.status).toBe(503);
  });

  describe('the webhook', () => {
    const key = 'wk_test_key';
    const sign = (body: string, t: number) =>
      `t=${t},s=${crypto.createHmac('sha256', key).update(`${t}.${body}`).digest('hex')}`;
    const now = 1_790_000_000;

    it('verifies MoonPay\'s V2 signature over the timestamp and raw body', () => {
      const body = '{"type":"transaction_updated"}';
      expect(verifyMoonPayWebhook(body, sign(body, now), key, now)).toBe(true);
      expect(verifyMoonPayWebhook(body + ' ', sign(body, now), key, now)).toBe(false);
      expect(verifyMoonPayWebhook(body, sign(body, now), 'another_key', now)).toBe(false);
      expect(verifyMoonPayWebhook(body, undefined, key, now)).toBe(false);
    });

    it('refuses a signature older than five minutes, as a replay', () => {
      const body = '{}';
      expect(verifyMoonPayWebhook(body, sign(body, now - 301), key, now)).toBe(false);
    });

    it('refuses an unsigned post, and is off with no webhook key', async () => {
      const app = new Hono();
      app.route('/', moonpayRoutes);
      const post = () =>
        app.request('/deposit/moonpay/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'transaction_updated', data: { status: 'completed', walletAddress: testWallet } }),
        });
      vi.stubEnv('MOONPAY_WEBHOOK_KEY', '');
      expect((await post()).status).toBe(503);
      vi.stubEnv('MOONPAY_WEBHOOK_KEY', key);
      expect((await post()).status).toBe(401);
    });
  });
});
