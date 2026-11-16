import { codes } from './visa.ts';

/** Every ISO-2 code that has visa data. Map shapes outside this set are territories. */
export const VALID_CODES: ReadonlySet<string> = new Set(codes);
