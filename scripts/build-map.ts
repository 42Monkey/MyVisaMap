/**
 * Builds the map data and prints a matching report against src/data/visa.json:
 *   src/data/world-50m.json   Natural Earth 50m (via world-atlas) with ISO-2 codes attached
 *   src/data/markers.json     clickable markers for tiny countries and countries with no shape
 *   src/data/focus.json       [lon, lat, zoom] per ISO-2, for "zoom to country"
 *   src/data/territories.json names of map shapes that have no visa data (Greenland, Guam, ...)
 *
 * Usage: npm run build:map
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea, geoBounds, geoCentroid, geoDistance } from 'd3-geo';
import type { Feature, Geometry, Polygon } from 'geojson';
import countries from 'i18n-iso-countries';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { VisaFile } from '../src/data/types.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const atlasPath = resolve(root, 'node_modules/world-atlas/countries-50m.json');
const visa = JSON.parse(readFileSync(resolve(root, 'src/data/visa.json'), 'utf8')) as VisaFile;

/** Below this spherical area (steradians) a country is too small to click at world scale. */
const TINY_SR = 1.2e-4;
const MIN_ZOOM = 1.5;
const MAX_ZOOM = 8; // tiny countries
const MAX_ZOOM_LARGE = 6; // everything else
const NEARBY_RAD = (25 * Math.PI) / 180;

// world-atlas features without a numeric id, resolved by name.
const BY_NAME: Record<string, string | null> = {
  Kosovo: 'XK',
  Somaliland: 'SO', // shown with Somalia, whose visa data covers it
  'N. Cyprus': 'CY', // shown with Cyprus, whose visa data covers it
  'Indian Ocean Ter.': null,
  'Siachen Glacier': null,
};

// Numeric ids to leave out of the map entirely.
const DROP_IDS = new Set(['010']); // Antarctica

// Hand-written [lon, lat, zoom] for data codes that have no shape at all.
const MANUAL_FOCUS: Record<string, [number, number, number]> = {
  TV: [179.2, -8.5, MAX_ZOOM], // Tuvalu (Funafuti): absent from Natural Earth 50m
};

const topology = JSON.parse(readFileSync(atlasPath, 'utf8')) as Topology;
const collection = topology.objects.countries as GeometryCollection<{ name: string }>;

interface Shape {
  iso2: string;
  name: string;
  area: number; // whole shape, steradians
  largestArea: number;
  centroid: [number, number]; // of the largest polygon, so overseas parts don't skew it
  zoom: number;
}

const kept: typeof collection.geometries = [];
const shapes: Shape[] = [];
const unmapped: string[] = [];

for (const geometry of collection.geometries) {
  const name = (geometry.properties as { name?: string } | undefined)?.name ?? '?';
  let iso2: string | null | undefined;

  if (geometry.id != null && geometry.id !== '') {
    const id = String(geometry.id);
    if (DROP_IDS.has(id)) continue;
    iso2 = countries.numericToAlpha2(id);
  } else {
    iso2 = BY_NAME[name];
  }

  if (!iso2) {
    unmapped.push(name);
    continue;
  }

  const f = feature(topology, geometry) as Feature<Geometry>;
  const g = f.geometry;
  const parts: Polygon[] =
    g.type === 'MultiPolygon'
      ? g.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }))
      : [g as Polygon];

  const measured = parts.map((part) => ({ part, area: geoArea(part), centroid: geoCentroid(part) }));
  const main = measured.reduce((best, m) => (m.area > best.area ? m : best), measured[0]);
  const largestArea = main.area;

  // Zoom to fit the main polygon plus any sizeable part close to it (Honshu + Hokkaido + Kyushu),
  // but not far-flung overseas parts (French Guiana).
  const nearby = measured.filter(
    (m) => m === main || (m.area >= 0.05 * largestArea && geoDistance(m.centroid, main.centroid) <= NEARBY_RAD),
  );
  const fitted = { type: 'MultiPolygon', coordinates: nearby.map((m) => m.part.coordinates) } as const;
  const [[w, s], [e, n]] = geoBounds(fitted);
  const widthDeg = e >= w ? e - w : e - w + 360;
  const span = Math.max(widthDeg, 2 * (n - s), 1);
  const isTiny = geoArea(f) < TINY_SR;
  const zoomCap = isTiny ? MAX_ZOOM : MAX_ZOOM_LARGE;
  const zoom = Math.round(Math.min(zoomCap, Math.max(MIN_ZOOM, 130 / span)) * 10) / 10;

  shapes.push({
    iso2,
    name,
    area: geoArea(f),
    largestArea,
    centroid: main.centroid as [number, number],
    zoom,
  });
  kept.push({ ...geometry, properties: { name, iso2 } as never });
}

