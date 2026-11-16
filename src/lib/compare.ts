import type { Entry, Status } from '../data/types.ts';

/** Looks up how a passport enters a destination. Undefined when the dataset has no entry. */
export type Lookup = (passport: string, destination: string) => Entry | undefined;

/** What a passport gets at a destination, including the two non-data states. */
export interface Access {
  status: Status | 'home' | 'no-data';
  days?: number;
}

/** Higher is better. See SPEC.md, "Comparison logic". This ranking is a product opinion. */
export const RANK: Record<Access['status'], number> = {
  home: 6,
  'visa-free': 5,
  eta: 4,
  voa: 3,
  'e-visa': 2,
  required: 1,
  blocked: 0,
  'no-data': -1,
};

export function getAccess(lookup: Lookup, passport: string, destination: string): Access {
  if (passport === destination) return { status: 'home' };
  return lookup(passport, destination) ?? { status: 'no-data' };
}

/** Which of two accesses is better: higher rank wins; same rank, more days wins when both have a count. */
export function compareAccess(a: Access, b: Access): 'A' | 'B' | 'tie' {
  const diff = RANK[a.status] - RANK[b.status];
  if (diff !== 0) return diff > 0 ? 'A' : 'B';
  if (a.days != null && b.days != null && a.days !== b.days) return a.days > b.days ? 'A' : 'B';
  return 'tie';
}

/**
 * Indices of the passports to use: those no other passport beats. When nothing separates them
 * (or the day counts contradict each other) every index comes back.
 */
export function bestOf(accesses: readonly Access[]): number[] {
  const winners: number[] = [];
  accesses.forEach((access, i) => {
    const beaten = accesses.some((other, j) => j !== i && compareAccess(other, access) === 'A');
    if (!beaten) winners.push(i);
  });
  return winners.length > 0 ? winners : accesses.map((_, i) => i);
}

export interface Summary {
  /** Destinations counted below: every code except the passports' own countries. */
  compared: number;
  /** Destinations where exactly this passport is the best choice, per passport. */
  wins: number[];
  /** Destinations where two or more passports are equally good. */
  ties: number;
  /** Indices of the best passports for every code, including the passports' own countries (home wins there). */
  byDestination: Record<string, number[]>;
}

export function summarize(lookup: Lookup, codes: readonly string[], passports: readonly string[]): Summary {
  const byDestination: Record<string, number[]> = {};
  const wins = passports.map(() => 0);
  let compared = 0;
  let ties = 0;

  for (const code of codes) {
    const winners = bestOf(passports.map((p) => getAccess(lookup, p, code)));
    byDestination[code] = winners;
    if (passports.includes(code)) continue;
    compared++;
    if (winners.length === 1) wins[winners[0]]++;
    else ties++;
  }

  return { compared, wins, ties, byDestination };
}
