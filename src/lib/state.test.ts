import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, reviveSettings } from './settings.ts';
import { exportTrips, parseTripsImport, reviveTrips, sanitizeTrips, tripsFromVisited } from './trips.ts';
import { buildSearch, parseUrl } from './urlState.ts';

const valid = new Set(['TH', 'DE', 'JP', 'XK']);

describe('parseUrl / buildSearch', () => {
  const more = new Set([...valid, 'FR', 'BR', 'ZA', 'US']);

  it('reads passports, view and tab', () => {
    expect(parseUrl('?p=th,de&view=de&tab=trips', valid)).toEqual({ passports: ['TH', 'DE'], view: 'DE', tab: 'trips' });
  });

  it('still reads the older a, b and tab=visited links', () => {
    expect(parseUrl('?a=TH&b=DE&view=b&tab=visited', valid)).toEqual({ passports: ['TH', 'DE'], view: 'best', tab: 'trips' });
  });

  it('keeps up to five unique, known passports', () => {
    const state = parseUrl('?p=TH,ZZ,DE,TH,JP,FR,BR,ZA,US', more);
    expect(state.passports).toEqual(['TH', 'DE', 'JP', 'FR', 'BR']);
  });

  it('only honours a view for a passport you hold, and only with two or more', () => {
    expect(parseUrl('?p=TH,DE&view=JP', valid).view).toBe('best');
    expect(parseUrl('?p=TH&view=TH', valid).view).toBe('best');
  });

  it('round-trips and leaves defaults out', () => {
    expect(buildSearch({ passports: [], view: 'best', tab: 'map' })).toBe('');
    expect(buildSearch({ passports: ['TH'], view: 'best', tab: 'map' })).toBe('?p=TH');
    expect(buildSearch({ passports: ['TH', 'DE'], view: 'best', tab: 'map' })).toBe('?p=TH,DE');
    const full = { passports: ['TH', 'DE', 'JP'], view: 'DE', tab: 'trips' } as const;
    expect(buildSearch({ ...full, passports: [...full.passports] })).toBe('?p=TH,DE,JP&view=DE&tab=trips');
    expect(parseUrl(buildSearch({ ...full, passports: [...full.passports] }), valid)).toEqual(full);
  });

  it('does not write a view with one passport', () => {
    expect(buildSearch({ passports: ['TH'], view: 'TH', tab: 'map' })).toBe('?p=TH');
  });
});

describe('trips', () => {
  it('keeps only known countries with a known state', () => {
    expect(sanitizeTrips({ th: 'visited', ZZ: 'next', DE: 'maybe', JP: 'skip' }, valid)).toEqual({ TH: 'visited', JP: 'skip' });
    expect(sanitizeTrips(['TH'], valid)).toEqual({});
    expect(sanitizeTrips(null, valid)).toEqual({});
  });

  it('migrates the old visited list once, and prefers stored trips afterwards', () => {
    expect(reviveTrips(null, ['TH', 'zz', 5, 'jp'], valid)).toEqual({ TH: 'visited', JP: 'visited' });
    expect(reviveTrips({ DE: 'next' }, ['TH'], valid)).toEqual({ DE: 'next' });
    expect(reviveTrips({}, ['TH'], valid)).toEqual({});
  });

  it('turns a list of codes into visited entries', () => {
    expect(tripsFromVisited(['TH', 'XK'], valid)).toEqual({ TH: 'visited', XK: 'visited' });
  });

  it('round-trips an export', () => {
    const trips = { JP: 'next', TH: 'visited', DE: 'skip' } as const;
    expect(parseTripsImport(exportTrips({ ...trips }), valid)).toEqual({ ok: true, trips, ignored: 0 });
  });

  it('accepts an older visited export and a bare array, and counts ignored entries', () => {
    expect(parseTripsImport('{"visited":["TH","ZZ"]}', valid)).toEqual({ ok: true, trips: { TH: 'visited' }, ignored: 1 });
    expect(parseTripsImport('["TH","DE"]', valid)).toEqual({ ok: true, trips: { TH: 'visited', DE: 'visited' }, ignored: 0 });
    expect(parseTripsImport('{"trips":{"TH":"next","ZZ":"next","DE":"x"}}', valid)).toEqual({
      ok: true,
      trips: { TH: 'next' },
      ignored: 2,
    });
  });

  it('reports bad files', () => {
    expect(parseTripsImport('not json', valid).ok).toBe(false);
    expect(parseTripsImport('{"foo":1}', valid).ok).toBe(false);
  });
});

describe('settings', () => {
  it('falls back to defaults for anything unexpected', () => {
    expect(reviveSettings(null, valid)).toEqual(DEFAULT_SETTINGS);
    expect(reviveSettings('x', valid)).toEqual(DEFAULT_SETTINGS);
    expect(reviveSettings({ palette: 'nope', arcs: 'yes', origin: 'ZZ', colors: { TH: 'red' } }, valid)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid choices', () => {
    expect(reviveSettings({ palette: 'reef', arcs: true, origin: 'JP', colors: { TH: '#AABBCC', ZZ: '#000000' } }, valid)).toEqual({
      palette: 'reef',
      arcs: true,
      origin: 'JP',
      colors: { TH: '#aabbcc' },
    });
  });
});
