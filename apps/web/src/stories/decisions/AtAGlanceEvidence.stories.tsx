import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import { T } from '@/lib/glance-metrics';
import { TA_RADAR_SCALE, TA_RADAR_STROKE } from '@/components/symbol/geometry';
import { GLANCE_VARIANTS, GlanceCell, GlanceMatrix, GlanceStyles, RESEARCH_ID, mapSurface, type AnyVariant } from '@/stories/support/GlanceSymbol';
import { DifferencesTable, MANUAL, OddOneOut, ProtocolNote, ResultsTable, SidcTable, UnverifiedList, VariantHeatmaps, mono } from '@/stories/support/glance-bench';
import { t7RadarCheck } from '@/stories/support/glance-eval';
import { VISION_LABEL, VisionFilter, withVision, type VisionMode } from '@/stories/support/vision-filters';

// Decisions/Evidence/At-a-Glance — the evaluation half of the At-a-Glance bench
// (glance-symbology-research.md §5), kept reachable so the Track Symbology
// decision stays auditable. FINAL is the decided production symbol
// (src/components/symbol), evaluated from the same primitives the app draws.
// The archived design variants live in Archive/At-a-Glance Variants.

interface EvidenceArgs {
  /** Vision filter applied to the whole canvas (blur σ1/σ2, grayscale, Machado CVD). */
  vision: VisionMode;
  /** Variant for the search tasks. */
  variant: AnyVariant;
  /** Symbol size for the search tasks, px. */
  size: 16 | 24 | 32;
  /** T8: items in the grid. */
  n: 8 | 16 | 32;
}

const EVIDENCE_VARIANTS: AnyVariant[] = ['FINAL', ...GLANCE_VARIANTS];

const page: CSSProperties = { display: 'grid', gap: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--surface-panel)' };
const h3: CSSProperties = { ...mono, margin: 0, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-tertiary)' };
const para: CSSProperties = { margin: 0, maxWidth: 1080, fontSize: 13, color: 'var(--text-secondary)' };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <h3 style={h3}>{title}</h3>
      {children}
    </section>
  );
}

const meta = {
  title: 'Decisions/Evidence/At-a-Glance',
  decorators: [withVision],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { inline: true },
      description: {
        component:
          'Evidence for **Decisions/Track Symbology**: the At-a-Glance evaluation (T1–T8, glance-symbology-research.md §5) run in this ' +
          'browser on the exact rendered pixels. **FINAL** = the decided production symbol (`src/components/symbol`); REF = doctrinal ' +
          'reference (calibration: must pass); V0 = the current n-gons (calibration: must fail); V1–V4 = the archived candidates ' +
          '(Archive/At-a-Glance Variants). Use the **vision** control for blur σ 1 / 2, grayscale, deuteranopia and protanopia.',
      },
    },
  },
  args: { vision: 'normal', variant: 'FINAL', size: 16, n: 16 },
  argTypes: {
    vision: { control: 'select', options: ['normal', 'blur1', 'blur2', 'grayscale', 'deuteranopia', 'protanopia'] },
    variant: { control: 'inline-radio', options: EVIDENCE_VARIANTS, table: { disable: true } },
    size: { control: 'inline-radio', options: [16, 24, 32], table: { disable: true } },
    n: { control: 'inline-radio', options: [8, 16, 32], table: { disable: true } },
  },
} satisfies Meta<EvidenceArgs>;

export default meta;
type Story = StoryObj<EvidenceArgs>;

const shown = { table: { disable: false } } as const;

// ---------------------------------------------------------------------------
// Evaluation stories
// ---------------------------------------------------------------------------

function VisionRow({ modes, size = 16, score = 0.45 }: { modes: VisionMode[]; size?: number; score?: number }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {modes.map((m) => (
        <div key={m} style={{ display: 'grid', gap: 4 }}>
          <h3 style={h3}>{VISION_LABEL[m]}</h3>
          <VisionFilter mode={m}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'start' }}>
              {EVIDENCE_VARIANTS.map((v) => (
                <GlanceMatrix key={v} variant={v} sizePx={size} score={score} reducedMotion caption={v === 'FINAL' ? 'FINAL (decided)' : v} />
              ))}
            </div>
          </VisionFilter>
        </div>
      ))}
    </div>
  );
}

