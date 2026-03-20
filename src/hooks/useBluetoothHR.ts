import { useState, useRef, useCallback, useEffect } from 'react';

export type HRZone = 0 | 1 | 2 | 3 | 4 | 5;

export interface HRState {
  hr: number | null;
  zone: HRZone;
  hrv: number | null;   // real-time RMSSD in ms (from RR intervals)
  connected: boolean;
  connecting: boolean;
  supported: boolean;
  deviceName: string | null;
  connectError: string | null;
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

/**
 * Parses the Bluetooth Heart Rate Measurement characteristic (0x2A37).
 *
 * Byte layout:
 *   Byte 0   – flags
 *              bit 0: HR value format  (0 = uint8, 1 = uint16)
 *              bit 3: energy expended present
 *              bit 4: RR interval(s) present
 *   Byte 1 [+2]: HR value
 *   [2 bytes] : energy expended (if flag bit 3 set) – skipped
 *   [2 bytes each]: RR intervals in 1/1024 s units (if flag bit 4 set)
 */
interface HRMData {
  hr: number;
  rrMs: number[]; // RR intervals converted to milliseconds
}

function parseHRMeasurement(value: DataView): HRMData {
  const flags = value.getUint8(0);
  const uint16Format  = flags & 0x01;
  const energyPresent = (flags >> 3) & 0x01;
  const rrPresent     = (flags >> 4) & 0x01;

  let offset = 1;
  const hr = uint16Format ? value.getUint16(offset, true) : value.getUint8(offset);
  offset += uint16Format ? 2 : 1;

  if (energyPresent) offset += 2;

  const rrMs: number[] = [];
  if (rrPresent) {
    while (offset + 1 < value.byteLength) {
      // RR unit = 1/1024 second → multiply by 1000/1024 to get ms
      rrMs.push(Math.round(value.getUint16(offset, true) * (1000 / 1024)));
      offset += 2;
    }
  }

  return { hr, rrMs };
}

/** RMSSD — root mean square of successive differences between adjacent RR intervals. */
function computeRMSSD(rrBuffer: number[]): number | null {
  if (rrBuffer.length < 5) return null;
  let sumSq = 0;
  for (let i = 1; i < rrBuffer.length; i++) {
    const diff = rrBuffer[i] - rrBuffer[i - 1];
    sumSq += diff * diff;
  }
  return Math.round(Math.sqrt(sumSq / (rrBuffer.length - 1)));
}

const RR_BUFFER_SIZE = 64; // ~1 min at 60 bpm

export function useBluetoothHR(maxHR: number): HRState & {
  connect: () => Promise<void>;
  disconnect: () => void;
} {
  const [state, setState] = useState<HRState>({
    hr: null,
    zone: 0,
    hrv: null,
    connected: false,
    connecting: false,
    supported: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
    deviceName: null,
    connectError: null,
  });

  const deviceRef         = useRef<BluetoothDevice | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const rrBufferRef       = useRef<number[]>([]);

  const handleNotification = useCallback((event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    if (!characteristic.value) return;

    const { hr, rrMs } = parseHRMeasurement(characteristic.value);
    const zone = getZone(hr, maxHR);

    // Maintain a capped sliding buffer of RR intervals
    if (rrMs.length > 0) {
      rrBufferRef.current = [...rrBufferRef.current, ...rrMs].slice(-RR_BUFFER_SIZE);
    }

    const hrv = computeRMSSD(rrBufferRef.current);
    setState(s => ({ ...s, hr, zone, hrv }));
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
    rrBufferRef.current = [];
    setState(s => ({ ...s, hr: null, zone: 0, hrv: null, connected: false, connecting: false, deviceName: null, connectError: null }));
  }, [handleNotification]);

  const connect = useCallback(async () => {
    if (!state.supported) return;
    setState(s => ({ ...s, connecting: true, connectError: null }));
    try {
      const device = await navigator.bluetooth.requestDevice({
        // Multiple filters — device must match at least one.
        // MyZone MZ-3 / MZ-Switch advertise by name ("MYZ-…") not by service UUID,
        // so they won't appear without an explicit namePrefix filter.
        filters: [
          { services: ['heart_rate'] },   // Polar, Garmin, and any standard HR belt
          { namePrefix: 'MYZ' },          // MyZone MZ-3, MZ-Switch, BKFC edition
          { namePrefix: 'MYZONE' },       // MyZone-branded variants
        ],
        // Required so we can access heart_rate on name-filtered MyZone devices
        optionalServices: ['heart_rate'],
      });
      deviceRef.current = device;

      device.addEventListener('gattserverdisconnected', () => {
        rrBufferRef.current = [];
        setState(s => ({ ...s, hr: null, zone: 0, hrv: null, connected: false, connecting: false }));
      });

      const server     = await device.gatt!.connect();
      const service    = await server.getPrimaryService('heart_rate');
      const char       = await service.getCharacteristic('heart_rate_measurement');
      characteristicRef.current = char;

      char.addEventListener('characteristicvaluechanged', handleNotification);
      await char.startNotifications();

      setState(s => ({ ...s, connected: true, connecting: false, deviceName: device.name ?? 'HR Device' }));
    } catch (err) {
      const e = err as DOMException;
      // AbortError / NotFoundError = user cancelled the picker — no error message needed
      const cancelled = e.name === 'AbortError' || e.name === 'NotFoundError';
      setState(s => ({
        ...s,
        connecting: false,
        connectError: cancelled ? null : (e.message || 'Connection failed'),
      }));
    }
  }, [state.supported, handleNotification]);

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
