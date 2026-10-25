/**
 * The executor as a Vercel function (2026-10-25): the same Hono app the Node server runs, every path routed here by
 * vercel.json. The scheduler is `POST /ops/tick`, called by .github/workflows/executor-tick.yml.
 */
import { handle } from 'hono/vercel';
import { app } from '../src/app.js';

const handler = handle(app);
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
export const OPTIONS = handler;
