// Story-only APP-6(E) / MIL-STD-2525E track symbol, used by
// Explorations/Track Symbology. Geometry follows the symbology research spec
// (frames + interior icons from milsymbol, scaled to a 32-unit box: frame
// centre = (16,16)). NOT used by the live renderers — the user has not picked
// an option yet.
//
// Every stroke/dash is specified in SCREEN px and converted to user units with
// k = 32 / sizePx, which is what vector-effect: non-scaling-stroke would give
// but also holds for dash arrays and works in every engine.

import type { CSSProperties, ReactNode } from 'react';
import type { Affiliation, SensorType } from '@hamilton/contracts';
import { symbolGeometry } from '@/components/cop/track-symbol';
import { haloPeriodMs, shouldHaloPulse, trustBand } from '@/lib/trust-gradient';
import { HaloSvg } from './TrackGlyph';

export type SymbologyOption = 'A' | 'B' | 'C';
export type FrameKind = 'friend' | 'hostile' | 'neutral' | 'unknown';
export type IconKind = 'fa' | 'fa-observer' | 'fa-radar' | 'recon' | 'radar' | 'airdef' | 'ew' | 'jamming' | 'none';
export type Echelon = 'team' | 'platoon' | 'battery';

export const FRAME_PATH: Record<FrameKind, string> = {
  friend: 'M4,8h24v16h-24z',
  hostile: 'M16,4.48 27.52,16 16,27.52 4.48,16z',
  neutral: 'M7.2,7.2h17.6v17.6h-17.6z',
  unknown:
    'M10.08,10.08C10.08,3.2 21.92,3.2 21.92,10.08C28.8,10.08 28.8,21.92 21.92,21.92C21.92,28.8 10.08,28.8 10.08,21.92C3.2,21.92 3.2,10.08 10.08,10.08Z',
};

/** Frame bounding box in 32-unit space [x0, y0, x1, y1]. */
export const FRAME_BOX: Record<FrameKind, [number, number, number, number]> = {
  friend: [4, 8, 28, 24],
  hostile: [4.48, 4.48, 27.52, 27.52],
  neutral: [7.2, 7.2, 24.8, 24.8],
  unknown: [4.92, 4.92, 27.08, 27.08],
};

const FRAME_TO_AFFILIATION: Record<FrameKind, Affiliation> = {
  friend: 'friendly',
  hostile: 'enemy',
  neutral: 'neutral',
  unknown: 'unknown',
};

/** Trust band → dash pattern in screen px (Option B). */
export const BAND_DASH = {
  nominal: undefined,
  watching: [6, 2],
  degraded: [3, 3],
  failed: [0.1, 3],
} as const;

/** Trust colour for strokes/bars: failed uses the 5.1:1 stroke variant. */
export function trustStrokeVar(score: number): string {
  const band = trustBand(score);
  return band === 'failed' ? 'var(--trust-failed-stroke)' : `var(--trust-${band})`;
}

export interface MilSymbolProps {
  option: SymbologyOption;
  frame: FrameKind;
  icon?: IconKind | undefined;
  /** Track trust score. Omit for entities that are not trust-scored (jammer). */
  score?: number | undefined;
  sizePx: number;
  /** T amplifier (unique designation), left of the frame. */
  designation?: string | undefined;
  /** H amplifier (additional information), lower right. */
  info?: string | undefined;
  echelon?: Echelon | undefined;
  /** Jammer / hostile status: candidate = APP-6 status 1 (anticipated), dashed. */
  status?: 'present' | 'anticipated' | undefined;
  /** J value for anticipated entities (candidate score). */
  candidateScore?: number | undefined;
  /** Top-ranked candidate takes the trust colour (Option B). */
  highlight?: boolean | undefined;
  selected?: boolean | undefined;
  /** Option C interior polygon. */
  sensorType?: SensorType | undefined;
  reducedMotion?: boolean | undefined;
  periodScale?: number | undefined;
}

