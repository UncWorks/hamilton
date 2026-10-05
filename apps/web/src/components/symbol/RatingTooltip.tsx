// Link-trust rating tooltip — the hover / focus factor breakdown for a track
// symbol (decision 3: keep the rating names and the hover breakdown). The score
// is RECOMPUTED from the components with the aggregator formula
// (services/trust-engine/crates/aggregator/src/lib.rs); a mismatch with the
// payload score is flagged. Evidence strings derive from the engine's own
// detector mappings. Tokens only, no dependencies.

import { useId, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { FingerprintCandidate } from '@hamilton/contracts';
import {
  AVG_BLEND,
  CREDIBILITY,
  NRT,
  RELIABILITY,
  TSS_MIN_GPS_SCORE,
  STALE_AFTER_S,
  STABILITY_CRC,
  TEMPORAL_BASELINE,
  TEMPORAL_SIGMA,
  WORST_BLEND,
  aggregateTrust,
  cadenceForTemporalTrust,
  cadenceSigma,
  crcForStabilityTrust,
  exportAmplifiers,
  formatDtg,
  rateLinkTrust,
  secondsSince,
  type Corroboration,
  type JOverride,
  type LinkTrustRating,
  type TrustComponentsLike,
  type TrustFactor,
} from '@/lib/link-trust-rating';
import { methodName } from '@/lib/display-names';
import { TrackSymbol, type TrackSymbolProps } from './TrackSymbol';

const mono: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--text-micro, 11px)' };

// ---------------------------------------------------------------------------
// Evidence strings
// ---------------------------------------------------------------------------

/** "1.0", "1.17", "6.1" — at least one decimal, at most two. */
const fmtS = (x: number) => {
  const t = x.toFixed(2);
  return t.endsWith('0') ? x.toFixed(1) : t;
};
/** "0.2", "6", "14" — CRC as a percentage, integer when it is one. */
const fmtPct = (frac: number) => {
  const pct = Math.round(frac * 1000) / 10;
  return Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1);
};

export interface EvidenceContext {
  /** Same-side units near this one, e.g. "A, C" (a leading "neighbours " is tolerated). */
  neighbours?: string | undefined;
  topCandidate?: FingerprintCandidate | undefined;
  /**
   * Raw telemetry behind the components, when known. Needed for exact strings
   * where the trust mapping saturates (temporal 0 at ≥ 6σ hides whether the gap
   * is 1.3 s or 6.1 s).
   */
  telemetry?: { cadenceS: number; crc: number } | undefined;
}

