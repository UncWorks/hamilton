import type { Meta, StoryObj } from '@storybook/react';
import { useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { expect, fireEvent, userEvent, waitFor, within } from '@storybook/test';
import type { Affiliation, SensorType } from '@hamilton/contracts';
import { ROE_FLOOR, STALE_AFTER_S, firstCrossingClock, formatDtg, type JOverride } from '@/lib/link-trust-rating';
import { formatSidc, toCotType, toSidc2525C, toSidc2525E, type SymbolCodeInput } from '@/lib/track-sidc';
import {
  DeclutterStack,
  RatingExplanation,
  TRIGGER_CSS,
  TrackSymbol,
  TrackSymbolG,
  TrackSymbolWithTooltip,
  explainRating,
  placeSymbol,
  trackSymbolDataUrl,
  trackSymbolSvg,
  useAnchoredTips,
  type ExplanationProps,
  type SymbolTrack,
} from '@/components/symbol';
import { MapSpine } from '@/components/cop/MapSpine';
import { StoreSeed } from '@/stories/support/mocks';
import {
  BAND_SAMPLES,
  CANDIDATES,
  CANDIDATE_SITES as CANDIDATE_SITES_FIXTURE,
  JAMMER_LOCATION,
  beatTrack,
  tracksRecord,
  PHASE_TRACKS,
  S2_OVERRIDE_B,
  S2_OVERRIDE_CLOCK,
  UNIT_EVALUATION,
  beatAt,
  clockIso,
  componentsFor,
  telemetryFor,
} from '@/stories/fixtures/avdiivka';
import { ResultsTable } from '@/stories/support/glance-bench';

// Decisions/Track Symbology — the FINAL symbol (src/components/symbol). The
// docs page (TrackSymbology.mdx) records decisions 1–6 and links the evidence.

interface Args {
  /** Matrix: link-trust score for every cell. */
  score: number;
  /** COP: scenario clock, s (0:45 → 1:30). */
  clock: number;
  /** COP: symbol size, px. */
  size: 16 | 24 | 32;
  /** COP: apply the example S2 override to B from 1:25. */
  s2Override: boolean;
  /** Hamilton link-trust overlay (side gauge). J stays: it is a doctrinal field. */
  overlay: boolean;
}

const mono: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11 };
const page: CSSProperties = { display: 'grid', gap: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--surface-panel)' };
const para: CSSProperties = { margin: 0, maxWidth: 1080, fontSize: 13, color: 'var(--text-secondary)' };
const th: CSSProperties = { ...mono, color: 'var(--text-tertiary)', fontWeight: 400, padding: '2px 8px', textAlign: 'left' };
const td: CSSProperties = { ...mono, color: 'var(--text-secondary)', padding: '3px 8px', borderTop: '1px solid var(--surface-elevated)', verticalAlign: 'middle' };
const mapSurface: CSSProperties = {
  background: 'var(--surface-base)',
  backgroundImage: 'linear-gradient(var(--surface-elevated) 1px, transparent 1px), linear-gradient(90deg, var(--surface-elevated) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
};

const SIZES = [16, 24, 32] as const;
const ROWS: { sensor: SensorType; label: string; designation: string }[] = [
  { sensor: 'recon_static', label: 'recon_static → COLT/FIST', designation: 'A' },
  { sensor: 'recon_mobile', label: 'recon_mobile → recon, motorized', designation: 'R2' },
  { sensor: 'detection', label: 'detection → FA TA radar', designation: 'C' },
  { sensor: 'offense', label: 'offense → FA battery', designation: 'B' },
  { sensor: 'defense', label: 'defense → air defense', designation: 'AD' },
];
const AFFILIATIONS: Affiliation[] = ['friendly', 'enemy', 'neutral', 'unknown'];

/** Fixed "now" for the static stories: the 1:20 beat. */
const NOW_ISO = clockIso(80);
const STALE_AGE_S = STALE_AFTER_S + 4;

function explanationFor(title: string, score: number, o: { stale?: boolean; neighbours?: string; corroboration?: 'confirmed'; jOverride?: JOverride } = {}): ExplanationProps {
  return {
    title,
    components: componentsFor(score),
    payloadScore: score,
    lastGoodIso: clockIso(80 - (o.stale ? STALE_AGE_S : 1)),
    nowIso: NOW_ISO,
    neighbours: o.neighbours ?? 'neighbours A, C',
    topCandidate: CANDIDATES[0],
    telemetry: telemetryFor(score),
    corroboration: o.corroboration,
    jOverride: o.jOverride,
  };
}

