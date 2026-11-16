import { useId, useMemo, useState } from 'react';
import { codes, nameOf } from '../data/visa.ts';
import styles from './Panel.module.css';

interface Props {
  label: string;
  onPick: (code: string) => void;
}

/**
 * Type-ahead country picker. It doubles as the keyboard and screen-reader route to every
 * country, since the shapes on the map are not individually focusable.
 */
export function CountrySearch({ label, onPick }: Props) {
  const [text, setText] = useState('');
  const inputId = useId();
  const listId = useId();

  const { names, byName } = useMemo(() => {
    const entries = codes.map((c) => [nameOf(c), c] as const).sort((x, y) => x[0].localeCompare(y[0]));
    return { names: entries.map(([n]) => n), byName: new Map(entries.map(([n, c]) => [n.toLowerCase(), c])) };
  }, []);

  function handleChange(value: string) {
    const code = byName.get(value.trim().toLowerCase());
    if (code) {
      onPick(code);
      setText('');
    } else {
      setText(value);
    }
  }

  return (
    <div className={styles.search}>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        list={listId}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Start typing a name"
        autoComplete="off"
        spellCheck={false}
      />
      <datalist id={listId}>
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  );
}
