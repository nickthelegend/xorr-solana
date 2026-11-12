/** Cross-check public certificates/proofs with the actual firmware native verifier. */
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PhoneAttestation, attestationText, certificateText, verifyAttestation, type Certificate } from './attestation';
const driver=path.resolve(import.meta.dirname,'../../../xorrpad-fw2/firmware/build/attestation-driver');
describe.skipIf(!existsSync(driver))('phone and production native attestation parity (run firmware/test/run.sh first)',()=>{
  it.each(['genuine','foreign-root','changed-challenge','changed-device'] as const)('agrees for %s',mode=>{
    const factory=generateKeyPairSync('ed25519'),device=generateKeyPairSync('ed25519');
    const pub=(key:typeof factory.publicKey)=>key.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
    const hello={device:'esp32-123456abcdef',pk:pub(device.publicKey),xpk:randomBytes(32).toString('hex'),nonce:randomBytes(32).toString('hex')};
    const c:Certificate={v:1,deviceKey:hello.pk,serial:hello.device,model:'xorrpad-esp32s3',signature:'0'.repeat(128)};
    c.signature=sign(null,Buffer.from(certificateText(c)),factory.privateKey).toString('hex');
    const controller=new PhoneAttestation(()=>randomBytes(32),[pub(factory.publicKey)]),request=controller.begin(hello)!;
    const expected={device:hello.device,deviceKey:hello.pk,context:`xorrpad-v2|${hello.device}|${hello.xpk}|${request.clientKey}|${request.challenge}|${request.nonce}`};
    const proof={certificate:c,signature:sign(null,Buffer.from(attestationText(c,expected.context)),device.privateKey).toString('hex')};
    let root=pub(factory.publicKey);
    if(mode==='foreign-root')root=pub(generateKeyPairSync('ed25519').publicKey);
    if(mode==='changed-challenge')expected.context=expected.context.replace(request.challenge,randomBytes(32).toString('hex'));
    if(mode==='changed-device')expected.device='esp32-000000000000';
    const result=spawnSync(driver,[],{input:JSON.stringify({...proof,...expected,root})+'\n',encoding:'utf8'});
    expect(result.status).toBe(0);expect(result.stdout.trim()).toBe(mode==='genuine'?'verified':'unverified');
    expect(verifyAttestation(proof,expected,[root]).verified).toBe(mode==='genuine');
  });
});
