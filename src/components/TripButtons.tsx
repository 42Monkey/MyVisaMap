import { TRIP_LABEL, TRIP_STATES, type TripState } from '../lib/trips.ts';
import styles from './Panel.module.css';

interface Props {
  value: TripState | undefined;
  /** Called with the new state, or null when the active one is pressed again. */
  onChange: (next: TripState | null) => void;
}

/** Next / Visited / Not going. Pressing the active one clears it. */
export function TripButtons({ value, onChange }: Props) {
  return (
    <div role="group" aria-label="Trip status" className={styles.states}>
      {TRIP_STATES.map((state) => (
        <button
          key={state}
          type="button"
          data-state={state}
          aria-pressed={value === state}
          onClick={() => onChange(value === state ? null : state)}
        >
          {TRIP_LABEL[state]}
        </button>
      ))}
    </div>
  );
}
