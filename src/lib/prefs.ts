import { safeStorage } from './safeStorage';

export interface Prefs {
  momName: string;
  daughterName: string;
  writingAs: 'mom' | 'daughter';
  sound: boolean;
  /** Ignore the date lock, so the game can be tried before or after the trip. */
  testMode: boolean;
}

/** Test mode only exists in builds with VITE_ENABLE_TEST_MODE=true (so the live trip app can't turn it on). */
export const TEST_MODE_ENABLED = import.meta.env.VITE_ENABLE_TEST_MODE === 'true';

const KEY = 'trip-quest:prefs:v1';
const DEFAULTS: Prefs = { momName: 'Mom', daughterName: 'Me', writingAs: 'daughter', sound: true, testMode: false };

export const loadPrefs = (): Prefs => {
  const p = { ...DEFAULTS, ...safeStorage.getJSON<Partial<Prefs>>(KEY, {}) };
  // A "on" saved earlier doesn't count once the flag is off.
  return TEST_MODE_ENABLED ? p : { ...p, testMode: false };
};
export const savePrefs = (p: Prefs) => safeStorage.setJSON(KEY, p);
export const authorName = (p: Prefs) => (p.writingAs === 'mom' ? p.momName : p.daughterName);
