import { nameOf } from '../data/visa.ts';
import type { Summary as SummaryData } from '../lib/compare.ts';
import { TIE } from '../lib/palette.ts';
import type { PassportRef } from './AccessLines.tsx';
import styles from './Panel.module.css';

interface Props {
  passports: readonly PassportRef[];
  summary: SummaryData;
}

/** How the passports split the world: where each one is the better choice. */
export function Summary({ passports, summary }: Props) {
  const rows = [
    ...passports.map((p, i) => ({
      key: p.code,
      label: nameOf(p.code),
      count: summary.wins[i],
      color: p.ramp.eta,
      hint: 'Best choice',
    })),
    { key: 'tie', label: 'Several', count: summary.ties, color: TIE.eta, hint: 'Equally good' },
  ];

  return (
    <section className={styles.section} aria-label="Which passport to use">
      <h2 className={styles.heading}>Which passport to use</h2>
      <div className={styles.split} role="img" aria-label={rows.map((r) => `${r.label} ${r.count}`).join(', ')}>
        {rows.map((r) => (
          <span key={r.key} style={{ flex: r.count, background: r.color }} />
        ))}
      </div>
      <ul className={styles.tally}>
        {rows.map((r) => (
          <li key={r.key} className={styles.tallyRow} style={{ ['--who' as string]: r.color }}>
            <span className={styles.tallyDot} aria-hidden="true" />
            <span>
              {r.label}
              <span className={styles.muted}> · {r.hint}</span>
            </span>
            <span className={styles.tallyNum}>{r.count}</span>
          </li>
        ))}
      </ul>
      <p className={styles.muted}>
        Out of {summary.compared} destinations, not counting {passports.length === 2 ? 'your two' : 'your'} home countries.
      </p>
    </section>
  );
}