export const BlurTest: Story = {
  name: 'Eval — blur σ 1 / 2 px (T1)',
  render: () => (
    <div style={page}>
      <GlanceStyles />
      <p style={para}>SVG feGaussianBlur at σ 1 and σ 2 px over every variant at 16 px, trust 0.45. The computed T1 scores use the same σ on silhouette alpha.</p>
      <VisionRow modes={['normal', 'blur1', 'blur2']} />
      <ResultsTable />
    </div>
  ),
};

export const Thumbnail16: Story = {
  name: 'Eval — 16 px thumbnail (T4)',
  render: () => (
    <div style={page}>
      <GlanceStyles />
      <p style={para}>
        True 16 px, no zoom, nominal and degraded. T4 classifies 16 sub-pixel offsets with σ 0.02 noise by max NCC against ≥ 128 px templates; its
        accuracies are in the results table (affiliation · function, at 16 / 24 / 32).
      </p>
      <VisionRow modes={['normal']} score={0.95} />
      <VisionRow modes={['normal']} score={0.45} />
      <ResultsTable />
    </div>
  ),
};

export const Grayscale: Story = {
  name: 'Eval — grayscale (T5)',
  render: () => (
    <div style={page}>
      <GlanceStyles />
      <VisionRow modes={['grayscale']} size={24} />
      <ResultsTable vision="grayscale" />
    </div>
  ),
};

export const ColourVision: Story = {
  name: 'Eval — deuteranopia / protanopia (T6)',
  render: () => (
    <div style={page}>
      <GlanceStyles />
      <p style={para}>Machado, Oliveira &amp; Fernandes 2009, severity 1.0, linear RGB — the same matrices drive the SVG filter and the evaluator.</p>
      <VisionRow modes={['deuteranopia', 'protanopia']} size={24} />
      <ResultsTable vision="deuteranopia" />
      <ResultsTable vision="protanopia" />
    </div>
  ),
};

export const SilhouetteDistinctness: Story = {
  name: 'Eval — silhouette distinctness (all variants)',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await waitFor(() => expect(c.getByTestId('results-normal').getAttribute('data-ready')).toBe('true'), { timeout: 60000 });
    // Calibration (research §5.3): the doctrinal reference passes T1, the n-gon baseline fails it.
    const row = (v: string) => c.getByTestId('results-normal').querySelector(`tr[data-variant="${v}"]`)!;
    await expect(row('REF').textContent).toMatch(/^REF.*?PASS/);
    await expect(row('V0').textContent).toMatch(/FAIL/);
    await expect(row('FINAL')).toBeTruthy();
  },
  render: () => (
    <div style={page}>
      <GlanceStyles />
      <ProtocolNote />
      <ResultsTable />
      {(['FINAL', 'REF', ...GLANCE_VARIANTS] as const).map((v) => (
        <Section key={v} title={`${v}${v === 'REF' ? ' — doctrinal reference (milsymbol-default sizes)' : v === 'V0' ? ' — current' : v === 'FINAL' ? ' — decided symbol (production)' : ` (${RESEARCH_ID[v]})`}`}>
          <VariantHeatmaps variant={v} />
        </Section>
      ))}
    </div>
  ),
};

