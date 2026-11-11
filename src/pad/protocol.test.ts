import { describe, expect, it } from 'vitest';
import { Buffer } from 'buffer';
import { chunkBytes, encodeRecord, MAX_LINE, PadFramer, validateRecord } from './protocol';
const hello = { v: 1 as const, type: 'hello', device: 'unit-device', fw: '1.0.0', caps: ['keys','voice','tts','signals','keymap'] };

describe('v1 NDJSON byte framing', () => {
  it('never emits partial records, including a split multibyte character', () => {
    const bytes = encodeRecord({ v: 1, type: 'result', id: 'unit-event', ok: false, error: 'Setup required: café 🎛' });
    for (let split = 1; split < bytes.length; split++) {
      const framer = new PadFramer();
      expect(framer.feed(bytes.slice(0, split))).toEqual([]);
      const records = framer.feed(bytes.slice(split));
      expect(records).toHaveLength(1);
      expect(Buffer.from(records[0]!.bytes).equals(Buffer.from(bytes))).toBe(true);
      expect(records[0]!.record.error).toBe('Setup required: café 🎛');
    }
  });
  it('tolerates CRLF and ignores boot diagnostics without changing relay bytes', () => {
    const bytes = Buffer.from('Boot ready\r\n' + JSON.stringify(hello) + '\r\n');
    const records = new PadFramer().feed(bytes);
    expect(records.map(r => r.record)).toEqual([hello]);
    expect(Buffer.from(records[0]!.bytes).toString()).toBe(JSON.stringify(hello) + '\r\n');
  });
  it('parses coalesced records and escaped JSON newlines', () => {
    const first = encodeRecord({ v: 1, type: 'result', id: 'unit-event', ok: false, error: 'first\nsecond' });
    const records = new PadFramer().feed(Buffer.concat([first, encodeRecord(hello)]));
    expect(records).toHaveLength(2);
    expect(records[0]!.record.error).toBe('first\nsecond');
  });
  it.each(['{"v":2,"type":"ping"}\n','{"v":1,"type":"unknown"}\n','{broken}\n','{"v":1,"type":"key","id":"x"}\n'])('refuses invalid input %s', line => {
    expect(() => new PadFramer().feed(Buffer.from(line))).toThrow();
  });
  it('accepts exactly 4096 bytes including LF and refuses overflow', () => {
    const plain = encodeRecord({ v: 1, type: 'ping', padding: '' });
    const exact = encodeRecord({ v: 1, type: 'ping', padding: 'a'.repeat(MAX_LINE - plain.length) });
    expect(exact.length).toBe(MAX_LINE);
    expect(new PadFramer().feed(exact)).toHaveLength(1);
    expect(() => encodeRecord({ v: 1, type: 'ping', padding: 'a'.repeat(MAX_LINE) })).toThrow('4096');
    const framer = new PadFramer();
    expect(() => framer.feed(Buffer.alloc(MAX_LINE, 123))).toThrow('overflow');
    expect(framer.feed(Buffer.concat([Buffer.from('discarded\n'), encodeRecord(hello)]))).toHaveLength(1);
  });
  it('resets partial input at a link boundary', () => {
    const framer = new PadFramer(); framer.feed(Buffer.from('{"v":1')); framer.reset();
    expect(framer.feed(encodeRecord(hello))[0]!.record).toEqual(hello);
  });
  it('refuses invalid UTF-8 instead of replacing bytes in the relay', () => {
    const bytes = Buffer.concat([Buffer.from('{"v":1,"type":"ping","extra":"'), Buffer.from([255]), Buffer.from('"}\n')]);
    expect(() => new PadFramer().feed(bytes)).toThrow('UTF-8');
  });
  it.each([undefined, 0, 22, 23, 24, 100, 247, 517])('chunks at ATT MTU %s and reassembles exactly', mtu => {
    const bytes = encodeRecord({ v: 1, type: 'result', id: 'unit', ok: false, error: '🎛'.repeat(130) });
    const chunks = chunkBytes(bytes, mtu);
    const width = mtu && mtu >= 23 ? mtu - 3 : 20;
    expect(chunks.every(c => c.length <= width)).toBe(true);
    expect(Buffer.concat(chunks.map(c => Buffer.from(c))).equals(Buffer.from(bytes))).toBe(true);
    const framer = new PadFramer();
    expect(chunks.flatMap(c => framer.feed(c))).toHaveLength(1);
  });
});

describe('v1 record constraints', () => {
  it('protects all 14 cells and fixed controls', () => {
    const cells = [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2],[2,3],[3,0],[3,1],[3,2],[3,3]];
    const fixed: Record<string,string> = { '2,0':'no', '2,1':'yes', '3,0':'kill', '3,1':'mic' };
    const keys = cells.map(([row,col], i) => ({ row, col, action: fixed[`${row},${col}`] ?? `action${i}`, label: 'KEY' }));
    expect(validateRecord({ v:1, type:'keymap', revision:0, keys })).toBeTruthy();
    expect(() => validateRecord({ v:1, type:'keymap', revision:0, keys: keys.slice(1) })).toThrow();
    expect(() => validateRecord({ v:1, type:'keymap', revision:0, keys: keys.map(k => k.action === 'mic' ? { ...k, action:'other' } : k) })).toThrow();
    expect(() => validateRecord({ v:1, type:'keymap', revision:0, keys: keys.map((k,i) => i === 0 ? { ...k, label:'😃' } : k) })).toThrow();
  });
  it('bounds PCM, enforces whole samples and permits an empty final chunk', () => {
    const tts = { v:1, type:'tts', stream:'unit', seq:0, sampleRate:16000, end:false };
    expect(validateRecord({ ...tts, pcm:Buffer.alloc(512).toString('base64') })).toBeTruthy();
    for (const pcm of [Buffer.alloc(514).toString('base64'),Buffer.alloc(3).toString('base64'),'invalid base64','']) expect(() => validateRecord({ ...tts, pcm })).toThrow();
    expect(validateRecord({ ...tts, end:true, pcm:'' })).toBeTruthy();
  });
});
