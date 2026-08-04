import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';

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

// ─── BLE UUIDs (full 128-bit form required by @capacitor-community/bluetooth-le) ──

const HR_SERVICE        = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_CHARACTERISTIC = '00002a37-0000-1000-8000-00805f9b34fb';

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

const isNative = Capacitor.isNativePlatform();

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
    // On native: always supported. On web: check for Web Bluetooth API.
    supported: isNative || (typeof navigator !== 'undefined' && 'bluetooth' in navigator),
    deviceName: null,
    connectError: null,
  });

  const rrBufferRef = useRef<number[]>([]);

  // Native refs
  const nativeDeviceIdRef = useRef<string | null>(null);

  // Web Bluetooth refs
  const webDeviceRef         = useRef<BluetoothDevice | null>(null);
  const webCharacteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  // ── Shared HR notification handler ──────────────────────────────────────
  const handleHRData = useCallback((value: DataView) => {
    const { hr, rrMs } = parseHRMeasurement(value);
    const zone = getZone(hr, maxHR);

    if (rrMs.length > 0) {
      rrBufferRef.current = [...rrBufferRef.current, ...rrMs].slice(-RR_BUFFER_SIZE);
    }

    const hrv = computeRMSSD(rrBufferRef.current);
    setState(s => ({ ...s, hr, zone, hrv }));
  }, [maxHR]);

  // The notification listeners are registered once at connect time, so they must
  // not close over `handleHRData` directly — that captures the maxHR from connect
  // time and keeps computing zones against it after the user edits their max HR.
  // Keep the latest handler in a ref and register STABLE listeners that read it,
  // so live maxHR changes apply without re-registering (which would tear down the
  // connection) and add/removeEventListener always reference the same function.
  const hrDataRef = useRef(handleHRData);
  useEffect(() => { hrDataRef.current = handleHRData; }, [handleHRData]);
  const webNotifyRef = useRef((event: Event) => {
    const char = event.target as BluetoothRemoteGATTCharacteristic;
    if (char.value) hrDataRef.current(char.value);
  });

  // ── Native connect (CoreBluetooth via Capacitor plugin) ─────────────────
  const connectNative = useCallback(async () => {
    await BleClient.initialize();

    // requestDevice opens the native iOS Bluetooth device picker.
    // We scan for the heart_rate service; CoreBluetooth on iOS is more
    // permissive than Web Bluetooth and will show MyZone devices even
    // when they don't include the service UUID in their advertisement
    // packets (provided the device has been paired with this iPhone before).
    const device = await BleClient.requestDevice({
      services: [HR_SERVICE],
      optionalServices: [],
    });

    nativeDeviceIdRef.current = device.deviceId;

    await BleClient.connect(device.deviceId, () => {
      // onDisconnect callback
      rrBufferRef.current = [];
      nativeDeviceIdRef.current = null;
      setState(s => ({ ...s, hr: null, zone: 0, hrv: null, connected: false, connecting: false }));
    });

    await BleClient.startNotifications(
      device.deviceId,
      HR_SERVICE,
      HR_CHARACTERISTIC,
      (value: DataView) => hrDataRef.current(value),
    );

    setState(s => ({
      ...s,
      connected: true,
      connecting: false,
      deviceName: device.name ?? 'HR Device',
    }));
  }, []);

  // ── Web Bluetooth connect ────────────────────────────────────────────────
  const connectWeb = useCallback(async () => {
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: ['heart_rate'] },
        { namePrefix: 'MYZ' },
        { namePrefix: 'MYZONE' },
      ],
      optionalServices: ['heart_rate'],
    });

    webDeviceRef.current = device;

    device.addEventListener('gattserverdisconnected', () => {
      rrBufferRef.current = [];
      setState(s => ({ ...s, hr: null, zone: 0, hrv: null, connected: false, connecting: false }));
    });

    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService('heart_rate');
    const char = await service.getCharacteristic('heart_rate_measurement');
    webCharacteristicRef.current = char;

    char.addEventListener('characteristicvaluechanged', webNotifyRef.current);
    await char.startNotifications();

    setState(s => ({
      ...s,
      connected: true,
      connecting: false,
      deviceName: device.name ?? 'HR Device',
    }));
  }, []);

  // ── Public connect ───────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!state.supported) return;
    setState(s => ({ ...s, connecting: true, connectError: null }));
    try {
      if (isNative) {
        await connectNative();
      } else {
        await connectWeb();
      }
    } catch (err) {
      const e = err as DOMException;
      const cancelled = e.name === 'AbortError' || e.name === 'NotFoundError' || e.name === 'UserCancelledError';
      setState(s => ({
        ...s,
        connecting: false,
        connectError: cancelled ? null : (e.message || 'Connection failed'),
      }));
    }
  }, [state.supported, connectNative, connectWeb]);

  // ── Disconnect ───────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    if (isNative) {
      if (nativeDeviceIdRef.current) {
        BleClient.stopNotifications(nativeDeviceIdRef.current, HR_SERVICE, HR_CHARACTERISTIC).catch(() => {});
        BleClient.disconnect(nativeDeviceIdRef.current).catch(() => {});
        nativeDeviceIdRef.current = null;
      }
    } else {
      if (webCharacteristicRef.current) {
        webCharacteristicRef.current.removeEventListener('characteristicvaluechanged', webNotifyRef.current);
        webCharacteristicRef.current.stopNotifications().catch(() => {});
        webCharacteristicRef.current = null;
      }
      if (webDeviceRef.current?.gatt?.connected) {
        webDeviceRef.current.gatt.disconnect();
      }
      webDeviceRef.current = null;
    }

    rrBufferRef.current = [];
    setState(s => ({
      ...s,
      hr: null, zone: 0, hrv: null,
      connected: false, connecting: false,
      deviceName: null, connectError: null,
    }));
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    // Copy the handler to a local at setup: it is created once by the useRef
    // initializer and never reassigned, and reading the ref in the cleanup
    // would use a value that may have moved by teardown time.
    const notifyHandler = webNotifyRef.current;
    return () => {
      if (isNative) {
        if (nativeDeviceIdRef.current) {
          BleClient.stopNotifications(nativeDeviceIdRef.current, HR_SERVICE, HR_CHARACTERISTIC).catch(() => {});
          BleClient.disconnect(nativeDeviceIdRef.current).catch(() => {});
        }
      } else {
        if (webCharacteristicRef.current) {
          webCharacteristicRef.current.removeEventListener('characteristicvaluechanged', notifyHandler);
          webCharacteristicRef.current.stopNotifications().catch(() => {});
        }
        if (webDeviceRef.current?.gatt?.connected) {
          webDeviceRef.current.gatt.disconnect();
        }
      }
    };
    // Unmount only — device refs are stable; the handler is captured above.
  }, []);

  return { ...state, connect, disconnect };
}
