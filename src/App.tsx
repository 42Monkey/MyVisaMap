import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessLines, type PassportRef } from './components/AccessLines.tsx';
import { Controls } from './components/Controls.tsx';
import { CountryDetail } from './components/CountryDetail.tsx';
import { CountrySearch } from './components/CountrySearch.tsx';
import { Legend } from './components/Legend.tsx';
import { Summary } from './components/Summary.tsx';
import { TripsPanel } from './components/TripsPanel.tsx';
import { VisaMap, type Arc, type FocusRequest } from './components/VisaMap.tsx';
import { territories } from './data/places.ts';
import type { Status } from './data/types.ts';
import { VALID_CODES } from './data/validCodes.ts';
import { codes, lookup, nameOf, visa } from './data/visa.ts';
import { useStoredState } from './hooks/useStoredState.ts';
import { getAccess, summarize } from './lib/compare.ts';
import { colorsFor, fillFor, makeRamp, MAX_PASSPORTS, TIE, TRIP_FILL } from './lib/palette.ts';
import { recommend } from './lib/recommend.ts';
import { reviveSettings, type Settings } from './lib/settings.ts';
import { PASSPORTS_KEY, readJson, SETTINGS_KEY, TRIPS_KEY, VISITED_KEY, writeJson } from './lib/storage.ts';
import { reviveTrips, TRIP_LABEL, type TripState, type Trips } from './lib/trips.ts';
import { buildSearch, parseUrl, type AppState, type Tab, type View } from './lib/urlState.ts';
import styles from './App.module.css';

const BY_NAME = [...codes].sort((x, y) => nameOf(x).localeCompare(nameOf(y)));

/** Last passports used here: the current list, or the older {a, b} pair. */
function revivePassports(raw: unknown): string[] {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as { list?: unknown; a?: unknown; b?: unknown };
  const source = Array.isArray(obj.list) ? obj.list : [obj.a, obj.b];
  const out: string[] = [];
  for (const item of source) {
    if (typeof item === 'string' && VALID_CODES.has(item) && !out.includes(item)) out.push(item);
  }
  return out.slice(0, MAX_PASSPORTS);
}

