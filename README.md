# Visa map

Which passport should I use to travel there?

Some people hold more than one passport. Each one gets you into different countries with different rules: walk straight in, get a visa at the airport, apply online first, or apply at an embassy weeks ahead. Visa map puts all of that on one spinning globe, so you can see at a glance which of your passports is the best choice for every country in the world.

## Features

- **Which passport to use:** up to five passports. Each country is coloured by the best of them: hue names the passport, brightness says how easy the entry is, and neutral grey means several are equally good.
- **Your colours:** pick a palette (Ember, Sunset, Reef or a colour-blind safe one) and click any passport's dot to choose its own colour. The brightness ramp is derived from whatever you pick.
- **Single-passport views:** show just one passport, with a legend that counts each status.
- **Verdict per country:** "Use Germany", "Thailand or Japan", "Either works" or "Same for both", with every passport's entry and allowed stay in days.
- **Trips:** mark any country as Next, Visited or Not going. The Next list says which passport to use for each and what entry it needs. Not-going countries fade on the main globe.
- **Arcs (optional):** a toggle draws lifted arcs from your home to your Next countries, coloured by the passport you would use. Choose where they start.
- **A real globe:** drag to turn it (it glides on release), scroll or pinch to zoom toward the cursor, arrow keys and +/- from the keyboard.
- **Backup:** export and import trips as JSON. The old visited list is migrated automatically.
- **Shareable links:** `?p=TH,DE,JP` opens the comparison, `&view=DE` shows one passport, `&tab=trips` opens Trips. Older `?a=TH&b=DE` links still work.
- **Find a country** by name: the globe flies there. It is also the keyboard and screen-reader route to every country.
- **Small states** get clickable dots until you zoom in far enough to see their shape.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # comparison, recommendation, palette, data integrity, URL and storage helpers
npm run build      # static site in dist/
```

Deploy `dist/` to any static host. On Vercel, use the Vite preset (build command `npm run build`, output `dist`).

## How the comparison works

Each destination gets a rank for each passport, higher is better:

`home` > `visa-free` > `eTA` > `visa on arrival` > `e-visa` > `visa required` > `no admission`

- **Per destination:** the passports that no other passport beats are the best choice. Higher rank wins. On the same rank, more allowed days wins, but only when both sides list a number. Otherwise they tie.
- **No overall winner.** The app does not crown one passport. It answers the question you actually have, per destination, and shows how the world splits.
- **Verdict wording:** "Use X" for one best passport, "X or Y" when several tie for best, "Either works" / "Any works" when nothing separates them and entry is at least an e-visa, and "Same for both" / "Same for all" when everyone needs a visa.
- Your passports' home countries are left out of the counts (197 destinations for two different passports).

The ranking is a product opinion, not a fact. For example, it puts an eTA above visa on arrival because an eTA is approved before you fly. It lives in one place, `src/lib/compare.ts`, and is covered by tests.

## Data

Visa data comes from [imorte/passport-index-data](https://github.com/imorte/passport-index-data) (MIT). `scripts/build-data.ts` validates and normalizes `passport-index.json` into `src/data/visa.json`, which is committed.

```bash
git clone https://github.com/imorte/passport-index-data ../passport-index-data
npm run build:data -- ../passport-index-data/passport-index.json 2026-03-01   # last arg: snapshot date shown in the footer
```

What the script checks, and fails the build on:

- the same 199 ISO-2 codes on both axes, and every passport has an entry for every other code;
- no passport has an entry for itself (the app treats that as the "home" state);
- only the six known status strings.

Things worth knowing about the dataset:

- A missing day count means "duration not listed", not "unlimited". Roughly 1,700 visa-free entries have no day count.
- Two `visa required` entries carry a day count. It is dropped.
- Entries are stored compactly (`f90` is visa-free, 90 days), which brings the file to about 400 kB (28 kB gzipped).

## Map

`scripts/build-map.ts` turns [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, 50m) into the shapes the globe draws, and prints a report of how it matches the visa data.

```bash
npm run build:map
```

- world-atlas identifies countries by numeric ISO code, so the script attaches ISO-2 codes. Kosovo has no numeric code and is matched by name.
- 198 of the 199 data codes have a shape. Tuvalu has none at 50m, so it gets a hand-placed marker.
- 37 map shapes have no visa data (Greenland, Puerto Rico, Guam, Western Sahara...). They are drawn as "no data".
- Somaliland and Northern Cyprus are drawn with Somalia and Cyprus, whose visa data covers them. Antarctica is left out.
- Countries below a small area threshold get a marker. Their focus point is the centroid of their largest polygon, so overseas territories do not drag, for instance, France's focus into the Atlantic.

## Design

- **Dark only.** A deep blue-black page, a sea lit from the upper left, a faint graticule, limb darkening and a thin glow make the sphere read as an object.
- **Hue is the passport, brightness is the ease.** "No admission" is hatched, "no data" is dark grey, home countries get a light outline.
- **Trips:** next is gold, visited is pale blue-white, not going is a dim plum.
- **One typeface,** Public Sans. Thin borders, no card stacks.
- The globe drifts slowly until the first interaction, and not at all with reduced motion enabled.

## Code notes

- The globe is a single `<VisaMap>` component: a canvas drawn with `d3-geo` (orthographic projection), with `d3-timer`, `d3-interpolate` and `d3-ease` for the animation. The rest of the app passes in a fill per country, a set of dimmed countries and a list of arcs, and receives clicks.
- Arcs are great circles sampled with `geoInterpolate`. Each point is lifted by scaling its screen offset from the globe's centre, which is exact for an orthographic view.
- Colour ramps are generated from one base colour with `d3-color` (fixed lightness steps), so any palette or custom colour keeps the brightness-means-ease rule. Tests check every palette.
- One animation loop runs only while something moves and stops when idle.
- Hit testing inverts the pointer to longitude/latitude and tests country bounding boxes first, so hover stays cheap.
- On wide screens the page fills the window and the side panel scrolls on its own, so selecting a country can never shift the globe under the cursor.
- State is plain React state. Passports, trips and settings live in `localStorage` under versioned keys (`visamap:passports:v1`, `visamap:trips:v1`, `visamap:settings:v1`) and are sanitized on load, so a corrupt entry cannot break the app.

## Limits

- Entry rules change. The footer shows the dataset's snapshot date and tells people to confirm with official sources.
- The data covers 199 countries and territories. Disputed and dependent territories follow the dataset's choices.
- Individual country shapes are not keyboard focusable (238 tab stops would be unusable). The "Find a country" box is the keyboard route, and the globe itself turns and zooms from the keyboard.
