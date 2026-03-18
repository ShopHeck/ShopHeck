const KEY       = 'fightcamp_fish_audio_key';
const MODEL_KEY = 'fightcamp_fish_model_id';

export const getFishAudioKey   = (): string => localStorage.getItem(KEY) ?? '';
export const setFishAudioKey   = (k: string): void => localStorage.setItem(KEY, k);
export const clearFishAudioKey = (): void => localStorage.removeItem(KEY);

/** Cloned voice model ID — overrides the built-in Goggins model when set */
export const getFishModelId   = (): string => localStorage.getItem(MODEL_KEY) ?? '';
export const setFishModelId   = (id: string): void => localStorage.setItem(MODEL_KEY, id);
export const clearFishModelId = (): void => localStorage.removeItem(MODEL_KEY);
