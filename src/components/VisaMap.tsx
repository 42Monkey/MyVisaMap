import { useEffect, useRef, useState, type ReactNode } from 'react';
import { geoBounds, geoContains, geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo';
import { timer, type Timer } from 'd3-timer';
import { interpolateRgb } from 'd3-interpolate';
import { easeCubicInOut, easeCubicOut } from 'd3-ease';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import worldUrl from '../data/world-50m.json?url';
import { focus, markers } from '../data/places.ts';
import { HATCH, NO_DATA } from '../lib/palette.ts';
import styles from './VisaMap.module.css';

/** Where the globe rests: Africa, Europe and Asia in view, which is where most trips are. */
const HOME_ROT: [number, number] = [-20, -22];
const MIN_K = 1;
const MAX_K = 16;
/** The globe fills this share of the smaller side at zoom 1, leaving room for the glow. */
const FILL = 0.86;
const DEG_PER_RAD = 180 / Math.PI;
const HATCH_BASE = '#232e3b';
/** Focus zoom levels were written for a flat map; this converts them for the globe. */
const FOCUS_TO_K = 0.8;
const MARKER_R = 3.6;

export interface FocusRequest {
  code: string;
  /** Changes on every request so asking for the same country twice still flies there. */
  id: number;
}

export interface Arc {
  from: string;
  to: string;
  color: string;
}

/** Where to aim for a country: the focus point, or the dot position for tiny states. */
function pointOf(code: string): [number, number] | null {
  const f = focus[code];
  if (f) return [f[0], f[1]];
  const m = markers.find((x) => x.iso2 === code);
  return m ? m.coordinates : null;
}

interface Props {
  /** Arcs drawn over the globe, lifted off the surface. Empty for none. */
  arcs: readonly Arc[];
  /** Countries painted over with a dark veil (the ones the person will not visit). */
  dimmed: ReadonlySet<string>;
  /** Fill per country code: a colour, HATCH, or nothing for "no data". */
  fills: Readonly<Record<string, string>>;
  /** Countries drawn with a light outline (the two home countries). */
  homes: ReadonlySet<string>;
  selected: string | null;
  /** Called with a country code, or null when the sea is clicked. */
  onSelect: (code: string | null) => void;
  focusRequest: FocusRequest | null;
  renderTooltip: (code: string) => ReactNode;
  ariaLabel: string;
}

interface Shape {
  code: string;
  feature: Feature<Geometry>;
  bounds: [[number, number], [number, number]];
}

interface Tween {
  t0: number;
  duration: number;
  from: [number, number];
  to: [number, number];
  k0: number;
  k1: number;
  /** How far the view pulls back mid-flight, 0 to 0.4. */
  dip: number;
}

interface Anim {
  t0: number;
  duration: number;
  blend: Record<string, (t: number) => string>;
}

interface Globe {
  w: number;
  h: number;
  dpr: number;
  rot: [number, number];
  k: number;
  vel: [number, number];
  dragging: boolean;
  drift: boolean;
  tween: Tween | null;
  anim: Anim | null;
  shown: Record<string, string>;
  hatch: Set<string>;
  hovered: string | null;
  shapes: Shape[];
  last: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function inBounds(b: Shape['bounds'], lon: number, lat: number): boolean {
  const [[w, s], [e, n]] = b;
  if (lat < s || lat > n) return false;
  return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e;
}

/** Shortest way round: a target longitude as an offset from the current one. */
function nearestLon(from: number, to: number): number {
  return from + ((((to - from) % 360) + 540) % 360) - 180;
}

function makeHatch(ctx: CanvasRenderingContext2D, dpr: number): CanvasPattern | null {
  const size = 6 * dpr;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const t = tile.getContext('2d');
  if (!t) return null;
  t.strokeStyle = 'rgba(170, 190, 215, 0.55)';
  t.lineWidth = 1.1 * dpr;
  t.beginPath();
  t.moveTo(-1, size + 1);
  t.lineTo(size + 1, -1);
  t.moveTo(-1, 1);
  t.lineTo(1, -1);
  t.moveTo(size - 1, size + 1);
  t.lineTo(size + 1, size - 1);
  t.stroke();
  const pattern = ctx.createPattern(tile, 'repeat');
  pattern?.setTransform(new DOMMatrix().scale(1 / dpr));
  return pattern;
}

export function VisaMap({ arcs, dimmed, fills, homes, selected, onSelect, focusRequest, renderTooltip, ariaLabel }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Latest props, readable from the animation loop without re-creating it.
  const latest = useRef({ arcs, dimmed, fills, homes, selected, onSelect });
  const g = useRef<Globe>({
    w: 0,
    h: 0,
    dpr: 1,
    rot: [...HOME_ROT],
    k: 1,
    vel: [0, 0],
    dragging: false,
    drift: true,
    tween: null,
    anim: null,
    shown: {},
    hatch: new Set(),
    hovered: null,
    shapes: [],
    last: 0,
  });
  const api = useRef<{
    wake: () => void;
    applyFills: (instant: boolean) => void;
    flyTo: (code: string) => void;
    zoomBy: (factor: number) => void;
    reset: () => void;
    stopDrift: () => void;
  } | null>(null);

  useEffect(() => {
    latest.current = { arcs, dimmed, fills, homes, selected, onSelect };
    api.current?.applyFills(false);
    api.current?.wake();
  }, [arcs, dimmed, fills, homes, selected, onSelect]);

  // Fly to a country when search or a list asks for it.
  useEffect(() => {
    if (focusRequest) api.current?.flyTo(focusRequest.code);
  }, [focusRequest]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!wrap || !canvas || !ctx) return;

    const state = g.current;
    const projection = geoOrthographic().clipAngle(90).precision(0.6);
    const path = geoPath(projection, ctx);
    const graticule = geoGraticule10();
    let hatchPattern: CanvasPattern | null = null;
    let loop: Timer | null = null;
    let disposed = false;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; x: number; y: number } | null = null;
    let down: { x: number; y: number; moved: boolean } | null = null;
    let lastMove = 0;

    const baseScale = () => (Math.min(state.w, state.h) / 2) * FILL;
    const sync = () => {
      projection
        .scale(baseScale() * state.k)
        .translate([state.w / 2, state.h / 2])
        .rotate([state.rot[0], state.rot[1]]);
    };
    /** Degrees of rotation per screen pixel at the current zoom. */
    const sens = () => DEG_PER_RAD / (baseScale() * state.k);
    const clampRot = () => {
      state.rot[1] = clamp(state.rot[1], -90, 90);
      state.rot[0] = ((((state.rot[0] + 180) % 360) + 360) % 360) - 180;
    };

    // ---- colour ----
    function applyFills(instant: boolean) {
      const { fills: wanted } = latest.current;
      const target: Record<string, string> = {};
      const hatch = new Set<string>();
      const all = new Set<string>(state.shapes.map((s) => s.code));
      for (const m of markers) all.add(m.iso2);
      for (const code of all) {
        const f = wanted[code] ?? NO_DATA;
        if (f === HATCH) {
          hatch.add(code);
          target[code] = HATCH_BASE;
        } else {
          target[code] = f;
        }
      }
      state.hatch = hatch;

      if (instant || reducedMotion() || Object.keys(state.shown).length === 0) {
        state.shown = target;
        state.anim = null;
        return;
      }
      const blend: Record<string, (t: number) => string> = {};
      for (const code of all) {
        const from = state.shown[code] ?? NO_DATA;
        if (from !== target[code]) blend[code] = interpolateRgb(from, target[code]);
      }
      state.anim = { t0: performance.now(), duration: 380, blend };
    }

    // ---- drawing ----
    function paint(code: string): string | CanvasPattern {
      return state.shown[code] ?? NO_DATA;
    }

    function draw() {
      const { w, h, dpr } = state;
      if (!w || !h) return;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);
      sync();
      const r = projection.scale();
      const cx = w / 2;
      const cy = h / 2;
      const c = ctx!;

      // Glow just outside the limb.
      const glow = c.createRadialGradient(cx, cy, r * 0.97, cx, cy, r * 1.2);
      glow.addColorStop(0, 'rgba(110, 165, 235, 0.22)');
      glow.addColorStop(1, 'rgba(110, 165, 235, 0)');
      c.fillStyle = glow;
      c.beginPath();
      c.arc(cx, cy, r * 1.2, 0, Math.PI * 2);
      c.fill();

      // Sea: lit from the upper left.
      const sea = c.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.05, cx, cy, r * 1.35);
      sea.addColorStop(0, '#1b2a3a');
      sea.addColorStop(1, '#090e15');
      c.fillStyle = sea;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fill();

      c.lineWidth = 0.6;
      c.strokeStyle = 'rgba(160, 190, 225, 0.075)';
      c.beginPath();
      path(graticule);
      c.stroke();

      // Countries.
      c.lineJoin = 'round';
      c.lineWidth = 0.6;
      c.strokeStyle = 'rgba(6, 10, 16, 0.9)';
      for (const shape of state.shapes) {
        c.beginPath();
        path(shape.feature);
        c.fillStyle = paint(shape.code);
        c.fill();
        if (hatchPattern && state.hatch.has(shape.code)) {
          c.fillStyle = hatchPattern;
          c.fill();
        }
        c.stroke();
      }

      // Limb darkening gives the sphere its volume.
      const shade = c.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.55, cx, cy, r * 1.01);
      shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
      shade.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
      c.fillStyle = shade;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fill();

      const { homes: homeSet, selected: sel, arcs: arcList, dimmed: dimSet } = latest.current;

      // A dark veil over countries the person has ruled out.
      if (dimSet.size > 0) {
        c.fillStyle = 'rgba(8, 12, 18, 0.62)';
        for (const shape of state.shapes) {
          if (!dimSet.has(shape.code)) continue;
          c.beginPath();
          path(shape.feature);
          c.fill();
        }
      }

      // Highlights: home countries, hover, selection.
      const hover = state.hovered;
      const byCode = (code: string) => state.shapes.find((s) => s.code === code);
      c.lineWidth = 1.2;
      c.strokeStyle = 'rgba(235, 242, 250, 0.85)';
      for (const code of homeSet) {
        const s = byCode(code);
        if (!s) continue;
        c.beginPath();
        path(s.feature);
        c.stroke();
      }
      if (hover && hover !== sel) {
        const s = byCode(hover);
        if (s) {
          c.beginPath();
          path(s.feature);
          c.fillStyle = 'rgba(255, 255, 255, 0.16)';
          c.fill();
          c.lineWidth = 1;
          c.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          c.stroke();
        }
      }
      if (sel) {
        const s = byCode(sel);
        if (s) {
          c.beginPath();
          path(s.feature);
          c.lineWidth = 2;
          c.strokeStyle = '#ffffff';
          c.stroke();
        }
      }

      // Small countries get a dot until their shape is big enough to see.
      const centre: [number, number] = [-state.rot[0], -state.rot[1]];
      for (const m of markers) {
        const hideAt = (focus[m.iso2]?.[2] ?? Infinity) * FOCUS_TO_K * 0.9;
        if (state.k >= hideAt) continue;
        if (geoDistance(m.coordinates, centre) > Math.PI / 2 - 0.03) continue;
        const p = projection(m.coordinates);
        if (!p) continue;
        c.beginPath();
        c.arc(p[0], p[1], MARKER_R, 0, Math.PI * 2);
        c.fillStyle = paint(m.iso2);
        c.fill();
        if (hatchPattern && state.hatch.has(m.iso2)) {
          c.fillStyle = hatchPattern;
          c.fill();
        }
        const isSel = m.iso2 === sel;
        const isHover = m.iso2 === hover;
        c.lineWidth = isSel ? 2 : homeSet.has(m.iso2) ? 1.4 : 1;
        c.strokeStyle = isSel ? '#ffffff' : homeSet.has(m.iso2) || isHover ? 'rgba(235, 242, 250, 0.9)' : 'rgba(6, 10, 16, 0.9)';
        c.stroke();
      }

      // Arcs lift off the surface: each point is pushed away from the centre in proportion to how
      // far along the route it is, which for an orthographic view is just scaling its screen offset.
      const centreLonLat: [number, number] = [-state.rot[0], -state.rot[1]];
      c.lineCap = 'round';
      for (const arc of arcList) {
        const from = pointOf(arc.from);
        const to = pointOf(arc.to);
        if (!from || !to || arc.from === arc.to) continue;
        const dist = geoDistance(from, to);
        const lift = Math.min(0.2, 0.03 + dist * 0.07);
        const steps = Math.max(24, Math.ceil(dist * 48));
        const along = geoInterpolate(from, to);
        const pts: Array<[number, number] | null> = [];
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const pt = along(t);
          const p = geoDistance(pt, centreLonLat) < Math.PI / 2 ? projection(pt) : null;
          if (!p) {
            pts.push(null);
            continue;
          }
          const h = Math.sin(Math.PI * t) * lift;
          pts.push([cx + (p[0] - cx) * (1 + h), cy + (p[1] - cy) * (1 + h)]);
        }
        c.save();
        c.shadowColor = arc.color;
        c.shadowBlur = 10;
        c.strokeStyle = arc.color;
        c.globalAlpha = 0.9;
        c.lineWidth = 1.7;
        c.beginPath();
        let pen = false;
        for (const q of pts) {
          if (!q) {
            pen = false;
            continue;
          }
          if (pen) c.lineTo(q[0], q[1]);
          else c.moveTo(q[0], q[1]);
          pen = true;
        }
        c.stroke();
        c.restore();
        const end = pts[pts.length - 1];
        const start = pts[0];
        c.fillStyle = arc.color;
        if (end) {
          c.beginPath();
          c.arc(end[0], end[1], 4.2, 0, Math.PI * 2);
          c.fill();
          c.lineWidth = 1.4;
          c.strokeStyle = 'rgba(8, 12, 18, 0.85)';
          c.stroke();
        }
        if (start) {
          c.beginPath();
          c.arc(start[0], start[1], 2.6, 0, Math.PI * 2);
          c.fill();
        }
      }

      // Rim.
      c.lineWidth = 1;
      c.strokeStyle = 'rgba(175, 205, 240, 0.2)';
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
    }

    // ---- loop ----
    function step(now: number) {
      const dt = clamp(now - state.last, 0, 48);
      state.last = now;
      let active = false;

      if (state.tween) {
        const tw = state.tween;
        const t = clamp((now - tw.t0) / tw.duration, 0, 1);
        const e = easeCubicInOut(t);
        state.rot[0] = tw.from[0] + (tw.to[0] - tw.from[0]) * e;
        state.rot[1] = tw.from[1] + (tw.to[1] - tw.from[1]) * e;
        const pull = 1 - tw.dip * Math.sin(Math.PI * t);
        state.k = clamp(Math.exp(Math.log(tw.k0) + (Math.log(tw.k1) - Math.log(tw.k0)) * e) * pull, MIN_K, MAX_K);
        if (t >= 1) state.tween = null;
        active = true;
      } else if (!state.dragging && Math.hypot(state.vel[0], state.vel[1]) > 0.0015) {
        state.rot[0] += state.vel[0] * dt;
        state.rot[1] += state.vel[1] * dt;
        const decay = Math.exp(-dt / 380);
        state.vel[0] *= decay;
        state.vel[1] *= decay;
        clampRot();
        active = true;
      } else if (state.drift && !state.dragging && !reducedMotion()) {
        state.rot[0] += dt * 0.0028;
        clampRot();
        active = true;
      }

      if (state.anim) {
        const t = clamp((now - state.anim.t0) / state.anim.duration, 0, 1);
        const e = easeCubicOut(t);
        for (const code in state.anim.blend) state.shown[code] = state.anim.blend[code](e);
        if (t >= 1) state.anim = null;
        active = true;
      }

      draw();
      if (!active) {
        loop?.stop();
        loop = null;
      }
    }

    function wake() {
      if (disposed || loop) return;
      state.last = performance.now();
      loop = timer(() => step(performance.now()));
    }

    function stopDrift() {
      state.drift = false;
    }

    // ---- navigation ----
    function zoomAt(nextK: number, px: number, py: number) {
      sync();
      const p = projection.invert!([px, py]);
      state.k = clamp(nextK, MIN_K, MAX_K);
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
      // Nudge the rotation until the point under the pointer is still under the pointer.
      for (let i = 0; i < 4; i++) {
        sync();
        const q = projection(p);
        if (!q) break;
        state.rot[0] += (px - q[0]) * sens();
        state.rot[1] -= (py - q[1]) * sens();
        clampRot();
      }
    }

    function flyTo(code: string) {
      stopDrift();
      const f = focus[code];
      const m = markers.find((x) => x.iso2 === code);
      const lon = f?.[0] ?? m?.coordinates[0];
      const lat = f?.[1] ?? m?.coordinates[1];
      if (lon == null || lat == null) return;
      const k1 = clamp((f?.[2] ?? 6) * FOCUS_TO_K, 1.25, MAX_K);
      const to: [number, number] = [nearestLon(state.rot[0], -lon), clamp(-lat, -90, 90)];
      const from: [number, number] = [state.rot[0], state.rot[1]];
      const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
      state.vel = [0, 0];
      state.tween = {
        t0: performance.now(),
        duration: reducedMotion() ? 1 : clamp(500 + distance * 7, 600, 1500),
        from,
        to,
        k0: state.k,
        k1,
        dip: clamp(distance / 200, 0, 0.35),
      };
      wake();
    }

    function reset() {
      stopDrift();
      const from: [number, number] = [state.rot[0], state.rot[1]];
      const to: [number, number] = [nearestLon(from[0], HOME_ROT[0]), HOME_ROT[1]];
      state.vel = [0, 0];
      state.tween = {
        t0: performance.now(),
        duration: reducedMotion() ? 1 : 900,
        from,
        to,
        k0: state.k,
        k1: 1,
        dip: 0,
      };
      wake();
    }

    function zoomBy(factor: number) {
      stopDrift();
      state.tween = null;
      zoomAt(state.k * factor, state.w / 2, state.h / 2);
      wake();
    }

    // ---- hit testing ----
    function hit(x: number, y: number): string | null {
      sync();
      const centre: [number, number] = [-state.rot[0], -state.rot[1]];
      for (const m of markers) {
        const hideAt = (focus[m.iso2]?.[2] ?? Infinity) * FOCUS_TO_K * 0.9;
        if (state.k >= hideAt) continue;
        if (geoDistance(m.coordinates, centre) > Math.PI / 2 - 0.03) continue;
        const p = projection(m.coordinates);
        if (p && Math.hypot(p[0] - x, p[1] - y) <= MARKER_R + 4) return m.iso2;
      }
      const pt = projection.invert!([x, y]);
      if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return null;
      for (const s of state.shapes) {
        if (inBounds(s.bounds, pt[0], pt[1]) && geoContains(s.feature, pt)) return s.code;
      }
      return null;
    }

    function local(e: { clientX: number; clientY: number }) {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function setHover(code: string | null) {
      if (state.hovered === code) return;
      state.hovered = code;
      setHovered(code);
      wake();
    }

    // ---- pointer events ----
    function onPointerDown(e: PointerEvent) {
      stopDrift();
      canvas!.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      state.tween = null;
      state.vel = [0, 0];
      if (pointers.size === 1) {
        down = { ...p, moved: false };
        lastMove = e.timeStamp;
        state.dragging = true;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (down) down.moved = true;
      }
      wake();
    }

    function onPointerMove(e: PointerEvent) {
      stopDrift();
      const p = local(e);
      pointer.current = p;

      if (!pointers.has(e.pointerId)) {
        if (e.pointerType !== 'touch') setHover(hit(p.x, p.y));
        placeTip();
        return;
      }

      const prev = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, p);

      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        if (pinch.dist > 0) zoomAt(state.k * (dist / pinch.dist), mx, my);
        state.rot[0] += (mx - pinch.x) * sens();
        state.rot[1] -= (my - pinch.y) * sens();
        clampRot();
        pinch = { dist, x: mx, y: my };
        wake();
        return;
      }

      if (!down) return;
      if (!down.moved && Math.hypot(p.x - down.x, p.y - down.y) > 5) {
        down.moved = true;
        setHover(null);
      }
      if (!down.moved) return;
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const s = sens();
      const dt = clamp(e.timeStamp - lastMove, 1, 64);
      state.rot[0] += dx * s;
      state.rot[1] -= dy * s;
      clampRot();
      // Smoothed velocity in degrees per millisecond, for the glide after release.
      state.vel = [state.vel[0] * 0.6 + ((dx * s) / dt) * 0.4, state.vel[1] * 0.6 + ((-dy * s) / dt) * 0.4];
      lastMove = e.timeStamp;
      wake();
    }

    function onPointerUp(e: PointerEvent) {
      const was = down;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        state.dragging = false;
        down = null;
        if (was && !was.moved) {
          const p = local(e);
          latest.current.onSelect(hit(p.x, p.y));
          state.vel = [0, 0];
        } else if (was?.moved && e.timeStamp - lastMove > 90) {
          state.vel = [0, 0];
        }
        wake();
      }
    }

    function onPointerLeave() {
      if (pointers.size === 0) setHover(null);
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      stopDrift();
      state.tween = null;
      state.vel = [0, 0];
      const p = local(e);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const factor = Math.exp((-e.deltaY * unit) / 560);
      zoomAt(state.k * clamp(factor, 0.5, 2), p.x, p.y);
      pointer.current = p;
      if (e.deltaMode === 0 && pointers.size === 0) setHover(hit(p.x, p.y));
      wake();
    }

    function onKeyDown(e: KeyboardEvent) {
      const step = 12 / state.k;
      const keys: Record<string, () => void> = {
        ArrowLeft: () => (state.rot[0] += step),
        ArrowRight: () => (state.rot[0] -= step),
        ArrowUp: () => (state.rot[1] += step),
        ArrowDown: () => (state.rot[1] -= step),
        '+': () => zoomAt(state.k * 1.4, state.w / 2, state.h / 2),
        '=': () => zoomAt(state.k * 1.4, state.w / 2, state.h / 2),
        '-': () => zoomAt(state.k / 1.4, state.w / 2, state.h / 2),
        '0': () => reset(),
      };
      const run = keys[e.key];
      if (!run) return;
      e.preventDefault();
      stopDrift();
      state.tween = e.key === '0' ? state.tween : null;
      run();
      clampRot();
      wake();
    }

    function placeTip() {
      const tip = tipRef.current;
      if (!tip) return;
      const { x, y } = pointer.current;
      const left = x > state.w - tip.offsetWidth - 24 ? x - tip.offsetWidth - 14 : x + 16;
      const top = y > state.h - tip.offsetHeight - 24 ? y - tip.offsetHeight - 14 : y + 16;
      tip.style.transform = `translate(${left}px, ${top}px)`;
    }

    // ---- size ----
    function resize() {
      const rect = wrap!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      state.w = rect.width;
      state.h = rect.height;
      state.dpr = dpr;
      canvas!.width = Math.max(1, Math.round(rect.width * dpr));
      canvas!.height = Math.max(1, Math.round(rect.height * dpr));
      hatchPattern = makeHatch(ctx!, dpr);
      wake();
    }

    api.current = { wake, applyFills, flyTo, zoomBy, reset, stopDrift };

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('focus', stopDrift);

    // Load the shapes once.
    fetch(worldUrl)
      .then((r) => r.json() as Promise<Topology>)
      .then((topology) => {
        if (disposed) return;
        const collection = feature(topology, topology.objects.countries) as FeatureCollection<Geometry, { iso2?: string }>;
        state.shapes = collection.features
          .filter((f) => f.properties?.iso2)
          .map((f) => ({
            code: f.properties.iso2 as string,
            feature: f,
            bounds: geoBounds(f),
          }));
        applyFills(true);
        setReady(true);
        wake();
      })
      .catch(() => {
        /* The shapes are static assets; if they fail the globe stays empty and the search still works. */
      });

    return () => {
      disposed = true;
      loop?.stop();
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('focus', stopDrift);
      api.current = null;
    };
  }, []);

  // Keep the tooltip next to the pointer after its content changes.
  useEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    const { x, y } = pointer.current;
    const { w, h } = g.current;
    const left = x > w - tip.offsetWidth - 24 ? x - tip.offsetWidth - 14 : x + 16;
    const top = y > h - tip.offsetHeight - 24 ? y - tip.offsetHeight - 14 : y + 16;
    tip.style.transform = `translate(${left}px, ${top}px)`;
  }, [hovered, renderTooltip]);

  return (
    <div ref={wrapRef} className={styles.wrap} data-ready={ready ? '1' : undefined}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="application"
        aria-label={`${ariaLabel}. Drag to turn, scroll or pinch to zoom, arrow keys to turn, plus and minus to zoom.`}
        tabIndex={0}
      />

      {!ready && <p className={styles.loading}>Loading map</p>}

      {hovered && (
        <div ref={tipRef} className={styles.tip} role="presentation">
          {renderTooltip(hovered)}
        </div>
      )}

      <div className={styles.zoom} role="group" aria-label="Globe zoom">
        <button type="button" onClick={() => api.current?.zoomBy(1.6)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => api.current?.zoomBy(1 / 1.6)} aria-label="Zoom out">
          −
        </button>
        <button type="button" className={styles.fit} onClick={() => api.current?.reset()} aria-label="Show the whole globe">
          Fit
        </button>
      </div>
    </div>
  );
}
