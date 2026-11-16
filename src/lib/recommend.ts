import { RANK, type Access } from './compare.ts';

export interface Recommendation {
  /** "Use Germany", "Thailand or Germany", "Either works", "Same for both". */
  headline: string;
  /** Why, when the headline alone could mislead. */
  note?: string;
}

function joinNames(names: readonly string[]): string {
  return names.length <= 2 ? names.join(' or ') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/**
 * Plain-language answer to "which of my passports should I use here?".
 * `winners` are the indices from bestOf. Returns null with fewer than two passports.
 */
export function recommend(
  names: readonly string[],
  accesses: readonly Access[],
  winners: readonly number[],
): Recommendation | null {
  const n = names.length;
  if (n < 2) return null;

  if (winners.length === n) {
    // Nothing separates them. That only helps if entry is at least workable.
    const workable = Math.max(...accesses.map((a) => RANK[a.status])) >= RANK['e-visa'];
    if (n === 2) return { headline: workable ? 'Either works' : 'Same for both' };
    return { headline: workable ? 'Any works' : 'Same for all' };
  }

  if (winners.length > 1) return { headline: joinNames(winners.map((i) => names[i])) };

  const i = winners[0];
  const headline = `Use ${names[i]}`;
  if (accesses[i].status === 'home') return { headline, note: `Home country of the ${names[i]} passport` };
  const sameKind = accesses.some((a, j) => j !== i && RANK[a.status] === RANK[accesses[i].status]);
  return sameKind ? { headline, note: 'Same entry, longer stay' } : { headline };
}
