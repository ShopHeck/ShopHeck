/**
 * Fitbit OAuth bearer tokens are long-lived third-party credentials.
 * They must not ride in the main account document (`fightcamp_app`): that blob
 * is large, frequently rewritten, and is the one path that can be wiped on
 * parse failure. Keeping secrets in a separate key limits blast radius and
 * matches the cloud sync rule that never uploads them.
 */

const FITBIT_SECRETS_KEY = 'fightcamp_fitbit_secrets';

export interface FitbitSecrets {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  userId?: string;
}

export function loadFitbitSecrets(): FitbitSecrets {
  try {
    const raw = localStorage.getItem(FITBIT_SECRETS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FitbitSecrets;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveFitbitSecrets(secrets: FitbitSecrets | null): void {
  try {
    if (!secrets || (!secrets.accessToken && !secrets.refreshToken)) {
      localStorage.removeItem(FITBIT_SECRETS_KEY);
      return;
    }
    localStorage.setItem(FITBIT_SECRETS_KEY, JSON.stringify({
      accessToken: secrets.accessToken,
      refreshToken: secrets.refreshToken,
      expiresAt: secrets.expiresAt,
      userId: secrets.userId,
    }));
  } catch {
    /* quota / private mode — same silent contract as saveState */
  }
}

export function clearFitbitSecrets(): void {
  saveFitbitSecrets(null);
}
