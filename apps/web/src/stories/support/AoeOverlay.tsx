'use client';

// PREVIEW ONLY — not production. Draws the proposed jammer area-of-effect
// graphics (docs/plans/jammer-aoe.md §3.2 of the design) on top of the REAL
// COP/MapSpine, without changing MapSpine:
//
// - MapSpine keeps its maplibre map private, so this module records every
//   maplibre Map that adds a control (MapSpine adds its deck.gl overlay right
//   after construction) and the frame picks the one inside its own DOM.
// - The graphics are an SVG portalled into the map's canvas container: above
//   the basemap, below MapSpine's symbol overlay (so the production symbols,
//   declutter stacks and tooltips stay on top), projected with map.project()
//   on every map move (same frame, like SpineOverlay).
// - The suspected-emitter symbol is NOT drawn here: the story passes the mode
//   to MapSpine's existing `candidateSites` prop, so it is the production
//   symbol (status 1 = dashed frame) and joins the production declutter.
//
// In production the same graphics are deck.gl PolygonLayer / PathLayer (with
// PathStyleExtension dashes — @deck.gl/extensions already ships inside the
// `deck.gl` dependency) in MapSpine and ground polygons in CesiumSpine; see
// the plan's file table. Calm UI: no flashing, no pulse; a one-time 300 ms
// opacity fade-in, skipped under prefers-reduced-motion.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import maplibregl from 'maplibre-gl';
import { boundsOf, fitMercator, type LatLon } from '@/lib/camera-fit';
import { formatDtg } from '@/lib/link-trust-rating';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { TrackSymbol } from '@/components/symbol';
import {
  RX_LABEL,
  dbmToW,
  type AoeLayer,
  type Bearing,
  type EmitterEstimate,
  type EvidenceItem,
  type LonLat,
  type MultiPolygon,
  type RxClass,
} from '@/stories/fixtures/aoe-preview';
import { AOE_FILL_ALPHA, AOE_RGB, rgba, type AoeHue } from './aoe-palette';

// ---------------------------------------------------------------------------
// Map capture (story-only shim)
// ---------------------------------------------------------------------------

const MAPS = new Set<maplibregl.Map>();
const MAP_LISTENERS = new Set<() => void>();
let patched = false;
function patchMaplibre() {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  const proto = maplibregl.Map.prototype as unknown as { addControl: (...a: unknown[]) => unknown };
  const orig = proto.addControl;
  proto.addControl = function patchedAddControl(this: maplibregl.Map, ...args: unknown[]) {
    if (!MAPS.has(this)) {
      MAPS.add(this);
      this.once('remove', () => MAPS.delete(this));
      queueMicrotask(() => MAP_LISTENERS.forEach((l) => l()));
    }
    return orig.apply(this, args);
  };
}
patchMaplibre();

function useMapIn(root: React.RefObject<HTMLElement | null>): maplibregl.Map | null {
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  useEffect(() => {
    const find = () => {
      const el = root.current;
      if (!el) return;
      for (const m of MAPS) if (el.contains(m.getContainer())) return setMap((p) => (p === m ? p : m));
    };
    find();
    MAP_LISTENERS.add(find);
    const id = window.setInterval(find, 250);
    return () => {
      MAP_LISTENERS.delete(find);
      window.clearInterval(id);
    };
  }, [root]);
  return map;
}

// ---------------------------------------------------------------------------
// Styles per receiver class
// ---------------------------------------------------------------------------

const HUE: Record<RxClass, AoeHue> = { gnss_civil: 'gnssCivil', gnss_mil: 'gnssMil', uhf_comms: 'uhfComms', fpv_link: 'fpvLink' };
/** Fill pattern of the 90% area: solid tint (civil), dense hatch (mil), diagonal hatch (UHF), cross-hatch (FPV). */
const PATTERN: Record<RxClass, 'tint' | 'dense' | 'diag' | 'cross'> = { gnss_civil: 'tint', gnss_mil: 'dense', uhf_comms: 'diag', fpv_link: 'cross' };

export const NAI_INK = 'var(--sym-ink)';

