import { useEffect } from 'react';
import { padRuntime, usePadState } from './runtime';

export function usePad() {
  const state = usePadState();
  return { ...state, pair: padRuntime.pair, disconnect: padRuntime.disconnect, save: padRuntime.save.bind(padRuntime), forget: padRuntime.forget.bind(padRuntime), answer: padRuntime.answer.bind(padRuntime), sign: padRuntime.signPending.bind(padRuntime) };
}

/** Lives at the root so leaving the Pad tab does not disconnect the desk or pad. */
export function PadSession() {
  useEffect(() => { void padRuntime.start(); return () => padRuntime.stop(); }, []);
  return null;
}
