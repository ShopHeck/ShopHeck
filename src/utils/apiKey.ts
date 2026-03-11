const KEY = 'fightcamp_apikey';
export const getApiKey = (): string => localStorage.getItem(KEY) ?? '';
export const setApiKey = (k: string): void => localStorage.setItem(KEY, k);
export const clearApiKey = (): void => localStorage.removeItem(KEY);
