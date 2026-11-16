import type { Status } from '../data/types.ts';
import { nameOf } from '../data/visa.ts';
import { STATUS_LABEL } from '../lib/format.ts';
import { LEGEND_ORDER, NO_DATA, TIE, type Ease, type Ramp } from '../lib/palette.ts';
import type { PassportRef } from './AccessLines.tsx';
import styles from './Panel.module.css';

const EASE_OF_STATUS: Partial<Record<Status, Ease>> = {
  'visa-free': 'free',
  eta: 'eta',
  voa: 'voa',
  'e-visa': 'evisa',
  required: 'required',
};

function Swatch({ ramp, status }: { ramp: Ramp; status: Status }) {
  const ease = EASE_OF_STATUS[status];
  if (!ease) return <span className={`${styles.swatch} ${styles.hatched}`} aria-hidden="true" />;
  return <span className={styles.swatch} style={{ ['--fill' as string]: ramp[ease] }} aria-hidden="true" />;
}

interface Props {
  /** "best" explains the multi-colour globe; a passport code shows that passport's own counts. */
  mode: string;
  passports: readonly PassportRef[];
  counts: Partial<Record<Status, number>>;
}

export function Legend({ mode, passports, counts }: Props) {
  if (mode === 'best' && passports.length > 1) {
    return (
      <section className={styles.section} aria-label="Legend">
        <h2 className={styles.heading}>How to read the globe</h2>
        <p className={styles.muted}>The colour names the passport to use. The brighter it is, the easier the entry.</p>
        <ul className={styles.keys}>
          {passports.map((p) => (
            <li key={p.code}>
              <span className={styles.tallyDot} style={{ ['--who' as string]: p.ramp.eta }} aria-hidden="true" />
              {nameOf(p.code)}
            </li>
          ))}
          <li>
            <span className={styles.tallyDot} style={{ ['--who' as string]: TIE.eta }} aria-hidden="true" />
            Several equally good
          </li>
        </ul>
        <ul className={styles.legend}>
          {LEGEND_ORDER.map((s) => (
            <li key={s} className={styles.legendRow}>
              <span className={styles.ramp}>
                {passports.map((p) => (
                  <Swatch key={p.code} ramp={p.ramp} status={s} />
                ))}
                <Swatch ramp={TIE} status={s} />
              </span>
              <span>{STATUS_LABEL[s]}</span>
              <span />
            </li>
          ))}
          <li className={styles.legendRow}>
            <span className={styles.ramp}>
              <span className={styles.swatch} style={{ ['--fill' as string]: NO_DATA }} aria-hidden="true" />
            </span>
            <span>No data</span>
            <span />
          </li>
        </ul>
      </section>
    );
  }

  const shown = passports.find((p) => p.code === mode) ?? passports[0];
  if (!shown) return null;
  return (
    <section className={styles.section} aria-label="Legend">
      <h2 className={styles.heading}>Entry for {nameOf(shown.code)}</h2>
      <ul className={styles.legend}>
        {LEGEND_ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
          <li key={s} className={styles.legendRow}>
            <span className={styles.ramp}>
              <Swatch ramp={shown.ramp} status={s} />
            </span>
            <span>{STATUS_LABEL[s]}</span>
            <span className={styles.count}>{counts[s]}</span>
          </li>
        ))}
        <li className={styles.legendRow}>
          <span className={styles.ramp}>
            <span className={styles.homeSwatch} style={{ width: 12, height: 14 }} aria-hidden="true" />
          </span>
          <span>Home country</span>
          <span />
        </li>
      </ul>
    </section>
  );
}
