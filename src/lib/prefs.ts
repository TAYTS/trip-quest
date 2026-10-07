import { safeStorage } from './safeStorage';

export interface Prefs {
  momName: string;
  daughterName: string;
  writingAs: 'mom' | 'daughter';
  sound: boolean;
  /** Ignore the date lock, so the game can be tried before or after the trip. */
  testMode: boolean;
}

const KEY = 'trip-quest:prefs:v1';
const DEFAULTS: Prefs = { momName: 'Mom', daughterName: 'Me', writingAs: 'daughter', sound: true, testMode: false };

export const loadPrefs = (): Prefs => ({ ...DEFAULTS, ...safeStorage.getJSON<Partial<Prefs>>(KEY, {}) });
export const savePrefs = (p: Prefs) => safeStorage.setJSON(KEY, p);
export const authorName = (p: Prefs) => (p.writingAs === 'mom' ? p.momName : p.daughterName);
