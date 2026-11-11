import { describe, expect, it } from 'vitest';
import { canAnswer, emptySignals, reduceSignals, type Signal } from './signals';
// Protocol/state-machine vectors only. No quote service is replaced or called.
const signal: Signal = { id:'unit-signal', state:'awaiting', expiresAt:10000, updatedAt:'2026-11-12T00:00:00Z', proposal:{signal:{side:'BUY',symbol:'unit-market'},verdict:{sizeUsd:1,why:['unit gate reason']}} };
describe('desk signal reducer', () => {
  it('replaces reconnect snapshots and drops wallet requests from the old link', () => {
    const state = reduceSignals(emptySignals(), { type:'snapshot', signals:[signal] });
    expect(state.signals[signal.id]).toEqual(signal);
    expect(reduceSignals(state, { type:'snapshot', signals:[] })).toEqual(emptySignals());
  });
  it('advances awaiting, accepted, signed, and executed without inventing a receipt', () => {
    let state = emptySignals();
    for (const next of ['awaiting','accepted','signed','executed'] as const) state = reduceSignals(state, { type:'signal', signal:{ ...signal, state:next } });
    expect(state.signals[signal.id]?.state).toBe('executed');
    expect(state.signals[signal.id]?.receipt).toBeUndefined();
    expect(reduceSignals(state,{type:'signal',signal})).toBe(state);
  });
  it('ignores malformed events, unknown states and older updates', () => {
    const state = reduceSignals(emptySignals(), { type:'signal', signal });
    for (const event of [null,{type:'signal',signal:{}},{type:'signal',signal:{...signal,state:'unknown'}},{type:'signal',signal:{...signal,updatedAt:'2025-01-01',state:'accepted'}},{type:'receipt',receipt:{signalId:signal.id,signature:'accepted'}}]) expect(reduceSignals(state,event)).toBe(state);
  });
  it('accepts wallet handoffs only for a known accepted signal and clears terminal handoffs', () => {
    const awaiting = reduceSignals(emptySignals(),{type:'signal',signal});
    expect(reduceSignals(awaiting,{type:'wallet_request',id:signal.id})).toBe(awaiting);
    let state = reduceSignals(awaiting,{type:'signal',signal:{...signal,state:'accepted'}});
    state = reduceSignals(state,{type:'wallet_request',id:signal.id,handoff:true});
    expect(state.requests[signal.id]?.handoff).toBe(true);
    state = reduceSignals(state,{type:'signal',signal:{...signal,state:'refused'}});
    expect(state.requests[signal.id]).toBeUndefined();
  });
  it('disables acceptance at the deadline and after any answer', () => {
    expect(canAnswer(signal,9999)).toBe(true);
    expect(canAnswer(signal,10000)).toBe(false);
    expect(canAnswer({...signal,state:'accepted'},1)).toBe(false);
  });
  it('keeps the queue bounded', () => {
    let state = emptySignals();
    for (let i=0;i<300;i++) state = reduceSignals(state,{type:'signal',signal:{...signal,id:`unit-${i}`}});
    expect(Object.keys(state.signals)).toHaveLength(256);
  });
});
