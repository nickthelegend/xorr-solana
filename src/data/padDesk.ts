import type { PadSettings } from '../pad/settings';
import { validateSettings } from '../pad/settings';
import { validSignalId } from '../pad/signals';

export class PadDesk {
  private settings: PadSettings;
  private socket?: WebSocket;
  private retry?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private attempt = 0;
  constructor(settings: PadSettings, private event: (event: unknown) => void, private state: (state: string) => void) { this.settings = validateSettings(settings); }
  connect() {
    this.stopped = false;
    this.state('connecting');
    const ws = this.socket = this.openSocket('/events');
    ws.onopen = () => { if (this.socket !== ws) return; this.attempt = 0; this.state('connected'); };
    ws.onmessage = ({ data }) => {
      if (this.socket !== ws || typeof data !== 'string' || data.length > 1048576) return;
      try { this.event(JSON.parse(data)); } catch { this.state('Setup required: compatible desk events'); }
    };
    ws.onerror = () => { this.state('Setup required: reachable desk URL and valid pad token'); ws.close(); };
    ws.onclose = () => {
      if (this.socket !== ws || this.stopped) return;
      this.state('Setup required: reconnecting to desk; check URL and token');
      this.retry = setTimeout(() => this.connect(), Math.min(30000, 1000 * 2 ** Math.min(this.attempt++, 5)));
    };
  }
  openSocket(path: string): WebSocket {
    return new WebSocket(this.settings.url.replace(/^http/, 'ws') + path, ['xorrpad', `pad-token.${this.settings.token}`]);
  }
  async post(path: string, body: unknown = {}): Promise<Record<string, unknown>> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(this.settings.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pad-token': this.settings.token }, body: JSON.stringify(body), signal: controller.signal });
      const value = await response.json();
      if (!response.ok || value.ok === false || value.error) throw new Error(typeof value.error === 'string' && value.error.startsWith('Setup required:') ? value.error : 'Desk refused the action; refresh the signal');
      return value;
    } catch (error) {
      if (error instanceof Error && (error.message.startsWith('Setup required:') || error.message.startsWith('Desk refused'))) throw error;
      throw new Error('Setup required: reachable desk; action was not retried');
    } finally { clearTimeout(timer); }
  }
  answer(id: string, action: 'accept' | 'refuse') {
    if (!validSignalId(id)) throw new Error('Invalid pad signal id');
    return this.post(`/signals/${encodeURIComponent(id)}/${action}`);
  }
  close() { this.stopped = true; clearTimeout(this.retry); const ws = this.socket; this.socket = undefined; ws?.close(); this.state('disconnected'); }
}
