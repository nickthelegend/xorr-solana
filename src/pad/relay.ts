import { Buffer } from 'buffer';
import { PadFramer, type PadRecord } from './protocol';

type RelayDesk = { openSocket: (path: string) => WebSocket };
/** The relay keeps only a hello handshake. Trade input is never buffered for reconnection. */
export class PadRelay {
  private socket?: WebSocket;
  private device?: string;
  private desk?: RelayDesk;
  private framer = new PadFramer();
  private lastResponse = 0;
  private heartbeat?: ReturnType<typeof setInterval>;
  constructor(private writeBle: (bytes: Uint8Array) => Promise<void>, private state: (state: string) => void) {}
  fromPad(desk: RelayDesk | undefined, record: PadRecord, bytes: Uint8Array) {
    if(record.type==='attest_request'||record.type==='attest_response')return;
    if (!desk) { this.close(); this.state('Setup required: connect the desk to relay'); return; }
    if (this.desk !== desk || (record.type === 'hello' && this.device !== record.device)) this.close();
    if (!this.socket) {
      if (record.type !== 'hello') return;
      this.device = String(record.device); this.desk = desk;
      this.state('connecting');
      const ws = this.socket = desk.openSocket(`/padlink?device=${encodeURIComponent(this.device)}`);
      ws.onopen = () => {
        if (this.socket !== ws) return;
        this.lastResponse = Date.now();
        ws.send(Buffer.from(bytes).toString('utf8')); // Handshake only; no stored trade input.
        this.heartbeat = setInterval(() => { if (Date.now() - this.lastResponse > 15000) this.fail('Setup required: desk relay timed out'); }, 1000);
      };
      ws.onmessage = ({ data }) => {
        if (this.socket !== ws) return;
        try {
          if (typeof data !== 'string' || Buffer.byteLength(data, 'utf8') > 65536) throw new Error();
          for (const line of this.framer.feed(Buffer.from(data, 'utf8'))) {
            if(line.record.type==='attest_request'||line.record.type==='attest_response')throw new Error('Phone attestation is BLE-only');
            this.lastResponse = Date.now();
            this.state('connected');
            void this.writeBle(line.bytes).catch(() => this.fail('Setup required: reconnect the pad to relay'));
          }
        } catch { this.fail('Setup required: compatible desk relay'); }
      };
      ws.onerror = () => { if (this.socket === ws) this.fail('Setup required: reachable desk /padlink WebSocket'); };
      ws.onclose = () => { if (this.socket === ws) this.fail('Setup required: relay disconnected; waiting for pad hello'); };
      return;
    }
    if (this.socket.readyState !== 1) return; // Drop live input while connecting. Never replay it.
    if (this.socket.bufferedAmount > 65536) { this.fail('Setup required: desk relay backpressure; reconnect'); return; }
    try { this.socket.send(Buffer.from(bytes).toString('utf8')); }
    catch { this.fail('Setup required: reconnect the desk relay'); }
  }
  private fail(message: string) { this.close(); this.state(message); }
  close() {
    const ws = this.socket; this.socket = undefined; this.desk = undefined; this.device = undefined;
    clearInterval(this.heartbeat); this.heartbeat = undefined; this.framer.reset();
    ws?.close(); this.state('disconnected');
  }
}
