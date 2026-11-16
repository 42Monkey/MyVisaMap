import { describe, expect, it } from 'vitest';
import { colorsFor, easeOf, EASE_ORDER, fillFor, HATCH, makeRamp, MAX_PASSPORTS, NO_DATA, PALETTES, TIE } from './palette.ts';

const lightness = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};

describe('makeRamp', () => {
  it('gets darker with every step from visa-free to visa required', () => {
    for (const palette of PALETTES) {
      for (const base of palette.colors) {
        const ramp = makeRamp(base);
        for (let i = 0; i < EASE_ORDER.length - 1; i++) {
          expect(lightness(ramp[EASE_ORDER[i]])).toBeGreaterThan(lightness(ramp[EASE_ORDER[i + 1]]));
        }
      }
    }
  });

  it('gives every passport in a palette its own colours', () => {
    for (const palette of PALETTES) {
      const all = palette.colors.flatMap((c) => Object.values(makeRamp(c)));
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('never collides with the neutral tie colours', () => {
    const tie = new Set(Object.values(TIE));
    for (const palette of PALETTES) {
      for (const c of palette.colors) for (const v of Object.values(makeRamp(c))) expect(tie.has(v)).toBe(false);
    }
  });

  it('survives a bad colour', () => {
    const ramp = makeRamp('not a colour');
    expect(Object.values(ramp)).toHaveLength(5);
    for (const v of Object.values(ramp)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('palettes', () => {
  it('have a colour for every passport slot', () => {
    for (const p of PALETTES) expect(p.colors.length).toBeGreaterThanOrEqual(MAX_PASSPORTS);
  });

  it('prefer a personal colour, then the palette slot, and wrap if needed', () => {
    expect(colorsFor(['TH', 'DE'], 'ember', { DE: '#123456' })).toEqual([PALETTES[0].colors[0], '#123456']);
    expect(colorsFor(['A'], 'nope', {})).toEqual([PALETTES[0].colors[0]]);
  });
});

describe('fillFor', () => {
  const ramp = makeRamp('#4aa3ff');
  it('uses the ramp for the entry that passport gets', () => {
    expect(fillFor(ramp, { status: 'visa-free' })).toBe(ramp.free);
    expect(fillFor(ramp, { status: 'e-visa' })).toBe(ramp.evisa);
  });

  it('hatches blocked entry and greys out missing data', () => {
    expect(fillFor(ramp, { status: 'blocked' })).toBe(HATCH);
    expect(fillFor(ramp, { status: 'no-data' })).toBe(NO_DATA);
  });

  it('shows a home country as the easiest entry', () => {
    expect(easeOf('home')).toBe('free');
  });
});