/** Dark gap between an Option B frame and its outline halo, screen px. */
const HALO_GAP_PX = 1.5;

export function strokeW(sizePx: number) {
  return sizePx <= 16 ? 1.25 : 1.5;
}

export function fontPx(sizePx: number) {
  return sizePx >= 32 ? 11 : sizePx >= 24 ? 10 : 9;
}

export function Icon({ kind, frame, color, k }: { kind: IconKind; frame: FrameKind; color: string; k: number }) {
  if (kind === 'none') return null;
  const sw = (1.5 * k) / 0.16; // 1.5px in 200-unit space
  const line = { fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const };
  const reconPath = frame === 'friend' ? 'M25,150L175,50' : 'M60,130L140,70';
  const parts: ReactNode[] = [];
  if (kind === 'fa' || kind === 'fa-observer' || kind === 'fa-radar') {
    parts.push(<circle key="fa" cx={100} cy={100} r={15} fill={color} />);
  }
  if (kind === 'fa-observer' || kind === 'recon') parts.push(<path key="recon" d={reconPath} {...line} />);
  if (kind === 'fa-radar' || kind === 'radar') {
    parts.push(
      <path
        key="radar"
        d="M72,95 l30,-25 0,25 30,-25 M70,70 c0,35 15,50 50,50"
        {...line}
        transform={kind === 'fa-radar' ? 'translate(10 -22) scale(0.8)' : undefined}
      />,
    );
  }
  if (kind === 'airdef') parts.push(<path key="ad" d="M25,150 C25,110 175,110 175,150" {...line} />);
  if (kind === 'ew') {
    parts.push(
      <text
        key="ew"
        x={100}
        y={100}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 52 }}
      >
        EW
      </text>,
    );
  }
  if (kind === 'jamming') parts.push(<path key="jam" d="M55,108 l15,-15 15,15 15,-15 15,15 15,-15 15,15" {...line} strokeLinejoin="round" />);
  return <g transform="scale(0.16)">{parts}</g>;
}

export function EchelonMark({ echelon, y, k, color }: { echelon?: Echelon | undefined; y: number; k: number; color: string }) {
  if (!echelon) return null;
  const r = 1.3;
  if (echelon === 'battery') {
    return <line x1={16} x2={16} y1={y - 5} y2={y} stroke={color} strokeWidth={1.5 * k} />;
  }
  const xs = echelon === 'team' ? [16] : [12, 16, 20];
  return (
    <g fill={color}>
      {xs.map((x) => (
        <circle key={x} cx={x} cy={y - r} r={r} />
      ))}
    </g>
  );
}

export function Amplifier({
  x,
  y,
  anchor,
  color,
  k,
  sizePx,
  children,
}: {
  x: number;
  y: number;
  anchor: 'start' | 'end';
  color: string;
  k: number;
  sizePx: number;
  children: ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="central"
      fill={color}
      // Dark outline so a halo (or the map) can never tint the text.
      stroke="var(--surface-base)"
      strokeWidth={3 * k}
      strokeLinejoin="round"
      paintOrder="stroke"
      style={{ fontFamily: 'var(--font-mono)', fontSize: fontPx(sizePx) * k, fontVariantNumeric: 'tabular-nums' }}
    >
      {children}
    </text>
  );
}

