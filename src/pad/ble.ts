import type { PadRecord } from './protocol';
export type BleState = { state: 'disconnected' | 'scanning' | 'connecting' | 'connected'; firmware?: string; device?: string; error?: string };
export type BleCallbacks = { state: (state: BleState) => void; record: (record: PadRecord, bytes: Uint8Array) => void };
export class PadBle {
  constructor(private callbacks: BleCallbacks) {}
  async pair(): Promise<void> { this.callbacks.state({ state: 'disconnected', error: 'Setup required: a physical phone with a development build for Bluetooth' }); }
  async write(_bytes: Uint8Array): Promise<void> { throw new Error('Setup required: a Bluetooth development build'); }
  async stop(): Promise<void> { this.callbacks.state({ state: 'disconnected' }); }
}