function searchStory(mode: 'affiliation' | 'function', alwaysPresent: boolean): Story {
  return {
    argTypes: { variant: shown, size: shown, ...(alwaysPresent ? {} : { n: shown }) },
    play: async ({ canvasElement }) => {
      const c = within(canvasElement);
      await userEvent.click(c.getByTestId('ooo-start'));
      const grid = c.getByTestId('ooo-grid');
      const target = Number(grid.getAttribute('data-target'));
      if (target >= 0) await userEvent.click(c.getByTestId(`ooo-cell-${target}`));
      else await userEvent.click(c.getByTestId('ooo-absent'));
      await expect(c.getByTestId('ooo-result').textContent).toMatch(/^Correct in \d+ ms/);
    },
    render: (args) => (
      <div style={page}>
        <GlanceStyles />
        <p style={para}>
          {mode === 'affiliation' ? 'One hostile among friends (offense row).' : 'One recon_mobile among recon_static (friend) — the hardest V0 pair (heptagon vs hexagon).'}{' '}
          {alwaysPresent
            ? 'Brief version: 10 × 10, target always present. Click it; the time is recorded per variant. "Randomise seed" moves it.'
            : `T8 human mode: ${args.n} items placed at seeded random cells of a 10 × 10 lattice, target present on 50 % of seeds. Run several N (8 / 16 / 32) to get the slope b of RT = a + b·N; pass ≤ ${10} ms/item.`}{' '}
          Switch <strong>variant</strong> / <strong>size</strong> in Controls; stats accumulate per variant until reload.
        </p>
        <OddOneOut mode={mode} variant={args.variant} sizePx={args.size} score={0.95} n={alwaysPresent ? 100 : args.n} alwaysPresent={alwaysPresent} />
      </div>
    ),
  };
}

export const SearchAffiliation: Story = { name: 'Eval — odd-one-out: hostile among friends (10×10)', ...searchStory('affiliation', true) };
export const SearchFunction: Story = { name: 'Eval — odd-one-out: one function among another (10×10)', ...searchStory('function', true) };
export const SearchSlope: Story = { name: 'Eval — T8 search slope (N 8/16/32, 50 % present)', ...searchStory('affiliation', false) };

// ---------------------------------------------------------------------------
// Reference
// ---------------------------------------------------------------------------

