import { describe, expect, it } from 'vitest';
import {
  getMultiplier,
  getCorporateActions,
  assessCorporateAction,
} from './corporate-actions.js';

describe('corporate actions schedule and assessment', () => {
  it('returns default 1.0 multiplier for xStocks', async () => {
    const m1 = await getMultiplier('NVDAx');
    const m2 = await getMultiplier('tslax');
    expect(m1).toBe(1.0);
    expect(m2).toBe(1.0);
  });

  it('retrieves scheduled corporate actions for an xStock', async () => {
    const actions = await getCorporateActions('NVDAx');
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]!.kind).toBe('dividend');
  });

  it('advises avoiding entry when stock split is imminent (<= 2 days)', async () => {
    // 2026-12-27 is 1 day before TSLA 2026-12-28 split
    const splitEve = new Date('2026-12-27T12:00:00Z');
    const assessment = await assessCorporateAction('TSLAx', splitEve);

    expect(assessment.recommendation).toBe('avoid_entry');
    expect(assessment.scoreAdjustment).toBe(-40);
    expect(assessment.reason).toContain('Stock split');
    expect(assessment.imminentAction?.kind).toBe('split');
  });

  it('advises avoiding entry when ex-dividend is imminent (<= 2 days)', async () => {
    // 2026-12-03 is 1 day before NVDA 2026-12-04 dividend ex-date
    const divEve = new Date('2026-12-03T12:00:00Z');
    const assessment = await assessCorporateAction('NVDAx', divEve);

    expect(assessment.recommendation).toBe('avoid_entry');
    expect(assessment.scoreAdjustment).toBe(-25);
    expect(assessment.reason).toContain('Ex-dividend date in 1 day');
  });

  it('advises positioning for dividend DCA capture when 3-7 days away', async () => {
    // 2026-11-30 is 4 days before 2026-12-04 dividend
    const divRunup = new Date('2026-11-30T12:00:00Z');
    const assessment = await assessCorporateAction('NVDAx', divRunup);

    expect(assessment.recommendation).toBe('position_dca');
    expect(assessment.scoreAdjustment).toBe(10);
    expect(assessment.reason).toContain('Dividend record date approaching in 4 days');
  });

  it('returns normal assessment when no corporate action is imminent', async () => {
    const normalDate = new Date('2026-06-15T12:00:00Z');
    const assessment = await assessCorporateAction('MSFTx', normalDate);

    expect(assessment.recommendation).toBe('normal');
    expect(assessment.scoreAdjustment).toBe(0);
  });
});
