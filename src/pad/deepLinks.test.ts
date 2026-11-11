import { describe, expect, it } from 'vitest';
import { padDeepLink, transactionRequestUrl } from './signals';
import { normalizeDeskUrl, validateSettings } from './settingsModel';
import { ACCEPT, REFUSE, noticeFor, padNotificationAction } from './notificationModel';
describe('Pad deep links and Solana Pay transaction requests', () => {
  it('names only a validated signal, with actions bound to that id', () => {
    expect(padDeepLink('unit-id')).toBe('/pad?signal=unit-id');
    for (const id of ['../trade','a&action=accept','','a/b','__proto__/x','__proto__','constructor']) expect(() => padDeepLink(id)).toThrow();
    expect(padNotificationAction({kind:'pad-signal',signalId:'unit-id'},ACCEPT)).toEqual({id:'unit-id',route:'/pad?signal=unit-id',action:'accept'});
    expect(padNotificationAction({kind:'pad-signal',signalId:'unit-id'},REFUSE)?.action).toBe('refuse');
    expect(padNotificationAction({kind:'other',signalId:'unit-id'},ACCEPT)).toBeNull();
    expect(padNotificationAction({kind:'pad-signal',signalId:'unit-id'},'unknown')?.action).toBeUndefined();
  });
  it('decodes only an HTTPS transaction capability URL', () => {
    const request = `https://desk.example/wallet/request/${'a'.repeat(48)}`;
    expect(transactionRequestUrl(`solana:${encodeURIComponent(request)}`).href).toBe(request);
    for (const url of ['http://desk.example/wallet/request/'+'a'.repeat(48),'https://user:password@desk.example/wallet/request/'+'a'.repeat(48),request+'?token=x',request+'#x','https://desk.example/signals/x/accept','javascript:alert(1)']) expect(() => transactionRequestUrl('solana:'+encodeURIComponent(url))).toThrow();
    expect(() => transactionRequestUrl('solana:%zz')).toThrow();
  });
  it('accepts HTTPS MagicDNS and loopback only, never tokens in URLs', () => {
    expect(normalizeDeskUrl('desk.tailnet.ts.net')).toBe('https://desk.tailnet.ts.net');
    expect(normalizeDeskUrl('http://127.0.0.1:8720')).toBe('http://127.0.0.1:8720');
    for (const url of ['http://public.example','https://desk.example?token=x','https://user:password@desk.example','https://desk.example/path']) expect(() => normalizeDeskUrl(url)).toThrow();
    expect(() => validateSettings({url:'https://desk.example',token:'invalid token'})).toThrow();
  });
  it('never posts an auto-accepted receipt notification from an acknowledgment', () => {
    const signal = {id:'unit',state:'accepted' as const,automatic:true,expiresAt:Date.now()+10000,proposal:{signal:{side:'BUY'},verdict:{sizeUsd:1,why:[]}}};
    expect(noticeFor(signal)).toBeNull();
    expect(noticeFor({...signal,state:'executed'})).toBeNull();
    const signature = '1'.repeat(64), receipt = {signalId:'unit',signature,explorer:`https://explorer.solana.com/tx/${signature}?cluster=devnet`};
    expect(noticeFor({...signal,state:'executed',receipt})?.data.receipt).toBe(receipt.explorer);
    expect(noticeFor({...signal,state:'executed',receipt:{...receipt,explorer:'https://untrusted.example'}})).toBeNull();
  });
});