export const Reference: Story = {
  name: 'Reference — MCRP 5-12A vs 2525E, codes, unverified (decision 4)',
  render: () => (
    <div style={page}>
      <ProtocolNote />
      <Section title={`Differences — ${MANUAL} vs MIL-STD-2525E / FM 1-02.2 (research §2.2 + bench findings)`}>
        <DifferencesTable />
      </Section>
      <Section title="Sensor type → MCRP icon → codes (research §2.1, validated with milsymbol 3.0.4 isValid())">
        <SidcTable variant="FINAL" withEchelon />
      </Section>
      <Section title="Fixture correction">
        <p style={para}>
          <code>AFFILIATION_TRACKS</code> types <code>hostile_ew_1</code> as sensor_type &ldquo;defense&rdquo;, which would draw a hostile air-defense dome. It is an EW
          (jamming) emitter: &ldquo;EW&rdquo; + sawtooth, Table 5-3 p 5-18; 2525B SHGPUUMSEJ-----, CoT a-h-G-U-U-M-S-E-J. The contract&apos;s SensorType has no EW
          value, so <code>SYMBOL_FUNCTION_OVERRIDES</code> (fixtures/avdiivka.ts) maps it to <code>&apos;ew-jamming&apos;</code>.
        </p>
      </Section>
      <Section title="Unverified / not found">
        <UnverifiedList />
      </Section>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Decision 5 — TA-radar glyph enlargement, T7 condition (iii)
// ---------------------------------------------------------------------------

interface RadarRow {
  label: string;
  byN: Record<number, number>;
}

/** Glyph geometries tried for decision 5 (scale about the glyph centre × radar stroke). Friend frame only: T7 (iii) is friend FA among friend TA radar. */
const RADAR_SWEEP: { scale: number; stroke: number }[] = [
  { scale: 1, stroke: 1 },
  { scale: 1.2, stroke: 1 },
  { scale: 1.35, stroke: 1 },
  { scale: 1.45, stroke: 1 },
  { scale: 1.45, stroke: 1.25 },
  { scale: 1.35, stroke: 1.5 },
  { scale: 1.4, stroke: 1.5 },
  { scale: 1.45, stroke: 1.5 },
];

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function RadarT7() {
  const [rows, setRows] = useState<RadarRow[]>([]);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const out: RadarRow[] = [];
      const push = async (label: string, f: () => Record<number, number>) => {
        await tick();
        if (cancelled) return;
        out.push({ label, byN: f() });
        setRows([...out]);
      };
      await push('REF — doctrinal reference (calibration)', () => t7RadarCheck('REF'));
      await push('BEFORE — V1 (A) doctrinal radar, scale 1', () => t7RadarCheck('V1'));
      await push(`AFTER — FINAL as shipped (friend scale ${TA_RADAR_SCALE.friend}, stroke ×${TA_RADAR_STROKE})`, () => t7RadarCheck('FINAL'));
      for (const g of RADAR_SWEEP) await push(`sweep — FINAL, scale ${g.scale}, stroke ×${g.stroke}`, () => t7RadarCheck('FINAL', { radarScale: g.scale, radarStroke: g.stroke }));
      if (cancelled) return;
      setDone(true);
      (window as unknown as { __radarT7?: unknown }).__radarT7 = out.map((r) => ({ label: r.label, min: Math.min(...Object.values(r.byN)), byN: r.byN }));
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const td: CSSProperties = { ...mono, padding: '3px 8px', color: 'var(--text-secondary)', borderTop: '1px solid var(--surface-elevated)' };
  return (
    <table style={{ borderCollapse: 'collapse' }} data-testid="radar-t7" data-ready={done ? 'true' : 'false'}>
      <thead>
        <tr>
          {['Geometry', ...T.t7.sizes.map((n) => `R @ N ${n}`), `min (pass ≥ ${T.t7.minR})`].map((h) => (
            <th key={h} style={{ ...td, color: 'var(--text-tertiary)', fontWeight: 400, textAlign: 'left', borderTop: 'none' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const min = Math.min(...Object.values(r.byN));
          return (
            <tr key={r.label} data-row={r.label}>
              <td style={{ ...td, color: r.label.startsWith('AFTER') || r.label.startsWith('BEFORE') ? 'var(--text-primary)' : td.color }}>{r.label}</td>
              {T.t7.sizes.map((n) => (
                <td key={n} style={td}>
                  {r.byN[n]!.toFixed(2)}
                </td>
              ))}
              <td style={{ ...td, color: min >= T.t7.minR ? 'var(--text-primary)' : 'var(--trust-failed-stroke)', fontWeight: 700 }}>
                {min.toFixed(2)} {min >= T.t7.minR ? 'PASS' : 'FAIL'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const RadarGlyphT7: Story = {
  name: 'Decision 5 — TA-radar glyph, T7 (iii) before / after',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await waitFor(() => expect(c.getByTestId('radar-t7').getAttribute('data-ready')).toBe('true'), { timeout: 60000 });
  },
  render: () => (
    <div style={page}>
      <GlanceStyles />
      <p style={para}>
        T7 condition (iii): one friendly FA battery (cannonball) among friendly FA target-acquisition radars, salience ratio R on blurred CIE L*a*b*, s 24,
        distractors at random ¼-px offsets and map-tile phases, N 8 / 16 / 32 (pass R ≥ {T.t7.minR}). The radar glyph (dot + radar, {MANUAL} Table 5-3 p
        5-13) is enlarged about its own centre inside each frame — icon enlargement within the frame is permitted (2525D §5.3.1.2). Friend and neutral
        frames take {TA_RADAR_SCALE.friend}×; the hostile diamond and unknown quatrefoil stop at {TA_RADAR_SCALE.hostile}× / {TA_RADAR_SCALE.unknown}× before the radar
        arm crosses the frame. Overlay off, nominal trust (the condition has no trust variation).
      </p>
      <Section title="Glyph — before (V1) and after (FINAL), 24 and 32 px">
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', ...mapSurface, padding: 8 }}>
          {(['V1', 'FINAL'] as const).map((v) =>
            [24, 32].map((s) => (
              <figure key={`${v}${s}`} style={{ margin: 0, display: 'grid', gap: 4 }}>
                <figcaption style={{ ...mono, color: 'var(--text-tertiary)' }}>
                  {v === 'V1' ? 'before' : 'after'} · {s} px
                </figcaption>
                <div style={{ display: 'flex' }}>
                  {(['friend', 'hostile', 'neutral', 'unknown'] as const).map((f) => (
                    <GlanceCell key={f} variant={v} sensor="detection" frame={f} score={0.95} sizePx={s} overlay={false} pad={[10, 10, 8]} />
                  ))}
                </div>
              </figure>
            )),
          )}
        </div>
      </Section>
      <Section title="T7 (iii) — computed in this browser">
        <RadarT7 />
      </Section>
    </div>
  ),
};
