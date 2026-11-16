import { MAX_PASSPORTS } from './palette.ts';

export type Tab = 'map' | 'trips';
/** "best" colours each country by the passport to use; a passport code shows that passport alone. */
export type View = string;

export interface AppState {
  passports: string[];
  view: View;
  tab: Tab;
}

function codes(raw: string | null, valid: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const part of (raw ?? '').split(',')) {
    const code = part.trim().toUpperCase();
    if (valid.has(code) && !out.includes(code)) out.push(code);
  }
  return out;
}

/** Reads ?p=TH,DE&view=TH&tab=trips. The older ?a=TH&b=DE and tab=visited still work. */
export function parseUrl(search: string, valid: ReadonlySet<string>): AppState {
  const params = new URLSearchParams(search);
  let passports = codes(params.get('p'), valid);
  if (passports.length === 0) passports = [...codes(params.get('a'), valid), ...codes(params.get('b'), valid)];
  passports = [...new Set(passports)].slice(0, MAX_PASSPORTS);

  const view = (params.get('view') ?? '').toUpperCase();
  const tab = params.get('tab');
  return {
    passports,
    // A single-passport view only means something when there are two or more passports.
    view: passports.length > 1 && passports.includes(view) ? view : 'best',
    tab: tab === 'trips' || tab === 'visited' ? 'trips' : 'map',
  };
}

/** Inverse of parseUrl. Defaults are left out so the common URL stays short. */
export function buildSearch(state: AppState): string {
  const params = new URLSearchParams();
  if (state.passports.length > 0) params.set('p', state.passports.join(','));
  if (state.passports.length > 1 && state.view !== 'best') params.set('view', state.view);
  if (state.tab === 'trips') params.set('tab', 'trips');
  const text = params.toString().replace(/%2C/g, ',');
  return text ? `?${text}` : '';
}