const mono: CSSProperties = { fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' };
export const plate: CSSProperties = {
  background: 'oklch(14% 0.01 250 / 0.86)',
  border: '1px solid var(--surface-elevated)',
  color: 'var(--text-primary)',
  padding: '4px 8px',
  borderRadius: 2,
  ...mono,
  fontSize: 'var(--text-micro)',
  lineHeight: 1.45,
};

// ---------------------------------------------------------------------------
// Overlay model
// ---------------------------------------------------------------------------

export interface AoeView {
  estimate: EmitterEstimate | null;
  /** Receiver classes switched on (chip row). */
  layers: readonly RxClass[];
  /** Illustrative layers (UHF / FPV) to draw if switched on. */
  extraLayers?: readonly AoeLayer[] | undefined;
  showNai?: boolean | undefined;
  showEvidence?: boolean | undefined;
  bearings?: readonly Bearing[] | undefined;
  /** Estimate age, s (label). */
  ageS: number;
  /** Method label for the map label, e.g. "Pole-21-class". */
  methodLabel: string;
  /** EVALUATION ONLY — hidden truth (point + true AoE outline + prior FLOT). Never in an operator story. */
  truth?: { lat: number; lon: number; aoe?: MultiPolygon | undefined; flot?: readonly LonLat[] | undefined } | undefined;
}

export function layersOf(v: AoeView): AoeLayer[] {
  const all = [...(v.estimate?.aoe ?? []), ...(v.extraLayers ?? [])];
  return all.filter((l) => v.layers.includes(l.rx_class));
}

/** Map label (design §3.2), e.g. "Est. GPS denial · Pole-21-class · 90% · 3 s ago · 4 degraded / 4 healthy". */
export function aoeLabel(v: AoeView, layer: AoeLayer): string {
  const e = v.estimate!;
  const current = e.evidence.filter((x) => !x.superseded);
  const deg = current.filter((x) => x.state === 'degraded').length;
  const ok = current.length - deg;
  const has90 = layer.contours.some((c) => c.p === 0.9 && c.polygon.coordinates.length);
  const what =
    layer.rx_class === 'gnss_civil'
      ? 'Est. GPS denial'
      : layer.rx_class === 'gnss_mil'
        ? 'Est. GPS denial (mil rx)'
        : layer.rx_class === 'uhf_comms'
          ? `Est. UHF denial · ${layer.ref_link_km} km links`
          : `Est. FPV link denial · ${layer.ref_link_km} km links`;
  if (layer.illustrative) return `${what} · ILLUSTRATIVE — not in ${v.methodLabel} bands`;
  if (e.state === 'stale') return `Last est. ${formatDtg(e.computed_at)} · ${what.replace('Est. ', '')} · ${v.methodLabel} · outline only`;
  return `${what} · ${v.methodLabel} · ${has90 ? '90%' : '50%'} · ${v.ageS} s ago · ${deg} degraded / ${ok} healthy`;
}

// ---------------------------------------------------------------------------
// Frame: map capture, camera fit, chips, legend
// ---------------------------------------------------------------------------

export interface AoeMapFrameProps extends AoeView {
  children: ReactNode;
  /** Extra fit points (tracks + estimate extent). Applied once with lib/camera-fit fitMercator. */
  fitPoints?: readonly LatLon[] | undefined;
  /** Chip row: receiver classes the method covers (others are disabled with a reason). */
  available?: readonly RxClass[] | undefined;
  onToggle?: ((rx: RxClass) => void) | undefined;
  onToggleNai?: (() => void) | undefined;
  /** Legend extras (e.g. evaluation table). */
  legendExtra?: ReactNode;
  hideLegend?: boolean | undefined;
}

export function AoeMapFrame(props: AoeMapFrameProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const map = useMapIn(rootRef);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [, setTick] = useState(0);
  const reduced = usePrefersReducedMotion();

  // Host div inside the canvas container: above the basemap, below MapSpine's symbol overlay.
  useEffect(() => {
    if (!map) return;
    const el = document.createElement('div');
    el.dataset.testid = 'aoe-preview-layer';
    Object.assign(el.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '1' });
    map.getCanvasContainer().appendChild(el);
    setHost(el);
    const onMove = () => flushSync(() => setTick((t) => t + 1));
    map.on('move', onMove);
    map.on('resize', onMove);
    return () => {
      map.off('move', onMove);
      map.off('resize', onMove);
      el.remove();
      setHost(null);
    };
  }, [map]);

  // Camera fit: the plan's proposed fit (tracks + AoE extent) through the production fit maths.
  const fitKey = JSON.stringify(props.fitPoints ?? []);
  const fittedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!map || !props.fitPoints?.length || fittedRef.current === fitKey) return;
    // After MapSpine's own first fit (it frames tracks only); never on operator navigation.
    const id = window.setTimeout(() => {
      const c = map.getContainer();
      const bounds = boundsOf(props.fitPoints ?? []);
      if (!bounds || !c.clientWidth) return;
      const v = fitMercator({ bounds, width: c.clientWidth, height: c.clientHeight });
      map.jumpTo({ center: [v.longitude, v.latitude], zoom: v.zoom });
      fittedRef.current = fitKey;
    }, 450);
    return () => window.clearTimeout(id);
  }, [map, fitKey, props.fitPoints]);

  return (
    <div ref={rootRef} data-testid="aoe-frame" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {props.children}
      {host && map && createPortal(<AoeSvg map={map} view={props} fade={!reduced} />, host)}
      {props.estimate && <ChipRow {...props} />}
      {!props.hideLegend && props.estimate && <AoeLegend view={props} extra={props.legendExtra} zoom={map?.getZoom()} />}
    </div>
  );
}

