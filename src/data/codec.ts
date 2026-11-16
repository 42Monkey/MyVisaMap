import type { Entry, Status } from './types.ts';

/** One letter per status; days follow as digits ("f90" = visa-free, 90 days). */
export const STATUS_TO_CHAR: Record<Status, string> = {
  'visa-free': 'f',
  eta: 't',
  voa: 'v',
  'e-visa': 'e',
  required: 'r',
  blocked: 'b',
};

const CHAR_TO_STATUS = Object.fromEntries(
  Object.entries(STATUS_TO_CHAR).map(([status, ch]) => [ch, status]),
) as Record<string, Status>;

export function encodeEntry(entry: Entry): string {
  return STATUS_TO_CHAR[entry.status] + (entry.days ?? '');
}

export function decodeEntry(encoded: string): Entry {
  const status = CHAR_TO_STATUS[encoded[0]];
  if (!status) throw new Error(`Unknown status code in "${encoded}"`);
  if (encoded.length === 1) return { status };
  const days = Number(encoded.slice(1));
  if (!Number.isInteger(days) || days <= 0) throw new Error(`Bad day count in "${encoded}"`);
  return { status, days };
}
