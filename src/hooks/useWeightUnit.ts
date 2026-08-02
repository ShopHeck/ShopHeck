import { useApp } from '../context/AppContext';
import type { WeightUnit } from '../utils/units';

/** The user's weight display unit (audit R8). Storage stays lbs everywhere —
 *  convert with utils/units at the point of display/input. */
export function useWeightUnit(): WeightUnit {
  const { state } = useApp();
  return state.dashboardPrefs?.weightUnit ?? 'lbs';
}
