// ARCHIVED — Option B′, US MIL-STD-2525E / FM 1-02.2 conformant track
// symbology (Archive/Track Symbology). Superseded by Decisions/Track Symbology:
// the decided symbol is filled (V1) with a side gauge + J instead of the halo.
// The rating tooltip it introduced is now production
// (src/components/symbol/RatingTooltip.tsx) and is re-exported here.
//
// Rules (us-symbology-findings.md, "modified Option B"):
//  - Monochrome standard frames in --sym-ink, SOLID regardless of trust.
//  - Dashes ONLY for status 1 (anticipated / candidate sites).
//  - No AL condition bar, no damaged slash, no frame colour or opacity for trust.
//  - J = evaluation rating mapped from the link-trust score (link-trust-rating.ts),
//    shown secondarily after the semantic name; W = DTG of the last good update;
//    AR = "NRT" + greyed frame once stale.
//  - At-a-glance cue = the existing centred halo (HaloSvg, Option 1), labelled
//    "Hamilton link-trust overlay (non-2525)", toggleable, trust tokens only;
//    text amplifiers are pushed outside its extent so it never sits under them.
//  - ROE / Excalibur gate lives in the fire-mission popup, not on the symbol.

import type { CSSProperties, ReactNode } from 'react';
import { haloOuterRadiusPx, shouldHaloPulse } from '@/lib/trust-gradient';
import { CREDIBILITY, J_CODE_CITATION, LINK_TRUST_SCALE, NRT, RELIABILITY, ROE_FLOOR, STALE_AFTER_S, rateLinkTrust, type LinkTrustRating } from '@/lib/link-trust-rating';
import {
  RatingExplanation,
  TRIGGER_CSS,
  evidenceFor,
  explainRating,
  tooltipSurface,
  useAnchoredTips,
  useHoverTip,
  type ExplanationProps,
} from '@/components/symbol/RatingTooltip';
import { mono } from './foundation-ui';
import { Amplifier, EchelonMark, FRAME_BOX, FRAME_PATH, Icon, fontPx, strokeW, type Echelon, type FrameKind, type IconKind } from './MilSymbol';
import { HaloSvg } from './TrackGlyph';

// ---------------------------------------------------------------------------
// Symbol
// ---------------------------------------------------------------------------

export interface MilSymbolPrimeProps {
  frame: FrameKind;
  icon?: IconKind | undefined;
  sizePx: number;
  /** T amplifier (unique designation), left of the frame. */
  designation?: string | undefined;
  echelon?: Echelon | undefined;
  /** H amplifier (additional information), right. */
  info?: string | undefined;
  /** Link-trust score. Omit for entities that are not trust-scored (jammer, candidates). */
  score?: number | undefined;
  /** Past the stale time: grey frame, AR = NRT, rating label STALE. */
  stale?: boolean | undefined;
  /** W amplifier: DTG of the last good update. */
  dtg?: string | undefined;
  /** Status 1 (anticipated / planned) — the ONLY reason a frame is dashed. */
  status?: 'present' | 'anticipated' | undefined;
  selected?: boolean | undefined;
  /** Hamilton link-trust overlay (non-2525). Default on. */
  overlay?: boolean | undefined;
  /** Hover / focus — reveals the rating label at ≥ 0.60 and the W amplifier. */
  active?: boolean | undefined;
  /** Always show the rating label (Rating Tooltip story). */
  forceLabel?: boolean | undefined;
  reducedMotion?: boolean | undefined;
}

/** Amplifier room in characters: left fits the W DTG (16 chars at 0.8 size). */
export const SYM_PRIME_SIDE_CHARS = { left: 14, right: 19 } as const;

