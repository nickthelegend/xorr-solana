import { PermissionsAndroid, Platform } from 'react-native';
import { Buffer } from 'buffer';
import type { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { chunkBytes, encodeRecord, PadFramer, RX, SERVICE, TX } from './protocol';
import type { BleCallbacks } from './ble';

export class PadBle {
  private manager?: BleManager;
  private device?: Device;
  private monitor?: Subscription;
  private disconnect?: Subscription;
  private timer?: ReturnType<typeof setTimeout>;
  private idle?: ReturnType<typeof setTimeout>;
  private framer = new PadFramer();
  private tail = Promise.resolve();
  private queued = 0;
  private generation = 0;
  constructor(private callbacks: BleCallbacks) {}
  async pair(): Promise<void> {
    await this.stop();
    const generation = this.generation;
    try {
      if (Platform.OS === 'android') {
        const permissions = Number(Platform.Version) >= 31
          ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
          : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
        const result = await PermissionsAndroid.requestMultiple(permissions);
        if (Object.values(result).some(v => v !== PermissionsAndroid.RESULTS.GRANTED)) throw new Error('permission');
      }
      const { BleManager: Manager } = await import('react-native-ble-plx');
      if (generation !== this.generation) return;
      const manager = this.manager = new Manager();
      if (await manager.state() !== 'PoweredOn') throw new Error('Bluetooth');
      this.callbacks.state({ state: 'scanning' });
      this.timer = setTimeout(() => { void this.fail('Setup required: a nearby USB-powered xorrpad advertising Bluetooth'); }, 15000);
      manager.startDeviceScan([SERVICE], null, (error, found) => {
        if (generation !== this.generation) return;
        if (error) { void this.fail('Setup required: Bluetooth permission and a powered-on radio'); return; }
        if (!found) return;
        manager.stopDeviceScan(); clearTimeout(this.timer);
        this.callbacks.state({ state: 'connecting' });
        void this.connect(found, generation).catch(() => this.fail('Setup required: reconnect the USB-powered pad'));
      });
    } catch { await this.fail('Setup required: Bluetooth permission, Bluetooth enabled, and a development build'); }
  }
  private async connect(found: Device, generation: number) {
    let device = await found.connect({ requestMTU: 247, timeout: 10000 });
    if (generation !== this.generation) { await device.cancelConnection(); return; }
    this.device = device;
    device = await device.discoverAllServicesAndCharacteristics();
    if (generation !== this.generation) return;
    this.device = device;
    this.disconnect = device.onDisconnected(() => { void this.fail('Setup required: reconnect the pad'); });
    this.monitor = device.monitorCharacteristicForService(SERVICE, TX, (error, characteristic) => {
      if (generation !== this.generation) return;
      if (error) { void this.fail('Setup required: reconnect the pad'); return; }
      if (!characteristic?.value) return;
      clearTimeout(this.idle);
      this.idle = setTimeout(() => { void this.fail('Setup required: pad link timed out; reconnect'); }, 15000);
      try {
        for (const { record, bytes } of this.framer.feed(Buffer.from(characteristic.value, 'base64'))) {
          if (record.type === 'hello') this.callbacks.state({ state: 'connected', firmware: String(record.fw), device: String(record.device) });
          this.callbacks.record(record, bytes);
        }
      } catch { void this.fail('Setup required: reconnect after an invalid pad record'); }
    });
    this.callbacks.state({ state: 'connected' });
    this.idle = setTimeout(() => { void this.fail('Setup required: pad hello timed out; reconnect'); }, 15000);
    // Subscribe before writing. The pad sends its own hello every five seconds.
    await this.write(encodeRecord({ v: 1, type: 'ping' }));
  }
  write(bytes: Uint8Array): Promise<void> {
    const device = this.device, generation = this.generation;
    if (!device) return Promise.reject(new Error('Setup required: connect the pad'));
    if (this.queued + bytes.length > 65536) return Promise.reject(new Error('Pad write buffer overflow'));
    this.queued += bytes.length;
    const operation = this.tail.then(async () => {
      for (const chunk of chunkBytes(bytes, device.mtu)) {
        if (generation !== this.generation) throw new Error('Pad disconnected; input was not replayed');
        await device.writeCharacteristicWithResponseForService(SERVICE, RX, Buffer.from(chunk).toString('base64'));
      }
    }).finally(() => { this.queued -= bytes.length; });
    this.tail = operation.catch(() => undefined);
    return operation;
  }
  private async fail(error: string) { await this.stop(); this.callbacks.state({ state: 'disconnected', error }); }
  async stop(): Promise<void> {
    this.generation++; clearTimeout(this.timer); clearTimeout(this.idle);
    this.framer.reset(); this.monitor?.remove(); this.disconnect?.remove();
    this.monitor = undefined; this.disconnect = undefined;
    const device = this.device, manager = this.manager;
    this.device = undefined; this.manager = undefined;
    manager?.stopDeviceScan();
    await device?.cancelConnection().catch(() => undefined);
    await manager?.destroy();
    this.callbacks.state({ state: 'disconnected' });
  }
}