/** "neighbours A, C" / "A, C" → "A and C"; empty → undefined. */
function neighbourList(raw: string | undefined): string | undefined {
  const list = raw?.replace(/^neighbours?\s*/i, '').trim();
  if (!list) return undefined;
  const parts = list.split(/\s*,\s*|\s+and\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
}

/**
 * Plain-language evidence line per factor, derived through the engine's
 * detector mappings (temporal.rs baseline 1.0 s ± 0.05 s, 1σ → 1.0, 6σ → 0.0;
 * stability.rs 0.5 % → 1.0, 20 % → 0.0; spatial.rs Nominal / Localized 0.6 /
 * Blanket 0.3; fingerprint.rs 1 − k/6) — e.g. temporal 0.52 ⇔ 1.17 s.
 */
export function evidenceFor(f: TrustFactor, c: number, ctx: EvidenceContext = {}): string {
  const healthy = c >= 0.999;
  const base = fmtS(TEMPORAL_BASELINE.meanS);
  switch (f) {
    case 'temporal': {
      if (healthy && !ctx.telemetry) return `Messages arriving every ${base} s (normal)`;
      const observed = ctx.telemetry?.cadenceS ?? (c > 0 ? cadenceForTemporalTrust(c) : undefined);
      if (observed === undefined) {
        const atZero = TEMPORAL_BASELINE.meanS + TEMPORAL_SIGMA.zero * TEMPORAL_BASELINE.stdS;
        return `Message gaps of ${fmtS(atZero)} s or more (normally ${base} s)`;
      }
      const sigma = cadenceSigma(observed);
      if (sigma <= TEMPORAL_SIGMA.full) return `Messages arriving every ${fmtS(observed)} s (normal)`;
      return `Messages arriving every ${fmtS(observed)} s (normally ${base} s${sigma > TEMPORAL_SIGMA.anomaly ? '' : ', within tolerance'})`;
    }
    case 'stability': {
      const crc = ctx.telemetry?.crc ?? (c > 0 ? crcForStabilityTrust(c) : undefined);
      if (healthy && (crc === undefined || crc <= STABILITY_CRC.full)) return `${fmtPct(crc ?? 0.002)}% of frames corrupted (normal)`;
      if (crc === undefined) return `${fmtPct(STABILITY_CRC.zero)}% or more of frames corrupted (normally under 1%)`;
      return `${fmtPct(crc)}% of frames corrupted (normally under 1%)`;
    }
    case 'spatial': {
      // spatial.rs: Nominal 1.0 (not degrading), Localized 0.6, Blanket 0.3.
      if (healthy) return 'This link is not degrading';
      const n = neighbourList(ctx.neighbours);
      if (c >= 0.6) {
        return n
          ? `Only this unit is affected — ${n} within 500 m ${/ and /.test(n) ? 'are' : 'is'} healthy`
          : 'Only this unit is affected — no degrading unit within 500 m';
      }
      return 'Nearby units also degraded';
    }
    case 'fingerprint': {
      // components.fingerprint IS trust: 1 − match strength, 1.0 when nothing matches at ≥ 0.5.
      if (healthy) return 'No known jammer signature';
      const overlap = 1 - c;
      const dims = Math.round(overlap * 6);
      const top = ctx.topCandidate;
      const name = top?.method_id && Math.abs(top.score - overlap) < 0.01 ? methodName(top.method_id) : undefined;
      const what = name ? `a known ${name.charAt(0).toLowerCase()}${name.slice(1)} jammer` : 'a known jammer';
      return `Matches ${what} on ${dims === 6 ? 'all 6' : `${dims} of 6`} signal checks`;
    }
  }
}

// ---------------------------------------------------------------------------
// Explanation body
// ---------------------------------------------------------------------------

export interface ExplanationProps extends EvidenceContext {
  /** e.g. "B · FA battery". */
  title: string;
  components: TrustComponentsLike;
  /** The payload score; the panel recomputes it from components and flags a mismatch. */
  payloadScore?: number | undefined;
  lastGoodIso: string;
  nowIso: string;
  corroboration?: Corroboration | undefined;
  jOverride?: JOverride | undefined;
}

const f3 = (n: number) => n.toFixed(3);
const pct = (x: number) => `${Math.round(x * 100)}%`;

function Bar({ value }: { value: number }) {
  const r = rateLinkTrust(value);
  return (
    <span aria-hidden style={{ display: 'inline-block', width: 56, height: 6, background: 'var(--surface-base)', verticalAlign: 'middle' }}>
      <span style={{ display: 'block', width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', background: r.bandToken }} />
    </span>
  );
}

export function explainRating(p: ExplanationProps): { rating: LinkTrustRating; agg: ReturnType<typeof aggregateTrust>; ageS: number } {
  const agg = aggregateTrust(p.components);
  const ageS = secondsSince(p.lastGoodIso, p.nowIso);
  return { rating: rateLinkTrust(agg.score, { stale: ageS > STALE_AFTER_S, corroboration: p.corroboration, override: p.jOverride }), agg, ageS };
}

export function RatingExplanation(p: ExplanationProps) {
  const { rating, agg, ageS } = explainRating(p);
  const mismatch = p.payloadScore !== undefined && Math.abs(p.payloadScore - agg.score) > 0.005;
  const amps = exportAmplifiers(rating, p.lastGoodIso);
  const cell: CSSProperties = { padding: '2px 6px 0 0', ...mono, fontSize: 11, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
  const ov = rating.override;
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)', fontSize: 12, color: 'var(--text-secondary)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-primary)' }}>{p.title}</span>
        <span style={{ ...mono, fontWeight: 600, color: rating.labelToken }}>{rating.label}</span>
        <span style={{ ...mono, color: 'var(--text-primary)' }}>{rating.score.toFixed(2)}</span>
        <span style={{ ...mono, color: 'var(--text-tertiary)' }} data-testid="tip-j">
          J {rating.jCode}
        </span>
      </div>
      {rating.stale && (
        <div style={{ ...mono, fontSize: 11 }}>
          STALE (AR {NRT}, J F6) — last rating {rating.name} {rating.score.toFixed(2)}
        </div>
      )}
      <div style={{ fontSize: 11 }}>
        <span style={{ ...mono, color: 'var(--text-primary)' }}>{rating.jCode}</span>: {RELIABILITY[rating.reliability].label.toLowerCase()} /{' '}
        {CREDIBILITY[rating.credibility].label.toLowerCase()}
        {!ov && !rating.stale && (
          <span>
            {' '}
            — letter from the link score, digit from corroboration ({rating.corroboration === 'confirmed' ? 'confirmed on an alternate channel' : 'not corroborated'})
          </span>
        )}
      </div>
      {ov && (
        <div data-testid="tip-override" style={{ fontSize: 11, color: 'var(--text-primary)' }}>
          {ov.by} override <span style={mono}>{rating.jCode}</span> (automatic <span style={mono}>{rating.autoJ}</span>) — {ov.reason}
          {ov.at ? <span style={{ color: 'var(--text-tertiary)' }}> · {formatDtg(ov.at)}</span> : null}
        </div>
      )}

      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--text-tertiary)' }}>
            {['Factor', 'Value', 'Weight', 'Share', ''].map((h, i) => (
              <th key={i} style={{ ...cell, fontWeight: 400, textAlign: 'left' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agg.factors.flatMap((f) => [
            <tr key={f.factor} data-factor={f.factor} data-weakest={f.weakest || undefined}>
              <td style={{ ...cell, color: f.weakest ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {f.label}
              </td>
              <td style={cell}>{f.value.toFixed(2)}</td>
              <td style={cell}>×{f.weight.toFixed(1)}</td>
              <td style={cell}>{f3(f.contribution)}</td>
              <td style={cell}>
                <Bar value={f.value} />
                {f.weakest && <span style={{ marginLeft: 6, color: 'var(--text-primary)' }}>◂ weakest link</span>}
              </td>
            </tr>,
            <tr key={`${f.factor}-ev`}>
              <td colSpan={5} style={{ padding: '0 0 4px 12px', fontSize: 11, color: 'var(--text-tertiary)' }}>
                {evidenceFor(f.factor, f.value, p)}
              </td>
            </tr>,
          ])}
          <tr style={{ borderTop: '1px solid var(--surface-panel)' }}>
            <td style={{ ...cell, color: 'var(--text-tertiary)' }} colSpan={3}>
              Weighted average
            </td>
            <td style={cell}>{f3(agg.weightedAvg)}</td>
            <td />
          </tr>
        </tbody>
      </table>

      <div data-testid="formula" style={{ ...mono, fontSize: 11, color: 'var(--text-primary)' }}>
        Score {agg.score.toFixed(2)} = {pct(AVG_BLEND)} weighted average ({agg.weightedAvg.toFixed(2)}) + {pct(WORST_BLEND)} weakest factor ({agg.worst.toFixed(2)})
      </div>
      {mismatch && (
        <div role="alert" style={{ ...mono, fontSize: 11, color: 'var(--trust-failed-stroke)' }}>
          Score mismatch: reported {p.payloadScore?.toFixed(3)}, recomputed {f3(agg.score)}
        </div>
      )}

      <div style={{ fontSize: 11 }}>
        Last good update <span style={{ ...mono, color: 'var(--text-primary)' }}>{formatDtg(p.lastGoodIso)}</span> · {Math.round(ageS)} s ago
        {rating.stale ? (
          <span style={{ color: 'var(--text-primary)' }}>
            {' '}
            → STALE (&gt;{STALE_AFTER_S} s), AR {NRT}
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 11, color: rating.belowTssMin ? 'var(--gating-primary)' : 'var(--text-tertiary)' }}>
        {rating.belowTssMin ? `Below TSS minimum (GPS-guided, C ≥ ${TSS_MIN_GPS_SCORE.toFixed(2)}) → GPS missions on this source fail TSS` : `At/above TSS minimum (GPS-guided, C ≥ ${TSS_MIN_GPS_SCORE.toFixed(2)})`}
      </div>
      {p.components.fingerprint <= agg.worst && p.components.fingerprint < 1 && p.topCandidate?.method_id && (
        <div style={{ fontSize: 11 }}>
          Top jammer candidate: <span style={{ color: 'var(--text-primary)' }}>{methodName(p.topCandidate.method_id)}</span>
          {p.topCandidate.named_systems.length ? ` (${p.topCandidate.named_systems.join(', ')})` : ''} · match {p.topCandidate.score.toFixed(2)}
        </div>
      )}
      <div style={{ ...mono, fontSize: 10, color: 'var(--text-tertiary)' }}>
        Export (TAK/CoT): J={amps.J} W={amps.W}
        {amps.AR ? ` AR=${amps.AR}` : ''}
      </div>
    </div>
  );
}

export const tooltipSurface: CSSProperties = {
  width: 400,
  padding: 'var(--space-3)',
  background: 'var(--surface-elevated)',
  border: '1px solid var(--surface-panel)',
  boxShadow: '0 8px 24px var(--surface-modal-scrim)',
  textAlign: 'left',
};

/** Focus ring for SVG / HTML triggers (tokens only). Render once per page. */
export const TRIGGER_CSS = `
.symbol-trigger { outline: none; }
.symbol-trigger:focus-visible { outline: 2px solid var(--text-primary); outline-offset: 2px; }
`;

// ---------------------------------------------------------------------------
// Hover / focus plumbing (WCAG 1.4.13: hoverable, dismissable with Escape)
// ---------------------------------------------------------------------------

export function useHoverTip(closeDelayMs = 120) {
  const id = `rating-tip-${useId().replace(/:/g, '')}`;
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const show = () => {
    window.clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), closeDelayMs);
  };
  return {
    id,
    open,
    triggerProps: {
      tabIndex: 0,
      'aria-describedby': id,
      onMouseEnter: show,
      onMouseLeave: hide,
      onFocus: show,
      onBlur: hide,
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false);
      },
    },
    tipProps: { id, role: 'tooltip' as const, onMouseEnter: show, onMouseLeave: hide },
  };
}

/** One open tip at a time for SVG scenes, rendered in the HTML layer above the SVG. */
export function useAnchoredTips(containerRef: { current: HTMLElement | null }, tipWidth = 400) {
  const [open, setOpen] = useState<{ key: string; x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = (key: string, el: Element) => {
    window.clearTimeout(timer.current);
    const c = containerRef.current?.getBoundingClientRect();
    if (!c) return;
    const r = el.getBoundingClientRect();
    const flip = r.right - c.left + 12 + tipWidth > c.width;
    setOpen({ key, x: flip ? Math.max(0, r.left - c.left - 12 - tipWidth) : r.right - c.left + 12, y: Math.max(0, r.top - c.top - 8) });
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(null), 150);
  };
  const keep = () => window.clearTimeout(timer.current);
  return {
    open,
    trigger: (key: string, tipId: string) => ({
      tabIndex: 0,
      role: 'button',
      'aria-describedby': tipId,
      className: 'symbol-trigger',
      style: { cursor: 'help' } as CSSProperties,
      onMouseEnter: (e: MouseEvent<Element>) => show(key, e.currentTarget),
      onMouseLeave: hide,
      onFocus: (e: FocusEvent<Element>) => show(key, e.currentTarget),
      onBlur: hide,
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(null);
      },
    }),
    tip: (key: string, tipId: string): { id: string; role: 'tooltip'; onMouseEnter: () => void; onMouseLeave: () => void; style: CSSProperties } => ({
      id: tipId,
      role: 'tooltip',
      onMouseEnter: keep,
      onMouseLeave: hide,
      style: {
        ...tooltipSurface,
        position: 'absolute',
        zIndex: 30,
        display: open?.key === key ? 'block' : 'none',
        left: open?.key === key ? open.x : 0,
        top: open?.key === key ? open.y : 0,
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Symbol + tooltip
// ---------------------------------------------------------------------------

export interface TrackSymbolWithTooltipProps extends TrackSymbolProps {
  explanation?: ExplanationProps | undefined;
  /** Render the tooltip open, in flow (review stories). */
  forceOpen?: boolean | undefined;
  testId?: string | undefined;
  margin?: number | undefined;
}

/** HTML cell: the symbol as a focusable trigger + its rating tooltip (aria-describedby). */
export function TrackSymbolWithTooltip({ explanation, forceOpen = false, testId, margin, ...sym }: TrackSymbolWithTooltipProps) {
  const tip = useHoverTip();
  if (!explanation || sym.track.score === undefined) return <TrackSymbol {...sym} margin={margin} />;
  const open = forceOpen || tip.open;
  return (
    <span style={{ position: 'relative', display: forceOpen ? 'flex' : 'inline-block', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
      <span
        {...tip.triggerProps}
        role="button"
        aria-label={`${sym.track.designation ?? 'Track'}: link trust — hover or focus for the rating breakdown`}
        data-testid={testId}
        className="symbol-trigger"
        style={{ display: 'inline-block', cursor: 'help' }}
      >
        <TrackSymbol {...sym} active={sym.active || open} margin={margin} />
      </span>
      <div {...tip.tipProps} style={{ ...tooltipSurface, display: open ? 'block' : 'none', ...(forceOpen ? {} : { position: 'absolute', left: '50%', top: '100%', zIndex: 20 }) }}>
        <RatingExplanation {...explanation} />
      </div>
    </span>
  );
}
