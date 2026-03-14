import { useState, useEffect, useRef, useCallback } from 'react';
import type { HRZone } from './useBluetoothHR';
import { ZONE_MEP_PER_MIN } from './useBluetoothHR';

/**
 * Accumulates MyZone Effort Points (MEP) during a timer session.
 * MEP accrues at 1-second resolution based on the current HR zone.
 */
export function useMyZoneMEP(zone: HRZone, isRunning: boolean): {
  mep: number;
  resetMEP: () => void;
} {
  const [mep, setMEP] = useState(0);
  // Fractional MEP accumulator (MEP accrues per second = mepPerMin / 60)
  const accumRef = useRef(0);

  useEffect(() => {
    if (!isRunning || zone === 0) return;
    const mepPerSec = ZONE_MEP_PER_MIN[zone] / 60;
    const id = setInterval(() => {
      accumRef.current += mepPerSec;
      const whole = Math.floor(accumRef.current);
      if (whole > 0) {
        setMEP(prev => prev + whole);
        accumRef.current -= whole;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [zone, isRunning]);

  const resetMEP = useCallback(() => {
    setMEP(0);
    accumRef.current = 0;
  }, []);

  return { mep, resetMEP };
}
