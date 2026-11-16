export type TripState = 'visited' | 'next' | 'skip';
/** One state per country; a country that is not here has no state. */
export type Trips = Record<string, TripState>;

export const TRIP_STATES: readonly TripState[] = ['next', 'visited', 'skip'];
export const TRIP_LABEL: Record<TripState, string> = {
  visited: 'Visited',
  next: 'Next',
  skip: 'Not going',
};

const isState = (v: unknown): v is TripState => v === 'visited' || v === 'next' || v === 'skip';

/** Keeps only known countries with a known state. */
export function sanitizeTrips(value: unknown, valid: ReadonlySet<string>): Trips {
  const out: Trips = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, state] of Object.entries(value)) {
    const code = key.trim().toUpperCase();
    if (valid.has(code) && isState(state)) out[code] = state;
  }
  return out;
}

/** Turns a list of codes into "visited" entries. Used for the old visited list and bare arrays. */
export function tripsFromVisited(value: unknown, valid: ReadonlySet<string>): Trips {
  const out: Trips = {};
  if (!Array.isArray(value)) return out;
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const code = item.trim().toUpperCase();
    if (valid.has(code)) out[code] = 'visited';
  }
  return out;
}

/** What is stored: the trips, or (once, on first run) the old visited list. */
export function reviveTrips(stored: unknown, legacyVisited: unknown, valid: ReadonlySet<string>): Trips {
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) return sanitizeTrips(stored, valid);
  return tripsFromVisited(legacyVisited, valid);
}

export type ImportResult = { ok: true; trips: Trips; ignored: number } | { ok: false; error: string };

/** Accepts an export from this app, an older visited export, or a bare array of codes. */
export function parseTripsImport(text: string, valid: ReadonlySet<string>): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  const obj = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;

  let trips: Trips;
  let total: number;
  if (obj && obj.trips && typeof obj.trips === 'object' && !Array.isArray(obj.trips)) {
    trips = sanitizeTrips(obj.trips, valid);
    total = Object.keys(obj.trips).length;
  } else if (Array.isArray(parsed) || (obj && Array.isArray(obj.visited))) {
    const list = Array.isArray(parsed) ? parsed : (obj!.visited as unknown[]);
    trips = tripsFromVisited(list, valid);
    total = list.length;
  } else {
    return { ok: false, error: 'No list of countries found. Use a file exported from this app.' };
  }
  return { ok: true, trips, ignored: total - Object.keys(trips).length };
}

export function exportTrips(trips: Trips): string {
  const sorted = Object.fromEntries(Object.entries(trips).sort(([x], [y]) => x.localeCompare(y)));
  return JSON.stringify({ app: 'visa-map', version: 2, trips: sorted }, null, 2);
}

export function codesWith(trips: Trips, state: TripState): string[] {
  return Object.keys(trips).filter((c) => trips[c] === state);
}
