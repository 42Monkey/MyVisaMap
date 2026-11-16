import focusJson from './focus.json';
import markersJson from './markers.json';
import territoriesJson from './territories.json';

/** [longitude, latitude, zoom] to use when jumping to a country. */
export type Focus = [number, number, number];

export interface Marker {
  iso2: string;
  name: string;
  coordinates: [number, number];
}

export const focus = focusJson as unknown as Record<string, Focus>;

/** Clickable dots for countries too small to hit at world scale (and Tuvalu, which has no shape). */
export const markers = markersJson as unknown as Marker[];

/** Map shapes that have no visa data (Greenland, Guam, ...), by ISO-2. */
export const territories = territoriesJson as Record<string, string>;
