'use client';

// Screen-space part of the FR-06a area of effect, shared by both spines and
// mounted in SpineOverlay while an estimate is shown (plan W11):
//  - AoeKey: the two-swatch key (90% fill + edge, 50% dash). Stale: outline only.
//  - the map label `Est. GPS denial · <method>-class · 90% · <age> · <n> degraded / <m> healthy`
//    on a halo plate just above the 90% contour's label point (lib/aoe.ts labelAnchor);
//  - a state marker for tests and screen readers: data-state (active / stale /
//    unbounded), data-layers (what the spine drew) and data-fade.
// The polygons themselves are WebGL (deck.gl layers / Cesium entities).

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { AOE_DASH_PX, AOE_EDGE50_PX, AOE_EDGE90_PX, AOE_FILL_ALPHA, AOE_RGB, cssRgb } from '@/lib/aoe-style';
import type { AoeDisplayState } from '@/lib/emitter-estimate';
import { nudgeLabelRect } from '@/lib/aoe';

const plate: CSSProperties = {
  background: 'oklch(14% 0.01 250 / 0.86)',
  border: '1px solid var(--surface-elevated)',
  color: 'var(--text-primary)',
  padding: '4px 8px',
  borderRadius: 2,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '0.02em',
  lineHeight: 1.45,
};

const civil = AOE_RGB.gnss_civil;

function Swatch({ kind }: { kind: 'fill' | 'outline' | 'dash' }) {
  return (
    <svg width={28} height={14} aria-hidden style={{ flex: 'none' }}>
      {kind === 'fill' && <rect x={1} y={2} width={26} height={10} fill={cssRgb(civil, AOE_FILL_ALPHA)} stroke={cssRgb(civil)} strokeWidth={AOE_EDGE90_PX} />}
      {kind === 'outline' && <rect x={1} y={2} width={26} height={10} fill="none" stroke={cssRgb(civil)} strokeWidth={AOE_EDGE90_PX} />}
      {kind === 'dash' && <rect x={1} y={2} width={26} height={10} fill="none" stroke={cssRgb(civil)} strokeWidth={AOE_EDGE50_PX} strokeDasharray={AOE_DASH_PX.join(' ')} />}
    </svg>
  );
}

/** Two-swatch key (HS-21 / FR-06a output). The label carries method, level, age and counts. */
export function AoeKey({ state }: { state: AoeDisplayState }) {
  const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
  return (
    <aside
      data-testid="aoe-key"
      aria-label="Area-of-effect key"
      style={{ ...plate, position: 'absolute', left: 12, bottom: 22, display: 'grid', gap: 3, color: 'var(--text-secondary)', pointerEvents: 'none' }}
    >
      <div style={row}>
        <Swatch kind={state === 'stale' ? 'outline' : 'fill'} /> Est. civil GPS denial — 90%
      </div>
      <div style={row}>
        <Swatch kind="dash" /> 50%
      </div>
    </aside>
  );
}

export interface AoeScreenProps {
  state: AoeDisplayState;
  /** Map label text (lib/emitter-estimate mapLabel), null = none (unbounded). */
  label: string | null;
  /** Screen position of the label anchor, null = off screen / unknown. */
  anchor: { x: number; y: number } | null;
  viewport: { width: number; height: number };
  /** What the spine drew, e.g. ["fill90-gnss_civil", "edge90-gnss_civil", "edge50-gnss_civil"]. */
  layers: readonly string[];
  /** Current fade-in opacity (1 = done / reduced motion). */
  opacity: number;
  reducedMotion: boolean;
  /** Screen centres of the drawn unit symbols / stacks; the label plate is nudged off them. */
  avoid?: readonly { x: number; y: number }[];
  /** Symbol box size in px (LIVE_SYMBOL_PX). */
  avoidPx?: number;
}

/** Label + key + state marker, inside SpineOverlay (below the symbols). */
export function AoeScreen(p: AoeScreenProps) {
  const drawn = p.layers.length > 0;
  const labelRef = useRef<HTMLDivElement>(null);
  const [labelW, setLabelW] = useState(0);
  const [labelH, setLabelH] = useState(0);
  useLayoutEffect(() => {
    const w = labelRef.current?.offsetWidth ?? 0;
    const h = labelRef.current?.offsetHeight ?? 0;
    if (w && w !== labelW) setLabelW(w);
    if (h && h !== labelH) setLabelH(h);
  });
  let labelEl = null;
  if (p.label && p.anchor && drawn) {
    const est = labelW || p.label.length * 7.5 + 24;
    const x = Math.min(Math.max(p.anchor.x - est / 2, 8), Math.max(8, p.viewport.width - est - 8));
    const y0 = Math.min(Math.max(p.anchor.y - 34, 48), Math.max(48, p.viewport.height - 60));
    const y = nudgeLabelRect({ x, y: y0, w: est, h: labelH || 24 }, p.avoid ?? [], p.avoidPx ?? 32, p.viewport).y;
    labelEl = (
      <div
        ref={labelRef}
        data-testid="aoe-label"
        style={{ ...plate, position: 'absolute', left: x, top: y, whiteSpace: 'nowrap', borderLeft: `3px solid ${cssRgb(civil)}`, opacity: p.opacity, pointerEvents: 'none' }}
      >
        {p.label}
      </div>
    );
  }
  return (
    <div
      data-testid="aoe-layer"
      data-state={p.state}
      data-layers={p.layers.join(' ')}
      data-fade={p.reducedMotion ? 'none' : 'once-300ms'}
      role="note"
      aria-label={p.label ?? (p.state === 'unbounded' ? 'Estimated GPS denial: edge not observed' : 'Estimated GPS denial')}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {labelEl}
      {drawn && <AoeKey state={p.state} />}
    </div>
  );
}
