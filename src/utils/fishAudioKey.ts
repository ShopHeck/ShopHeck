const KEY = 'fightcamp_fish_audio_key';
export const getFishAudioKey  = (): string => localStorage.getItem(KEY) ?? '';
export const setFishAudioKey  = (k: string): void => localStorage.setItem(KEY, k);
export const clearFishAudioKey = (): void => localStorage.removeItem(KEY);
