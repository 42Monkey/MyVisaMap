import type { Status } from '../data/types.ts';
import type { Access } from './compare.ts';

/** Visual state of a country. Each tone maps to a color token in index.css. */
export type Tone =
  | 'free'
  | 'eta'
  | 'voa'
  | 'evisa'
  | 'required'
  | 'blocked'
  | 'home'
  | 'nodata'
  | 'visited'
  | 'unvisited';

const TONE_BY_STATUS: Record<Access['status'], Tone> = {
  'visa-free': 'free',
  eta: 'eta',
  voa: 'voa',
  'e-visa': 'evisa',
  required: 'required',
  blocked: 'blocked',
  home: 'home',
  'no-data': 'nodata',
};

export function toneOf(status: Access['status']): Tone {
  return TONE_BY_STATUS[status];
}

/** Legend order, best entry first. */
export const LEGEND_ORDER: readonly Status[] = ['visa-free', 'eta', 'voa', 'e-visa', 'required', 'blocked'];
