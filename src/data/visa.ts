import { decodeEntry } from './codec.ts';
import type { Entry, VisaFile } from './types.ts';
// Imported as a raw string and parsed once: avoids TypeScript inferring a 39k-key literal type.
import rawVisa from './visa.json?raw';

export const visa: VisaFile = JSON.parse(rawVisa);

export const codes: readonly string[] = visa.codes;

export function lookup(passport: string, destination: string): Entry | undefined {
  const cell = visa.data[passport]?.[destination];
  return cell ? decodeEntry(cell) : undefined;
}

export function nameOf(code: string): string {
  return visa.names[code] ?? code;
}
