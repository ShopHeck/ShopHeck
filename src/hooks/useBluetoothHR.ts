import { useState, useRef, useCallback, useEffect } from 'react';

export type HRZone = 0 | 1 | 2 | 3 | 4 | 5;

export interface HRState {
  hr: number | null;
  zone: HRZone;
  connected: boolean;
  connecting: boolean;
  supported: boolean;
  deviceName: string | null;
}

export const ZONE_COLORS: Record<HRZone, string> = {
  0: '#6b7280',
  1: '#3b82f6',
  2: '#22c55e',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
};

export const ZONE_LABELS: Record<HRZone, string> = {
  0: '—',
  1: 'Zone 1',
  2: 'Zone 2',
  3: 'Zone 3',
  4: 'Zone 4',
  5: 'Zone 5',
};

// MEP per minute for each zone (MyZone standard)
export const ZONE_MEP_PER_MIN: Record<HRZone, number> = {
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 4,
};

export function getZone(hr: number, maxHR: number): HRZone {
  const pct = hr / maxHR;
  if (pct >= 0.90) return 5;
  if (pct >= 0.80) return 4;
  if (pct >= 0.70) return 3;
  if (pct >= 0.60) return 2;
  if (pct >= 0.50) return 1;
  return 0;
}

function parseHRMeasurement(value: DataView): number {
  const flags = value.getUint8(0);
  // bit 0: 0 = uint8 format, 1 = uint16 format
  return (flags & 0x1) ? value.getUint16(1, true) : value.getUint8(1);
}

export function useBluetoothHR(maxHR: number): HRState & {
  connect: () => Promise<void>;
  disconnect: () => void;
} {
  const [state, setState] = useState<HRState>({
    hr: null,
    zone: 0,
    connected: false,
    connecting: false,
    supported: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
    deviceName: null,
  });

  const deviceRef = useRef<BluetoothDevice | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  const handleNotification = useCallback((event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    if (!characteristic.value) return;
    const hr = parseHRMeasurement(characteristic.value);
    const zone = getZone(hr, maxHR);
    setState(s => ({ ...s, hr, zone }));
  }, [maxHR]);

  const disconnect = useCallback(() => {
    if (characteristicRef.current) {
      characteristicRef.current.removeEventListener('characteristicvaluechanged', handleNotification);
      characteristicRef.current.stopNotifications().catch(() => {});
      characteristicRef.current = null;
    }
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    deviceRef.current = null;
    setState(s => ({ ...s, hr: null, zone: 0, connected: false, connecting: false, deviceName: null }));
  }, [handleNotification]);

  const connect = useCallback(async () => {
    if (!state.supported) return;
    setState(s => ({ ...s, connecting: true }));
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
        optionalServices: ['heart_rate'],
      });
      deviceRef.current = device;

      device.addEventListener('gattserverdisconnected', () => {
        setState(s => ({ ...s, hr: null, zone: 0, connected: false, connecting: false }));
      });

      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      characteristicRef.current = characteristic;

      characteristic.addEventListener('characteristicvaluechanged', handleNotification);
      await characteristic.startNotifications();

      setState(s => ({
        ...s,
        connected: true,
        connecting: false,
        deviceName: device.name ?? 'HR Device',
      }));
    } catch (err) {
      // User cancelled or error
      setState(s => ({ ...s, connecting: false }));
    }
  }, [state.supported, handleNotification]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (characteristicRef.current) {
        characteristicRef.current.removeEventListener('characteristicvaluechanged', handleNotification);
        characteristicRef.current.stopNotifications().catch(() => {});
      }
      if (deviceRef.current?.gatt?.connected) {
        deviceRef.current.gatt.disconnect();
      }
    };
  }, [handleNotification]);

  return { ...state, connect, disconnect };
}