function ChipRow(p: AoeMapFrameProps) {
  const avail = p.available ?? ['gnss_civil', 'gnss_mil'];
  const all: RxClass[] = ['gnss_civil', 'gnss_mil', 'uhf_comms', 'fpv_link'];
  return (
    <div role="group" aria-label="Area-of-effect layers" style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: '60%' }}>
      {all.map((rx) => {
        const on = p.layers.includes(rx);
        const enabled = avail.includes(rx);
        const hue = AOE_RGB[HUE[rx]];
        return (
          <button
            key={rx}
            type="button"
            data-testid={`aoe-chip-${rx}`}
            aria-pressed={on}
            disabled={!enabled}
            title={enabled ? `Show / hide ${RX_LABEL[rx]}` : `${p.methodLabel} does not cover this band — no ${RX_LABEL[rx]} estimate`}
            onClick={() => p.onToggle?.(rx)}
            style={{
              ...plate,
              cursor: enabled ? 'pointer' : 'not-allowed',
              opacity: enabled ? 1 : 0.45,
              color: on ? 'var(--text-primary)' : 'var(--text-tertiary)',
              borderColor: on ? rgba(hue, 1) : 'var(--surface-elevated)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span aria-hidden style={{ width: 10, height: 10, background: on ? rgba(hue, 0.9) : 'transparent', border: `1px solid ${rgba(hue, 1)}` }} />
            {RX_LABEL[rx]}
            {!enabled && ' · n/a'}
          </button>
        );
      })}
      <button type="button" data-testid="aoe-chip-nai" aria-pressed={!!p.showNai} onClick={() => p.onToggleNai?.()} style={{ ...plate, cursor: 'pointer', color: p.showNai ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
        NAI
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG graphics
// ---------------------------------------------------------------------------

function project(map: maplibregl.Map, [lon, lat]: LonLat): [number, number] {
  const p = map.project([lon, lat]);
  return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
}

function pathOf(map: maplibregl.Map, m: MultiPolygon): string {
  return m.coordinates
    .map((poly) => poly.map((ring) => ring.map((c, i) => `${i ? 'L' : 'M'}${project(map, c).join(' ')}`).join('') + 'Z').join(''))
    .join('');
}

/** Pixels per km at a latitude (Web Mercator, from the map's own projection). */
function pxPerKm(map: maplibregl.Map, lat: number, lon: number): number {
  const a = map.project([lon, lat]);
  const b = map.project([lon + 1 / (111.32 * Math.cos((lat * Math.PI) / 180)), lat]);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Destination point (flat-earth, km) — bearing in degrees true. */
function dest(lat: number, lon: number, bearingDeg: number, km: number): LonLat {
  const b = (bearingDeg * Math.PI) / 180;
  return [lon + (km * Math.sin(b)) / (111.32 * Math.cos((lat * Math.PI) / 180)), lat + (km * Math.cos(b)) / 111.32];
}

function largestRingAnchor(map: maplibregl.Map, m: MultiPolygon, pick: 'west' | 'centroid'): [number, number] | null {
  let best: LonLat[] | null = null;
  for (const poly of m.coordinates) if (!best || poly[0]!.length > best.length) best = poly[0]!;
  if (!best) return null;
  if (pick === 'west') {
    const w = best.reduce((a, c) => (c[0] < a[0] ? c : a));
    return project(map, w);
  }
  const [sx, sy] = best.reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]);
  return project(map, [sx / best.length, sy / best.length]);
}

function AoeSvg({ map, view, fade }: { map: maplibregl.Map; view: AoeView; fade: boolean }) {
  const c = map.getContainer();
  const w = c.clientWidth;
  const h = c.clientHeight;
  const e = view.estimate;
  const stale = e?.state === 'stale';
  const layers = layersOf(view);
  const [shown, setShown] = useState(!fade);
  useEffect(() => {
    if (!fade) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [fade]);

  const units = useMemo(() => (e?.evidence ?? []).filter((x) => !x.superseded), [e]);

  return (
    <svg
      width={w}
      height={h}
      style={{ position: 'absolute', inset: 0, opacity: shown ? 1 : 0, transition: fade ? 'opacity 300ms var(--ease-in-out-smooth)' : undefined }}
      data-testid="aoe-svg"
      data-state={e?.state ?? 'none'}
    >
      <defs>
        {layers.map((l) => {
          const hue = AOE_RGB[HUE[l.rx_class]];
          const pat = PATTERN[l.rx_class];
          const id = `aoe-pat-${l.rx_class}`;
          if (pat === 'tint') return null;
          const gap = pat === 'dense' ? 5 : 8;
          return (
            <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={gap} height={gap} patternTransform="rotate(45)">
              <rect width={gap} height={gap} fill={rgba(hue, pat === 'dense' ? 0.12 : 0.04)} />
              <line x1={0} y1={0} x2={0} y2={gap} stroke={rgba(hue, 0.55)} strokeWidth={1.2} />
              {pat === 'cross' && <line x1={0} y1={0} x2={gap} y2={0} stroke={rgba(hue, 0.55)} strokeWidth={1.2} />}
            </pattern>
          );
        })}
        {/* Evidence footprint: fills only where a reporting unit can see; beyond it the contour is outline only ("extrapolated"). */}
        {layers.map((l) => (
          <clipPath key={l.rx_class} id={`aoe-fp-${l.rx_class}`}>
            {units.map((u) => {
              const [x, y] = project(map, [u.lon, u.lat]);
              return <circle key={u.source_id + u.lat} cx={x} cy={y} r={l.footprint_radius_km * pxPerKm(map, u.lat, u.lon)} />;
            })}
          </clipPath>
        ))}
      </defs>

      {/* Truth (Evaluation only) */}
      {view.truth?.flot && (
        <g data-testid="aoe-flot">
          <path d={`M${project(map, view.truth.flot[0]!).join(' ')}L${project(map, view.truth.flot[1]!).join(' ')}`} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="2 4" fill="none" />
          <text x={project(map, view.truth.flot[1]!)[0] + 4} y={project(map, view.truth.flot[1]!)[1] + 12} fill="var(--text-tertiary)" style={{ ...mono, fontSize: 10 }}>
            FLOT (prior)
          </text>
        </g>
      )}

      {/* AoE layers: 90% fill (clipped to the evidence footprint) + 2 px edge; 50% dashed outline. */}
      {layers.map((l) => {
        const hue = AOE_RGB[HUE[l.rx_class]];
        const c90 = l.contours.find((x) => x.p === 0.9);
        const c50 = l.contours.find((x) => x.p === 0.5);
        const fill = PATTERN[l.rx_class] === 'tint' ? rgba(hue, AOE_FILL_ALPHA) : `url(#aoe-pat-${l.rx_class})`;
        return (
          <g key={l.rx_class} data-testid={`aoe-layer-${l.rx_class}`} data-illustrative={l.illustrative ? 'true' : undefined}>
            {c90 && c90.polygon.coordinates.length > 0 && (
              <>
                {!stale && <path d={pathOf(map, c90.polygon)} fill={fill} fillRule="evenodd" clipPath={`url(#aoe-fp-${l.rx_class})`} data-testid={`aoe-fill90-${l.rx_class}`} />}
                <path d={pathOf(map, c90.polygon)} fill="none" stroke={rgba(hue, stale ? 0.55 : 1)} strokeWidth={stale ? 1.25 : 2} strokeLinejoin="round" data-testid={`aoe-edge90-${l.rx_class}`} />
              </>
            )}
            {c50 && c50.polygon.coordinates.length > 0 && (
              <path d={pathOf(map, c50.polygon)} fill="none" stroke={rgba(hue, stale ? 0.5 : 0.95)} strokeWidth={1.5} strokeDasharray="7 5" strokeLinejoin="round" data-testid={`aoe-edge50-${l.rx_class}`} />
            )}
          </g>
        );
      })}

      {/* NAI J1 — MCRP 5-12A / FM 1-02.2 NAI graphic (SIDC 10032500001202000000): dashed boundary, T = NAI J1, W = DTG. */}
      {e && view.showNai && e.emitter.region90.coordinates.length > 0 && (
        <g data-testid="aoe-nai">
          <path d={pathOf(map, e.emitter.region90)} fill="none" stroke={NAI_INK} strokeOpacity={stale ? 0.5 : 0.9} strokeWidth={1.5} strokeDasharray="10 6" fillRule="evenodd" />
          {(() => {
            // Below the region's southmost on-screen vertex (clear of a symbol at the mode).
            const pts = e.emitter.region90.coordinates.flatMap((p) => p[0]!).map((pt) => project(map, pt));
            const on = pts.filter(([px, py]) => px >= 0 && px <= w && py >= 0 && py <= h);
            if (!pts.length) return null;
            const a = (on.length ? on : pts).reduce((m, p) => (p[1] > m[1] ? p : m));
            const [x, y] = [Math.min(Math.max(a[0], 80), w - 80), Math.min(Math.max(a[1] + 18, 40), h - 40)];
            return (
              <g transform={`translate(${x} ${y})`}>
                <text textAnchor="middle" fill="var(--text-primary)" stroke="var(--surface-base)" strokeWidth={3} paintOrder="stroke" style={{ ...mono, fontSize: 12, fontWeight: 600 }}>
                  NAI J1
                </text>
                <text y={14} textAnchor="middle" fill="var(--text-secondary)" stroke="var(--surface-base)" strokeWidth={3} paintOrder="stroke" style={{ ...mono, fontSize: 10 }}>
                  {formatDtg(e.computed_at)} · ~{Math.round(e.emitter.area90_km2)} km²
                </text>
              </g>
            );
          })()}
        </g>
      )}

      {/* ce90 around the gated-in mode (the symbol itself is MapSpine's candidate site). */}
      {e?.emitter.mode && !stale && (
        <circle
          data-testid="aoe-ce90"
          cx={project(map, [e.emitter.mode.lon, e.emitter.mode.lat])[0]}
          cy={project(map, [e.emitter.mode.lon, e.emitter.mode.lat])[1]}
          r={(e.emitter.mode.ce90_m / 1000) * pxPerKm(map, e.emitter.mode.lat, e.emitter.mode.lon)}
          fill="none"
          stroke={NAI_INK}
          strokeOpacity={0.7}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}

      {/* Bearings — only when real DF bearings exist: centre line + ±σ wedge, from the DF sensor. */}
      {view.bearings?.map((b) => {
        const len = 28;
        const o = project(map, [b.lon, b.lat]);
        const c0 = project(map, dest(b.lat, b.lon, b.bearing_deg, len));
        const l0 = project(map, dest(b.lat, b.lon, b.bearing_deg - b.sigma_deg, len));
        const r0 = project(map, dest(b.lat, b.lon, b.bearing_deg + b.sigma_deg, len));
        return (
          <g key={b.source_id} data-testid={`aoe-bearing-${b.designation}`}>
            <path d={`M${o.join(' ')}L${l0.join(' ')}L${r0.join(' ')}Z`} fill="oklch(90% 0.01 90 / 0.07)" stroke="none" />
            <path d={`M${o.join(' ')}L${c0.join(' ')}`} stroke={NAI_INK} strokeOpacity={0.75} strokeWidth={1} strokeDasharray="6 4" />
            <text x={c0[0] + 4} y={c0[1]} fill="var(--text-secondary)" stroke="var(--surface-base)" strokeWidth={3} paintOrder="stroke" style={{ ...mono, fontSize: 10 }}>
              DF {b.designation} {Math.round(b.bearing_deg)}° ±{b.sigma_deg}°
            </text>
          </g>
        );
      })}

      {/* Evidence marks under each contributing unit: ✕ degraded / ○ healthy + age. */}
      {e && view.showEvidence !== false && !stale && e.evidence.map((x) => <EvidenceMark key={x.source_id + x.lat} map={map} x={x} />)}

      {/* Truth (Evaluation only): true AoE (sectoral) + the hidden emitter. */}
      {view.truth && (
        <g data-testid="aoe-truth">
          {view.truth.aoe && <path d={pathOf(map, view.truth.aoe)} fill="none" stroke="var(--text-primary)" strokeWidth={1.25} strokeDasharray="1 3" strokeLinecap="round" />}
          {(() => {
            const [x, y] = project(map, [view.truth.lon, view.truth.lat]);
            return (
              <g transform={`translate(${x} ${y})`}>
                <circle r={7} fill="none" stroke="var(--text-primary)" strokeWidth={1.5} />
                <path d="M-11 0H-4M4 0H11M0 -11V-4M0 4V11" stroke="var(--text-primary)" strokeWidth={1.5} />
                <text x={12} y={-8} fill="var(--text-primary)" stroke="var(--surface-base)" strokeWidth={3} paintOrder="stroke" style={{ ...mono, fontSize: 11, fontWeight: 600 }}>
                  TRUTH (hidden from C2)
                </text>
              </g>
            );
          })()}
        </g>
      )}

      {/* Map label on a halo plate, above the north edge of the filled (90%) contour, else the 50% one. */}
      {e &&
        layers.slice(0, 2).map((l, i) => {
          const c = l.contours.find((x) => x.p === 0.9 && x.polygon.coordinates.length) ?? l.contours.find((x) => x.p === 0.5 && x.polygon.coordinates.length);
          if (!c) return null;
          const pts = c.polygon.coordinates.flatMap((p) => p[0]!).map((pt) => project(map, pt));
          const onScreen = pts.filter(([x, y]) => x >= 0 && x <= w && y >= 0 && y <= h);
          const top = (onScreen.length ? onScreen : pts).reduce((a, p) => (p[1] < a[1] ? p : a));
          const text = aoeLabel(view, l);
          const est = text.length * 7.5 + 24;
          const x = Math.min(Math.max(top[0] - est / 2, 8), w - est - 8);
          const y = Math.min(Math.max(top[1] - 32 - i * 26, 48 + i * 26), h - 60);
          return (
            <foreignObject key={l.rx_class} x={x} y={y} width={est} height={24}>
              <div data-testid={`aoe-label-${l.rx_class}`} style={{ ...plate, whiteSpace: 'nowrap', borderLeft: `3px solid ${rgba(AOE_RGB[HUE[l.rx_class]], 1)}` }}>
                {text}
              </div>
            </foreignObject>
          );
        })}
    </svg>
  );
}

function EvidenceMark({ map, x }: { map: maplibregl.Map; x: EvidenceItem }) {
  const [px, py] = project(map, [x.lon, x.lat]);
  const deg = x.state === 'degraded';
  const hue = AOE_RGB[HUE[x.rx_class]];
  const text = `${deg ? '✕' : '○'} ${x.age_s}s${x.superseded ? ' (earlier)' : ''}`;
  return (
    <g transform={`translate(${px} ${py + 27})`} data-testid={`aoe-evidence-${x.designation}${x.superseded ? '-earlier' : ''}`} data-state={x.state} opacity={x.superseded ? 0.6 : 1}>
      <rect x={-text.length * 3.4 - 4} y={-9} width={text.length * 6.8 + 8} height={14} rx={2} fill="oklch(14% 0.01 250 / 0.86)" stroke={deg ? rgba(hue, 1) : 'var(--surface-elevated)'} />
      <text textAnchor="middle" y={2} fill={deg ? 'var(--text-primary)' : 'var(--text-secondary)'} style={{ ...mono, fontSize: 10 }}>
        <title>{`${x.designation}: GNSS C/N0 ${x.value} dB, ${x.state}, ${x.age_s} s ago`}</title>
        {text}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function Swatch({ kind, rx }: { kind: 'fill' | 'dash' | 'outline' | 'nai'; rx?: RxClass }) {
  const hue = rx ? AOE_RGB[HUE[rx]] : AOE_RGB.gnssCivil;
  return (
    <svg width={28} height={14} aria-hidden style={{ flex: 'none' }}>
      {kind === 'fill' && <rect x={1} y={2} width={26} height={10} fill={rgba(hue, AOE_FILL_ALPHA)} stroke={rgba(hue, 1)} strokeWidth={2} />}
      {kind === 'dash' && <rect x={1} y={2} width={26} height={10} fill="none" stroke={rgba(hue, 0.95)} strokeWidth={1.5} strokeDasharray="7 5" />}
      {kind === 'outline' && <rect x={1} y={2} width={26} height={10} fill="none" stroke={rgba(hue, 1)} strokeWidth={2} />}
      {kind === 'nai' && <rect x={1} y={2} width={26} height={10} fill="none" stroke="var(--sym-ink)" strokeWidth={1.5} strokeDasharray="10 6" />}
    </svg>
  );
}

function AoeLegend({ view, extra, zoom }: { view: AoeView; extra?: ReactNode; zoom?: number | undefined }) {
  const e = view.estimate!;
  const civil = e.aoe.find((l) => l.rx_class === 'gnss_civil');
  const stale = e.state === 'stale';
  const current = e.evidence.filter((x) => !x.superseded);
  const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
  const w = e.model.hypotheses.erp_dbm.map(dbmToW);
  return (
    <aside data-testid="aoe-legend" aria-label="Area-of-effect legend" style={{ ...plate, position: 'absolute', right: 12, bottom: 22, zIndex: 5, maxWidth: 380, display: 'grid', gap: 4, color: 'var(--text-secondary)' }}>
      <div style={{ color: 'var(--text-primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        Est. area of effect {stale ? '· STALE (last est.)' : ''}
      </div>
      {layersOf(view).map((l) => (
        <div key={l.rx_class} style={{ display: 'grid', gap: 2 }}>
          <div style={row}>
            <Swatch kind={stale ? 'outline' : 'fill'} rx={l.rx_class} /> {RX_LABEL[l.rx_class]} 90% — likely denied
            {l.contours.find((c) => c.p === 0.9)?.area_km2 ? ` (~${Math.round(l.contours.find((c) => c.p === 0.9)!.area_km2)} km²)` : ' (none)'}
          </div>
          <div style={row}>
            <Swatch kind="dash" rx={l.rx_class} /> 50% — possibly denied (~{Math.round(l.contours.find((c) => c.p === 0.5)?.area_km2 ?? 0)} km²)
          </div>
        </div>
      ))}
      {!stale && (
        <div style={row}>
          <Swatch kind="outline" /> outline only = extrapolated (no reporting unit within {civil?.footprint_radius_km} km)
        </div>
      )}
      {view.showNai && (
        <div style={row}>
          <Swatch kind="nai" /> NAI J1 — 90% emitter region, ~{Math.round(e.emitter.area90_km2)} km²{e.emitter.mode ? '' : ' · not located'}
        </div>
      )}
      <div style={row}>
        <span style={{ width: 28, display: 'grid', placeItems: 'center' }}>
          <TrackSymbol track={{ affiliation: 'enemy', fn: 'ew-jamming', status: 'anticipated', designation: '' }} sizePx={20} />
        </span>
        Suspected emitter (dashed) — {e.emitter.mode ? `shown: ${e.bearings_used} bearings / region ≤ 25 km²` : 'not shown: needs ≤ 25 km² or ≥ 2 bearings'}
      </div>
      {!stale && (
        <div>
          Evidence ✕ degraded / ○ healthy · age:{' '}
          {current.map((x) => `${x.state === 'degraded' ? '✕' : '○'}${x.designation}`).join(' ')} ({current.length} units)
        </div>
      )}
      {civil && (
        <div style={{ color: 'var(--text-tertiary)' }}>
          Civil denial radius {Math.round(civil.radius_km_range[0])}–{Math.round(civil.radius_km_range[1])} km (link budget, EIRP {w[0]}–{w[w.length - 1]} W, mast{' '}
          {e.model.hypotheses.mast_m[0]}–{e.model.hypotheses.mast_m[e.model.hypotheses.mast_m.length - 1]} m; Pole-21E envelope, verified MFR claim)
        </div>
      )}
      {zoom !== undefined && <div style={{ color: 'var(--text-tertiary)' }}>map zoom {zoom.toFixed(1)} · PREVIEW (story-only layer)</div>}
      {extra}
    </aside>
  );
}