const meta = {
  title: 'Decisions/Track Symbology',
  parameters: {
    layout: 'fullscreen',
    // No store: every story is self-contained, so inline rendering is safe.
    docs: { story: { inline: true } },
  },
  args: { score: BAND_SAMPLES.degraded, clock: 80, size: 32, s2Override: false, overlay: true },
  argTypes: {
    score: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    clock: { control: { type: 'range', min: 45, max: 95, step: 1 }, table: { disable: true } },
    size: { control: 'inline-radio', options: [16, 24, 32], table: { disable: true } },
    s2Override: { control: 'boolean', table: { disable: true } },
    overlay: { control: 'boolean' },
  },
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;
const shown = { table: { disable: false } } as const;

// ---------------------------------------------------------------------------
// Matrix — 5 functions × 4 affiliations × 16 / 24 / 32 px
// ---------------------------------------------------------------------------

export const Matrix: Story = {
  name: 'Matrix — 5 functions × 4 affiliations',
  render: ({ score, overlay }) => (
    <div style={page}>
      <p style={para}>
        The decided symbol at 16 / 24 / 32 px on the dark map, trust {score.toFixed(2)} (Controls → <em>score</em>). Below 28 px only the T label is
        shown (V4 label treatment); at 32 px the echelon and J appear. Hover any symbol for the rating breakdown.
      </p>
      <style>{TRIGGER_CSS}</style>
      {SIZES.map((size) => (
        <table key={size} style={{ borderCollapse: 'collapse', justifySelf: 'start', ...mapSurface }} data-testid={`final-matrix-${size}`}>
          <caption style={{ ...th, captionSide: 'top', padding: '4px 0', color: 'var(--text-secondary)' }}>{size} px</caption>
          <thead>
            <tr>
              <th />
              {AFFILIATIONS.map((a) => (
                <th key={a} style={th}>
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.sensor}>
                <th style={{ ...th, textAlign: 'right', whiteSpace: 'nowrap' }}>{r.label}</th>
                {AFFILIATIONS.map((a) => (
                  <td key={a} style={{ padding: 4 }}>
                    <TrackSymbolWithTooltip
                      track={{ affiliation: a, sensorType: r.sensor, designation: r.designation, score }}
                      sizePx={size}
                      overlay={overlay}
                      margin={2}
                      explanation={explanationFor(`${r.designation} · ${a} ${r.label.split('→ ')[1]}`, score)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Trust bands (+ J split)
// ---------------------------------------------------------------------------

interface BandCol {
  key: string;
  head: string;
  track: Partial<SymbolTrack>;
  note: string;
}

const BAND_COLS: BandCol[] = [
  { key: 'nominal', head: 'NOMINAL', track: { score: BAND_SAMPLES.nominal }, note: 'B2 · gauge full' },
  { key: 'watch', head: 'WATCH', track: { score: BAND_SAMPLES.watching }, note: 'C3 · J on hover' },
  { key: 'degraded', head: 'DEGRADED', track: { score: BAND_SAMPLES.degraded }, note: 'D4 · J at rest (< 0.60)' },
  { key: 'unreliable', head: 'UNRELIABLE', track: { score: BAND_SAMPLES.failed }, note: 'E5' },
  { key: 'stale', head: 'STALE', track: { score: BAND_SAMPLES.degraded, stale: true }, note: `F6 · AR NRT · frame line greys (> ${STALE_AFTER_S} s)` },
  { key: 'confirmed', head: 'UNRELIABLE, confirmed', track: { score: BAND_SAMPLES.failed, corroboration: 'confirmed' }, note: 'E1 · alternate channel' },
  { key: 'override', head: 'UNRELIABLE, S2 override', track: { score: BAND_SAMPLES.failed, jOverride: S2_OVERRIDE_B }, note: `${S2_OVERRIDE_B.j} (auto E5)` },
];

export const TrustBands: Story = {
  name: 'Trust bands — gauge + J (J split)',
  // Padded: the docs page embeds this story; fullscreen would stretch it to 100vh.
  parameters: { layout: 'padded' },
  render: ({ overlay }) => (
    <div style={page}>
      <p style={para}>
        Friendly FA battery B through every rating. Trust is the side gauge (fill height = score, trust colour) plus J text outside the frame — no halo,
        no outline, no blink; the frame and fill never change with trust. J split: the score sets the reliability letter, corroboration the credibility
        digit, STALE is F6, and an S2 override replaces the automatic value (kept in the tooltip and the log).
      </p>
      <table style={{ borderCollapse: 'collapse', justifySelf: 'start', ...mapSurface }} data-testid="final-bands">
        <thead>
          <tr>
            <th />
            {BAND_COLS.map((c) => (
              <th key={c.key} style={{ ...th, verticalAlign: 'bottom', maxWidth: 130 }}>
                {c.head}
                <br />
                <span style={{ color: 'var(--text-secondary)' }}>{c.note}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...SIZES, 48].map((size) => (
            <tr key={size}>
              <th style={{ ...th, textAlign: 'right' }}>{size} px</th>
              {BAND_COLS.map((c) => (
                <td key={c.key} style={{ padding: 6 }} data-testid={size === 32 ? `band-${c.key}` : undefined}>
                  <TrackSymbol track={{ affiliation: 'friendly', sensorType: 'offense', designation: 'B', ...c.track }} sizePx={size} overlay={overlay} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const j = (key: string) => c.getByTestId(`band-${key}`).querySelector('[data-field="J"]')?.textContent;
    await expect(j('degraded')).toBe('D4');
    await expect(j('nominal')).toBeUndefined();
    await expect(j('stale')).toBe('F6');
    await expect(j('confirmed')).toBe('E1');
    await expect(j('override')).toBe('D3');
    await expect(c.getByTestId('band-stale').querySelector('[data-field="AR"]')?.textContent).toBe('NRT');
    // No halo anywhere: no circle cue, no animated element.
    await expect(canvasElement.querySelectorAll('.halo, circle').length).toBe(0);
  },
};

// ---------------------------------------------------------------------------
// Rating tooltip
// ---------------------------------------------------------------------------

const TOOLTIP_STATES: { key: string; score: number; o?: Parameters<typeof explanationFor>[2]; source: string }[] = [
  { key: 'nominal', score: BAND_SAMPLES.nominal, source: 'engine beat 0:00 (Unit B)' },
  { key: 'watch', score: BAND_SAMPLES.watching, source: 'engine beat 0:45 (Unit B)' },
  { key: 'degraded', score: BAND_SAMPLES.degraded, source: 'synthetic — not in the demo timeline' },
  { key: 'unreliable', score: BAND_SAMPLES.failed, source: 'engine beat 1:15 (Unit B)' },
  { key: 'stale', score: BAND_SAMPLES.degraded, o: { stale: true }, source: `synthetic, last good update ${STALE_AGE_S} s old` },
  { key: 'confirmed', score: BAND_SAMPLES.failed, o: { corroboration: 'confirmed' }, source: 'engine beat 1:15, confirmed on an alternate channel' },
  { key: 'override', score: BAND_SAMPLES.failed, o: { jOverride: S2_OVERRIDE_B }, source: 'engine beat 1:15 + S2 override (fixture)' },
];

export const RatingTooltip: Story = {
  name: 'Rating tooltip — factor breakdown',
  render: ({ overlay }) => (
    <div style={page}>
      <style>{TRIGGER_CSS}</style>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', minHeight: 120, ...mapSurface, padding: 'var(--space-3)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 220 }}>Live: hover, or Tab to focus, the symbol. Escape closes.</span>
        <TrackSymbolWithTooltip
          testId="live-trigger"
          track={{ affiliation: 'friendly', sensorType: 'offense', designation: 'B', score: BAND_SAMPLES.failed }}
          sizePx={32}
          overlay={overlay}
          explanation={explanationFor('B · FA battery', BAND_SAMPLES.failed)}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(560px, 1fr))', gap: 'var(--space-4)' }}>
        {TOOLTIP_STATES.map((st) => (
          <div key={st.key} data-testid={`tooltip-state-${st.key}`} style={{ ...mapSurface, padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}>
            <span style={{ ...mono, color: 'var(--text-tertiary)' }}>
              {st.score.toFixed(2)} — {st.source}
            </span>
            <TrackSymbolWithTooltip
              forceOpen
              track={{
                affiliation: 'friendly',
                sensorType: 'offense',
                designation: 'B',
                score: st.score,
                stale: st.o?.stale,
                corroboration: st.o?.corroboration,
                jOverride: st.o?.jOverride,
              }}
              sizePx={32}
              overlay={overlay}
              explanation={explanationFor('B · FA battery', st.score, st.o)}
            />
          </div>
        ))}
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByTestId('live-trigger');
    const tip = canvasElement.ownerDocument.getElementById(trigger.getAttribute('aria-describedby')!)!;
    await expect(tip).toHaveAttribute('role', 'tooltip');
    await expect(tip).not.toBeVisible();
    await userEvent.hover(trigger);
    await waitFor(() => expect(tip).toBeVisible());
    // Engine beat 1:15 (Unit B): components 0 / 0.308 / 0.6 / 0 → 0.127.
    await expect(tip).toHaveTextContent('UNRELIABLE');
    await expect(tip).toHaveTextContent('J E5');
    await expect(within(tip).getByTestId('formula')).toHaveTextContent(/= 0\.127$/);
    await expect(tip).toHaveTextContent('1.0s → 6.1s');
    await expect(canvasElement.ownerDocument.querySelectorAll('[role="alert"]')).toHaveLength(0);
    await userEvent.unhover(trigger);
    await waitFor(() => expect(tip).not.toBeVisible());
    trigger.focus();
    fireEvent.focusIn(trigger);
    await waitFor(() => expect(tip).toBeVisible());
    fireEvent.keyDown(trigger, { key: 'Escape' });
    await waitFor(() => expect(tip).not.toBeVisible());
    // J split states.
    await expect(within(canvas.getByTestId('tooltip-state-stale')).getByTestId('tip-j')).toHaveTextContent('J F6');
    await expect(within(canvas.getByTestId('tooltip-state-confirmed')).getByTestId('tip-j')).toHaveTextContent('J E1');
    await expect(within(canvas.getByTestId('tooltip-state-override')).getByTestId('tip-override')).toHaveTextContent('S2 override D3 (automatic E5)');
  },
};

// ---------------------------------------------------------------------------
// Declutter (decision 6) — symbol-side pieces
// ---------------------------------------------------------------------------

const CLUSTER: (SymbolTrack & { x: number; y: number })[] = [
  { affiliation: 'friendly', sensorType: 'recon_static', designation: 'A', score: 1, x: 120, y: 92 },
  { affiliation: 'friendly', sensorType: 'offense', designation: 'B', score: BAND_SAMPLES.degraded, x: 132, y: 100 },
  { affiliation: 'friendly', sensorType: 'detection', designation: 'C', score: 1, x: 126, y: 112 },
  { affiliation: 'enemy', fn: 'ew-jamming', designation: 'J1', x: 140, y: 96 },
  { affiliation: 'unknown', sensorType: 'defense', designation: 'U1', score: BAND_SAMPLES.watching, x: 115, y: 106 },
];

function DeclutterPanels({ size }: { size: 16 | 24 | 32 }) {
  const W = 330;
  const H = 230;
  const cx = CLUSTER.reduce((a, t) => a + t.x, 0) / CLUSTER.length;
  const cy = CLUSTER.reduce((a, t) => a + t.y, 0) / CLUSTER.length;
  const panel = (title: string, body: ReactNode, testId: string) => (
    <figure style={{ margin: 0, display: 'grid', gap: 4 }}>
      <figcaption style={{ ...mono, color: 'var(--text-secondary)', maxWidth: W }}>{title}</figcaption>
      <svg width={W} height={H} style={{ ...mapSurface, display: 'block' }} overflow="hidden" data-testid={testId}>
        {body}
      </svg>
    </figure>
  );
  return (
    <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
      {panel(
        `Raw, ${size} px: 5 tracks within 1.5·s — overlap`,
        CLUSTER.map((t) => (
          <g key={t.designation} transform={placeSymbol(t.x, t.y, size)}>
            <TrackSymbolG track={t} sizePx={size} />
          </g>
        )),
        `declutter-raw-${size}`,
      )}
      {panel(
        'E: bracketed stack + one locator line (MCRP ¶5-8, Fig 5-6, pp 5-41/42), hostile first',
        <DeclutterStack at={[cx, cy]} tracks={CLUSTER} sizePx={size} maxShown={CLUSTER.length} offsetPx={size * 2.2} />,
        `declutter-stack-${size}`,
      )}
      {panel('E compact (Hamilton convention): first 3 frames + "+n"', <DeclutterStack at={[cx, cy]} tracks={CLUSTER} sizePx={size} offsetPx={size * 2.2} />, `declutter-compact-${size}`)}
    </div>
  );
}

export const Declutter: Story = {
  name: 'Declutter stack (E)',
  render: () => (
    <div style={page}>
      <p style={para}>
        Decision 6: research candidate E. When three or more symbols overlap within 1.5·s the map draws them as a bracketed stack with one locator line
        to the true location (the dot), hostile first; if the stack still collides it shows three frames and a &ldquo;+n&rdquo; count (a Hamilton
        convention, not doctrine). This story uses the production pieces (<code>DeclutterStack</code>, <code>StackBracket</code>, <code>OverflowCount</code>,{' '}
        <code>stackOrder</code>); deciding when to cluster is the map renderers&apos; job.
      </p>
      {([24, 32] as const).map((s) => (
        <DeclutterPanels key={s} size={s} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const compact = c.getByTestId('declutter-compact-24');
    await expect(compact.querySelector('[data-declutter="overflow"]')?.textContent).toBe('+2');
    // Hostile first.
    await expect(compact.querySelector('[data-declutter="stack"] [data-sidc]')?.getAttribute('data-sidc')?.[3]).toBe('6');
  },
};

// ---------------------------------------------------------------------------
// COP — Avdiivka with the final symbol
// ---------------------------------------------------------------------------

const SCENE_W = 960;
const SCENE_H = 560;
const LON0 = 37.728;
const LON1 = 37.778;
const LAT0 = 48.1335;
const LAT1 = 48.1485;
const project = (lat: number, lon: number): [number, number] => [((lon - LON0) / (LON1 - LON0)) * SCENE_W, ((LAT1 - lat) / (LAT1 - LAT0)) * SCENE_H];

/** Mock geolocations for the three FR-04a candidates (fixtures: CANDIDATE_SITES; the engine publishes scores only). */
const CANDIDATE_SITES = CANDIDATE_SITES_FIXTURE;
const UNIT_META: Record<string, { designation: string; title: string; neighbours: string }> = {
  unit_a: { designation: 'A', title: 'A · FA observer team (COLT/FIST)', neighbours: 'neighbours B, C' },
  unit_b: { designation: 'B', title: 'B · FA battery', neighbours: 'neighbours A, C' },
  unit_c: { designation: 'C', title: 'C · FA target-acq radar platoon', neighbours: 'neighbours A, B' },
};
const B_CROSSING_CLOCK = firstCrossingClock() ?? 75;
const FIX_CLOCK = 80;
const fmtClock = (c: number) => `${Math.floor(c / 60)}:${String(Math.round(c % 60)).padStart(2, '0')}`;

/** Clock of B's last frame before `clock` (frames arrive at the beat's cadence; never STALE in the demo). */
function lastFrameClock(clock: number): number {
  const beat = beatAt(clock);
  const cadence = beat.telemetry.unit_b.cadenceS;
  return beat.clockS + Math.floor((clock - beat.clockS) / cadence) * cadence;
}

function CopScene({ clock, size, s2Override, overlay }: Pick<Args, 'clock' | 'size' | 's2Override' | 'overlay'>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tips = useAnchoredTips(containerRef);
  const baseId = `cop-final-${useId().replace(/:/g, '')}`;
  const nowIso = clockIso(clock);
  const beat = beatAt(clock);
  const units = Object.values(PHASE_TRACKS.degraded).map((t) => {
    const id = t.source_id as 'unit_a' | 'unit_b' | 'unit_c';
    const out = beat.units[id];
    const evaluation = { ...UNIT_EVALUATION[id], ...(id === 'unit_b' && s2Override && clock >= S2_OVERRIDE_CLOCK ? { jOverride: S2_OVERRIDE_B } : {}) };
    const ex: ExplanationProps = {
      title: UNIT_META[id]!.title,
      components: { ...out.components },
      payloadScore: out.score,
      lastGoodIso: clockIso(id === 'unit_b' ? lastFrameClock(clock) : clock - 1),
      nowIso,
      neighbours: UNIT_META[id]!.neighbours,
      topCandidate: clock >= B_CROSSING_CLOCK ? CANDIDATES[0] : undefined,
      telemetry: beat.telemetry[id],
      corroboration: evaluation.corroboration,
      jOverride: evaluation.jOverride,
    };
    const { rating } = explainRating(ex);
    const track: SymbolTrack = {
      affiliation: t.affiliation,
      sensorType: t.sensor_type,
      designation: UNIT_META[id]!.designation,
      score: rating.score,
      components: ex.components,
      stale: rating.stale,
      corroboration: evaluation.corroboration,
      jOverride: evaluation.jOverride,
    };
    return { t, id, ex, rating, track };
  });
  const b = units.find((u) => u.id === 'unit_b')!;
  const bPt = project(b.t.lat, b.t.lon);
  const jPt = project(JAMMER_LOCATION.lat, JAMMER_LOCATION.lon);
  const sites = CANDIDATE_SITES.map((st) => project(st.lat, st.lon));
  const all = [jPt, ...sites];
  const cx = all.reduce((a, p) => a + p[0], 0) / all.length;
  const cy = all.reduce((a, p) => a + p[1], 0) / all.length;
  const rx = Math.max(...all.map((p) => Math.abs(p[0] - cx))) + 52;
  const ry = Math.max(...all.map((p) => Math.abs(p[1] - cy))) + 40;
  const dx = (JAMMER_LOCATION.lon - b.t.lon) * Math.cos((b.t.lat * Math.PI) / 180);
  const dy = JAMMER_LOCATION.lat - b.t.lat;
  const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  const ordered = [...CANDIDATES].sort((p, q) => q.score - p.score);
  const showBearing = b.rating.score < ROE_FLOOR;
  const showCandidates = clock >= B_CROSSING_CLOCK;
  const showFix = clock >= FIX_CLOCK;
  const label: CSSProperties = { ...mono };
  const outlined = { stroke: 'var(--surface-base)', strokeWidth: 3, paintOrder: 'stroke' as const };
  return (
    <div style={{ padding: 'var(--space-4)', background: 'var(--surface-panel)', display: 'grid', gap: 'var(--space-3)' }}>
      <style>{TRIGGER_CSS}</style>
      <div style={{ ...mono, fontSize: 12, color: 'var(--text-secondary)' }}>
        Scenario clock <span style={{ color: 'var(--text-primary)' }}>{fmtClock(clock)}</span> · {formatDtg(nowIso)} · B{' '}
        <span style={{ color: b.rating.labelToken }}>{b.rating.label}</span> {b.rating.score.toFixed(2)} (J {b.rating.jCode}
        {b.rating.override ? `, ${b.rating.override.by} override; auto ${b.rating.autoJ}` : ''}) — drag the <em>clock</em> control. Hover or Tab to a unit for
        its rating breakdown. <span data-testid="cop-beat">Engine beat: {beat.label}.</span>
      </div>
      <div ref={containerRef} style={{ position: 'relative', width: SCENE_W, maxWidth: '100%' }}>
        <svg width={SCENE_W} height={SCENE_H} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} style={{ ...mapSurface, display: 'block', maxWidth: '100%', height: 'auto' }}>
          {showCandidates && (
            <g aria-label="NAI 1 — jammer" data-testid="cop-nai">
              <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="var(--sym-ink)" strokeOpacity={0.7} strokeWidth={1.25} strokeDasharray="8 5" />
              <text x={cx} y={cy - ry - 20} textAnchor="middle" fill="var(--sym-ink)" style={label} {...outlined}>
                NAI 1 — JAMMER
              </text>
              <text x={cx} y={cy - ry - 6} textAnchor="middle" fill="var(--text-secondary)" style={{ ...label, fontSize: 10 }} {...outlined}>
                T FDC-1 · W {formatDtg(clockIso(B_CROSSING_CLOCK))}
              </text>
            </g>
          )}
          {showBearing && (
            <g aria-label="Bearing line — jammer">
              <line x1={bPt[0]} y1={bPt[1]} x2={jPt[0]} y2={jPt[1]} stroke="var(--sym-ink)" strokeOpacity={0.8} strokeWidth={1.25} />
              <text x={jPt[0] - 34} y={jPt[1] - 34} textAnchor="end" fill="var(--sym-ink)" style={label} {...outlined}>
                BRG {bearing.toFixed(0).padStart(3, '0')}° — J
              </text>
              <text x={jPt[0] - 34} y={jPt[1] - 20} textAnchor="end" fill="var(--text-secondary)" style={{ ...label, fontSize: 10 }} {...outlined}>
                T FDC-1 · W {formatDtg(clockIso(B_CROSSING_CLOCK))}
              </text>
            </g>
          )}
          {showCandidates &&
            ordered.map((c, i) => (
              <g key={c.method_id} transform={placeSymbol(sites[i]![0], sites[i]![1], size)} data-testid={`cop-candidate-${i}`}>
                <TrackSymbolG
                  track={{ affiliation: 'enemy', fn: 'ew-jamming', status: 'anticipated', designation: CANDIDATE_SITES[i]!.label, info: `${i === 0 ? '#1 ' : ''}${c.method_id} ${c.score.toFixed(2)}` }}
                  sizePx={size}
                />
              </g>
            ))}
          {showFix && (
            <g transform={placeSymbol(jPt[0], jPt[1], size)} data-testid="cop-fix">
              <TrackSymbolG track={{ affiliation: 'enemy', fn: 'ew-jamming', designation: 'J1' }} sizePx={size} />
            </g>
          )}
          {units.map((u) => {
            const tipId = `${baseId}-${u.id}`;
            const [x, y] = project(u.t.lat, u.t.lon);
            return (
              <g key={u.id} data-testid={`cop-${u.id}`} aria-label={`${u.track.designation}: friend, link trust ${u.rating.label} ${u.rating.score.toFixed(2)}, J ${u.rating.jCode}`} {...tips.trigger(u.id, tipId)}>
                <g transform={placeSymbol(x, y, size)}>
                  <TrackSymbolG track={u.track} sizePx={size} selected={u.id === 'unit_b'} overlay={overlay} active={tips.open?.key === u.id} />
                </g>
              </g>
            );
          })}
        </svg>
        {units.map((u) => (
          <div key={u.id} {...tips.tip(u.id, `${baseId}-${u.id}`)}>
            <RatingExplanation {...u.ex} />
          </div>
        ))}
      </div>
    </div>
  );
}

export const Cop: Story = {
  name: 'COP — Avdiivka (final symbol)',
  argTypes: { clock: shown, size: shown, s2Override: shown },
  parameters: {
    docs: {
      description: {
        story:
          'A (FA observer team, COLT/FIST — corroborated by C, so J B1 on hover), B (FA battery, selected) and C (TA-radar platoon) on the PR #1 engine ' +
          'beats. From 1:15 B is UNRELIABLE 0.13 (E5): candidates appear as status-1 (dashed) hostile EW jamming symbols inside the dashed NAI, with ' +
          'the bearing line; at 1:20 the fix J1 is placed (hostile EW, Table 5-3 p 5-18). Toggle **s2Override** to apply the fixture S2 override ' +
          '(D3) from 1:25. Candidate positions are mock.',
      },
    },
  },
  render: ({ clock, size, s2Override, overlay }) => <CopScene clock={clock} size={size} s2Override={s2Override} overlay={overlay} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByTestId('cop-unit_b').querySelector('[data-field="J"]')?.textContent).toBe('E5');
    await expect(c.getByTestId('cop-fix').querySelector('[data-fn]')?.getAttribute('data-fn')).toBe('ew-jamming');
    await expect(c.getByTestId('cop-candidate-0').querySelector('[data-sidc]')?.getAttribute('data-sidc')).toBe('13061010001505040000');
    await expect(c.getByTestId('cop-nai')).toBeTruthy();
  },
};

// ---------------------------------------------------------------------------
// COP — the same beats on the REAL spine (MapSpine, store-driven)
// ---------------------------------------------------------------------------

function LiveSpineCop({ clock, s2Override }: Pick<Args, 'clock' | 's2Override'>) {
  const beat = beatAt(clock);
  const tracks = tracksRecord(beatTrack('unit_a', beat.clockS), beatTrack('unit_b', beat.clockS), beatTrack('unit_c', beat.clockS));
  const b = tracks.unit_b!;
  const showCandidates = clock >= B_CROSSING_CLOCK;
  const evaluations = {
    ...UNIT_EVALUATION,
    ...(s2Override && clock >= S2_OVERRIDE_CLOCK ? { unit_b: { jOverride: S2_OVERRIDE_B } } : {}),
  };
  return (
    <StoreSeed seed={{ tracks, selectedSource: 'unit_b', candidates: showCandidates ? { source_id: 'unit_b', items: CANDIDATES } : null }}>
      <div style={{ padding: 'var(--space-4)', background: 'var(--surface-panel)', display: 'grid', gap: 'var(--space-3)' }}>
        <div style={{ ...mono, fontSize: 12, color: 'var(--text-secondary)' }}>
          Scenario clock <span style={{ color: 'var(--text-primary)' }}>{fmtClock(clock)}</span> · engine beat {beat.label} · the production{' '}
          <code>MapSpine</code> on the offline basemap (CesiumSpine draws the same symbols as billboards). Hover or Tab to a unit for its breakdown.
        </div>
        <div style={{ position: 'relative', height: 560 }} data-testid="cop-live-spine">
          <MapSpine
            evaluations={evaluations}
            {...(b.score < ROE_FLOOR ? { directionalFrom: { lat: b.lat, lon: b.lon }, directionalTo: JAMMER_LOCATION } : {})}
            {...(showCandidates ? { candidateSites: CANDIDATE_SITES, candidateNai: JAMMER_LOCATION } : {})}
            {...(clock >= FIX_CLOCK ? { jammerLocation: { ...JAMMER_LOCATION, method_id: CANDIDATES[0]!.method_id } } : {})}
          />
        </div>
      </div>
    </StoreSeed>
  );
}

export const CopLiveSpine: Story = {
  name: 'COP — live spine',
  argTypes: { clock: shown, s2Override: shown },
  parameters: {
    // The spine reads the module-singleton store: render in its own iframe on the docs page.
    docs: {
      story: { inline: false, iframeHeight: 680 },
      description: {
        story:
          'The COP story above, on the real renderer: the store is seeded with the PR #1 engine beat at **clock** and `MapSpine` draws ' +
          'the production symbols, declutter stacks and rating tooltips. From 1:15 the candidate sites (mock positions) appear as ' +
          'anticipated EW symbols; from 1:20 the fix J1. B is selected (double frame). The spine draws over the offline ' +
          'Protomaps basemap (`NEXT_PUBLIC_BASEMAP`, default offline once `make fetch-tiles` has provisioned `/public/tiles`; ' +
          'see **COP/MapSpine › Basemap off** for the comparison).',
      },
    },
  },
  render: ({ clock, s2Override }) => <LiveSpineCop clock={clock} s2Override={s2Override} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const bHit = await waitFor(() => c.getByTestId('cop-symbol-unit_b'), { timeout: 15_000 });
    await expect(bHit.getAttribute('aria-label')).toMatch(/J E5/);
    await expect(canvasElement.querySelector('[data-cop-symbol="unit_b"] [data-field="J"]')?.textContent).toBe('E5');
    await waitFor(() => expect(canvasElement.querySelector('[data-symbol-id="__jammer"]')).toBeTruthy());
  },
};

// ---------------------------------------------------------------------------
// Export — codes + billboard image
// ---------------------------------------------------------------------------

const EXPORT_ROWS: { entity: string; track: SymbolTrack }[] = [
  { entity: 'unit_a', track: { affiliation: 'friendly', sensorType: 'recon_static', designation: 'A', score: 1, corroboration: 'confirmed' } },
  { entity: 'unit_b', track: { affiliation: 'friendly', sensorType: 'offense', designation: 'B', score: BAND_SAMPLES.failed } },
  { entity: 'unit_c', track: { affiliation: 'friendly', sensorType: 'detection', designation: 'C', score: 1 } },
  { entity: 'jammer (fix)', track: { affiliation: 'enemy', fn: 'ew-jamming', designation: 'J1' } },
  { entity: 'jammer candidate', track: { affiliation: 'enemy', fn: 'ew-jamming', status: 'anticipated', designation: 'C1', info: 'match 1.00' } },
  { entity: 'hostile_ew_1 (fixture)', track: { affiliation: 'enemy', sensorType: 'defense', fn: 'ew-jamming', designation: 'H1', score: BAND_SAMPLES.degraded } },
];

export const Export: Story = {
  name: 'Export — SIDC / CoT + billboard image',
  render: () => (
    <div style={page}>
      <p style={para}>
        Decision 4: draw to FM 1-02 / MCRP 5-12A (2004), store the 2525E numeric SIDC (<code>toSidc2525E</code>), export the 2525B/C letter SIDC
        (<code>toSidc2525C</code>) and the ATAK CoT type (<code>toCotType</code>). The image column is the data-URL renderer (<code>trackSymbolDataUrl</code>,
        2× pixel ratio) that the map renderers can use as a Cesium billboard / deck.gl icon — drawn here as a plain <code>&lt;img&gt;</code>, so CSS tokens are
        resolved to literals. Gauge and halo are never exported; J / W / AR are.
      </p>
      <table style={{ borderCollapse: 'collapse', justifySelf: 'start' }} data-testid="export-table">
        <thead>
          <tr>
            {['Entity', 'SVG (React)', 'Image (data URL)', '2525E (stored)', '2525B/C letter (export)', 'CoT type'].map((h) => (
              <th key={h} style={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {EXPORT_ROWS.map((r) => {
            const img = trackSymbolSvg(r.track, { sizePx: 32, pixelRatio: 2 });
            const code: SymbolCodeInput = r.track;
            return (
              <tr key={r.entity}>
                <td style={{ ...td, color: 'var(--text-primary)' }}>{r.entity}</td>
                <td style={{ ...td, ...mapSurface }}>
                  <TrackSymbol track={r.track} sizePx={32} />
                </td>
                <td style={{ ...td, ...mapSurface }}>
                  <img src={trackSymbolDataUrl(r.track, { sizePx: 32, pixelRatio: 2 })} width={img.width / 2} height={img.height / 2} alt={r.entity} data-testid={`billboard-${r.entity}`} />
                </td>
                <td style={td}>{formatSidc(toSidc2525E(code))}</td>
                <td style={td}>{toSidc2525C(code)}</td>
                <td style={td}>{toCotType(code)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const img = within(canvasElement).getByTestId('billboard-unit_b') as HTMLImageElement;
    await waitFor(() => expect(img.complete && img.naturalWidth > 0).toBe(true));
  },
};

// ---------------------------------------------------------------------------
// Bench scores — re-run on the final symbol
// ---------------------------------------------------------------------------

export const BenchScores: Story = {
  name: 'Bench scores — final symbol (T1–T7)',
  render: () => (
    <div style={page}>
      <p style={para}>
        The At-a-Glance protocol (glance-symbology-research.md §5) re-run in this browser on the production primitives (<strong>FINAL</strong>), with the
        calibration rows (REF must pass, V0 must fail) and V1, the base it was built from. Normal vision, grayscale (T5) and Machado 2009 deuteranopia /
        protanopia (T6). Heatmaps, search tasks and the radar sweep: Decisions/Evidence/At-a-Glance.
      </p>
      <ResultsTable variants={['REF', 'V0', 'V1', 'FINAL']} />
      <ResultsTable variants={['REF', 'V0', 'V1', 'FINAL']} vision="grayscale" />
      <ResultsTable variants={['REF', 'V0', 'V1', 'FINAL']} vision="deuteranopia" />
      <ResultsTable variants={['REF', 'V0', 'V1', 'FINAL']} vision="protanopia" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await waitFor(() => expect(c.getByTestId('results-normal').getAttribute('data-ready')).toBe('true'), { timeout: 120000 });
    const row = c.getByTestId('results-normal').querySelector('tr[data-variant="FINAL"]')!;
    await expect(row.textContent).not.toMatch(/FAIL/);
  },
};

