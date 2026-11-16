import { useMemo } from 'react';
import { codes, nameOf } from '../data/visa.ts';
import { MAX_PASSPORTS, PALETTES } from '../lib/palette.ts';
import type { View } from '../lib/urlState.ts';
import styles from './Controls.module.css';

const BY_NAME = [...codes].sort((x, y) => nameOf(x).localeCompare(nameOf(y)));

interface Props {
  passports: readonly string[];
  /** Base colour for each passport. */
  hues: readonly string[];
  view: View;
  paletteId: string;
  onChange: (index: number, code: string) => void;
  onAdd: (code: string) => void;
  onRemove: (index: number) => void;
  onColor: (code: string, hex: string) => void;
  onPalette: (id: string) => void;
  onView: (view: View) => void;
}

export function Controls({ passports, hues, view, paletteId, onChange, onAdd, onRemove, onColor, onPalette, onView }: Props) {
  // Each passport can be held once, so every picker leaves out the others.
  const optionsFor = useMemo(
    () => (keep: string | null) => BY_NAME.filter((c) => c === keep || !passports.includes(c)),
    [passports],
  );
  const canAdd = passports.length < MAX_PASSPORTS;

  return (
    <div className={styles.controls}>
      <div className={styles.group}>
        <span className={styles.groupLabel} id="passports-label">
          {passports.length > 1 ? 'Your passports' : 'Your passport'}
        </span>
        <div className={styles.passports} role="group" aria-labelledby="passports-label">
          {passports.map((code, i) => (
            <div key={code} className={styles.passport}>
              <input
                type="color"
                className={styles.color}
                value={hues[i]}
                onChange={(e) => onColor(code, e.target.value)}
                aria-label={`Colour for ${nameOf(code)}`}
                title="Change colour"
              />
              <select
                value={code}
                onChange={(e) => onChange(i, e.target.value)}
                aria-label={`Passport ${i + 1}`}
              >
                {optionsFor(code).map((c) => (
                  <option key={c} value={c}>
                    {nameOf(c)}
                  </option>
                ))}
              </select>
              {passports.length > 1 && (
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => onRemove(i)}
                  aria-label={`Remove ${nameOf(code)} passport`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {canAdd && (
            <div className={styles.passport}>
              <select
                className={styles.add}
                value=""
                onChange={(e) => e.target.value && onAdd(e.target.value)}
                aria-label={passports.length === 0 ? 'Choose your passport' : 'Add a passport'}
              >
                <option value="">{passports.length === 0 ? 'Choose your passport' : '+ Add a passport'}</option>
                {optionsFor(null).map((c) => (
                  <option key={c} value={c}>
                    {nameOf(c)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {passports.length > 1 && (
        <div className={styles.group}>
          <span id="view-label" className={styles.groupLabel}>
            Globe shows
          </span>
          <div role="radiogroup" aria-labelledby="view-label" className={styles.segment}>
            <button type="button" role="radio" aria-checked={view === 'best'} onClick={() => onView('best')}>
              Best of all
            </button>
            {passports.map((code, i) => (
              <button key={code} type="button" role="radio" aria-checked={view === code} onClick={() => onView(code)}>
                <span className={styles.key} style={{ background: hues[i] }} aria-hidden="true" />
                {nameOf(code)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`${styles.group} ${styles.palette}`}>
        <label className={styles.groupLabel} htmlFor="palette">
          Colours
        </label>
        <select id="palette" value={paletteId} onChange={(e) => onPalette(e.target.value)} className={styles.paletteSelect}>
          {PALETTES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
