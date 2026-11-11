import { useEffect, useState } from 'react';
import { PadBle, type BleState } from './ble';

export function usePad() {
  const [link, setLink] = useState<BleState>({ state: 'disconnected' });
  const [ble] = useState(() => new PadBle({ state: setLink, record: () => {} }));
  useEffect(() => () => { void ble.stop(); }, [ble]);
  return { link, pair: () => ble.pair(), disconnect: () => ble.stop() };
}
