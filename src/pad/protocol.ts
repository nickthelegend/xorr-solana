import { Buffer } from 'buffer';

export const SERVICE = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
export const RX = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
export const TX = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';
export const MAX_LINE = 4096;
export type PadRecord = { v: 1 | 2; type: string; [field: string]: unknown };
const text = (v: unknown) => typeof v === 'string' && v.length > 0;
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown) => finite(v) && Number.isInteger(v) && Number(v) >= 0;
const bool = (v: unknown) => typeof v === 'boolean';

/** Reject unknown versions/types and incomplete records before they enter either transport. */
export function validateRecord(value: unknown): PadRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid pad record');
  const m = value as PadRecord;
  const h = (s: unknown, n = 32) => typeof s === 'string' && new RegExp(`^[0-9a-f]{${n*2}}$`).test(s);
  if(m.v === 2) {
    let valid = false;
    switch(m.type) {
      case 'hello': valid = typeof m.device === 'string' && /^[\w-]{1,64}$/.test(m.device) && typeof m.fw === 'string' && /^[23]\.\d+\.\d+$/.test(m.fw) && h(m.pk) && h(m.xpk) && h(m.nonce); break;
      case 'pair': valid = h(m.deskpk) && h(m.challenge) && h(m.nonce); break;
      case 'pair_proof': valid = h(m.signature,64); break;
      case 'attest_request': valid = h(m.clientKey) && h(m.challenge) && h(m.nonce); break;
      case 'attest_response': valid = m.certificate === undefined || (!!m.certificate && typeof m.certificate === 'object'); break;
      case 'encrypted': valid = integer(m.seq) && Number(m.seq)>0 && Number(m.seq)<=0xffffffff && integer(m.ack) && Number(m.ack)<=0xffffffff && typeof m.body === 'string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(m.body) && h(m.tag,16); break;
    }
    if (!valid) throw new Error('Unsupported or malformed pad v2 record');
    return m;
  }
  const valid = m.v === 1 && (() => {
    switch (m.type) {
      case 'hello': return text(m.device) && m.fw === '1.0.0' && Array.isArray(m.caps) && m.caps.every(text);
      case 'caps': return m.heartbeatMs === 5000 && m.maxLine === MAX_LINE && m.sampleRate === 16000;
      case 'ping': return m.id === undefined || text(m.id);
      case 'key': return text(m.id) && text(m.action) && m.edge === 'down' && (m.signalId === undefined || text(m.signalId));
      case 'knob': return text(m.id) && finite(m.sizeUsd) && Number(m.sizeUsd) > 0;
      case 'signal': return text(m.signalId) && m.state === 'awaiting' && ['market','side','venue','why'].every(k => text(m[k])) && finite(m.sizeUsd) && Number(m.sizeUsd) > 0 && integer(m.remainingMs) && bool(m.autoAccept);
      case 'signal_state': return text(m.signalId) && (['accept','refuse'].includes(String(m.state)) ? text(m.id) : ['awaiting','accepted','auto_accepted','refused','expired','signed','executed','failed'].includes(String(m.state)) && integer(m.remainingMs) && bool(m.autoAccept));
      case 'receipt': return ['signalId','signature','explorer'].every(k => text(m[k]));
      case 'status': return bool(m.armed) && ['usb','ble','wifi','tcp'].includes(String(m.link)) && ['venue','market','agent'].every(k => typeof m[k] === 'string') && bool(m.autoAccept);
      case 'result': return text(m.id) && bool(m.ok) && (m.error === undefined || typeof m.error === 'string');
      case 'keymap_state': return integer(m.revision) && bool(m.ok);
      case 'keymap': {
        if (!integer(m.revision) || !Array.isArray(m.keys) || m.keys.length !== 14) return false;
        const cells = new Set<string>(), fixed: Record<string, string> = {mic:'3,1',kill:'3,0',yes:'2,1',no:'2,0'};
        for (const key of m.keys) {
          if (!key || !integer(key.row) || !integer(key.col) || key.row > 3 || key.col > (key.row < 2 ? 2 : 3)) return false;
          const cell = `${key.row},${key.col}`;
          if (cells.has(cell) || !/^[A-Za-z0-9_.:-]{1,96}$/.test(key.action) || !/^[\x20-\x7e]{1,16}$/.test(key.label)) return false;
          if (fixed[key.action] !== undefined) { if (fixed[key.action] !== cell) return false; delete fixed[key.action]; }
          else if (['mic','kill','yes','no'].includes(key.action)) return false;
          cells.add(cell);
        }
        return Object.keys(fixed).length === 0;
      }
      case 'voice': case 'tts': {
        if (m.type === 'voice' && !text(m.id)) return false;
        if (!text(m.stream) || !integer(m.seq) || !bool(m.end) || m.sampleRate !== 16000 || typeof m.pcm !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(m.pcm)) return false;
        const bytes = Buffer.from(m.pcm, 'base64').length;
        return bytes <= 512 && bytes % 2 === 0 && (bytes > 0 || m.end === true);
      }
      default: return false;
    }
  })();
  if (!valid) throw new Error('Unsupported or malformed pad v1 record');
  return m;
}

export function encodeRecord(value: PadRecord): Uint8Array {
  validateRecord(value);
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  if (bytes.length > MAX_LINE) throw new Error('Pad record exceeds 4096 bytes');
  return bytes;
}

/** Split UTF-8 bytes, including multibyte characters, at the negotiated ATT payload. */
export function chunkBytes(bytes: Uint8Array, mtu?: number): Uint8Array[] {
  const width = mtu !== undefined && Number.isInteger(mtu) && mtu >= 23 ? Math.min(mtu, 517) - 3 : 20;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += width) chunks.push(bytes.slice(i, i + width));
  return chunks;
}

export class PadFramer {
  private pending: number[] = [];
  private dropping = false;
  reset() { this.pending = []; this.dropping = false; }
  feed(bytes: Uint8Array): { record: PadRecord; bytes: Uint8Array }[] {
    const records: { record: PadRecord; bytes: Uint8Array }[] = [];
    for (const byte of bytes) {
      if (this.dropping) { if (byte === 10) this.dropping = false; continue; }
      this.pending.push(byte);
      if (this.pending.length > MAX_LINE || (this.pending.length === MAX_LINE && byte !== 10)) {
        this.pending = []; this.dropping = byte !== 10;
        throw new Error('Pad receive buffer overflow');
      }
      if (byte !== 10) continue;
      const line = Buffer.from(this.pending); this.pending = [];
      if (line[0] !== 123) continue; // Firmware diagnostic text is not a protocol event.
      const value = line.toString('utf8');
      if (!Buffer.from(value, 'utf8').equals(line)) throw new Error('Invalid pad UTF-8');
      records.push({ record: validateRecord(JSON.parse(value)), bytes: line });
    }
    return records;
  }
}
