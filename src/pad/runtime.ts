import { create } from 'zustand';
import { PadDesk } from '../data/padDesk';
import { signPadRequest } from '../wallet/padRequest';
import { PadBle, type BleState } from './ble';
import { clearSettings, readSettings, saveSettings, validateSettings, type PadSettings } from './settings';
import { canAnswer, emptySignals, isSignal, reduceSignals, type SignalState, type WalletRequest } from './signals';

type State = { link: BleState; desk: string; url: string; queue: SignalState; busy?: string; error?: string };
export const usePadState = create<State>(() => ({ link: { state: 'disconnected' }, desk: 'disconnected', url: '', queue: emptySignals() }));

class PadRuntime {
  private desk?: PadDesk;
  private generation = 0;
  private running = false;
  private ble = new PadBle({ state: link => usePadState.setState({ link }), record: () => {} });
  private event = (event: unknown) => { usePadState.setState(s => ({ queue: reduceSignals(s.queue, event) })); };
  async start() {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;
    try { const settings = await readSettings(); if (settings && generation === this.generation) this.connect(settings); }
    catch { usePadState.setState({ error: 'Setup required: save the desk URL and pad token again' }); }
  }
  async save(settings: PadSettings) {
    try {
      const checked = validateSettings(settings);
      await saveSettings(checked);
      this.generation++;
      this.connect(checked);
    } catch (error) { this.error(error); }
  }
  private connect(settings: PadSettings) {
    this.desk?.close();
    usePadState.setState({ url: settings.url, queue: emptySignals(), error: undefined });
    this.desk = new PadDesk(settings, this.event, desk => usePadState.setState({ desk }));
    this.desk.connect();
  }
  async forget() {
    this.generation++; this.desk?.close(); this.desk = undefined;
    usePadState.setState({ url: '', queue: emptySignals(), error: undefined });
    try { await clearSettings(); } catch { this.error(new Error('Setup required: unlock SecureStore to forget the desk')); }
  }
  pair = () => this.ble.pair();
  disconnect = () => this.ble.stop();
  async answer(id: string, action: 'accept' | 'refuse') {
    const current = usePadState.getState();
    const signal = current.queue.signals[id];
    if (current.busy || !signal || !canAnswer(signal) || current.desk !== 'connected' || !this.desk) return;
    const desk = this.desk;
    usePadState.setState({ busy: id, error: undefined });
    try {
      const value = await desk.answer(id, action);
      if (this.desk !== desk) return;
      if (isSignal(value)) this.event({ type: 'signal', signal: value });
      const execution = ('execution' in value ? value.execution : undefined) as WalletRequest | undefined;
      if (execution?.ok === false) throw new Error(execution.error?.startsWith('Setup required:') ? execution.error : 'Desk execution failed; review the signal');
      if (execution?.handoff) {
        this.event({ type: 'wallet_request', id, ...execution });
        await this.sign(id, execution, desk);
      }
    } catch (error) { this.error(error); }
    finally { usePadState.setState({ busy: undefined }); }
  }
  async signPending(id: string) {
    const state = usePadState.getState(), request = state.queue.requests[id];
    if (!request || state.busy || !this.desk || state.desk !== 'connected') return;
    usePadState.setState({ busy: id, error: undefined });
    try { await this.sign(id, request, this.desk); } catch (error) { this.error(error); }
    finally { usePadState.setState({ busy: undefined }); }
  }
  private async sign(id: string, request: WalletRequest, desk: PadDesk) {
    const signal = usePadState.getState().queue.signals[id];
    if (!signal || signal.state !== 'accepted' || Date.now() >= signal.expiresAt) throw new Error('Signal is no longer awaiting a wallet signature');
    const signedTx = await signPadRequest(request, signal.proposal.routing?.best?.network);
    if (this.desk !== desk) throw new Error('Desk changed; signed transaction was not submitted');
    const value = await desk.post(`/signals/${encodeURIComponent(id)}/sign`, { signedTx });
    if (value.receipt) this.event({ type: 'receipt', receipt: value.receipt });
  }
  private error(error: unknown) { usePadState.setState({ error: error instanceof Error ? error.message : 'Setup required: reconnect the desk' }); }
  stop() { this.running = false; this.generation++; this.desk?.close(); this.desk = undefined; void this.ble.stop(); }
}
export const padRuntime = new PadRuntime();
