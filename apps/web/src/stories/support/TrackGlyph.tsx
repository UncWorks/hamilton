// Story-only SVG preview of the Branding §5.2 track rendering rule, built
// from the app's real geometry + color helpers (track-symbol.ts,
// trust-gradient.ts). Neither renderer draws polygons today (both draw
// circles) — this is the reference the renderers should converge on.
// The halo (HaloSvg) matches what both renderers now draw (Option 1).

import { useId, type CSSProperties } from 'react';
import type { Affiliation, SensorType } from '@hamilton/contracts';
import { affiliationRgb, symbolGeometry } from '@/components/cop/track-symbol';
import {
  HALO_MIN_EXTENT,
  haloOuterRadiusPx,
  haloPeriodMs,
  haloRadiusPx,
  shouldHaloPulse,
  trustBand,
} from '@/lib/trust-gradient';

/**
 * Halo treatments compared in Explorations/Halo Options.
 * `pulse` (Option 1) is the LIVE treatment — MapSpine + CesiumSpine draw the
 * same thing via haloFrameAt().
 */
export type HaloVariant = 'pulse' | 'ping' | 'band' | 'glow' | 'none';

export interface HaloSvgProps {
  score: number;
  /** Icon radius in px; the halo extends (1 - c) * 24px beyond it. */
  iconRadius: number;
  variant?: HaloVariant;
  /** Multiplies the §5.2 period (exploration control). */
  periodScale?: number;
  /** Force the reduced-motion (static ring) rendering. */
  reducedMotion?: boolean;
  /** Show the halo even at c >= 0.60 (exploration only). */
  force?: boolean;
}

/**
 * The halo, centred on (0,0) of the parent SVG's user space. Every animated
 * element carries `.halo` (transform-box: fill-box; transform-origin: center)
 * so CSS scale() happens about the icon centre — see motion.css.
 */
export function HaloSvg({
  score,
  iconRadius,
  variant = 'pulse',
  periodScale = 1,
  reducedMotion = false,
  force = false,
}: HaloSvgProps) {
  const filterId = `halo-glow-${useId().replace(/:/g, '')}`;
  if (variant === 'none' || (!force && !shouldHaloPulse(score))) return null;
  const band = trustBand(score);
  const color = `var(--trust-${band})`;
  const outer = haloOuterRadiusPx(score, iconRadius);
  const extent = haloRadiusPx(score);
  const period = haloPeriodMs(score) * periodScale;
  const motion = reducedMotion ? 'halo--static' : '';
  const vars = (from: number): CSSProperties =>
    ({ '--halo-period': `${period}ms`, '--halo-from': from.toFixed(4) }) as CSSProperties;

  switch (variant) {
    case 'pulse':
      return (
        <g
          className={`halo halo--pulse ${motion}`}
          style={vars((iconRadius + HALO_MIN_EXTENT * extent) / outer)}
        >
          <circle r={outer} fill={color} fillOpacity={0.28} />
          <circle
            r={outer - 1}
            fill="none"
            stroke={color}
            strokeOpacity={0.9}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      );
    case 'ping':
      return (
        <circle
          className={`halo halo--ping ${motion}`}
          style={vars(iconRadius / outer)}
          r={outer - 0.75}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      );
    case 'band': {
      const style =
        band === 'failed'
          ? { strokeWidth: 3, strokeDasharray: '3 3' }
          : band === 'degraded'
            ? { strokeWidth: 2, strokeDasharray: undefined }
            : { strokeWidth: 1, strokeDasharray: '1 3' };
      return (
        <circle
          r={outer - style.strokeWidth / 2}
          fill="none"
          stroke={color}
          strokeWidth={style.strokeWidth}
          strokeDasharray={style.strokeDasharray}
        />
      );
    }
    case 'glow':
      return (
        <>
          <defs>
            <filter id={filterId} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation={2 + extent / 3} />
            </filter>
          </defs>
          <circle
            className={`halo halo--breathe ${motion}`}
            style={vars(1)}
            r={outer - extent / 3}
            fill={color}
            filter={`url(#${filterId})`}
          />
        </>
      );
  }
}

export interface TrackGlyphProps {
  affiliation: Affiliation;
  sensorType: SensorType;
  score: number;
  /** Icon radius in px (MapSpine ICON_RADIUS_PX = 18). */
  radius?: number;
  /** Use CSS affiliation token (true) or the deck.gl RGB mirror (false). */
  useCssToken?: boolean;
  showLabel?: boolean;
  /** Halo treatment; defaults to the live one (Option 1, `pulse`). */
  haloVariant?: HaloVariant;
  haloPeriodScale?: number;
  /** Force reduced-motion rendering (static ring). OS setting also applies. */
  reducedMotion?: boolean;
}

export function TrackGlyph({
  affiliation,
  sensorType,
  score,
  radius = 18,
  useCssToken = true,
  showLabel = true,
  haloVariant = 'pulse',
  haloPeriodScale = 1,
  reducedMotion = false,
}: TrackGlyphProps) {
  const geom = symbolGeometry(affiliation, sensorType);
  const rot = (geom.rotation_deg * Math.PI) / 180;
  const pts = geom.vertices
    .map(([x, y]) => {
      const rx = x * Math.cos(rot) - y * Math.sin(rot);
      const ry = x * Math.sin(rot) + y * Math.cos(rot);
      return `${(rx * radius).toFixed(2)},${(ry * radius).toFixed(2)}`;
    })
    .join(' ');
  const band = trustBand(score);
  const [r, g, b] = affiliationRgb(affiliation);
  const fill = useCssToken ? `var(--affiliation-${affiliation})` : `rgb(${r} ${g} ${b})`;
  const size = (radius + 24 + 12) * 2; // room for max halo + glow blur
  const outlined = affiliation === 'neutral' || affiliation === 'unknown';

  return (
    <div style={{ display: 'inline-grid', justifyItems: 'center', gap: 'var(--space-1)' }}>
      <svg
        width={size}
        height={size}
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        overflow="visible"
        role="img"
        aria-label={`${affiliation} ${sensorType} trust ${score.toFixed(2)}`}
      >
        <HaloSvg
          score={score}
          iconRadius={radius}
          variant={haloVariant}
          periodScale={haloPeriodScale}
          reducedMotion={reducedMotion}
        />
        <polygon
          points={pts}
          fill={outlined ? 'transparent' : fill}
          stroke={outlined ? fill : `var(--trust-${band})`}
          strokeWidth={2}
          strokeDasharray={affiliation === 'unknown' ? '4 3' : undefined}
          style={{ opacity: Math.max(0.3, score) }}
        />
      </svg>
      {showLabel && (
        <span className="trust-readout" style={{ fontSize: 'var(--text-micro)', color: `var(--trust-${band})` }}>
          {score.toFixed(2)}
        </span>
      )}
    </div>
  );
}
