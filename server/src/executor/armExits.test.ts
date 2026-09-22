/**
 * One agent exit per holding (2026-09-23).
 *
 * An exit sells the whole holding, and each agent entry armed a new one beside the last, so the hosted wallet carried
 * three live exits on AAPLx at three sets of levels. The newest agent exit replaces the agent exits before it; an exit
 * the owner set by hand is left alone and nothing is armed over it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { text: string; params: unknown[] }[] = [];
let ownExit: { id: string } | null = null;

vi.mock('../db/index.js', () => ({
  one: vi.fn(async (text: string, params: unknown[]) => {
    calls.push({ text, params });
    if (/NOT \(params \? 'armedBy'\)/.test(text)) return ownExit;
    if (/INSERT INTO strategies/.test(text)) return { id: 'new-exit' };
    return null; // no identical exit
  }),
  query: vi.fn(async (text: string, params: unknown[]) => {
    calls.push({ text, params });
    return [];
  }),
}));
vi.mock('./run.js', () => ({ runStrategy: vi.fn() }));

const { armExits } = await import('./order.js');
const W = { id: 'w1', address: 'owner', agents_stopped: false };
const LEVELS = { symbol: 'AAPLx', entryPrice: 100, stopPrice: 95, targetPrice: 110 };

describe('armExits', () => {
  beforeEach(() => {
    calls.splice(0, calls.length);
    ownExit = null;
  });

  it("replaces the agent's earlier exits on the holding, and records who armed the new one", async () => {
    const out = await armExits(W, { ...LEVELS, armedBy: 'Momentum Scout' });
    expect(out.strategyId).toBe('new-exit');
    const ended = calls.find((c) => /SET state = 'ended'/.test(c.text));
    expect(ended?.text).toMatch(/params \? 'armedBy'/);
    expect(ended?.params).toEqual(['w1', 'AAPLx']);
    const insert = calls.find((c) => /INSERT INTO strategies/.test(c.text));
    expect(JSON.parse(insert!.params[4] as string)).toMatchObject({ armedBy: 'Momentum Scout' });
  });

  it("leaves an exit the owner set, and arms nothing over it", async () => {
    ownExit = { id: 'mine' };
    const out = await armExits(W, { ...LEVELS, armedBy: 'Momentum Scout' });
    expect(out.strategyId).toBeNull();
    expect(out.sentence).toMatch(/stays as you set it/);
    expect(calls.some((c) => /SET state = 'ended'/.test(c.text))).toBe(false);
    expect(calls.some((c) => /INSERT INTO strategies/.test(c.text))).toBe(false);
  });

  it('an exit armed by hand ends nothing', async () => {
    await armExits(W, LEVELS);
    expect(calls.some((c) => /SET state = 'ended'/.test(c.text))).toBe(false);
  });
});
