import { DEFAULT_PALETTE, PALETTES } from './palette.ts';

/** Preferences that are not part of the shareable link. */
export interface Settings {
  palette: string;
  /** Personal colour per passport code, as #rrggbb. */
  colors: Record<string, string>;
  /** Draw arcs from home to the "next" countries. */
  arcs: boolean;
  /** Where arcs start. Null means the first passport's country. */
  origin: string | null;
}

export const DEFAULT_SETTINGS: Settings = { palette: DEFAULT_PALETTE, colors: {}, arcs: false, origin: null };

const HEX = /^#[0-9a-f]{6}$/i;

export function reviveSettings(raw: unknown, valid: ReadonlySet<string>): Settings {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const colors: Record<string, string> = {};
  if (obj.colors && typeof obj.colors === 'object') {
    for (const [code, value] of Object.entries(obj.colors)) {
      if (valid.has(code) && typeof value === 'string' && HEX.test(value)) colors[code] = value.toLowerCase();
    }
  }
  return {
    palette: typeof obj.palette === 'string' && PALETTES.some((p) => p.id === obj.palette) ? obj.palette : DEFAULT_PALETTE,
    colors,
    arcs: obj.arcs === true,
    origin: typeof obj.origin === 'string' && valid.has(obj.origin) ? obj.origin : null,
  };
}
