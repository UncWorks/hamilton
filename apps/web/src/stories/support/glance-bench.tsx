// Explorations/At-a-Glance Symbols — bench UI: heatmaps + results for the
// research protocol (glance-eval.ts), the human odd-one-out task (T8), SIDC
// tables and the documentation (rationale, conformance, differences,
// unverified list). Story-only.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { SensorType } from '@hamilton/contracts';
import { CONFUSABLE_AT, INDISTINGUISHABLE_AT, T, formatSidc, linearFit, mulberry32 } from '@/lib/glance-metrics';
import type { FrameKind } from './MilSymbol';
import { FRAME_COLS, FUNCTIONS, GLANCE_VARIANTS, GlanceCell, RESEARCH_ID, SENSOR_ROWS, cellCodes, mapSurface, type AnyVariant, type GlanceVariant } from './GlanceSymbol';
import { SEARCH_CONDITIONS, VISIONS, runSuite, t3Pass, type PairMatrix, type SearchCondition, type SuiteResult, type Vision } from './glance-eval';

export const mono: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11 };
export const MANUAL = 'FM 1-02 / MCRP 5-12A (2004)';
const tdS: CSSProperties = { ...mono, padding: '3px 8px', color: 'var(--text-secondary)', borderTop: '1px solid var(--surface-elevated)', verticalAlign: 'top' };
const thS: CSSProperties = { ...mono, padding: '3px 8px', color: 'var(--text-tertiary)', fontWeight: 400, textAlign: 'left', verticalAlign: 'bottom' };

// ---------------------------------------------------------------------------
// Running the suite without freezing the first paint
// ---------------------------------------------------------------------------

