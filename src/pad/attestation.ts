import { ed25519 } from '@noble/curves/ed25519';
import { FACTORY_ROOTS } from './attestationRoots';

export type Certificate = { v: 1; deviceKey: string; serial: string; model: 'xorrpad-esp32s3'; signature: string };
export type AttestationState = { verified: boolean; label: string; reason: string; serial?: string };
export type AttestationHello = { device: string; pk: string; xpk: string; nonce: string };
export type AttestationRequest = { v: 2; type: 'attest_request'; clientKey: string; challenge: string; nonce: string };
export type ExpectedAttestation = { device: string; deviceKey: string; context: string };
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const hex = (s: unknown, n: number): s is string => typeof s === 'string' && new RegExp(`^[0-9a-f]{${n * 2}}$`).test(s);
const bytes = (s: string) => Uint8Array.from(s.match(/../g)!, x => parseInt(x, 16));
const utf8 = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0)); // Contract is strictly ASCII.
export const unverified = (reason = 'Connect a pad to verify its factory certificate'): AttestationState => ({ verified: false, label: 'Unverified device', reason });
export function certificateText(value: unknown): string {
  if (!isObject(value) || Object.keys(value).sort().join(',') !== 'deviceKey,model,serial,signature,v' ||
      value.v !== 1 || value.model !== 'xorrpad-esp32s3' || typeof value.serial !== 'string' ||
      !/^esp32-[0-9a-f]{12}$/.test(value.serial) || !hex(value.deviceKey, 32) || !hex(value.signature, 64)) throw Error('Invalid device certificate');
  return `xorrpad-cert-v3\n1\n${value.deviceKey}\n${value.serial}\n${value.model}`;
}
export function attestationText(c: unknown, context: string): string {
  const cert = certificateText(c), certificate = c as Certificate;
  const parts = typeof context === 'string' ? context.split('|') : [];
  if (parts.length !== 6 || parts[0] !== 'xorrpad-v2' || parts[1] !== certificate.serial || !parts.slice(2).every(x => hex(x, 32))) throw Error('Invalid attestation challenge');
  return `xorrpad-attest-v3\n${cert}\n${certificate.signature}\n${context}`;
}
export function verifyAttestation(proof: unknown, expected: ExpectedAttestation, roots: readonly string[] = FACTORY_ROOTS): AttestationState {
  try {
    if (!isObject(proof)) throw Error('Device certificate or challenge proof missing');
    const text = attestationText(proof.certificate, expected.context), c = proof.certificate as Certificate;
    if (c.serial !== expected.device || c.deviceKey !== expected.deviceKey || !hex(proof.signature, 64)) throw Error('Device certificate does not match this connection');
    const trusted = roots.some(root => hex(root, 32) && ed25519.verify(bytes(c.signature), utf8(certificateText(c)), bytes(root), { zip215: false }));
    if (!trusted) throw Error(roots.length ? 'Factory certificate verification failed' : 'Setup required: trusted factory public key');
    if (!ed25519.verify(bytes(proof.signature), utf8(text), bytes(expected.deviceKey), { zip215: false })) throw Error('Device challenge verification failed');
    return { verified: true, label: `Genuine xorrpad #${c.serial}`, serial: c.serial, reason: 'Factory certificate and fresh phone challenge verified' };
  } catch (error) { return unverified(error instanceof Error ? error.message : 'Attestation verification failed'); }
}
/** One proof per fresh phone challenge, bound to the current BLE hello. No desk-supplied verdicts. */
export class PhoneAttestation {
  state = unverified();
  private hello?: string;
  private pending?: { expected: ExpectedAttestation; deadline: number };
  constructor(private random: () => Uint8Array, private roots: readonly string[] = FACTORY_ROOTS, private now: () => number = Date.now) {}
  reset(reason?: string) { this.hello = undefined; this.pending = undefined; return this.state = unverified(reason); }
  begin(hello: AttestationHello): AttestationRequest | undefined {
    if (!/^esp32-[0-9a-f]{12}$/.test(hello.device) || ![hello.pk, hello.xpk, hello.nonce].every(v => hex(v, 32))) { this.reset('Invalid pad identity'); return; }
    const identity = `${hello.device}|${hello.pk}|${hello.xpk}|${hello.nonce}`;
    if (this.hello === identity) return;
    this.reset();
    const randomHex = () => { const b = this.random(); if (b.length !== 32) throw Error('Secure random challenge unavailable'); return Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); };
    try {
      const clientKey = randomHex(), challenge = randomHex();
      this.hello = identity;
      this.pending = { expected: { device: hello.device, deviceKey: hello.pk, context: `xorrpad-v2|${hello.device}|${hello.xpk}|${clientKey}|${challenge}|${hello.nonce}` }, deadline: this.now() + 10000 };
      this.state = unverified('Checking factory certificate and fresh phone challenge');
      return { v: 2, type: 'attest_request', clientKey, challenge, nonce: hello.nonce };
    } catch { this.reset('Setup required: secure random challenge'); }
  }
  finish(proof: unknown): AttestationState {
    const pending = this.pending; this.pending = undefined;
    if (!pending || this.now() >= pending.deadline) return this.state = unverified('Device challenge missing, expired or already consumed');
    return this.state = verifyAttestation(proof, pending.expected, this.roots);
  }
  expire() { if (this.pending && this.now() >= this.pending.deadline) { this.pending = undefined; this.state = unverified('No fresh device proof; reconnect the pad'); } return this.state; }
}
