import type { Meta, StoryObj } from '@storybook/react';
import type { CSSProperties, ReactNode } from 'react';
import { expect, fireEvent, userEvent, waitFor, within } from '@storybook/test';
import type { Affiliation, SensorType } from '@hamilton/contracts';
import { STALE_AFTER_S, firstCrossingClock, type JOverride } from '@/lib/link-trust-rating';
import { formatSidc, toCotType, toSidc2525C, toSidc2525E, type SymbolCodeInput } from '@/lib/track-sidc';
import {
  DeclutterStack,
  TRIGGER_CSS,
  TrackSymbol,
  TrackSymbolG,
  TrackSymbolWithTooltip,
  placeSymbol,
  trackSymbolDataUrl,
  trackSymbolSvg,
  type ExplanationProps,
  type SymbolTrack,
} from '@/components/symbol';
import { MapSpine } from '@/components/cop/MapSpine';
import { MissionQueue } from '@/components/fires/MissionQueue';
import { AB1001_AT_CLOCK_S, AB1002_AT_CLOCK_S, ab1001, ab1002, missionState, missionsRecord } from '@/stories/fixtures/missions';
import { StoreSeed, TrustHeartbeat } from '@/stories/support/mocks';
import {
  BAND_SAMPLES,
  CANDIDATES,
  beatTrack,
  tracksRecord,
  S2_OVERRIDE_B,
  S2_OVERRIDE_CLOCK,
  UNIT_EVALUATION,
  beatAt,
  clockIso,
  componentsFor,
  telemetryFor,
} from '@/stories/fixtures/avdiivka';

// Decisions/Track Symbology — the FINAL symbol (src/components/symbol). The
// docs page (TrackSymbology.mdx) records decisions 1–6 and links the evidence.

