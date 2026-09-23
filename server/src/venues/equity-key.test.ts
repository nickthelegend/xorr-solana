import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ one: vi.fn(), query: vi.fn(), tx: vi.fn() }));
const { equityKey } = await import('./equity-key.js');

describe('the equity a symbol names is the family this deployment trades', () => {
  it('on Solana, an xStock is an equity and a Base equity is not', () => {
    expect(equityKey('NVDAx', true)).toBe('NVDAx');
    expect(equityKey('nvdax', true)).toBe('NVDAx');
    expect(equityKey('NVDAc', true)).toBeUndefined();
    expect(equityKey('T-OpenAI', true)).toBeUndefined();
  });

  it('on Base, the Base equities as before, and no xStock', () => {
    expect(equityKey('NVDAc', false)).toBe('NVDAc');
    expect(equityKey('NVDAx', false)).toBeUndefined();
  });
});
