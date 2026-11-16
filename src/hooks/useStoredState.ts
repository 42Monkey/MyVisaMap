import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { readJson, writeJson } from '../lib/storage.ts';

/**
 * useState that survives reloads. `revive` turns whatever is in storage (anything, including
 * nothing or garbage) into a valid value, so a bad or old entry can never break the app.
 */
export function useStoredState<T>(key: string, revive: (raw: unknown) => T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => revive(readJson(key)));
  useEffect(() => {
    writeJson(key, value);
  }, [key, value]);
  return [value, setValue];
}
