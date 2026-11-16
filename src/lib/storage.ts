/** The visited list from before trips existed. Read once to migrate, never written. */
export const VISITED_KEY = 'visamap:visited:v1';
export const TRIPS_KEY = 'visamap:trips:v1';
export const PASSPORTS_KEY = 'visamap:passports:v1';
export const SETTINGS_KEY = 'visamap:settings:v1';

/** localStorage can be missing, full or blocked, so every access is guarded. */
export function readJson(key: string): unknown {
  try {
    const text = window.localStorage.getItem(key);
    return text == null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the app keeps working, it just won't remember.
  }
}

/** Keeps only known, unique ISO-2 codes from an unknown value. */
export function sanitizeCodes(value: unknown, valid: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const upper = item.trim().toUpperCase();
    if (valid.has(upper)) seen.add(upper);
  }
  return [...seen];
}
