# Visa Map: Spec (v0.2, v1 built)

A dark, local-first globe for people who hold one to five passports: for every destination, which passport should I use? Portfolio project: data integration, comparison logic, interaction design, clean presentation.

## Goals and non-goals

**Goals**
- Pick up to five passports and see, per destination, which one to use and how easy entry is.
- Look at any passport on its own.
- Track trips locally: visited, next, and not going.
- Feel elegant: a real globe that turns and zooms smoothly, dark only, two hues and one brightness ramp.

**Non-goals**: accounts, backend, live data, mobile app, legal advice, and a "best overall passport" verdict (the question is per destination). The UI carries an "entry rules change" note and a "repository snapshot <date>" footer.

## Stack

| Layer | Choice |
|---|---|
| Framework | React 19 + Vite + TypeScript |
| Globe | `d3-geo` orthographic projection on a canvas, `d3-timer` / `d3-interpolate` / `d3-ease` for motion, behind a single `<VisaMap>` component |
| Visa data | `imorte/passport-index-data` (MIT), `passport-index.json`, normalized at build time |
| Map data | Natural Earth 50m TopoJSON via `world-atlas`, ISO-2 attached by `scripts/build-map.ts` |
| State | `useState` + `useStoredState` hook (`localStorage`) |
| Styling | CSS variables + CSS modules, Public Sans |
| Tests | Vitest: comparison logic, data integrity, URL and storage helpers |
| Deploy | Vercel (static) |

## Data

### Source facts (verified against the repo's `passport-index.json`)

- 199 passports, each with 198 destinations (39,402 entries). Same 199 ISO-2 codes on both axes.
- A passport has **no entry for its own country**. The UI treats that as **home**.
- `HK`, `MO`, `PS`, `TW`, `XK` exist as passports and destinations. `EH` (Western Sahara) does not exist.
- Raw status counts: visa free 12,780 · visa required 12,070 · e-visa 7,965 · visa on arrival 5,440 · eta 1,099 · no admission 48.
- `days` is present on all `eta` entries, 11,050 of 12,780 `visa free`, 5,152 of 5,440 `visa on arrival`, 2,291 of 7,965 `e-visa`, and 2 `visa required` entries (dropped).
- No `days` means the duration is not listed, **not** unlimited.

### Normalized model

```ts
type Status = 'visa-free' | 'eta' | 'voa' | 'e-visa' | 'required' | 'blocked';
type Entry = { status: Status; days?: number };
```

Stored compactly in `src/data/visa.json` as `data[passport][destination] = "f90"` (status letter + optional days), decoded by `src/data/codec.ts`. About 400 kB, 28 kB gzipped.

The build script fails on any unknown status, any code outside the 199-code set, a passport with an entry for itself, or a passport without exactly 198 destinations.

## Comparison logic (`src/lib/compare.ts`)

Rank (higher is better): `home` 6 > `visa-free` 5 > `eta` 4 > `voa` 3 > `e-visa` 2 > `required` 1 > `blocked` 0.

**Per destination (A vs B):** higher rank wins; same rank breaks the tie by more days, only when both have a count; otherwise tie. A passport at its own country is `home` and wins.

**Best of N:** the passports no other passport beats. **Summary:** sole wins per passport and multi-way ties over destinations excluding the passports' own countries. There is no overall winner.

**Verdict:** "Use X", "X or Y", "Either/Any works" (all tie, e-visa or better), "Same for both/all" (all tie, below e-visa).

This ranking is a product opinion. It is documented in the README.

## Features

1. Globe coloured by the best passport: hue = which passport, brightness = ease of entry, neutral = several equally good. Up to five passports.
2. Palettes (Ember, Sunset, Reef, Colour-blind safe) plus a custom colour per passport; ramps are derived from one base colour.
3. Single-passport views and a legend that counts each status.
4. Hover tooltip and country panel with a verdict headline and every passport's entry and stay in days.
5. Trips tab: Next / Visited / Not going per country, with how to get in for each Next country; JSON export and merge-import; the old visited list migrates once.
6. Optional arcs from a home country (default: first passport) to Next countries, coloured by the passport to use. Not-going countries fade on the map.
7. Shareable URL state: `?p=TH,DE,JP&view=DE&tab=trips`; older `a`/`b` links still work.
8. Drag with inertia, wheel and pinch zoom toward the pointer, keyboard turn and zoom, Fit button, fly-to from search.
9. Dots for 31 small countries plus Tuvalu, hidden once their shape is large enough on screen.

**Not built:** passport shopping, stay-length filter, keyboard focus on individual shapes.

## Visual design

- Dark only. Sea lit from the upper left, graticule, limb darkening, a thin glow.
- Each passport has a five-step ramp (visa-free brightest, visa required darkest); ties use a blue-grey ramp. `blocked` is hatched, `no-data` is dark grey, home countries get a light outline.
- Trips: gold for next, pale blue-white for visited, dim plum for not going.
- Thin borders, no shadows, no card stack. The globe is the one bold element.

## Map matching

Run `npm run build:map` to rebuild and print the report:

- 198 of 199 data codes have a shape; Tuvalu does not (hand-placed marker).
- 37 shapes have no visa data (Greenland, Puerto Rico, Guam, Western Sahara...), drawn as "no data".
- Somaliland and Northern Cyprus are drawn with Somalia and Cyprus. Kosovo is matched by name. Antarctica is dropped.
- 31 shapes under 1.2e-4 steradians get markers. Focus points use the centroid of the largest polygon, and zoom fits that polygon plus sizeable nearby parts.

## Project structure

```
scripts/         build-data.ts, build-map.ts
src/data/        visa.json, world-50m.json, markers/focus/territories.json (generated), codec.ts, visa.ts, places.ts
src/lib/         compare.ts, recommend.ts, palette.ts, trips.ts, settings.ts, format.ts, urlState.ts, storage.ts (+ tests)
src/hooks/       useStoredState.ts
src/components/  VisaMap, Controls, CountrySearch, CountryDetail, Summary, Legend, TripsPanel, TripButtons, AccessLines
```

## Risks and how they turned out

- **Scroll zoom:** the first version used `react-simple-maps`, whose wheel zoom did not work for the owner. The globe handles wheel events itself (non-passive listener, zoom toward the pointer).
- **Globe weight:** 50m is 745 kB (242 kB gzipped), fetched once. One animation loop runs only while something moves.
- **Data freshness:** the dataset is a snapshot. The footer shows the repository snapshot date.

## Decisions

Built as agreed: TypeScript + CSS modules, 50m shapes with small-state markers, days in tooltip and panel, visited tab with export/import, shareable URLs. Changed after review: d3 globe instead of a flat map, a two-passport "which to use" model instead of a best-overall passport, dark mode only.