export function useSuites(variants: AnyVariant[]): { results: Partial<Record<AnyVariant, SuiteResult>>; done: boolean } {
  const [results, setResults] = useState<Partial<Record<AnyVariant, SuiteResult>>>({});
  const key = variants.join(',');
  useEffect(() => {
    let cancelled = false;
    const queue = [...variants];
    const step = async () => {
      const v = queue.shift();
      if (!v || cancelled) return;
      const r = await runSuite(v);
      if (cancelled) return;
      setResults((prev) => ({ ...prev, [v]: r }));
      void step();
    };
    const id = setTimeout(() => void step(), 30);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { results, done: variants.every((v) => results[v]) };
}

// ---------------------------------------------------------------------------
// Heatmaps
// ---------------------------------------------------------------------------

/** Sequential single-hue ramp on the dark surface. `bad` end is light. */
function rampBg(t: number): string {
  return `oklch(${(24 + 58 * Math.max(0, Math.min(1, t))).toFixed(1)}% 0.045 250)`;
}

export function Heatmap({
  title,
  pm,
  kind,
  testId,
}: {
  title: string;
  pm: PairMatrix;
  /** similarity: high = bad (flag ≥ 0.85 / ≥ 0.80); distance: low = bad (no flag, compared to REF / V0 in the table). */
  kind: 'similarity' | 'distance';
  testId?: string;
}) {
  const n = pm.labels.length;
  const cell = 46;
  return (
    <figure style={{ margin: 0, display: 'grid', gap: 4 }} data-testid={testId}>
      <figcaption style={{ ...mono, color: 'var(--text-secondary)' }}>{title}</figcaption>
      <div style={{ display: 'grid', gridTemplateColumns: `92px repeat(${n}, ${cell}px)`, gap: 2, alignItems: 'center' }}>
        <span />
        {pm.labels.map((l) => (
          <span key={l} style={{ ...mono, fontSize: 9, color: 'var(--text-tertiary)', textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={l}>
            {l.replace('recon_', 'r_')}
          </span>
        ))}
        {pm.labels.map((row, i) => (
          <HeatRow key={row} row={row} i={i} pm={pm} kind={kind} cell={cell} />
        ))}
      </div>
    </figure>
  );
}

function HeatRow({ row, i, pm, kind, cell }: { row: string; i: number; pm: PairMatrix; kind: 'similarity' | 'distance'; cell: number }) {
  return (
    <>
      <span style={{ ...mono, color: 'var(--text-tertiary)', textAlign: 'right', paddingRight: 6 }}>{row}</span>
      {pm.labels.map((col, j) => {
        const s = pm.m[i]?.[j] ?? 0;
        const diag = i === j;
        const bad = kind === 'similarity' ? s : 1 - s;
        const flag = kind === 'similarity' && !diag ? (s >= INDISTINGUISHABLE_AT ? 'indistinguishable' : s >= CONFUSABLE_AT ? 'confusable' : 'distinct') : 'distinct';
        const light = 24 + 58 * bad > 58;
        return (
          <span
            key={col}
            data-verdict={diag ? 'self' : flag}
            title={diag ? row : `${row} vs ${col}: ${kind === 'similarity' ? 'soft IoU' : 'D'} ${s.toFixed(3)}${flag !== 'distinct' ? ` → ${flag}` : ''}`}
            style={{
              ...mono,
              height: cell - 14,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 2,
              background: diag ? 'var(--surface-panel)' : rampBg(bad),
              color: diag ? 'var(--text-tertiary)' : light ? 'var(--surface-base)' : 'var(--text-primary)',
              outline: flag === 'indistinguishable' ? '2px solid var(--text-primary)' : flag === 'confusable' ? '1px dashed var(--text-secondary)' : undefined,
              outlineOffset: -2,
              fontWeight: flag === 'indistinguishable' ? 700 : 400,
            }}
          >
            {diag ? '—' : `${s.toFixed(2)}${flag === 'indistinguishable' ? '≈' : flag === 'confusable' ? '~' : ''}`}
          </span>
        );
      })}
    </>
  );
}

export function VariantHeatmaps({ variant }: { variant: AnyVariant }) {
  const { results } = useSuites([variant]);
  const r = results[variant];
  if (!r) return <p style={mono}>Computing (canvas rasterisation)…</p>;
  return (
    <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'start' }} data-testid={`distinctness-${variant}`}>
      <Heatmap title={`T1 affiliation frames · soft IoU σ1 · s ${T.t1.sizePx} · max over the 5 rows`} pm={r.t1Heat} kind="similarity" testId={`heatmap-${variant}-frames`} />
      <Heatmap title={`Function icons · soft IoU σ1 · s ${T.t3.sizePx} · max over the 4 frames`} pm={r.fnHeat} kind="similarity" testId={`heatmap-${variant}-icons`} />
      <Heatmap title={`T3 function appearance distance D · σ1 · min over frames (low = bad)`} pm={r.t3Heat} kind="distance" testId={`heatmap-${variant}-t3`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results table (T1–T7) with calibration
// ---------------------------------------------------------------------------

const P = ({ ok }: { ok: boolean }) => <span style={{ color: ok ? 'var(--text-primary)' : 'var(--trust-failed-stroke)', fontWeight: 700 }}>{ok ? 'PASS' : 'FAIL'}</span>;
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '∞');
const pct = (x: number) => `${Math.round(x * 100)}%`;

export const SUITE_VARIANTS: AnyVariant[] = ['REF', ...GLANCE_VARIANTS];

export function ResultsTable({ variants = SUITE_VARIANTS, vision = 'normal' }: { variants?: AnyVariant[]; vision?: Vision }) {
  const { results, done } = useSuites(variants.includes('REF') && variants.includes('V0') ? variants : (['REF', 'V0', ...variants.filter((v) => v !== 'REF' && v !== 'V0')] as AnyVariant[]));
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      {!done && <p style={{ ...mono, color: 'var(--text-tertiary)' }}>Running T1–T7 in this browser… ({Object.keys(results).length} variants done)</p>}
      <table style={{ borderCollapse: 'collapse' }} data-testid={`results-${vision}`} data-ready={done ? 'true' : 'false'}>
        <thead>
          <tr>
            <th style={thS}>Variant</th>
            <th style={thS}>
              T1 affiliation (s24)
              <br />σ1 max ≤ {T.t1.sigma1Max} · F/H ≤ {T.t1.friendHostileMax} · σ2 max ≤ {T.t1.sigma2Max}
            </th>
            {vision === 'normal' && (
              <th style={thS}>
                T2 overlay masking
                <br />max rise ≤ {T.t2.maxRise}
              </th>
            )}
            <th style={thS}>
              T3 function D (s32)
              <br />≥ REF and ≥ {T.t3.vsNgonFactor}× V0
            </th>
            <th style={thS}>
              T4 thumbnail NCC (aff · fn)
              <br />16 / 24 / 32 px
            </th>
            <th style={thS}>{vision === 'grayscale' ? 'T5 min contrast ≥ 3:1' : vision === 'normal' ? 'Colour' : `T6 ΔE76 (≥ ${T.t6.minDeltaE} or redundant)`}</th>
            {vision === 'normal' && (
              <th style={thS}>
                T7 salience R ≥ {T.t7.minR}
                <br />min over N 8/16/32
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => {
            const r = results[v];
            if (!r) return null;
            const x = r.visions[vision];
            const ref = results.REF && results.V0 ? t3Pass(v, vision) : undefined;
            return (
              <tr key={v} data-variant={v}>
                <td style={{ ...tdS, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  {v} {v !== 'REF' && v !== 'V0' ? `(${RESEARCH_ID[v]})` : v === 'REF' ? '(doctrinal ref)' : '(n-gon)'}
                </td>
                <td style={tdS}>
                  <P ok={x.t1.pass} /> σ1 {f2(x.t1.sigma1.max)} ({x.t1.sigma1.pair.join('/')}) · F/H {f2(x.t1.sigma1.friendHostile)} · σ2 {f2(x.t1.sigma2.max)}
                </td>
                {vision === 'normal' && (
                  <td style={tdS}>
                    <P ok={r.t2.pass} /> +{f2(Math.max(0, r.t2.maxRise))} ({r.t2.pair.join('/')} @ {r.t2.score})
                  </td>
                )}
                <td style={tdS}>
                  {ref ? <P ok={ref.pass} /> : '…'} {f2(x.t3.minD)} ({x.t3.pair.join('/')}){ref ? ` · REF ${f2(ref.ref)} · V0 ${f2(ref.ngon)}` : ''}
                </td>
                <td style={tdS}>
                  <P ok={x.t4pass} /> {x.t4.map((c) => `${pct(c.affiliation)}·${pct(c.function)}`).join(' / ')}
                </td>
                <td style={tdS}>
                  {vision === 'grayscale' ? (
                    <>
                      <P ok={x.colour.minContrast.value >= T.t5.minContrast} /> {x.colour.minContrast.value.toFixed(1)}:1 ({x.colour.minContrast.what})
                    </>
                  ) : vision === 'normal' ? (
                    <>min contrast {x.colour.minContrast.value.toFixed(1)}:1 ({x.colour.minContrast.what})</>
                  ) : (
                    <>
                      <P ok={(x.colour.affiliationDeltaE.value >= T.t6.minDeltaE || x.colour.affiliationRedundant) && (x.colour.trustDeltaE.value >= T.t6.minDeltaE || x.colour.trustRedundant)} /> aff{' '}
                      {x.colour.affiliationDeltaE.value.toFixed(1)} ({x.colour.affiliationDeltaE.pair}) · trust {x.colour.trustDeltaE.value.toFixed(1)} ({x.colour.trustDeltaE.pair})
                    </>
                  )}
                </td>
                {vision === 'normal' && (
                  <td style={tdS}>
                    <P ok={r.t7pass} />{' '}
                    {(Object.keys(SEARCH_CONDITIONS) as SearchCondition[]).map((c) => `${c} ${f2(Math.min(...Object.values(r.t7[c])))}`).join(' · ')}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ProtocolNote() {
  return (
    <div style={{ maxWidth: 1080, fontSize: 12, color: 'var(--text-secondary)', display: 'grid', gap: 6 }}>
      <p style={{ margin: 0 }}>
        <strong>Protocol</strong> — glance-symbology-research.md §5, implemented in <code>glance-eval.ts</code> / <code>lib/glance-metrics.ts</code>. Every
        cell is drawn on a 2s × 2s canvas at DPR 1 from the same primitive list as the SVG, composited on the map colour #06090d. Normal vision: T1/T2
        on silhouette alpha, T3/T4 on Rec.709 linear luminance. T5 reruns on CIE L*; T6 on luminance after Machado 2009 (severity 1.0, linear RGB)
        deuteranopia / protanopia; reruns of T1 use the luminance contrast against the map as the silhouette.
      </p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>T1 soft IoU = Σmin/Σmax after Gaussian σ 1 and 2 px, s 24, overlay off, max over the five sensor rows. Pass: σ1 max ≤ 0.85 and friend–hostile ≤ 0.70; σ2 max ≤ 0.92.</li>
        <li>T2 T1(σ1) with the overlay on at 0.45 and 0.20 vs off. Pass: no pair rises by more than 0.05.</li>
        <li>T3 D = Σ|a − b| / Σmax(a, b) on the blurred function signal |L − L(frame only)| (the frame is common to all five icons; for V0 the n-gon is the signal), s 32, min over frames. Pass: ≥ REF and ≥ 1.5× V0.</li>
        <li>T4 templates rendered at ≥ 128 px (integer supersample k = ⌈128/s⌉), box-downsampled, and averaged over the 16 sub-pixel offsets; tests at s with those 16 offsets and noise σ 0.02 (seeded); max-NCC classifier. Pass: affiliation 100 % at 16; function ≥ 95 % at 24, 100 % at 32; V4 (D) also function ≥ 95 % at 16.</li>
        <li>T5 contrast: frame vs map, icon vs fill, trust cue vs map ≥ 3:1 (WCAG 1.4.11). T6 ΔE76 ≥ 20 for colour-coded pairs, or a redundant non-colour code.</li>
        <li>T7 R = ‖V_T − V̄_D‖ / max‖V_Di − V̄_D‖ on blurred [L*, a*, b*], s 24, distractors at random ¼-px offsets and map-tile phases, N 8/16/32. Pass: R ≥ 2 in every condition.</li>
        <li>T8 human mode: the Odd-one-out stories time clicks and fit RT = a + b·N on correct target-present trials.</li>
      </ul>
      <p style={{ margin: 0 }}>
        REF = doctrinal reference at milsymbol-default icon sizes with 2525C light fills (a reconstruction, not milsymbol itself — the package is not a
        dependency). Calibration rule: REF must pass and V0 must fail before any other row is trusted. Heatmap flags: ≥ {INDISTINGUISHABLE_AT}{' '}
        <strong>≈ indistinguishable</strong> (T1 fail line), ≥ {CONFUSABLE_AT} ~ confusable (the brief&apos;s original 0.8). Normative basis: {MANUAL} ¶4-10,
        p 4-10 — symbols &ldquo;must be easily distinguishable&rdquo; and &ldquo;distinguishable without color for use on a monochrome display&rdquo;.
        Thresholds for T3, T6 and T7 are the research agent&apos;s provisional ones.
        Measured window: cues drawn beyond the 2s × 2s canvas (V1&apos;s gauge after the J column; V0&apos;s halo at low trust) are outside the
        glance window, so T2 and T7(iv) do not see them — by the protocol&apos;s definition they do not mask the silhouette. T7&apos;s denominator
        is driven by sub-pixel / map-tile jitter, so a bright ink frame line (V1–V4) raises distractor spread where REF&apos;s black line on the
        dark map does not.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SIDC table
// ---------------------------------------------------------------------------

export function SidcTable({ variant, withEchelon = false }: { variant: AnyVariant; withEchelon?: boolean }) {
  if (variant === 'V0') {
    return <p style={{ ...mono, color: 'var(--text-tertiary)' }}>V0 is bespoke (Branding §5.2 n-gons): no SIDC exists for any cell; it cannot be exported to 2525 / APP-6 / CoT.</p>;
  }
  return (
    <table style={{ borderCollapse: 'collapse' }} data-testid={`sidc-${variant}`}>
      <thead>
        <tr>
          <th style={thS}>Row → function ({MANUAL})</th>
          {FRAME_COLS.map((f) => (
            <th key={f} style={thS}>
              {f}: 2525E numeric · 2525B letter · CoT
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {SENSOR_ROWS.map((s) => {
          const fn = FUNCTIONS[s];
          return (
            <tr key={s}>
              <td style={{ ...tdS, color: 'var(--text-primary)', maxWidth: 260 }}>
                {s} → {fn.name}
                <br />
                <span style={{ color: 'var(--text-tertiary)' }}>{fn.cite}</span>
                {fn.eNote && (
                  <>
                    <br />
                    <span style={{ color: 'var(--text-tertiary)' }}>{fn.eNote}</span>
                  </>
                )}
              </td>
              {FRAME_COLS.map((f) => {
                const c = cellCodes(variant, s, f, withEchelon)!;
                return (
                  <td key={f} style={{ ...tdS, whiteSpace: 'nowrap' }}>
                    {formatSidc(c.e)}
                    <br />
                    {c.b}
                    <br />
                    <span style={{ color: 'var(--text-tertiary)' }}>{c.cot}</span>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Documentation
// ---------------------------------------------------------------------------

export interface VariantDoc {
  title: string;
  rationale: ReactNode;
  standard: ReactNode;
  overlay: ReactNode;
}

export const VARIANT_DOCS: Record<GlanceVariant, VariantDoc> = {
  V0: {
    title: 'V0 — Current (baseline)',
    rationale:
      'The bespoke Branding §5.2 scheme as COP/TrackSymbol draws it: sensor type = polygon side count (recon_static hexagon, recon_mobile heptagon, detection pentagon, defense square, offense triangle), enemy rotated 45°, neutral outlined, unknown dashed, opacity = score, and the same circular amber halo on every cell below 0.60. Research §1.1: vertex count needs > 3:1 ratios to guide attention (6 vs 7 is 1.17:1); the 45° rotation is effectively 15° on a hexagon and 6.4° on a heptagon.',
    standard: `Nothing. No frame, icon, colour or field maps to ${MANUAL} or 2525. Affiliation colours also disagree with Table 4-3 p 4-4 (neutral should be green, unknown yellow). Rotation carries no meaning for units (¶4-2, ¶4-11).`,
    overlay: 'Circular halo — a circle is the friendly land-equipment frame (Table 4-1 p 4-3); the variable-rate pulse violates MIL-STD-1472H §5.17.27.',
  },
  V1: {
    title: 'V1 (research A) — doctrinal filled, dark-map luminance',
    rationale:
      'Table 4-1 frames filled with 2525C hues at dark-map luminance (friend #0091c0, hostile #f00000, neutral #00b000, unknown #dcd900), frame in --sym-ink, icons #06090d. Enlarged doctrinal icons: FA cannonball r 25, COLT/FIST dot r 20, TA-radar dot r 12. Trust = side gauge + J text; no halo. Fill colour is an "undoubted" guiding feature and redundant with shape; MIL-STD-1472H §5.17.25.15 prefers filled symbols.',
    standard: `Frames: Table 4-1 p 4-3. Colours: Table 4-3 p 4-4 (computer-generated friend cyan, hostile red, neutral green, unknown yellow). Icons: Table 5-3 pp 5-6 (air defense), 5-11 (FA), 5-13 (COLT/FIST recon, TA radar, cavalry), Table 5-4 p 5-28 (motorized). J = Evaluation Rating, Table 4-4 p 4-6. Enlarged icons: 2525D §5.3.1.2 (within the octagon), per research §1.2.`,
    overlay: 'Side gauge (H2) right of the J column; non-doctrinal, legend-labelled per ¶4-5 p 4-4.',
  },
  V2: {
    title: 'V2 (research B) — unfilled monochrome, bold icons',
    rationale:
      'No fill (dark plate), frame and icon in --sym-ink, icon strokes ×1.25. Affiliation by shape only, so grayscale and CVD pass by construction and trust colour has no affiliation hue to collide with. Loses the strongest guiding feature (colour); outline symbols are less detectable (1472H §5.17.25.15).',
    standard: `Frames/icons as V1. "A frame can be black or colored" (¶4-4 p 4-2); colour may be the frame line (¶4-5 p 4-4); must work monochrome (¶4-10 p 4-10).`,
    overlay: 'H1 frame-following outline (0 / 1.5 / 2.5 / 4 px by band, 1 px gap) + H2 side gauge.',
  },
  V3: {
    title: 'V3 (research C) — RECOMMENDED: filled + frame-following trust outline',
    rationale:
      'V1 plus H1: the frame path stroked behind the symbol, width 0 / 1.5 / 2.5 / 4 px for nominal / watching / degraded / failed, with a 1 px plate gap; plus the gauge and J text. Below 0.30 the outline blinks once per second (50 % duty, globally synchronised) until acknowledged (H5, 1472H §5.17.27). The cue reinforces the frame silhouette instead of replacing it, and the width steps are colour-independent.',
    standard: 'Symbol identical to V1 (same citations). Weakness: a coloured border can read as affiliation colour (¶4-5 lets the frame line carry it) — keep the gap and the legend entry.',
    overlay: 'H1 outline + H2 gauge + H5 blink (below 0.30, acknowledgeable). J is doctrinal (Table 4-4).',
  },
  V4: {
    title: 'V4 (research D) — high-glance',
    rationale: `Filled doctrinal frames with heavier strokes (1.5 / 2 / 2.75 px at 16 / 24 / 32; icon ×0.9), minimum box 24 px (the brief said 20; research D says 24, from 1472H §5.17.25.13). Below 28 px (level of detail) echelon and every amplifier except T are hidden and icons enlarge (FA r 28, diagonal and dome ×1.5); at ≥ 28 px the full icons and echelon (Table 5-6 p 5-33) return. Trust = H1 at 2.5 / 4 px only (watching suppressed) + gauge.`,
    standard: `Frames, colours, icon meanings and field positions as V1 (Fig 5-2 p 5-3: echelon above, T left). The LOD rule and the 24 px floor are Hamilton conventions to document.`,
    overlay: 'H1 (degraded / failed only) + H2 gauge.',
  },
};

export interface Difference {
  topic: string;
  mcrp: string;
  e2525: string;
  consequence: string;
}

/** research §2.2, plus bench findings (marked "bench"). */
export const GLANCE_DIFFERENCES: Difference[] = [
  { topic: 'Base standard', mcrp: 'STANAG 2019 / APP-6A; "complies with ... 2525" (Preface p vi; p 4-1)', e2525: '2525E is "the single standard"', consequence: 'Symbol vocabulary is 2525B-era' },
  { topic: 'SIDC', mcrp: '2525B 15-char letter codes (via 2525B/C); the manual prints none', e2525: '20-digit numeric (+10 extension); milsymbol: version 13 = E', consequence: 'Store letter SIDC + CoT type; map to numeric for 2525E export. 130302 has no 2525E equivalent' },
  { topic: 'ATAK / CoT', mcrp: 'CoT a-<affil>-<dim>-<function> derives from the 2525B function code', e2525: 'Needs a lookup table', consequence: 'MCRP alignment makes CoT export trivial' },
  { topic: 'Assumed friend / suspect', mcrp: 'Base frame + "?" (Table 4-1 p 4-3)', e2525: 'Dashed variants (prior findings)', consequence: 'Under MCRP a dash means only planned/suspected status (p 4-4): never dash for trust' },
  { topic: 'Colour values', mcrp: 'Names only; non-default colours need a legend (p 4-4)', e2525: 'RGB tables; luminance-only variation (2525C pp 43–44)', consequence: 'Trust colours must appear in the legend' },
  { topic: 'Unfilled symbols', mcrp: 'Colour may be the frame line (p 4-4); frames "black or colored" (p 4-2)', e2525: 'Unfilled monochrome allowed (2525D Fig 8)', consequence: 'V2 (B) conforms to both' },
  { topic: 'Status / condition', mcrp: 'K = combat effectiveness 1–4 (p 4-7); no condition bar', e2525: 'AL operational-condition bar; K = FO/SO/MO/NO', consequence: 'No bars under the frame for trust in either standard' },
  { topic: 'Evaluation rating', mcrp: 'J = A–F / 1–6 (p 4-6)', e2525: 'Same J field', consequence: 'Keep the B2 / C3 / D4 / E5 mapping' },
  { topic: 'Echelon', mcrp: 'Ø • •• ••• I II (Table 5-6 p 5-33)', e2525: 'Same glyphs; numeric codes (11 = team)', consequence: 'The earlier "team = dot" was wrong (dot = squad) — fixed in MilSymbol.EchelonMark (bench)' },
  { topic: 'FA TA radar', mcrp: 'Dot + radar (p 5-13)', e2525: '130300 + modifier 50 / 67', consequence: 'Same look, different code path' },
  { topic: 'EW', mcrp: 'Under Military Intelligence (pp 5-16 – 5-18); jamming = "EW" + sawtooth (p 5-18)', e2525: 'Intelligence 1505xx', consequence: 'Same icon. Fixture hostile_ew_1 is typed "defense" (air-defense dome) — must render as EW' },
  { topic: 'Declutter', mcrp: 'Offset Q line; bracketed stacks (p 5-41/42)', e2525: 'Offset indicator retained (2525D §5.3.11)', consequence: 'Doctrinal aggregation exists (research E, Declutter story)' },
  { topic: 'Size / line width', mcrp: 'None', e2525: '2525D §5.3.9–5.3.10 defers to 1472, asks for usability tests', consequence: 'Use 1472H (research §1.2) and T1–T8' },
  { topic: 'Combat-effectiveness colours', mcrp: 'Gumball: green ≥ 85 %, amber 70–84, red 50–69, black < 50 (p D-2)', e2525: '—', consequence: 'Trust bands 0.85 / 0.60 / 0.30 in amber/red can be read as unit strength: keep trust off the fill' },
  { topic: 'Cannonball size (bench)', mcrp: 'Drawn ≈ 17 % of frame height (Table 5-3 p 5-11, measured at 300 dpi)', e2525: 'milsymbol r 15 / 100 ≈ 30 %', consequence: 'Both fail 1472H 10′ at s 32; research enlarges to r 25 / 28' },
  { topic: 'Frame proportions (bench)', mcrp: 'Drawings: neutral side ≈ friend height; hostile ≈ 1.3×, unknown ≈ 1.28× friend height (p 4-3)', e2525: 'milsymbol 1.1× / 1.44× / 1.385×', consequence: 'Bench uses milsymbol geometry; drawings are not a scale spec (approximate)' },
  { topic: 'NAI / bearing line (bench)', mcrp: 'NAI = polygon labelled "NAI <number>" (Table 7-11 p 7-35); no bearing-line graphic found (text search, Ch 7)', e2525: '25 120200 NAI; 25 220107 Bearing Line – Jammer', consequence: 'Jammer bearing line has no 2004 equivalent' },
];

export const UNVERIFIED: string[] = [
  'Change 1 date of the MCRP copy (research: not found in the front matter).',
  'Fletcher et al. 2011 (DSTO-TR-2604) symbol sizes and slopes — abstract only.',
  'NSWCDD 24′ default symbol size — search snippet, PDF returned 403.',
  'DRDC (ADA509467) and McFadden (ADA477198) reports — not read (403).',
  'Not found: Kerr/Fisher 2525 recognition studies, an ARL legibility report, a NATO HFM symbology study, a doctrinal rationale for the four frame shapes.',
  '2525B text not consulted: letter SIDCs come from 2525C / milsymbol 3.0.4 letter tables (all cell codes pass milsymbol isValid()).',
  '2525E PDF not consulted: entity codes from milstandard-e tables (research) and milsymbol 3.0.4 (bench). 130302 exists in milsymbol (2525D JMSML) but not in the 2525E tables, per research.',
  'TA-radar dot position (cx 70 cy 110 r 9 in milsymbol): confirmed by rendering milsymbol 3.0.4 in Node (bench), research had it unverified.',
  'Contour interaction at symbol scale (research §3) — inferred from acuity data.',
  'T3, T6, T7 thresholds are provisional (research §5.3) — calibrated only by REF passing and V0 failing.',
  'REF is a reconstruction of milsymbol defaults (sizes, light fills, black lines), not milsymbol output.',
  'Bearing-line absence in MCRP 5-12A rests on a text search of the extract, not a page-by-page read of Ch 7.',
];

export function DifferencesTable() {
  return (
    <table style={{ borderCollapse: 'collapse', maxWidth: 1240 }} data-testid="differences">
      <thead>
        <tr>
          <th style={thS}>Topic</th>
          <th style={thS}>{MANUAL} — what V1–V4 follow</th>
          <th style={thS}>2525E / FM 1-02.2 (2025)</th>
          <th style={thS}>Hamilton consequence</th>
        </tr>
      </thead>
      <tbody>
        {GLANCE_DIFFERENCES.map((d) => (
          <tr key={d.topic}>
            <td style={{ ...tdS, color: 'var(--text-primary)' }}>{d.topic}</td>
            <td style={tdS}>{d.mcrp}</td>
            <td style={tdS}>{d.e2525}</td>
            <td style={{ ...tdS, color: 'var(--text-tertiary)' }}>{d.consequence}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function UnverifiedList() {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', maxWidth: 1080 }} data-testid="unverified">
      {UNVERIFIED.map((u) => (
        <li key={u}>{u}</li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// T8 — human odd-one-out (timed, seeded, 50 % target present)
// ---------------------------------------------------------------------------

export type SearchMode = 'affiliation' | 'function';

interface Trial {
  variant: AnyVariant;
  n: number;
  seed: number;
  present: boolean;
  ms: number;
  correct: boolean;
}

interface Layout {
  present: boolean;
  slots: number[];
  target: number;
}

function layoutFor(seed: number, n: number, cols: number): Layout {
  // Scramble the seed: mulberry32's first draw is correlated across small consecutive seeds.
  const rnd = mulberry32(Math.imul(seed, 0x9e3779b1) >>> 0);
  const present = rnd() < 0.5;
  const cells = Array.from({ length: cols * cols }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  const slots = cells.slice(0, n);
  return { present, slots, target: present ? slots[Math.floor(rnd() * n)]! : -1 };
}

export function OddOneOut({
  mode,
  variant,
  sizePx,
  score,
  n = 32,
  alwaysPresent = false,
  sensor = 'offense',
  distractor = 'recon_static',
  target = 'recon_mobile',
  initialSeed = 1,
}: {
  mode: SearchMode;
  variant: AnyVariant;
  sizePx: number;
  score: number;
  /** Items in the grid (8 / 16 / 32, or 100 for the full 10 × 10). */
  n?: number;
  /** The brief's 10 × 10 version: target always present. */
  alwaysPresent?: boolean;
  sensor?: SensorType;
  distractor?: SensorType;
  target?: SensorType;
  initialSeed?: number;
}) {
  const cols = 10;
  const [seed, setSeed] = useState(initialSeed);
  const [start, setStart] = useState<number | null>(null);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [last, setLast] = useState<Trial | null>(null);
  const lay = useMemo(() => {
    const l = layoutFor(seed, Math.min(n, cols * cols), cols);
    if (alwaysPresent && !l.present) return { ...l, present: true, target: l.slots[0]! };
    return l;
  }, [seed, n, alwaysPresent]);
  const running = start !== null;

  const begin = (s: number) => {
    setSeed(s);
    setLast(null);
    setStart(performance.now());
  };
  const answer = (cellIdx: number | 'absent') => {
    if (start === null) return;
    const correct = cellIdx === 'absent' ? !lay.present : cellIdx === lay.target;
    const t: Trial = { variant, n, seed, present: lay.present, ms: Math.round(performance.now() - start), correct };
    setTrials((ts) => [...ts, t]);
    setLast(t);
    setStart(null);
  };

  const cellFor = (i: number): { sensor: SensorType; frame: FrameKind } | null => {
    if (!lay.slots.includes(i)) return null;
    const isT = i === lay.target;
    return mode === 'affiliation' ? { sensor, frame: isT ? 'hostile' : 'friend' } : { sensor: isT ? target : distractor, frame: 'friend' };
  };

  const stats = (['V0', 'V1', 'V2', 'V3', 'V4', 'REF'] as AnyVariant[])
    .map((v) => {
      const mine = trials.filter((t) => t.variant === v);
      const ok = mine.filter((t) => t.correct && t.present);
      const fit = linearFit(
        ok.map((t) => t.n),
        ok.map((t) => t.ms),
      );
      const med = ok.map((t) => t.ms).sort((a, b) => a - b)[Math.floor(ok.length / 2)];
      return { v, n: mine.length, acc: mine.length ? mine.filter((t) => t.correct).length / mine.length : 0, med, fit };
    })
    .filter((r) => r.n > 0);
  const box = sizePx + 2 * Math.max(4, sizePx / 3);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }} data-testid={`ooo-${mode}`}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap', ...mono }}>
        <button type="button" data-testid="ooo-start" onClick={() => begin(trials.length === 0 && !last && !running ? seed : seed + 1)} style={btn}>
          {running ? 'Restart' : trials.length ? 'Next trial (seed +1)' : 'Start'}
        </button>
        <button type="button" data-testid="ooo-randomise" onClick={() => begin(Math.floor(Math.random() * 1e6))} style={btn}>
          Randomise seed
        </button>
        {!alwaysPresent && (
          <button type="button" data-testid="ooo-absent" disabled={!running} onClick={() => answer('absent')} style={btn}>
            Target absent
          </button>
        )}
        <label style={{ color: 'var(--text-tertiary)' }}>
          seed{' '}
          <input
            type="number"
            value={seed}
            data-testid="ooo-seed"
            onChange={(e) => {
              setSeed(Number(e.target.value) || 0);
              setStart(null);
            }}
            style={{ ...mono, width: 90, background: 'var(--surface-panel)', color: 'var(--text-primary)', border: '1px solid var(--surface-elevated)' }}
          />
        </label>
        <span data-testid="ooo-result" style={{ color: last ? (last.correct ? 'var(--text-primary)' : 'var(--trust-failed-stroke)') : 'var(--text-tertiary)' }}>
          {running
            ? alwaysPresent
              ? 'Find the odd one and click it…'
              : 'Click the odd one, or "Target absent"…'
            : last
              ? `${last.correct ? 'Correct' : 'Wrong'} in ${last.ms} ms (N ${last.n}, target ${last.present ? 'present' : 'absent'}, seed ${last.seed}, ${last.variant})`
              : 'Press Start; the timer runs from the moment the grid appears.'}
        </span>
      </div>
      <div
        data-testid="ooo-grid"
        data-target={running ? lay.target : undefined}
        style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${box}px)`, gridAutoRows: `${box}px`, justifyContent: 'start', ...mapSurface, padding: 8, opacity: running ? 1 : 0.06 }}
        aria-hidden={!running}
      >
        {Array.from({ length: cols * cols }, (_, i) => {
          const c = cellFor(i);
          if (!c) return <span key={i} />;
          return (
            <button
              key={i}
              type="button"
              data-testid={`ooo-cell-${i}`}
              disabled={!running}
              onClick={() => answer(i)}
              style={{ all: 'unset', cursor: running ? 'pointer' : 'default', display: 'grid', placeItems: 'center' }}
              aria-label={`item ${i + 1}`}
            >
              <GlanceCell variant={variant} sensor={c.sensor} frame={c.frame} score={score} sizePx={sizePx} pad={[2, 2, 2]} />
            </button>
          );
        })}
      </div>
      {stats.length > 0 && (
        <table style={{ borderCollapse: 'collapse' }} data-testid="ooo-stats">
          <thead>
            <tr>
              <th style={thS}>Variant</th>
              <th style={thS}>Trials</th>
              <th style={thS}>Accuracy</th>
              <th style={thS}>Median RT (hits)</th>
              <th style={thS}>RT = a + b·N (needs ≥ 2 N values)</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((r) => (
              <tr key={r.v}>
                <td style={tdS}>{r.v}</td>
                <td style={tdS}>{r.n}</td>
                <td style={tdS}>{pct(r.acc)}</td>
                <td style={tdS}>{r.med !== undefined ? `${r.med} ms` : '—'}</td>
                <td style={tdS}>
                  {r.fit ? `a ${Math.round(r.fit.a)} ms · b ${r.fit.b.toFixed(1)} ms/item ${r.fit.b <= T.t8.maxSlopeMsPerItem ? '(≤ 10: pass)' : '(> 10)'}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const btn: CSSProperties = {
  ...mono,
  background: 'var(--surface-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--text-tertiary)',
  padding: '4px 10px',
  cursor: 'pointer',
};

export { VISIONS };
