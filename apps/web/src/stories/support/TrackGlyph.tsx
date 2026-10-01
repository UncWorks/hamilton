// Story-only SVG preview of the Branding §5.2 track rendering rule, built
// from the app's real geometry + color helpers (track-symbol.ts,
// trust-gradient.ts). Neither renderer draws polygons today (both draw
// circles) — this is the reference the renderers should converge on.

import type { Affiliation, SensorType } from '@hamilton/contracts';
import { affiliationRgb, symbolGeometry } from '@/components/cop/track-symbol';
import {
  haloPeriodMs,
  haloRadiusPx,
  shouldHaloPulse,
  trustBand,
} from '@/lib/trust-gradient';

export interface TrackGlyphProps {
  affiliation: Affiliation;
  sensorType: SensorType;
  score: number;
  /** Icon radius in px (MapSpine ICON_RADIUS_PX = 18). */
  radius?: number;
  /** Use CSS affiliation token (true) or the deck.gl RGB mirror (false). */
  useCssToken?: boolean;
  showLabel?: boolean;
}

export function TrackGlyph({
  affiliation,
  sensorType,
  score,
  radius = 18,
  useCssToken = true,
  showLabel = true,
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
  const halo = haloRadiusPx(score);
  const pulse = shouldHaloPulse(score);
  const band = trustBand(score);
  const [r, g, b] = affiliationRgb(affiliation);
  const fill = useCssToken ? `var(--affiliation-${affiliation})` : `rgb(${r} ${g} ${b})`;
  const size = (radius + 24 + 4) * 2;
  const outlined = affiliation === 'neutral' || affiliation === 'unknown';

  return (
    <div style={{ display: 'inline-grid', justifyItems: 'center', gap: 'var(--space-1)' }}>
      <svg
        width={size}
        height={size}
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        role="img"
        aria-label={`${affiliation} ${sensorType} trust ${score.toFixed(2)}`}
      >
        {pulse && (
          <circle
            r={radius + halo}
            fill={`var(--trust-${band})`}
            style={{
              opacity: 0.35,
              transformOrigin: 'center',
              animation: `halo-pulse ${haloPeriodMs(score)}ms var(--ease-in-out-smooth) infinite`,
            }}
          />
        )}
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
