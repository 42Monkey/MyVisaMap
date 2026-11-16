import { useRef, useState } from 'react';
import { codes, nameOf } from '../data/visa.ts';
import { VALID_CODES } from '../data/validCodes.ts';
import { exportVisited, parseVisitedImport } from '../lib/storage.ts';
import { CountrySearch } from './CountrySearch.tsx';
import styles from './Panel.module.css';

interface Props {
  visited: readonly string[];
  onAdd: (code: string) => void;
  onRemove: (code: string) => void;
  onReplaceAll: (next: string[]) => void;
}

export function VisitedPanel({ visited, onAdd, onRemove, onReplaceAll }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sorted = [...visited].sort((x, y) => nameOf(x).localeCompare(nameOf(y)));

  function download() {
    const blob = new Blob([exportVisited(visited)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'visa-map-visited.json';
    link.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${visited.length} ${visited.length === 1 ? 'country' : 'countries'}.`);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const result = parseVisitedImport(await file.text(), VALID_CODES);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    const merged = [...new Set([...visited, ...result.codes])];
    const added = merged.length - visited.length;
    onReplaceAll(merged);
    setMessage(
      `Added ${added} new ${added === 1 ? 'country' : 'countries'}` +
        (result.ignored > 0 ? `, ignored ${result.ignored} unknown ${result.ignored === 1 ? 'entry' : 'entries'}.` : '.'),
    );
  }

  function clearAll() {
    if (window.confirm(`Remove all ${visited.length} visited countries?`)) {
      onReplaceAll([]);
      setMessage('Cleared.');
    }
  }

  return (
    <>
      <section className={styles.section} aria-label="Visited summary">
        <p className={styles.big}>
          {visited.length} <span className={styles.muted}>of {codes.length}</span>
        </p>
        <p className={styles.muted}>
          {visited.length === 0
            ? 'Click countries on the map to mark where you have been.'
            : 'Click a country on the map to add or remove it.'}
        </p>
        <CountrySearch label="Add a country by name" onPick={onAdd} />
      </section>

      {sorted.length > 0 && (
        <section className={styles.section} aria-label="Visited countries">
          <h2 className={styles.heading}>Visited</h2>
          <ul className={styles.chips}>
            {sorted.map((c) => (
              <li key={c} className={styles.chip}>
                {nameOf(c)}
                <button type="button" onClick={() => onRemove(c)} aria-label={`Remove ${nameOf(c)}`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section} aria-label="Back up and restore">
        <h2 className={styles.heading}>Back up</h2>
        <p className={styles.muted}>Your list is saved in this browser only. Export it to keep a copy or move it.</p>
        <div className={styles.row}>
          <button type="button" className={styles.button} onClick={download} disabled={visited.length === 0}>
            Export
          </button>
          <button type="button" className={styles.button} onClick={() => fileRef.current?.click()}>
            Import
          </button>
          {visited.length > 0 && (
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
