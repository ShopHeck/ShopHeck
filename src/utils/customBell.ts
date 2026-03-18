const KEY = 'fightcamp_custom_bell';

export function getCustomBellDataUrl(): string | null {
  return localStorage.getItem(KEY);
}

export function setCustomBell(dataUrl: string): void {
  localStorage.setItem(KEY, dataUrl);
}

export function clearCustomBell(): void {
  localStorage.removeItem(KEY);
}

export function hasCustomBell(): boolean {
  return !!localStorage.getItem(KEY);
}

/** Read a File object into a base64 data URL */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Convert a base64 data URL to an ArrayBuffer for decodeAudioData */
export function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const b64    = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
