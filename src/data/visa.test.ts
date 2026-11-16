import { describe, expect, it } from 'vitest';
import { decodeEntry, encodeEntry } from './codec.ts';
import { codes, lookup, nameOf, visa } from './visa.ts';

describe('codec', () => {
  it('round-trips entries', () => {
    expect(decodeEntry(encodeEntry({ status: 'visa-free', days: 90 }))).toEqual({ status: 'visa-free', days: 90 });
    expect(decodeEntry(encodeEntry({ status: 'e-visa' }))).toEqual({ status: 'e-visa' });
    expect(decodeEntry(encodeEntry({ status: 'blocked' }))).toEqual({ status: 'blocked' });
  });

  it('rejects unknown status letters and bad day counts', () => {
    expect(() => decodeEntry('x30')).toThrow();
    expect(() => decodeEntry('f0')).toThrow();
    expect(() => decodeEntry('fabc')).toThrow();
  });
});

describe('generated visa data', () => {
  it('has 199 codes, each with an entry for every other code and none for itself', () => {
    expect(codes).toHaveLength(199);
    for (const passport of codes) {
      expect(Object.keys(visa.data[passport])).toHaveLength(codes.length - 1);
      expect(visa.data[passport][passport]).toBeUndefined();
    }
  });

  it('decodes every entry', () => {
    let n = 0;
    for (const p of codes) for (const d of codes) if (p !== d && lookup(p, d)) n++;
    expect(n).toBe(199 * 198);
  });

  it('has a display name for every code, including the edge cases', () => {
    for (const code of codes) expect(nameOf(code)).not.toBe(code);
    for (const code of ['XK', 'TW', 'PS', 'HK', 'MO']) expect(codes).toContain(code);
    expect(codes).not.toContain('EH');
  });
});