/** URL wins (so shared links work); otherwise fall back to the last passports used here. */
function initialState(): AppState {
  const fromUrl = parseUrl(window.location.search, VALID_CODES);
  if (fromUrl.passports.length > 0) return fromUrl;
  return { ...fromUrl, passports: revivePassports(readJson(PASSPORTS_KEY)) };
}

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const { passports, tab } = state;
  // A view only makes sense for a passport you still hold, and with two or more.
  const view: View = passports.length > 1 && passports.includes(state.view) ? state.view : 'best';

  const [selected, setSelected] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const focusId = useRef(0);
  const [trips, setTrips] = useStoredState<Trips>(TRIPS_KEY, (raw) => reviveTrips(raw, readJson(VISITED_KEY), VALID_CODES));
  const [settings, setSettings] = useStoredState<Settings>(SETTINGS_KEY, (raw) => reviveSettings(raw, VALID_CODES));

  // Keep the address bar and storage in step with the passports, so links can be shared.
  useEffect(() => {
    const search = buildSearch({ ...state, view });
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
    }
    writeJson(PASSPORTS_KEY, { list: state.passports });
  }, [state, view]);

  const patch = (next: Partial<AppState>) => setState((s) => ({ ...s, ...next }));
  const addPassport = (code: string) =>
    setState((s) =>
      s.passports.length >= MAX_PASSPORTS || s.passports.includes(code) ? s : { ...s, passports: [...s.passports, code] },
    );
  const changePassport = (index: number, code: string) =>
    setState((s) => ({ ...s, passports: s.passports.map((p, i) => (i === index ? code : p)) }));
  const removePassport = (index: number) =>
    setState((s) => ({ ...s, passports: s.passports.filter((_, i) => i !== index) }));
  const setTab = (next: Tab) => {
    setSelected(null);
    patch({ tab: next });
  };

  function setTrip(code: string, next: TripState | null) {
    setTrips((t) => {
      const out = { ...t };
      if (next) out[code] = next;
      else delete out[code];
      return out;
    });
  }

  function focusOn(code: string) {
    focusId.current += 1;
    setFocusRequest({ code, id: focusId.current });
  }

  // Colours: a base per passport, from the chosen palette unless the person picked their own.
  const hues = useMemo(() => colorsFor(passports, settings.palette, settings.colors), [passports, settings]);
  const refs: PassportRef[] = useMemo(
    () => passports.map((code, i) => ({ code, ramp: makeRamp(hues[i]) })),
    [passports, hues],
  );

  const summary = useMemo(() => (passports.length > 1 ? summarize(lookup, codes, passports) : null), [passports]);
  const names = useMemo(() => passports.map(nameOf), [passports]);

  const fills = useMemo(() => {
    const out: Record<string, string> = {};
    if (tab === 'trips') {
      for (const c of codes) out[c] = TRIP_FILL[trips[c] ?? 'none'];
      return out;
    }
    if (refs.length === 0) return out;
    const single = refs.findIndex((r) => r.code === view);
    for (const c of codes) {
      const accesses = refs.map((r) => getAccess(lookup, r.code, c));
      if (refs.length === 1 || single >= 0) {
        const i = single >= 0 ? single : 0;
        out[c] = fillFor(refs[i].ramp, accesses[i]);
      } else {
        const winners = summary?.byDestination[c] ?? [0];
        // One clear winner wears its own colour; several equally good wear the neutral one.
        out[c] = fillFor(winners.length === 1 ? refs[winners[0]].ramp : TIE, accesses[winners[0]]);
      }
    }
    return out;
  }, [tab, trips, refs, view, summary]);

  const homes = useMemo(() => new Set(tab === 'map' ? passports : []), [tab, passports]);

  // Countries the person ruled out fade back on the main globe.
  const dimmed = useMemo(
    () => new Set(tab === 'map' ? Object.keys(trips).filter((c) => trips[c] === 'skip') : []),
    [tab, trips],
  );

  const origin = settings.origin ?? passports[0] ?? null;
  const nextCodes = useMemo(() => Object.keys(trips).filter((c) => trips[c] === 'next'), [trips]);

  const arcs: Arc[] = useMemo(() => {
    if (!settings.arcs || !origin) return [];
    return nextCodes
      .filter((c) => c !== origin)
      .map((c) => {
        let color: string = TRIP_FILL.next;
        if (tab === 'map' && refs.length > 0) {
          const single = refs.findIndex((r) => r.code === view);
          const winners = summary?.byDestination[c];
          if (single >= 0) color = refs[single].ramp.free;
          else if (refs.length === 1) color = refs[0].ramp.free;
          else if (winners?.length === 1) color = refs[winners[0]].ramp.free;
          else color = TIE.free;
        }
        return { from: origin, to: c, color };
      });
  }, [settings.arcs, origin, nextCodes, tab, refs, view, summary]);

  const listed = view !== 'best' ? view : (passports[0] ?? null);
  const counts = useMemo(() => {
    const out: Partial<Record<Status, number>> = {};
    if (!listed) return out;
    for (const c of codes) {
      if (c === listed) continue;
      const access = getAccess(lookup, listed, c);
      if (access.status === 'home' || access.status === 'no-data') continue;
      out[access.status] = (out[access.status] ?? 0) + 1;
    }
    return out;
  }, [listed]);

  function handleSelect(code: string | null) {
    setSelected(code);
  }

  function handlePick(code: string) {
    setSelected(code);
    focusOn(code);
  }

  function renderTooltip(code: string) {
    if (!VALID_CODES.has(code)) {
      return (
        <>
          <strong>{territories[code] ?? code}</strong>
          <div>No visa data for this territory</div>
        </>
      );
    }
    const trip = trips[code];
    const accesses = refs.map((r) => getAccess(lookup, r.code, code));
    const winners = summary?.byDestination[code];
    const verdict = winners && tab === 'map' ? recommend(names, accesses, winners) : null;
    return (
      <>
        <strong>{nameOf(code)}</strong>
        {trip && <div className={styles.tipTrip}>{TRIP_LABEL[trip]}</div>}
        {verdict && <div className={styles.tipVerdict}>{verdict.headline}</div>}
        {refs.length > 0 ? <AccessLines code={code} passports={refs} /> : <div>Choose a passport to see entry rules</div>}
      </>
    );
  }

  const ariaLabel =
    tab === 'trips'
      ? 'Globe of your trips: visited, next and not going'
      : passports.length > 1
        ? `Globe showing which of your ${passports.length} passports to use for each destination`
        : passports.length === 1
          ? `Globe of entry requirements for the ${nameOf(passports[0])} passport`
          : 'Globe';

  const detail = selected && (
    <CountryDetail
      code={selected}
      passports={refs}
      winners={summary ? (summary.byDestination[selected] ?? null) : null}
      trip={trips[selected]}
      onTrip={(next) => setTrip(selected, next)}
      onClose={() => setSelected(null)}
    />
  );

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Visa map</h1>
        <nav className={styles.tabs} aria-label="Views">
          <button type="button" aria-current={tab === 'map' ? 'page' : undefined} onClick={() => setTab('map')}>
            Map
          </button>
          <button type="button" aria-current={tab === 'trips' ? 'page' : undefined} onClick={() => setTab('trips')}>
            Trips <span className={styles.badge}>{Object.keys(trips).length}</span>
          </button>
        </nav>
      </header>

      {tab === 'map' && (
        <Controls
          passports={passports}
          hues={hues}
          view={view}
          paletteId={settings.palette}
          onChange={changePassport}
          onAdd={addPassport}
          onRemove={removePassport}
          onColor={(code, hex) => setSettings((s) => ({ ...s, colors: { ...s.colors, [code]: hex } }))}
          onPalette={(id) => setSettings((s) => ({ ...s, palette: id, colors: {} }))}
          onView={(next) => patch({ view: next })}
        />
      )}

      <main className={styles.main}>
        <div className={styles.mapArea}>
          <VisaMap
            arcs={arcs}
            dimmed={dimmed}
            fills={fills}
            homes={homes}
            selected={selected}
            onSelect={handleSelect}
            focusRequest={focusRequest}
            renderTooltip={renderTooltip}
            ariaLabel={ariaLabel}
          />

          <div className={styles.mapTools}>
            <button
              type="button"
              className={styles.tool}
              aria-pressed={settings.arcs}
              onClick={() => setSettings((s) => ({ ...s, arcs: !s.arcs }))}
              title="Draw arcs from your home to the countries you marked as next"
            >
              Arcs{settings.arcs ? ` · ${arcs.length}` : ''}
            </button>
            {settings.arcs && (
              <label className={styles.toolSelect}>
                <span>from</span>
                <select
                  value={origin ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, origin: e.target.value || null }))}
                  aria-label="Where arcs start"
                >
                  {!origin && <option value="">Choose</option>}
                  {BY_NAME.map((c) => (
                    <option key={c} value={c}>
                      {nameOf(c)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {settings.arcs && arcs.length === 0 && (
              <span className={styles.toolHint}>Mark countries as Next to see arcs</span>
            )}
          </div>
        </div>

        <aside className={styles.panel} aria-label="Details">
          {tab === 'map' ? (
            <>
              <div className={styles.searchBox}>
                <CountrySearch label="Find a country" onPick={handlePick} />
              </div>

              {detail}

              {summary && <Summary passports={refs} summary={summary} />}

              {refs.length > 0 ? (
                <Legend mode={view} passports={refs} counts={counts} />
              ) : (
                <p className={styles.empty}>Choose your passport above to see where it can go.</p>
              )}
              {passports.length === 1 && (
                <p className={styles.empty}>
                  Holding more than one passport? Add the others above to see which to use for each destination.
                </p>
              )}
              {dimmed.size > 0 && (
                <p className={styles.empty}>Faded countries are the ones you marked as not going.</p>
              )}
            </>
          ) : (
            <>
              {detail && <div className={styles.detailGap}>{detail}</div>}
              <TripsPanel
                trips={trips}
                passports={passports}
                onSet={setTrip}
                onSelect={handlePick}
                onPick={handlePick}
                onReplaceAll={setTrips}
              />
            </>
          )}
        </aside>
      </main>

      <footer className={styles.footer}>
        Data from{' '}
        <a href={visa.meta.source} target="_blank" rel="noreferrer">
          imorte/passport-index-data
        </a>{' '}
        ({visa.meta.license}), repository snapshot {visa.meta.snapshot}. Entry rules change, so check the destination’s
        official source before you travel.
      </footer>
    </div>
  );
}
