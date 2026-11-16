import { hsl } from 'd3-color';
import type { Status } from '../data/types.ts';
import type { Access } from './compare.ts';

/**
 * Colour for the dark globe.
 *
 * Hue says which passport. Brightness says how easy entry is: the brighter the country, the easier
 * the entry. Each passport gets a base colour and a five-step ramp is derived from it, so any
 * colour a person picks still reads correctly.
 */
export type Ease = 'free' | 'eta' | 'voa' | 'evisa' | 'required';
export type Ramp = Record<Ease, string>;

/** Easiest entry first. */
export const EASE_ORDER: readonly Ease[] = ['free', 'eta', 'voa', 'evisa', 'required'];

const LIGHTNESS = [0.8, 0.67, 0.55, 0.43, 0.31];
const SATURATION = [0.85, 0.95, 1, 0.95, 0.85];

/** A five-step brightness ramp that keeps the hue of `base`. Falls back to grey on bad input. */
export function makeRamp(base: string): Ramp {
  const c = hsl(base);
  const valid = Number.isFinite(c.h) || Number.isFinite(c.s);
  const hue = Number.isFinite(c.h) ? c.h : 0;
  const sat = valid ? Math.min(0.95, Math.max(0.45, Number.isFinite(c.s) ? c.s : 0.5)) : 0;
  const out = {} as Ramp;
  EASE_ORDER.forEach((ease, i) => {
    out[ease] = hsl(hue, Math.min(1, sat * SATURATION[i]), LIGHTNESS[i]).formatHex();
  });
  return out;
}

/** Used where two or more passports are equally good. Deliberately colourless. */
export const TIE: Ramp = {
  free: '#e9f0f7',
  eta: '#c3d0dd',
  voa: '#9aabbd',
  evisa: '#70859a',
  required: '#475667',
};

export interface PaletteDef {
  id: string;
  name: string;
  /** One base colour per passport slot, in order. */
  colors: readonly string[];
}

export const MAX_PASSPORTS = 5;

export const PALETTES: readonly PaletteDef[] = [
  { id: 'ember', name: 'Ember', colors: ['#ffb020', '#4aa3ff', '#ff6b9a', '#a6e22e', '#c9a0ff'] },
  { id: 'sunset', name: 'Sunset', colors: ['#ff8a5b', '#ffd166', '#ef476f', '#8ecae6', '#95d5b2'] },
  { id: 'reef', name: 'Reef', colors: ['#4cc9f0', '#f9c74f', '#f94144', '#43aa8b', '#9d8cff'] },
  { id: 'accessible', name: 'Colour-blind safe', colors: ['#e69f00', '#56b4e9', '#2fc69a', '#f0e442', '#cc79a7'] },
];

export const DEFAULT_PALETTE = PALETTES[0].id;

export function paletteById(id: string): PaletteDef {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** Base colour for each passport: a personal override first, then the palette slot. */
export function colorsFor(passports: readonly string[], paletteId: string, overrides: Readonly<Record<string, string>>) {
  const palette = paletteById(paletteId);
  return passports.map((code, i) => overrides[code] ?? palette.colors[i % palette.colors.length]);
}

export const HATCH = 'hatch';
export const NO_DATA = '#1b2530';

/** Fills for the Trips tab. */
export const TRIP_FILL = {
  visited: '#dbe7f5',
  next: '#ffd166',
  skip: '#3b2a36',
  none: '#1e2935',
} as const;

/** Legend order, best entry first. */
export const LEGEND_ORDER: readonly Status[] = ['visa-free', 'eta', 'voa', 'e-visa', 'required', 'blocked'];

export function easeOf(status: Access['status']): Ease | 'blocked' | 'none' {
  switch (status) {
    case 'visa-free':
    case 'home':
      return 'free';
    case 'eta':
      return 'eta';
    case 'voa':
      return 'voa';
    case 'e-visa':
      return 'evisa';
    case 'required':
      return 'required';
    case 'blocked':
      return 'blocked';
    case 'no-data':
      return 'none';
  }
}

/** The fill for a country given the ramp to use and what that passport gets there. */
export function fillFor(ramp: Ramp, access: Access): string {
  const ease = easeOf(access.status);
  if (ease === 'blocked') return HATCH;
  if (ease === 'none') return NO_DATA;
  return ramp[ease];
}
