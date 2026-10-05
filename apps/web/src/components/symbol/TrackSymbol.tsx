// Production track symbol (Decisions/Track Symbology). Renders the decided
// symbol for a track: FM 1-02 / MCRP 5-12A filled frame + enlarged function
// icon, T label (V4 treatment), echelon / J / AR / H in the detail state, and
// the link-trust side gauge. See describe.ts for the rules.

import type { CSSProperties } from 'react';
import { describeTrackSymbol, type SymbolDescription, type SymbolOptions, type SymbolTrack } from './describe';
import type { PPrim } from './geometry';

/** Primitive list → SVG paths, in the 200-unit box. */
export function SymbolPrims({ prims }: { prims: readonly PPrim[] }) {
  return (
    <>
      {prims
        .filter((p) => !p.svgSkip)
        .map((p, i) => {
          const common = {
            opacity: p.opacity,
            'data-layer': p.layer,
            transform: p.scale ? `translate(100 100) scale(${p.scale}) translate(-100 -100)` : undefined,
          };
          return p.mode === 'fill' ? (
            <path key={i} d={p.d} fill={p.color} {...common} />
          ) : (
            <path
              key={i}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={p.w}
              strokeDasharray={p.dash?.join(' ')}
              strokeLinecap={p.cap ?? 'butt'}
              strokeLinejoin="round"
              {...common}
            />
          );
        })}
    </>
  );
}

const TEXT_STYLE: CSSProperties = { fontFamily: 'var(--font-mono)', fontWeight: 400, fontVariantNumeric: 'tabular-nums' };

/** A described symbol in its 200-unit box (frame centre 100,100). Position it with a parent transform. */
export function SymbolGroup({ d }: { d: SymbolDescription }) {
  const { u, fontPx } = d.layout;
  return (
    <g data-sidc={d.codes.sidc2525E} data-fn={d.fn} data-detail={d.detail ? '' : undefined}>
      <SymbolPrims prims={d.prims} />
      {d.texts.map((t) => (
        <text
          key={t.field}
          data-field={t.field}
          x={t.x}
          y={t.y}
          textAnchor={t.anchor}
          dominantBaseline="central"
          fill={t.color}
          // Dark outline so the map (or a neighbour) can never tint the text.
          stroke="var(--surface-base)"
          strokeWidth={3 * u}
          strokeLinejoin="round"
          paintOrder="stroke"
          style={{ ...TEXT_STYLE, fontSize: fontPx * u }}
        >
          {t.text}
        </text>
      ))}
    </g>
  );
}

export interface TrackSymbolProps extends SymbolOptions {
  track: SymbolTrack;
}

/** The symbol in the 200-unit box. */
export function TrackSymbolG({ track, ...opts }: TrackSymbolProps) {
  return <SymbolGroup d={describeTrackSymbol(track, opts)} />;
}

/** SVG transform placing a 200-unit symbol so its frame centre lands on (x, y) at `sizePx`. */
export function placeSymbol(x: number, y: number, sizePx: number): string {
  return `translate(${x - sizePx / 2} ${y - sizePx / 2}) scale(${sizePx / 200})`;
}

/** Standalone, accessible SVG sized to the symbol and its amplifiers. */
export function TrackSymbol({ track, style, margin = 0, ...opts }: TrackSymbolProps & { style?: CSSProperties | undefined; margin?: number | undefined }) {
  const d = describeTrackSymbol(track, opts);
  const { box, pad } = d.layout;
  const l = pad.left + margin;
  const t = pad.top + margin;
  const w = box + l + pad.right + margin;
  const h = box + t + pad.bottom + margin;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      overflow="visible"
      role="img"
      aria-label={d.label}
      data-sidc-2525e={d.codes.sidc2525E}
      data-sidc-2525c={d.codes.sidc2525C}
      data-cot={d.codes.cot}
      style={{ display: 'block', ...style }}
    >
      <title>{d.label}</title>
      <g transform={`translate(${l} ${t}) scale(${box / 200})`}>
        <SymbolGroup d={d} />
      </g>
    </svg>
  );
}
