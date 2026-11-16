import { lookup, nameOf } from '../data/visa.ts';
import { getAccess } from '../lib/compare.ts';
import { describeAccess } from '../lib/format.ts';
import { fillFor, HATCH, type Ramp } from '../lib/palette.ts';
import styles from './Panel.module.css';

export interface PassportRef {
  code: string;
  /** The colour ramp this passport wears on the globe. */
  ramp: Ramp;
}

interface Props {
  code: string;
  passports: readonly PassportRef[];
}

/** One line per passport: a swatch in that passport's colour, its name, and what it needs there. */
export function AccessLines({ code, passports }: Props) {
  return (
    <ul className={styles.lines}>
      {passports.map(({ code: p, ramp }) => {
        const access = getAccess(lookup, p, code);
        const fill = fillFor(ramp, access);
        const className =
          access.status === 'home' ? styles.homeSwatch : fill === HATCH ? `${styles.dot} ${styles.hatched}` : styles.dot;
        return (
          <li key={p} className={styles.line}>
            <span
              className={className}
              style={fill === HATCH || access.status === 'home' ? undefined : { ['--fill' as string]: fill }}
              aria-hidden="true"
            />
            <span>
              <strong>{nameOf(p)}</strong>: {describeAccess(access)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