/** Symbol in 32-unit space, frame centred on (16,16). Position it with a parent transform. */
export function MilSymbol(p: MilSymbolProps) {
  const {
    option,
    frame,
    icon = 'none',
    score,
    sizePx,
    designation,
    info,
    echelon,
    status = 'present',
    candidateScore,
    highlight,
    selected,
    sensorType = 'offense',
    reducedMotion = false,
    periodScale = 1,
  } = p;
  const k = 32 / sizePx;
  const sw = strokeW(sizePx) * k;
  const [x0, y0, x1, y1] = FRAME_BOX[frame];
  const d = FRAME_PATH[frame];
  const scored = score !== undefined;
  const band = scored ? trustBand(score) : 'nominal';
  const below = scored && shouldHaloPulse(score);
  const opacity = scored ? Math.max(0.45, score) : 1;
  const anticipated = status === 'anticipated';
  const aff = FRAME_TO_AFFILIATION[frame];
  const ink = option === 'A' ? 'var(--sym-ink-strong)' : 'var(--sym-ink)';

  // ---- halo -----------------------------------------------------------------
  let halo: ReactNode = null;
  if (below && option === 'B') {
    // Shape-preserving outline halo: the frame path stroked 2–4px outward in
    // the trust colour, behind the plate. .halo (transform-box: fill-box)
    // keeps the pulse centred on the frame.
    const outward = 2 + (2 * (0.6 - score)) / 0.6;
    halo = (
      <path
        d={d}
        className={`halo halo--pulse ${reducedMotion ? 'halo--static' : ''}`}
        style={
          {
            '--halo-period': `${haloPeriodMs(score) * periodScale}ms`,
            '--halo-from': '0.94',
          } as CSSProperties
        }
        fill="none"
        stroke={trustStrokeVar(score)}
        strokeWidth={sw + 2 * (HALO_GAP_PX + outward) * k}
        strokeLinejoin="round"
      />
    );
  } else if (below) {
    // A / C: the fixed circular halo (Option 1 of Explorations/Halo Options),
    // drawn in screen px inside a k-scaled group centred on the frame.
    halo = (
      <g transform={`translate(16 16) scale(${k})`}>
        <HaloSvg
          score={score}
          iconRadius={12 / k}
          reducedMotion={reducedMotion}
          periodScale={periodScale}
        />
      </g>
    );
  }

  // ---- frame ----------------------------------------------------------------
  let frameEl: ReactNode;
  let iconEl: ReactNode;
  const dashFor = (): string | undefined => {
    if (anticipated) return `${4 * k} ${4 * k}`;
    if (option !== 'B' || !scored) return undefined;
    const dash = BAND_DASH[band];
    return dash ? dash.map((v) => v * k).join(' ') : undefined;
  };
  if (option === 'A') {
    const fill = `var(--sym-fill-${frame}${below ? '-dim' : ''})`;
    frameEl = (
      <path d={d} fill={fill} stroke={ink} strokeWidth={sw} strokeDasharray={dashFor()} strokeLinejoin="round" />
    );
    iconEl = <Icon kind={icon} frame={frame} color={ink} k={k} />;
  } else if (option === 'B') {
    const stroke = highlight && candidateScore !== undefined ? trustStrokeVar(candidateScore) : ink;
    frameEl = (
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeDasharray={dashFor()}
        strokeLinecap={band === 'failed' && scored ? 'round' : 'butt'}
        strokeLinejoin="round"
      />
    );
    iconEl = <Icon kind={icon} frame={frame} color={stroke} k={k} />;
  } else {
    const color = `var(--affiliation-${aff})`;
    frameEl = (
      <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={dashFor()} strokeLinejoin="round" />
    );
    if (icon === 'jamming' || icon === 'ew') {
      iconEl = <Icon kind={icon} frame={frame} color={color} k={k} />;
    } else {
      // Hamilton n-gon (track-symbol.ts) as the interior icon.
      const geom = symbolGeometry(aff, sensorType);
      const rot = (geom.rotation_deg * Math.PI) / 180;
      const r = 5.5;
      const pts = geom.vertices
        .map(([x, y]) => {
          const rx = x * Math.cos(rot) - y * Math.sin(rot);
          const ry = x * Math.sin(rot) + y * Math.cos(rot);
          return `${(16 + rx * r).toFixed(2)},${(16 + ry * r).toFixed(2)}`;
        })
        .join(' ');
      iconEl = <polygon points={pts} fill={color} stroke={`var(--trust-${band})`} strokeWidth={k} />;
    }
  }

  // ---- condition bar (Option B, Hamilton extension) ---------------------------
  const barH = 4;
  const barY = y1 + 2;
  const bar =
    option === 'B' && scored ? (
      <g>
        <rect x={x0} y={barY} width={x1 - x0} height={barH} fill="var(--sym-ink)" opacity={0.14} />
        <rect x={x0} y={barY} width={(x1 - x0) * score} height={barH} fill={trustStrokeVar(score)} />
      </g>
    ) : null;

  // ---- APP-6 "damaged" slash for failed (Option B) ------------------------------
  const damaged =
    option === 'B' && scored && band === 'failed' ? (
      <line x1={x0 - 1} y1={y1 + 1} x2={x1 + 1} y2={y0 - 1} stroke="var(--sym-ink)" strokeWidth={sw} strokeLinecap="round" />
    ) : null;

  // ---- selection: solid double frame -----------------------------------------
  const sel = selected
    ? [3, 5.5].map((px) => {
        const half = Math.max(x1 - x0, y1 - y0) / 2;
        const f = 1 + (px * k) / half;
        return (
          <path
            key={px}
            d={d}
            fill="none"
            stroke="var(--sym-select)"
            strokeWidth={(1.25 * k) / f}
            transform={`translate(16 16) scale(${f}) translate(-16 -16)`}
          />
        );
      })
    : null;

  // ---- amplifiers -------------------------------------------------------------
  const gap = (selected ? 7 : 3) * k;
  const jValue = anticipated ? candidateScore : below ? score : undefined;
  const jColor =
    jValue === undefined
      ? ink
      : anticipated && !highlight
        ? 'var(--sym-ink)'
        : trustStrokeVar(jValue);

  return (
    <g>
      {halo}
      {/* Plate: hides the inner half of the outline halo + map clutter. */}
      {option !== 'A' && (
        <path
          d={d}
          fill="var(--sym-plate)"
          // Option B halo: a dark gap keeps the frame dash readable against the ring.
          stroke={below && option === 'B' ? 'var(--surface-base)' : 'none'}
          strokeWidth={sw + 2 * HALO_GAP_PX * k}
          strokeLinejoin="round"
        />
      )}
      <g opacity={opacity}>
        {frameEl}
        {iconEl}
        {damaged}
      </g>
      {bar}
      {sel}
      <EchelonMark echelon={echelon} y={y0 - 2 - (selected ? 5.5 * k : 0)} k={k} color={ink} />
      {designation && (
        <Amplifier x={x0 - gap} y={16} anchor="end" color="var(--sym-ink)" k={k} sizePx={sizePx}>
          {designation}
        </Amplifier>
      )}
      {jValue !== undefined && (
        <Amplifier x={x1 + gap} y={info ? 12 : 16} anchor="start" color={jColor} k={k} sizePx={sizePx}>
          {jValue.toFixed(2)}
        </Amplifier>
      )}
      {info && (
        <Amplifier x={x1 + gap} y={jValue !== undefined ? 12 + fontPx(sizePx) * k * 1.15 : 16} anchor="start" color="var(--text-tertiary)" k={k} sizePx={sizePx}>
          {info}
        </Amplifier>
      )}
    </g>
  );
}

/** Standalone cell: an SVG in screen px with the frame centred. */
export function MilSymbolCell({ margin = 20, ...p }: MilSymbolProps & { margin?: number }) {
  const s = p.sizePx;
  const w = (s * 112) / 32 + 2 * margin;
  const h = (s * 56) / 32 + 2 * margin;
  return (
    <svg width={w} height={h} viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} overflow="visible" role="img" aria-label={`${p.frame} ${p.score ?? ''}`}>
      <g transform={`scale(${s / 32}) translate(-16 -16)`}>
        <MilSymbol {...p} />
      </g>
    </svg>
  );
}
