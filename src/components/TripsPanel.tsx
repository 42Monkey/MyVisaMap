import { useRef, useState } from 'react';
import { codes, lookup, nameOf } from '../data/visa.ts';
import { VALID_CODES } from '../data/validCodes.ts';
import { bestOf, getAccess } from '../lib/compare.ts';
import { describeAccess } from '../lib/format.ts';
import { recommend } from '../lib/recommend.ts';
import { TRIP_FILL } from '../lib/palette.ts';
import { codesWith, exportTrips, parseTripsImport, type TripState, type Trips } from '../lib/trips.ts';
import { CountrySearch } from './CountrySearch.tsx';
import styles from './Panel.module.css';

interface Props {
  trips: Trips;
  /** Passports held, used to say how to get in to each "next" country. */
  passports: readonly string[];
  onSet: (code: string, state: TripState | null) => void;
  onSelect: (code: string) => void;
  onPick: (code: string) => void;
  onReplaceAll: (next: Trips) => void;
}

const byName = (x: string, y: string) => nameOf(x).localeCompare(nameOf(y));

/** How to get in: the recommendation across passports, with the best entry's details. */
function entryHint(code: string, passports: readonly string[]): string | null {
  if (passports.length === 0 || !VALID_CODES.has(code)) return null;
  const accesses = passports.map((p) => getAccess(lookup, p, code));
  if (passports.length === 1) return describeAccess(accesses[0]);
  const winners = bestOf(accesses);
  const rec = recommend(passports.map(nameOf), accesses, winners);
  return `${rec?.headline ?? ''}: ${describeAccess(accesses[winners[0]])}`;
}

export function TripsPanel({ trips, passports, onSet, onSelect, onPick, onReplaceAll }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const next = codesWith(trips, 'next').sort(byName);
  const visited = codesWith(trips, 'visited').sort(byName);
  const skip = codesWith(trips, 'skip').sort(byName);
  const total = Object.keys(trips).length;

  function download() {
    const blob = new Blob([exportTrips(trips)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'visa-map-trips.json';
    link.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${total} ${total === 1 ? 'country' : 'countries'}.`);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const result = parseTripsImport(await file.text(), VALID_CODES);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    const added = Object.keys(result.trips).length;
    onReplaceAll({ ...trips, ...result.trips });
    setMessage(
      `Imported ${added} ${added === 1 ? 'country' : 'countries'}` +
        (result.ignored > 0 ? `, ignored ${result.ignored} unknown ${result.ignored === 1 ? 'entry' : 'entries'}.` : '.'),
    );
  }

  function clearAll() {
    if (window.confirm(`Remove all ${total} countries from your trips?`)) {
      onReplaceAll({});
      setMessage('Cleared.');
    }
  }

  const chips = (list: string[], state: TripState) => (
    <ul className={styles.chips}>
      {list.map((c) => (
        <li key={c} className={styles.chip} data-state={state}>
          <button type="button" className={styles.chipName} onClick={() => onSelect(c)}>
            {nameOf(c)}
          </button>
          <button type="button" onClick={() => onSet(c, null)} aria-label={`Remove ${nameOf(c)}`}>
            ×
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <section className={styles.section} aria-label="Trips summary">
        <p className={styles.big}>
          {visited.length} <span className={styles.muted}>of {codes.length} visited</span>
        </p>
        <p className={styles.muted}>
          {total === 0
            ? 'Click a country on the globe, then mark it as next, visited or not going.'
            : `${next.length} next · ${skip.length} not going`}
        </p>
        <CountrySearch label="Find a country" onPick={onPick} />
        <ul className={styles.keys} aria-label="Colours">
          <li>
            <span className={styles.tallyDot} style={{ ['--who' as string]: TRIP_FILL.next }} aria-hidden="true" />
            Next
          </li>
          <li>
            <span className={styles.tallyDot} style={{ ['--who' as string]: TRIP_FILL.visited }} aria-hidden="true" />
            Visited
          </li>
          <li>
            <span className={styles.tallyDot} style={{ ['--who' as string]: TRIP_FILL.skip }} aria-hidden="true" />
            Not going
          </li>
        </ul>
      </section>

      <section className={styles.section} aria-label="Next countries">
        <h2 className={styles.heading}>Next</h2>
        {next.length === 0 ? (
          <p className={styles.muted}>Nothing planned yet. Pick a country and press Next.</p>
        ) : (
          <ul className={styles.tripList}>
            {next.map((c) => {
              const hint = entryHint(c, passports);
              return (
                <li key={c} className={styles.tripRow}>
                  <button type="button" className={styles.tripName} onClick={() => onSelect(c)}>
                    <strong>{nameOf(c)}</strong>
                    {hint && <span className={styles.muted}>{hint}</span>}
                  </button>
                  <button type="button" className={styles.x} onClick={() => onSet(c, null)} aria-label={`Remove ${nameOf(c)}`}>
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {visited.length > 0 && (
        <section className={styles.section} aria-label="Visited countries">
          <h2 className={styles.heading}>Visited</h2>
          {chips(visited, 'visited')}
        </section>
      )}

      {skip.length > 0 && (
        <section className={styles.section} aria-label="Countries not going to">
          <h2 className={styles.heading}>Not going</h2>
          {chips(skip, 'skip')}
        </section>
      )}

      <section className={styles.section} aria-label="Back up and restore">
        <h2 className={styles.heading}>Back up</h2>
        <p className={styles.muted}>Your trips are saved in this browser only. Export them to keep a copy or move them.</p>
        <div className={styles.row}>
          <button type="button" className={styles.button} onClick={download} disabled={total === 0}>
            Export
          </button>
          <button type="button" className={styles.button} onClick={() => fileRef.current?.click()}>
            Import
          </button>
          {total > 0 && (
            <button type="button" className={styles.link} onClick={clearAll}>
              Clear all
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <p className={styles.status} role="status">
          {message}
        </p>
      </section>
    </>
  );
}