/** Symbol in 32-unit space, frame centred on (16,16) — same contract as MilSymbol. */
export function MilSymbolPrime(p: MilSymbolPrimeProps) {
  const {
    frame,
    icon = 'none',
    sizePx,
    designation,
    echelon,
    info,
    score,
    stale = false,
    dtg,
    status = 'present',
    selected = false,
    overlay = true,
    active = false,
    forceLabel = false,
    reducedMotion = false,
  } = p;
  const k = 32 / sizePx;
  const sw = strokeW(sizePx) * k;
  const [x0, y0, x1, y1] = FRAME_BOX[frame];
  const d = FRAME_PATH[frame];
  const rating = score !== undefined ? rateLinkTrust(score, { stale }) : undefined;
  const ink = stale ? 'var(--sym-ink-stale)' : 'var(--sym-ink)';
  const anticipated = status === 'anticipated';

  // Overlay: the live centred halo (HaloSvg Option 1), in px inside a k-scaled
  // group. Frozen (static ring) when stale — no live data to pulse about.
  const iconRadiusPx = 12 / k;
  const haloOn = overlay && score !== undefined && shouldHaloPulse(score);
  const haloUnits = haloOn ? haloOuterRadiusPx(score, iconRadiusPx) * k : 0;

  // Amplifiers sit outside the halo extent so it never tints / hides text.
  const gap = (selected ? 7 : 3) * k;
  const xr = Math.max(x1 + gap, 16 + haloUnits + 2 * k);
  const xl = Math.min(x0 - gap, 16 - haloUnits - 2 * k);
  const fs = fontPx(sizePx) * k;
  const lh = fs * 1.25;

  const showLabel = rating !== undefined && (forceLabel || active || rating.visibleAtRest);
  const right: ReactNode[] = [];
  if (showLabel && rating) {
    right.push(
      <>
        <tspan fill={rating.labelToken} fontWeight={600}>
          {rating.label}
        </tspan>
        <tspan fill="var(--sym-ink)"> {rating.score.toFixed(2)}</tspan>
        <tspan fill="var(--text-tertiary)" fontSize={fs * 0.85}>
          {' '}
          {rating.jCode}
        </tspan>
      </>,
    );
  }
  if (stale) right.push(<tspan fill="var(--sym-ink)">{NRT}</tspan>);
  if (info) right.push(<tspan fill="var(--text-tertiary)">{info}</tspan>);
  const showW = !!dtg && (stale || active || selected);

  return (
    <g>
      {haloOn && (
        <g data-overlay="hamilton-link-trust" data-non-2525="" aria-hidden transform={`translate(16 16) scale(${k})`}>
          <HaloSvg score={score} iconRadius={iconRadiusPx} reducedMotion={reducedMotion || stale} />
        </g>
      )}
      <path d={d} fill="var(--sym-plate)" stroke="none" />
      <path
        d={d}
        fill="none"
        stroke={ink}
        strokeWidth={sw}
        strokeDasharray={anticipated ? `${4 * k} ${4 * k}` : undefined}
        strokeLinejoin="round"
      />
      <Icon kind={icon} frame={frame} color={ink} k={k} />
      {selected &&
        [3, 5.5].map((px) => {
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
        })}
      <EchelonMark echelon={echelon} y={y0 - 2 - (selected ? 5.5 * k : 0)} k={k} color={ink} />
      {designation && (
        <Amplifier x={xl} y={16} anchor="end" color="var(--sym-ink)" k={k} sizePx={sizePx}>
          {designation}
        </Amplifier>
      )}
      {showW && (
        <Amplifier x={xl} y={16 - lh} anchor="end" color="var(--text-tertiary)" k={k} sizePx={sizePx}>
          <tspan fontSize={fs * 0.8}>{dtg}</tspan>
        </Amplifier>
      )}
      {right.map((content, i) => (
        <Amplifier key={i} x={xr} y={16 + (i - (right.length - 1) / 2) * lh} anchor="start" color="var(--sym-ink)" k={k} sizePx={sizePx}>
          {content}
        </Amplifier>
      ))}
    </g>
  );
}

