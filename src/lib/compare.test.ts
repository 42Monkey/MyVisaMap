import { describe, expect, it } from 'vitest';
import type { Entry } from '../data/types.ts';
import { codes, lookup } from '../data/visa.ts';
import { bestOf, compareAccess, getAccess, RANK, summarize, type Access, type Lookup } from './compare.ts';

const a = (status: Access['status'], days?: number): Access => ({ status, days });

describe('compareAccess', () => {
  it('ranks statuses visa-free > eta > voa > e-visa > required > blocked', () => {
    const order: Access['status'][] = ['visa-free', 'eta', 'voa', 'e-visa', 'required', 'blocked'];
    for (let i = 0; i < order.length - 1; i++) {
      expect(compareAccess(a(order[i]), a(order[i + 1]))).toBe('A');
      expect(compareAccess(a(order[i + 1]), a(order[i]))).toBe('B');
    }
  });

  it('home beats every status', () => {
    for (const status of Object.keys(RANK) as Access['status'][]) {
      if (status === 'home') continue;
      expect(compareAccess(a('home'), a(status, 365))).toBe('A');
    }
  });

  it('breaks same-status ties by days when both have a count', () => {
    expect(compareAccess(a('e-visa', 90), a('e-visa', 30))).toBe('A');
    expect(compareAccess(a('visa-free', 30), a('visa-free', 180))).toBe('B');
  });

  it('is a tie when days are equal or either side has no count', () => {
    expect(compareAccess(a('visa-free', 90), a('visa-free', 90))).toBe('tie');
    expect(compareAccess(a('visa-free'), a('visa-free', 90))).toBe('tie');
    expect(compareAccess(a('voa', 30), a('voa'))).toBe('tie');
    expect(compareAccess(a('required'), a('required'))).toBe('tie');
  });

  it('never lets days override a better status', () => {
    expect(compareAccess(a('visa-free', 14), a('eta', 365))).toBe('A');
  });

  it('ranks no-data below everything and ties with itself', () => {
    expect(compareAccess(a('blocked'), a('no-data'))).toBe('A');
    expect(compareAccess(a('no-data'), a('no-data'))).toBe('tie');
  });
});

describe('bestOf', () => {
  it('returns the single best passport', () => {
    expect(bestOf([a('e-visa'), a('visa-free', 30), a('required')])).toEqual([1]);
  });

  it('returns every passport that ties for best', () => {
    expect(bestOf([a('visa-free', 90), a('eta'), a('visa-free', 90)])).toEqual([0, 2]);
  });

  it('returns all of them when nothing separates them', () => {
    expect(bestOf([a('required'), a('required'), a('required')])).toEqual([0, 1, 2]);
  });

  it('uses days only between equal statuses that both list a count', () => {
    expect(bestOf([a('visa-free', 30), a('visa-free', 90), a('voa', 365)])).toEqual([1]);
    expect(bestOf([a('visa-free'), a('visa-free', 90)])).toEqual([0, 1]);
  });

  it('lets the home passport win', () => {
    expect(bestOf([a('visa-free', 365), a('home')])).toEqual([1]);
  });
});

describe('summarize (fixture)', () => {
  // Passports: X, Y. Destinations: X, Y, P, Q, R, S (every passport has an entry for each other code).
  const table: Record<string, Record<string, Entry>> = {
    X: {
      Y: { status: 'required' },
      P: { status: 'visa-free', days: 90 },
      Q: { status: 'eta' },
      R: { status: 'required' },
      S: { status: 'e-visa' },
    },
    Y: {
      X: { status: 'visa-free' },
      P: { status: 'visa-free', days: 30 },
      Q: { status: 'visa-free' },
      R: { status: 'required' },
      S: { status: 'blocked' },
    },
  };
  const fixture: Lookup = (p, d) => table[p]?.[d];
  const fixtureCodes = ['X', 'Y', 'P', 'Q', 'R', 'S'];
  const s = summarize(fixture, fixtureCodes, ['X', 'Y']);

  it('excludes the passports home countries from the counts', () => {
    expect(s.compared).toBe(4);
    expect(s.wins[0] + s.wins[1] + s.ties).toBe(4);
  });

  it('counts which passport to use at each destination', () => {
    expect(s.wins).toEqual([2, 1]); // X: P (90 vs 30 days), S. Y: Q.
    expect(s.ties).toBe(1); // R
  });

  it('reports the best passports for every code, with the home passport winning at home', () => {
    expect(Object.keys(s.byDestination).sort()).toEqual([...fixtureCodes].sort());
    expect(s.byDestination.X).toEqual([0]);
    expect(s.byDestination.Y).toEqual([1]);
    expect(s.byDestination.R).toEqual([0, 1]);
  });

  it('handles a single passport as all wins', () => {
    const one = summarize(fixture, fixtureCodes, ['X']);
    expect(one.compared).toBe(5);
    expect(one.wins).toEqual([5]);
  });
});

describe('summarize (real data)', () => {
  it('compares 197 destinations for two different passports', () => {
    const s = summarize(lookup, codes, ['TH', 'DE']);
    expect(s.compared).toBe(codes.length - 2);
    expect(s.wins[0] + s.wins[1] + s.ties).toBe(s.compared);
  });

  it('is symmetric when the passports are swapped', () => {
    const ab = summarize(lookup, codes, ['TH', 'DE']);
    const ba = summarize(lookup, codes, ['DE', 'TH']);
    expect(ab.wins[0]).toBe(ba.wins[1]);
    expect(ab.wins[1]).toBe(ba.wins[0]);
    expect(ab.ties).toBe(ba.ties);
  });

  it('adding a passport never makes the best entry worse', () => {
    const best = (list: string[], c: string) => Math.max(...list.map((p) => RANK[getAccess(lookup, p, c).status]));
    for (const c of codes) {
      expect(best(['TH', 'DE', 'JP'], c)).toBeGreaterThanOrEqual(best(['TH', 'DE'], c));
    }
  });

  it('counts five passports', () => {
    const list = ['TH', 'DE', 'JP', 'BR', 'ZA'];
    const s = summarize(lookup, codes, list);
    expect(s.compared).toBe(codes.length - 5);
    expect(s.wins.reduce((x, y) => x + y, 0) + s.ties).toBe(s.compared);
  });

  it('treats a passport compared with itself as all ties', () => {
    const s = summarize(lookup, codes, ['JP', 'JP']);
    expect(s.wins).toEqual([0, 0]);
    expect(s.ties).toBe(s.compared);
  });

  it('reports home for a passport at its own country', () => {
    expect(getAccess(lookup, 'TH', 'TH').status).toBe('home');
  });
});
