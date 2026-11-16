import { VALID_CODES } from '../data/validCodes.ts';
import { territories } from '../data/places.ts';
import { lookup, nameOf } from '../data/visa.ts';
import { getAccess } from '../lib/compare.ts';
import { TIE } from '../lib/palette.ts';
import { recommend } from '../lib/recommend.ts';
import type { TripState } from '../lib/trips.ts';
import { AccessLines, type PassportRef } from './AccessLines.tsx';
import styles from './Panel.module.css';
import { TripButtons } from './TripButtons.tsx';

interface Props {
  code: string;
  passports: readonly PassportRef[];
  /** Indices of the best passports here, when two or more are held. */
  winners: readonly number[] | null;
  trip: TripState | undefined;
  onTrip: (next: TripState | null) => void;
  onClose: () => void;
}

export function CountryDetail({ code, passports, winners, trip, onTrip, onClose }: Props) {
  const known = VALID_CODES.has(code);
  const names = passports.map((p) => nameOf(p.code));
  const verdict =
    known && winners && passports.length > 1
      ? recommend(names, passports.map((p) => getAccess(lookup, p.code, code)), winners)
      : null;
  const who = winners && winners.length === 1 ? passports[winners[0]].ramp.eta : TIE.eta;

  return (
    <section className={styles.section} aria-label="Selected country">
      <div className={styles.titleRow}>
        <h2 className={styles.title}>{known ? nameOf(code) : (territories[code] ?? code)}</h2>
        <button type="button" className={styles.link} onClick={onClose}>
          Close
        </button>
      </div>

      {verdict && (
        <div className={styles.verdict} style={{ ['--who' as string]: who }}>
          <span className={styles.verdictHead}>{verdict.headline}</span>
          {verdict.note && <span className={styles.muted}>{verdict.note}</span>}
        </div>
      )}

      {!known && <p className={styles.muted}>This territory is not in the visa dataset.</p>}
      {known && passports.length === 0 && <p className={styles.muted}>Choose a passport to see how it enters here.</p>}
      {known && passports.length > 0 && <AccessLines code={code} passports={passports} />}

      {known && <TripButtons value={trip} onChange={onTrip} />}
    </section>
  );
}