/** Standalone SVG in screen px, frame centred, asymmetric room for amplifiers. */
export function MilSymbolPrimeSvg({ margin = 8, ...p }: MilSymbolPrimeProps & { margin?: number | undefined }) {
  const s = p.sizePx;
  const charPx = fontPx(s) * 0.62;
  const haloPx = 24;
  const left = s / 2 + haloPx + SYM_PRIME_SIDE_CHARS.left * charPx + margin;
  const right = s / 2 + haloPx + SYM_PRIME_SIDE_CHARS.right * charPx + margin;
  const half = s / 2 + haloPx + margin;
  const rating = p.score !== undefined ? rateLinkTrust(p.score, { stale: p.stale ?? false }) : undefined;
  return (
    <svg
      width={left + right}
      height={2 * half}
      viewBox={`${-left} ${-half} ${left + right} ${2 * half}`}
      overflow="visible"
      role="img"
      aria-label={`${p.designation ?? ''} ${p.frame}${rating ? ` · link trust ${rating.label} ${rating.score.toFixed(2)} (J ${rating.jCode})` : ''}${p.status === 'anticipated' ? ' · anticipated' : ''}`}
      style={{ display: 'block' }}
    >
      <g transform={`scale(${s / 32}) translate(-16 -16)`}>
        <MilSymbolPrime {...p} />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Rating tooltip — production (src/components/symbol/RatingTooltip.tsx)
// ---------------------------------------------------------------------------

export { RatingExplanation, TRIGGER_CSS, evidenceFor, explainRating, tooltipSurface, useAnchoredTips, useHoverTip, type ExplanationProps };

export interface RatingCellProps extends MilSymbolPrimeProps {
  explanation?: ExplanationProps;
  /** Render the tooltip open, in flow (Rating Tooltip story). */
  forceOpen?: boolean | undefined;
  testId?: string | undefined;
  margin?: number | undefined;
}

/** HTML cell: B′ symbol + hover/focus tooltip (aria-describedby). */
export function RatingCell({ explanation, forceOpen = false, testId, margin, ...sym }: RatingCellProps) {
  const tip = useHoverTip();
  if (!explanation || sym.score === undefined) {
    return <MilSymbolPrimeSvg {...sym} margin={margin} />;
  }
  const open = forceOpen || tip.open;
  const label = `${sym.designation ?? ''} ${sym.frame}: link trust — hover or focus for the explanation`;
  return (
    <span style={{ position: 'relative', display: forceOpen ? 'flex' : 'inline-block', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
      <span {...tip.triggerProps} role="button" aria-label={label} data-testid={testId} className="symbol-trigger" style={{ display: 'inline-block', cursor: 'help' }}>
        <MilSymbolPrimeSvg {...sym} active={sym.active || open} margin={margin} />
      </span>
      <div
        {...tip.tipProps}
        style={{
          ...tooltipSurface,
          display: open ? 'block' : 'none',
          ...(forceOpen ? {} : { position: 'absolute', left: '50%', top: '100%', zIndex: 20 }),
        }}
      >
        <RatingExplanation {...explanation} />
      </div>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Fire-mission / target popup mock — where the ROE / Excalibur gate lives
// ---------------------------------------------------------------------------

export function FireMissionPopup({
  target,
  observer,
  rating,
  dtg,
  requested = true,
  requestedAt,
}: {
  target: string;
  observer: string;
  rating: LinkTrustRating;
  dtg: string;
  /** False until the call for fire arrives; the gate is evaluated only then. */
  requested?: boolean;
  /** Scenario clock of the call for fire, e.g. "1:20". */
  requestedAt?: string;
}) {
  const hold = requested && rating.roeGated;
  const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', fontSize: 12 };
  return (
    <section
      aria-label="Fire mission (mock)"
      style={{ width: 300, padding: 'var(--space-3)', background: 'var(--surface-elevated)', border: '1px solid var(--surface-panel)', display: 'grid', gap: 'var(--space-2)' }}
    >
      <header style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
        Fire mission · {target} <span style={{ textTransform: 'none' }}>(mock)</span>
      </header>
      <div style={row}>
        <span>Observer</span>
        <span style={mono}>
          {observer} · <span style={{ color: rating.labelToken }}>{rating.label}</span> {rating.score.toFixed(2)} · J {rating.jCode}
        </span>
      </div>
      <div style={row}>
        <span>Last good update</span>
        <span style={mono}>
          {dtg}
          {rating.stale ? ` · ${NRT}` : ''}
        </span>
      </div>
      <div style={row}>
        <span>Munition</span>
        <span style={mono}>M982 Excalibur (GPS)</span>
      </div>
      <div
        role="status"
        data-testid="fire-mission-gate"
        style={{
          padding: 'var(--space-2)',
          border: `1px solid ${hold ? 'var(--gating-primary)' : 'var(--surface-panel)'}`,
          color: hold ? 'var(--gating-primary)' : 'var(--text-secondary)',
          fontSize: 12,
        }}
      >
        {!requested ? (
          <>
            <strong style={mono}>AWAITING CALL FOR FIRE.</strong> ROE gate evaluates when the mission arrives
            {requestedAt ? ` (${requestedAt})` : ''}. Observer link {rating.score.toFixed(2)} {rating.roeGated ? '<' : '≥'} floor{' '}
            {ROE_FLOOR.toFixed(2)}.
          </>
        ) : hold ? (
          <>
            <strong style={mono}>ROE GATE — HOLD.</strong> Observer link {rating.score.toFixed(2)} &lt; floor {ROE_FLOOR.toFixed(2)} → GPS-guided fires gated.
            <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>Options: delay 60 s · shift to non-GPS · confirm on alternate channel</div>
          </>
        ) : (
          <>
            <strong style={mono}>ROE GATE — CLEAR.</strong> Observer link ≥ {ROE_FLOOR.toFixed(2)}.
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Legend + rating scale + SIDC table
// ---------------------------------------------------------------------------

function Swatch({ children, label }: { children: ReactNode; label: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
      <svg width={40} height={28} viewBox="0 0 40 28" overflow="visible" aria-hidden>
        {children}
      </svg>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}

const thS: CSSProperties = { ...mono, fontWeight: 400, color: 'var(--text-tertiary)', padding: '2px 8px', textAlign: 'left' };
const tdS: CSSProperties = { ...mono, fontSize: 12, padding: '2px 8px', color: 'var(--text-secondary)' };

export function RatingScaleTable() {
  return (
    <table style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {['Rating (label)', 'Score', 'J (export)', 'J meaning — FM 2-22.3 App. B', 'ROE'].map((h) => (
            <th key={h} style={thS}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {LINK_TRUST_SCALE.map((l, i) => {
          const hi = i === 0 ? 1 : LINK_TRUST_SCALE[i - 1]!.min;
          return (
            <tr key={l.id} style={{ borderTop: '1px solid var(--surface-elevated)' }}>
              <td style={{ ...tdS, color: l.bandToken, fontWeight: 600 }}>{l.name}</td>
              <td style={tdS}>{i === 0 ? `≥ ${l.min.toFixed(2)}` : `${l.min.toFixed(2)} – ${hi.toFixed(2)}`}</td>
              <td style={tdS}>{l.jCode}</td>
              <td style={{ ...tdS, fontFamily: 'inherit' }}>
                {l.reliability}: {RELIABILITY[l.reliability].label} · {l.credibility}: {CREDIBILITY[l.credibility].label}
              </td>
              <td style={tdS}>{l.min < ROE_FLOOR ? 'gated' : '—'}</td>
            </tr>
          );
        })}
        <tr style={{ borderTop: '1px solid var(--surface-elevated)' }}>
          <td style={{ ...tdS, color: 'var(--sym-ink-stale)', fontWeight: 600 }}>STALE</td>
          <td style={tdS}>&gt; {STALE_AFTER_S} s since last good update</td>
          <td style={tdS}>F6 (since the J split)</td>
          <td style={{ ...tdS, fontFamily: 'inherit' }}>AR = {NRT} (non-real-time); frame greys out; W = last good DTG</td>
          <td style={tdS}>per score</td>
        </tr>
      </tbody>
    </table>
  );
}

export function LegendPrime() {
  const frames: FrameKind[] = ['friend', 'hostile', 'neutral', 'unknown'];
  return (
    <section style={{ display: 'grid', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--surface-panel)', maxWidth: 1080 }}>
      <h3 style={{ ...mono, margin: 0, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-tertiary)' }}>Legend — Option B′</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-2)' }}>
        {frames.map((f) => (
          <Swatch key={f} label={`${f} — 2525E frame, affiliation by shape; solid regardless of trust`}>
            <path d={FRAME_PATH[f]} transform="translate(4 -2)" fill="none" stroke="var(--sym-ink)" strokeWidth={1.5} />
          </Swatch>
        ))}
        <Swatch label="Dashes reserved for status / identity (status 1 anticipated, or suspect / assumed / pending) — never trust">
          <path d={FRAME_PATH.hostile} transform="translate(4 -2)" fill="none" stroke="var(--sym-ink)" strokeWidth={1.5} strokeDasharray="4 4" />
        </Swatch>
        <Swatch label={<><strong>Hamilton link-trust overlay (non-2525)</strong> — centred halo below 0.60, trust tokens only, toggleable, stripped on export</>}>
          <g transform="translate(20 14)">
            <HaloSvg score={0.45} iconRadius={8} reducedMotion />
          </g>
          <path d={FRAME_PATH.friend} transform="translate(12 6) scale(0.5)" fill="var(--sym-plate)" stroke="var(--sym-ink)" strokeWidth={3} />
        </Swatch>
        <Swatch label="Stale (> 10 s since last good update): frame greys, AR = NRT, label STALE">
          <path d={FRAME_PATH.friend} transform="translate(4 -2)" fill="none" stroke="var(--sym-ink-stale)" strokeWidth={1.5} />
        </Swatch>
        <Swatch label="Right (J line): rating name + score, then the 2525 J code (export value). Shown below 0.60, when stale, or on hover/focus">
          <text x={0} y={18} fill={rateLinkTrust(0.45).bandToken} style={{ ...mono, fontSize: 9, fontWeight: 600 }}>
            DEGR.
          </text>
          <text x={30} y={18} fill="var(--text-tertiary)" style={{ ...mono, fontSize: 9 }}>
            D4
          </text>
        </Swatch>
        <Swatch label="Left: T (unique designation); W (DTG of last good update) above it when stale / hovered / selected">
          <text x={20} y={18} textAnchor="middle" fill="var(--sym-ink)" style={{ ...mono, fontSize: 11 }}>
            B
          </text>
        </Swatch>
        <Swatch label="Echelon: • team · ••• platoon · | battery">
          <g fill="var(--sym-ink)">
            <circle cx={5} cy={14} r={1.5} />
            <circle cx={14} cy={14} r={1.5} />
            <circle cx={18} cy={14} r={1.5} />
            <circle cx={22} cy={14} r={1.5} />
            <rect x={32} y={9} width={1.5} height={10} />
          </g>
        </Swatch>
        <Swatch label="Selected — solid double frame">
          <rect x={6} y={6} width={28} height={18} fill="none" stroke="var(--sym-select)" strokeWidth={1.25} />
          <rect x={3} y={3} width={34} height={24} fill="none" stroke="var(--sym-select)" strokeWidth={1.25} />
        </Swatch>
        <Swatch label="No AL condition bar, no damaged slash, no frame colour/opacity for trust. ROE / Excalibur gate → fire-mission popup">
          <line x1={4} x2={36} y1={14} y2={14} stroke="var(--text-tertiary)" strokeWidth={1.5} />
        </Swatch>
      </div>
      <RatingScaleTable />
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>
        J wording: {J_CODE_CITATION}. Mapping score → J code is a Hamilton convention (the J scale was written for sources and information, not links).
      </p>
    </section>
  );
}

export interface SidcRow {
  entity: string;
  shownAs: string;
  sidc2525e: string;
  sidc2525c: string;
  note: string;
}

export const SIDC_ROWS_PRIME: SidcRow[] = [
  { entity: 'unit_a', shownAs: 'A · friend · team', sidc2525e: '10031000111304000000', sidc2525c: 'SFGPUCFTC--A---', note: 'NEAREST: 2525C has no generic FA observer; UCFTC- = FA target acquisition COLT (milsymbol lettersidc/ground.js). Echelon assumed.' },
  { entity: 'unit_b', shownAs: 'B · friend · battery', sidc2525e: '10031000151303000000', sidc2525c: 'SFGPUCF----E---', note: 'UCF--- field artillery verified (ground.js). Echelon assumed.' },
  { entity: 'unit_c', shownAs: 'C · friend · platoon', sidc2525e: '10031000141303025000', sidc2525c: 'SFGPUCFTR--D---', note: 'UCFTR- FA target acquisition radar verified (ground.js). Echelon assumed.' },
  { entity: 'jammer (confirmed)', shownAs: 'J1 · hostile', sidc2525e: '10065200001102002500', sidc2525c: 'SHGPUUMSEJ-----', note: 'NEAREST: 2525C SIGINT set has no jammer; UUMSEJ = EW jamming UNIT (ground.js), not equipment.' },
  { entity: 'candidate, barrage', shownAs: 'C1–C2 · status 1', sidc2525e: '10065210001102002500', sidc2525c: 'SHGAUUMSEJ-----', note: 'Status A (anticipated) in position 4. Same NEAREST caveat as the jammer.' },
  { entity: 'candidate, swept', shownAs: 'C3 · status 1', sidc2525e: '10065210001102002800', sidc2525c: 'SHGAUUMSEJ-----', note: 'UNVERIFIED distinction: 2525C has no barrage/swept modifier.' },
  { entity: 'bearing line', shownAs: 'B → J1', sidc2525e: '10032500002201070000', sidc2525c: 'GFOPBE---------', note: 'UNVERIFIED — from memory (G*O*BE "bearing line, electronic"); milsymbol ships points only, could not check.' },
  { entity: 'NAI', shownAs: 'NAI 1', sidc2525e: '10032500001202000000', sidc2525c: 'GFGPSAN--------', note: 'UNVERIFIED — from memory (G*G*SAN "named area of interest"); not checkable offline.' },
];

export function SidcTablePrime() {
  return (
    <table style={{ borderCollapse: 'collapse', maxWidth: 1080 }}>
      <thead>
        <tr>
          {['Entity', 'Shown as', 'SIDC 2525E (stored)', '2525C letter (TAK export)', 'Verification'].map((h) => (
            <th key={h} style={thS}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {SIDC_ROWS_PRIME.map((r) => (
          <tr key={r.entity} style={{ borderTop: '1px solid var(--surface-elevated)' }}>
            <td style={tdS}>{r.entity}</td>
            <td style={tdS}>{r.shownAs}</td>
            <td style={{ ...tdS, color: 'var(--text-primary)' }}>{r.sidc2525e}</td>
            <td style={{ ...tdS, color: 'var(--text-primary)' }}>{r.sidc2525c}</td>
            <td style={{ ...tdS, fontFamily: 'inherit', fontSize: 11 }}>{r.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const SIDC_TABLE_PRIME_MD =
  '| Entity | SIDC 2525E (stored) | 2525C letter (TAK export) | Verification |\n|---|---|---|---|\n' +
  SIDC_ROWS_PRIME.map((r) => `| ${r.entity} | ${r.sidc2525e} | ${r.sidc2525c} | ${r.note} |`).join('\n');
