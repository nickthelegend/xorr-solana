import { describe, it, expect } from 'vitest';
import { tradableToken, tradableSymbols } from './tradable-token.js';

describe('tradableToken', () => {
  it('finds an xStock and calls it an equity', () => {
    const t = tradableToken('NVDAx')!;
    expect(t.kind).toBe('equity');
    expect(t.address).toBe('Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh');
    expect(t.decimals).toBe(8);
  });

  it('finds a Tessera token and calls it pre-IPO', () => {
    const t = tradableToken('T-OpenAI')!;
    expect(t.kind).toBe('pre-ipo');
    expect(t.address).toBe('oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ');
    expect(t.decimals).toBe(9);
  });

  /* xStock symbols already resolve case-insensitively everywhere else; keep that. */
  it('matches an xStock however it was typed', () => {
    expect(tradableToken('nvdax')?.symbol).toBe('NVDAx');
  });

  /*
   * T-Tokens are matched exactly. `T-OpenAI` is how Tessera writes it, and accepting `t-openai`
   * would be accepting a symbol nobody issued — on a path whose job is deciding what to buy.
   */
  it('does not invent a T-Token symbol that was not issued', () => {
    expect(tradableToken('t-openai')).toBeUndefined();
    expect(tradableToken('T-Anthropic')).toBeUndefined();
  });

  it('is undefined for anything neither class holds', () => {
    expect(tradableToken('WETH')).toBeUndefined();
    expect(tradableToken('')).toBeUndefined();
  });

  it('lists both classes', () => {
    const all = tradableSymbols();
    expect(all).toContain('NVDAx');
    expect(all).toContain('T-SpaceX');
    expect(new Set(all).size).toBe(all.length);
  });
});
