import { beforeAll, describe, expect, it } from 'vitest';
import { normalizeDeskUrl } from './settingsModel';
import { encodeRecord, PadFramer } from './protocol';
import { Buffer } from 'buffer';
const base = normalizeDeskUrl(process.env.XORRPAD_DESK_URL ?? 'http://127.0.0.1:8720');
const token = process.env.XORRPAD_PAD_TOKEN;
let reachable = false;
describe('live xorrpad desk (read only; no proposals or transactions)', () => {
  beforeAll(async () => {
    try {
      const response = await fetch(`${base}/signals`, { headers:token ? {'x-pad-token':token} : {}, signal:AbortSignal.timeout(3000) });
      reachable = response.ok;
      if (!response.ok) console.info(`[pad live] skipped: desk /signals returned HTTP ${response.status}; Setup required: XORRPAD_PAD_TOKEN for the running desk`);
    } catch { console.info('[pad live] skipped: no reachable xorrpad desk at the configured URL (default port 8720); run npm run backend in xorrpad/desk'); }
  });
  it('reads the real authenticated queue', async context => {
    if (!reachable) { context.skip(); return; }
    const response = await fetch(`${base}/signals`, {headers:token ? {'x-pad-token':token} : {},signal:AbortSignal.timeout(5000)});
    expect(response.ok).toBe(true); expect(Array.isArray((await response.json()).signals)).toBe(true);
  });
  it('receives a real /events WebSocket snapshot', async context => {
    if (!reachable || !token) { if (!token && reachable) console.info('[pad live] WebSocket skipped: Setup required: XORRPAD_PAD_TOKEN'); context.skip(); return; }
    const snapshot = await new Promise<Record<string,unknown>>((resolve,reject) => {
      const ws = new WebSocket(base.replace(/^http/,'ws')+'/events',['xorrpad',`pad-token.${token}`]);
      const timer = setTimeout(() => {ws.close();reject(new Error('Desk events snapshot timeout'));},5000);
      ws.onmessage = ({data}) => {clearTimeout(timer);ws.close();try {resolve(JSON.parse(String(data)));} catch {reject(new Error('Invalid events JSON'));}};
      ws.onerror = () => {clearTimeout(timer);ws.close();reject(new Error('Authenticated desk events connection failed'));};
    });
    expect(snapshot.type).toBe('snapshot'); expect(Array.isArray(snapshot.signals)).toBe(true);
  });
  it('exchanges a read-only v1 hello with the real /padlink relay', async context => {
    if (!reachable || !token) { if (!token && reachable) console.info('[pad live] relay skipped: Setup required: XORRPAD_PAD_TOKEN'); context.skip(); return; }
    const caps = await new Promise<Record<string,unknown>>((resolve,reject) => {
      const device = `phone-readonly-probe-${Date.now()}`;
      const ws = new WebSocket(base.replace(/^http/,'ws')+`/padlink?device=${device}`,['xorrpad',`pad-token.${token}`]);
      const framer = new PadFramer();
      const timer = setTimeout(() => {ws.close();reject(new Error('Desk padlink hello timeout'));},5000);
      ws.onopen = () => ws.send(Buffer.from(encodeRecord({v:1,type:'hello',device,fw:'1.0.0',caps:['keys','voice','tts','signals','keymap']})).toString('utf8'));
      ws.onmessage = ({data}) => {
        try { for (const line of framer.feed(Buffer.from(String(data)))) if (line.record.type === 'caps') { clearTimeout(timer);ws.close();resolve(line.record); } }
        catch {clearTimeout(timer);ws.close();reject(new Error('Invalid padlink v1 response'));}
      };
      ws.onerror = () => {clearTimeout(timer);ws.close();reject(new Error('Authenticated desk padlink connection failed'));};
    });
    expect(caps.v).toBe(1); expect(caps.maxLine).toBe(4096);
  });
});