interface Args {
  /** Matrix: link-trust score for every cell. */
  score: number;
  /** COP — live spine: scenario clock, s (0:45 → 1:30). */
  clock: number;
  /** COP — live spine: apply the example S2 override to B from 1:25. */
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
  args: { score: BAND_SAMPLES.degraded, clock: 80, s2Override: false, overlay: true },
  argTypes: {
    score: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    clock: { control: { type: 'range', min: 45, max: 95, step: 1 }, table: { disable: true } },
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
    // 0.6 × 0.212 + 0.4 × 0 = 0.127 → shown to two places.
    await expect(within(tip).getByTestId('formula')).toHaveTextContent(/^Score 0\.13 = 60% weighted average \(0\.21\) \+ 40% weakest factor \(0\.00\)$/);
    await expect(tip).toHaveTextContent('Messages arriving every 6.1 s (normally 1.0 s)');
    await expect(tip).toHaveTextContent('Only this unit is affected — A and C within 500 m are healthy');
    await expect(tip).toHaveTextContent('Matches a known ground-based GPS/UHF barrage jammer on all 6 signal checks');
    await expect(tip).not.toHaveTextContent(/FR-0|ground_based/);
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
  { affiliation: 'enemy', fn: 'ew-jamming', designation: 'HE1', x: 140, y: 96 },
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

const B_CROSSING_CLOCK = firstCrossingClock() ?? 75;
const fmtClock = (c: number) => `${Math.floor(c / 60)}:${String(Math.round(c % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// COP — the same beats on the REAL spine (MapSpine, store-driven)
// ---------------------------------------------------------------------------

function LiveSpineCop({ clock, s2Override }: Pick<Args, 'clock' | 's2Override'>) {
  const beat = beatAt(clock);
  // Fresh report times (the engine publishes at ~1 Hz): the TSS report-age check
  // must see live reports, not the 2024 scenario epoch.
  const fresh = new Date().toISOString();
  const tracks = tracksRecord(
    beatTrack('unit_a', beat.clockS, { last_update: fresh }),
    beatTrack('unit_b', beat.clockS, { last_update: fresh }),
    beatTrack('unit_c', beat.clockS, { last_update: fresh }),
  );
  const b = tracks.unit_b!;
  const showCandidates = clock >= B_CROSSING_CLOCK;
  const evaluations = {
    ...UNIT_EVALUATION,
    ...(s2Override && clock >= S2_OVERRIDE_CLOCK ? { unit_b: { jOverride: S2_OVERRIDE_B } } : {}),
  };
  // Calls for fire due by `clock` (comms-sim missions.py): AB1002 at 0:30, AB1001 at 1:12.
  const missions = missionsRecord(
    ...(clock >= AB1002_AT_CLOCK_S ? [missionState(ab1002(new Date(Date.now() - (clock - AB1002_AT_CLOCK_S) * 1000).toISOString()))] : []),
    ...(clock >= AB1001_AT_CLOCK_S ? [missionState(ab1001(new Date(Date.now() - (clock - AB1001_AT_CLOCK_S) * 1000).toISOString()))] : []),
  );
  return (
    <StoreSeed seed={{ tracks, missions, selectedSource: 'unit_b', candidates: showCandidates ? { source_id: 'unit_b', items: CANDIDATES } : null }}>
      <TrustHeartbeat>
        <div style={{ padding: 'var(--space-4)', background: 'var(--surface-panel)', display: 'grid', gap: 'var(--space-3)' }}>
          <div style={{ ...mono, fontSize: 12, color: 'var(--text-secondary)' }}>
            Scenario clock <span style={{ color: 'var(--text-primary)' }}>{fmtClock(clock)}</span> · engine beat {beat.label} · the production{' '}
            <code>MapSpine</code> on the offline basemap (CesiumSpine draws the same symbols as billboards) beside the fire-mission queue. Hover or Tab to a unit for its breakdown.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)', gap: 'var(--space-3)' }}>
            <div style={{ position: 'relative', height: 560 }} data-testid="cop-live-spine">
              <MapSpine
                evaluations={evaluations}
              />
            </div>
            <div style={{ maxHeight: 560, overflowY: 'auto', alignSelf: 'start' }}>
              <MissionQueue />
            </div>
          </div>
        </div>
      </TrustHeartbeat>
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
          'The decided symbol on the real renderer: the store is seeded with the PR #1 engine beat at **clock** and `MapSpine` draws ' +
          'the production symbols, declutter stacks and rating tooltips. The jammer\'s position is never presumed: no jammer symbol, ' +
          'candidate site or bearing line is drawn. B is selected (double frame). The fire-mission queue beside it holds the calls ' +
          'for fire due by **clock**: AB1002 (OBS C, M795, from 0:30, never gated) and AB1001 (OBS B, M982, from 1:12) — TSS PASS at 1:12 ' +
          '(B C3), TSS FAIL — RELIABILITY E5 (min C), rec. DO NOT LOAD from 1:15. No modal anywhere (Fires/Mission Row). The spine draws over the offline Protomaps basemap (`NEXT_PUBLIC_BASEMAP`, default offline once `make fetch-tiles` has provisioned `/public/tiles`; see **COP/MapSpine › Basemap off**).',
      },
    },
  },
  render: ({ clock, s2Override }) => <LiveSpineCop clock={clock} s2Override={s2Override} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const bHit = await waitFor(() => c.getByTestId('cop-symbol-unit_b'), { timeout: 15_000 });
    await expect(bHit.getAttribute('aria-label')).toMatch(/J E5/);
    await expect(canvasElement.querySelector('[data-cop-symbol="unit_b"] [data-field="J"]')?.textContent).toBe('E5');
    // HS-20: the live spine never presumes the jammer's position.
    await expect(canvasElement.querySelector('[data-symbol-id="__jammer"]')).toBeNull();
    const row = await c.findByTestId('fm-row-AB1001');
    await waitFor(() => expect(row).toHaveAttribute('data-verdict', 'FAIL'));
  },
};

// ---------------------------------------------------------------------------
// Export — codes + billboard image
// ---------------------------------------------------------------------------

const EXPORT_ROWS: { entity: string; track: SymbolTrack }[] = [
  { entity: 'unit_a', track: { affiliation: 'friendly', sensorType: 'recon_static', designation: 'A', score: 1, corroboration: 'confirmed' } },
  { entity: 'unit_b', track: { affiliation: 'friendly', sensorType: 'offense', designation: 'B', score: BAND_SAMPLES.failed } },
  { entity: 'unit_c', track: { affiliation: 'friendly', sensorType: 'detection', designation: 'C', score: 1 } },
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