const outTopology: Topology = {
  ...topology,
  objects: { countries: { ...collection, geometries: kept } },
};
writeFileSync(resolve(root, 'src/data/world-50m.json'), JSON.stringify(outTopology));

// One record per ISO-2 (Somalia + Somaliland count as one country).
const byCode = new Map<
  string,
  { area: number; name: string; centroid: [number, number]; zoom: number; best: number }
>();
for (const s of shapes) {
  const cur = byCode.get(s.iso2);
  if (!cur) {
    byCode.set(s.iso2, { area: s.area, name: s.name, centroid: s.centroid, zoom: s.zoom, best: s.largestArea });
  } else {
    cur.area += s.area;
    if (s.largestArea > cur.best) {
      cur.best = s.largestArea;
      cur.centroid = s.centroid;
      cur.zoom = s.zoom;
    }
  }
}

const dataCodes = new Set(visa.codes);
const noShape = visa.codes.filter((c) => !byCode.has(c));
const noData = [...byCode.keys()].filter((c) => !dataCodes.has(c));

const round = (n: number) => Math.round(n * 100) / 100;
const focus: Record<string, [number, number, number]> = {};
for (const [code, v] of byCode) focus[code] = [round(v.centroid[0]), round(v.centroid[1]), v.zoom];
for (const [code, f] of Object.entries(MANUAL_FOCUS)) focus[code] = f;
writeFileSync(resolve(root, 'src/data/focus.json'), JSON.stringify(focus));

const territories: Record<string, string> = {};
for (const code of noData) territories[code] = byCode.get(code)?.name ?? code;
writeFileSync(resolve(root, 'src/data/territories.json'), JSON.stringify(territories));

const markers: { iso2: string; name: string; coordinates: [number, number] }[] = [];
const tiny: [string, number][] = [];
for (const code of visa.codes) {
  const hit = byCode.get(code);
  if (hit && hit.area < TINY_SR) {
    markers.push({ iso2: code, name: visa.names[code], coordinates: focus[code].slice(0, 2) as [number, number] });
    tiny.push([code, hit.area]);
  } else if (!hit && MANUAL_FOCUS[code]) {
    markers.push({ iso2: code, name: visa.names[code], coordinates: MANUAL_FOCUS[code].slice(0, 2) as [number, number] });
  }
}
writeFileSync(resolve(root, 'src/data/markers.json'), JSON.stringify(markers));

const stillMissing = noShape.filter((c) => !MANUAL_FOCUS[c]);

console.log(`map: ${kept.length} shapes kept, ${byCode.size} distinct ISO-2 codes`);
console.log(`map: unmapped features (dropped): ${unmapped.join(', ') || 'none'}`);
console.log(`map: ${noShape.length} data codes with no map shape: ${noShape.join(', ') || 'none'}`);
console.log(`map: ${noData.length} map shapes with no data (shown as "no data"): ${noData.join(', ')}`);
console.log(`map: ${tiny.length} tiny shapes (< ${TINY_SR} sr) get markers; ${markers.length} markers in total`);
console.log(
  'map: focus samples',
  ['TH', 'US', 'FR', 'RU', 'MC', 'SG', 'FJ', 'JP'].map((c) => `${c}=${JSON.stringify(focus[c])}`).join(' '),
);
if (stillMissing.length) {
  console.error(`map: ERROR, no shape and no manual focus for: ${stillMissing.join(', ')}`);
  process.exitCode = 1;
}
