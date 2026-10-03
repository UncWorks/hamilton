import type { Meta, StoryObj } from '@storybook/react';
import type { CSSProperties, ReactNode } from 'react';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import type { SensorType } from '@hamilton/contracts';
import {
  D_LOD_BELOW_PX,
  D_MIN_BOX_PX,
  GLANCE_VARIANTS,
  GlanceCell,
  GlanceMatrix,
  GlanceStyles,
  GlanceSymbol,
  HALO_CANDIDATES,
  RESEARCH_ID,
  mapSurface,
  renderBoxPx,
  type GlanceVariant,
} from '@/stories/support/GlanceSymbol';
import {
  DifferencesTable,
  MANUAL,
  OddOneOut,
  ProtocolNote,
  ResultsTable,
  SidcTable,
  UnverifiedList,
  VARIANT_DOCS,
  VariantHeatmaps,
  mono,
} from '@/stories/support/glance-bench';
import type { FrameKind } from '@/stories/support/MilSymbol';
import { VISION_LABEL, VisionFilter, withVision, type VisionMode } from '@/stories/support/vision-filters';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface GlanceArgs {
  /** Vision filter applied to the whole canvas (blur σ1/σ2, grayscale, Machado CVD). */
  vision: VisionMode;
  /** Force the reduced-motion rendering (no pulse, no blink). */
  reducedMotion: boolean;
  /** C (V3): operator acknowledged the < 0.30 alert — stops the 1 Hz blink. */
  acknowledged: boolean;
  /** Variant for the search tasks. */
  variant: GlanceVariant;
  /** Symbol size for the search tasks, px. */
  size: 16 | 24 | 32;
  /** T8: items in the grid. */
  n: 8 | 16 | 32;
}

const SIZES = [16, 24, 32] as const;
const SCORES = [0.45, 0.95] as const;

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

function DocHeader({ variant }: { variant: GlanceVariant }) {
  const d = VARIANT_DOCS[variant];
  return (
    <header style={{ display: 'grid', gap: 6 }}>
      <h2 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>{d.title}</h2>
      <p style={para}>
        <strong>Rationale.</strong> {d.rationale}
      </p>
      <p style={para}>
        <strong>Standard ({MANUAL}).</strong> {d.standard}
      </p>
      <p style={para}>
        <strong>Hamilton overlay (non-doctrinal, labelled, toggleable, stripped on export).</strong> {d.overlay}
      </p>
    </header>
  );
}

function MatrixGrid({ variant, args, detail }: { variant: GlanceVariant; args: GlanceArgs; detail?: boolean }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      {SIZES.map((size) => (
        <div key={size} style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'start' }}>
          {SCORES.map((score) => (
            <GlanceMatrix
              key={score}
              variant={variant}
              sizePx={size}
              score={score}
              detail={detail}
              reducedMotion={args.reducedMotion}
              blinkOn={!args.acknowledged}
              caption={`${size} px${renderBoxPx(variant, size) !== size ? ` (renders ${renderBoxPx(variant, size)})` : ''} · trust ${score.toFixed(2)} ${score < 0.6 ? '(degraded)' : '(nominal)'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function VariantPage({ variant, args, extra }: { variant: GlanceVariant; args: GlanceArgs; extra?: ReactNode }) {
  return (
    <div style={page}>
      <GlanceStyles />
      <DocHeader variant={variant} />
      <Section title="Matrix — rows: sensor type · columns: affiliation">
        <MatrixGrid variant={variant} args={args} />
      </Section>
      {extra}
      <Section title="Distinctness (computed in this browser)">
        <VariantHeatmaps variant={variant} />
        <ResultsTable variants={['REF', 'V0', ...(variant === 'V0' ? [] : [variant])]} />
      </Section>
      <Section title="SIDC per cell">
        <SidcTable variant={variant} />
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: 'Explorations/At-a-Glance Symbols',
  decorators: [withVision],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { inline: true },
      description: {
        component:
          'Comparison bench for track-symbol alternates that are distinguishable at a glance AND follow **FM 1-02 / MCRP 5-12A, ' +
          '"Operational Terms and Graphics" (21 Sep 2004)** — frames Table 4-1 p 4-3, colours Table 4-3 p 4-4, fields Fig 4-2 / Table 4-4 ' +
          'pp 4-5 – 4-9, unit icons Table 5-3, mobility Table 5-4, echelon Table 5-6 p 5-33. Variants follow ' +
          'glance-symbology-research.md: **V0** current n-gons (baseline) · **V1 = A** doctrinal filled · **V2 = B** unfilled ink · ' +
          '**V3 = C** filled + frame-following trust outline (RECOMMENDED) · **V4 = D** high-glance · **E** doctrinal declutter. ' +
          'Rows: recon_static, recon_mobile, detection, offense, defense; columns: friend, hostile, neutral, unknown; 16 / 24 / 32 px; trust ' +
          '0.45 and 0.95 on the dark map. The evaluation (T1–T8) runs in this browser from the exact primitives that are drawn. ' +
          'Use the **vision** control for blur σ 1 / 2, grayscale, deuteranopia and protanopia on any story. ' +
          'Live renderers (CesiumSpine / MapSpine) are untouched.',
      },
    },
  },
  args: { vision: 'normal', reducedMotion: false, acknowledged: false, variant: 'V3', size: 16, n: 16 },
  argTypes: {
    vision: { control: 'select', options: ['normal', 'blur1', 'blur2', 'grayscale', 'deuteranopia', 'protanopia'] },
    reducedMotion: { control: 'boolean' },
    acknowledged: { control: 'boolean' },
    variant: { control: 'inline-radio', options: GLANCE_VARIANTS, table: { disable: true } },
    size: { control: 'inline-radio', options: [16, 24, 32], table: { disable: true } },
    n: { control: 'inline-radio', options: [8, 16, 32], table: { disable: true } },
  },
} satisfies Meta<GlanceArgs>;

export default meta;
type Story = StoryObj<GlanceArgs>;

const shown = { table: { disable: false } } as const;

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export const Compare16px: Story = {
  name: 'Compare — V0 vs V1–V4 at 16 px',
  render: (args) => (
    <div style={page}>
      <GlanceStyles />
      <p style={para}>
        Every variant&apos;s full matrix at <strong>16 px</strong>, trust 0.45 (degraded), side by side. V4 never renders below {D_MIN_BOX_PX} px (research D) and is in
        its level-of-detail state below {D_LOD_BELOW_PX} px. Results table below: T1–T7, calibrated on REF (must pass) and V0 (must fail).
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'start' }} data-testid="compare-16">
        {GLANCE_VARIANTS.map((v) => (
          <GlanceMatrix key={v} variant={v} sizePx={16} score={0.45} reducedMotion={args.reducedMotion} blinkOn={!args.acknowledged} caption={`${v}${v === 'V0' ? ' current' : ` (${RESEARCH_ID[v]})`}`} />
        ))}
      </div>
      <ResultsTable />
      <ProtocolNote />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export const V0Current: Story = { name: 'V0 — Current (baseline)', render: (args) => <VariantPage variant="V0" args={args} /> };
export const V1Filled: Story = { name: 'V1 (A) — MCRP 5-12A filled', render: (args) => <VariantPage variant="V1" args={args} /> };
export const V2Unfilled: Story = { name: 'V2 (B) — unfilled + bold icons', render: (args) => <VariantPage variant="V2" args={args} /> };
export const V3Outline: Story = {
  name: 'V3 (C) — filled + trust outline (recommended)',
  argTypes: { acknowledged: shown },
  render: (args) => (
    <VariantPage
      variant="V3"
      args={args}
      extra={
        <Section title="Trust bands — outline width 0 / 1.5 / 2.5 / 4 px, gauge = score, J below 0.60, 1 Hz blink below 0.30 until acknowledged">
          <div style={{ display: 'flex', gap: 'var(--space-2)', ...mapSurface, padding: 8, flexWrap: 'wrap' }}>
            {[0.95, 0.72, 0.45, 0.2].map((s) => (
              <GlanceCell key={s} variant="V3" sensor="offense" frame="friend" score={s} sizePx={32} reducedMotion={args.reducedMotion} blinkOn={!args.acknowledged} />
            ))}
          </div>
        </Section>
      }
    />
  ),
};
export const V4HighGlance: Story = {
  name: 'V4 (D) — high-glance',
  render: (args) => (
    <VariantPage
      variant="V4"
      args={args}
      extra={
        <Section title={`Level of detail — both states at every size (default: LOD below ${D_LOD_BELOW_PX} px)`}>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'start' }}>
            {[false, true].map((detail) => (
              <GlanceMatrix
                key={String(detail)}
                variant="V4"
                sizePx={24}
                score={0.45}
                detail={detail}
                reducedMotion={args.reducedMotion}
                caption={detail ? 'Zoomed in (≥ threshold): full Table 5-3 icons, echelon (Table 5-6), T' : 'Zoomed out (< threshold): enlarged icons, T only, no echelon'}
              />
            ))}
          </div>
        </Section>
      }
    />
  ),
};

// ---------------------------------------------------------------------------
// Halo variants (on V1)
// ---------------------------------------------------------------------------

export const HaloVariants: Story = {
  name: 'Halo variants — trust cues on V1',
  render: (args) => (
    <div style={page}>
      <GlanceStyles />
      <p style={para}>
        Each candidate trust cue applied to the V1 (A) symbol at 24 px, trust 0.95 / 0.72 / 0.45 / 0.20. All are the Hamilton link-trust overlay
        (non-doctrinal). The offset-dot variant is dropped: a dot above the frame reads as the squad echelon (Table 5-6, p 5-33).
      </p>
      <table style={{ borderCollapse: 'collapse', ...mapSurface }} data-testid="halo-variants">
        <tbody>
          {HALO_CANDIDATES.map((c) => (
            <tr key={c.id} data-cue={c.id} style={{ borderTop: '1px solid var(--surface-elevated)' }}>
              <th style={{ ...mono, color: c.id === 'circle' ? 'var(--trust-failed-stroke)' : 'var(--text-secondary)', fontWeight: 400, textAlign: 'left', padding: '4px 8px', maxWidth: 300 }}>
                {c.label}
              </th>
              {[0.95, 0.72, 0.45, 0.2].map((s) => (
                <td key={s} style={{ padding: 0 }}>
                  <div style={{ display: 'flex' }}>
                    {(['friend', 'hostile'] as FrameKind[]).map((f) => (
                      <GlanceCell key={f} variant="V1" sensor="offense" frame={f} score={s} sizePx={24} cues={c.cues} reducedMotion={args.reducedMotion} pad={[26, 26, 26]} />
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// E — doctrinal declutter
// ---------------------------------------------------------------------------

interface Track {
  id: string;
  sensor: SensorType;
  frame: FrameKind;
  score: number;
  x: number;
  y: number;
}

const CLUSTER: Track[] = [
  { id: 'A', sensor: 'recon_static', frame: 'friend', score: 0.95, x: 120, y: 92 },
  { id: 'B', sensor: 'offense', frame: 'friend', score: 0.45, x: 132, y: 100 },
  { id: 'C', sensor: 'detection', frame: 'friend', score: 0.95, x: 126, y: 112 },
  { id: 'H1', sensor: 'offense', frame: 'hostile', score: 0.95, x: 140, y: 96 },
  { id: 'U1', sensor: 'defense', frame: 'unknown', score: 0.72, x: 115, y: 106 },
];

function Declutter({ size, args }: { size: number; args: GlanceArgs }) {
  const W = 300;
  const H = 210;
  const s = size;
  const cx = CLUSTER.reduce((a, t) => a + t.x, 0) / CLUSTER.length;
  const cy = CLUSTER.reduce((a, t) => a + t.y, 0) / CLUSTER.length;
  const ordered = [...CLUSTER].sort((a, b) => Number(b.frame === 'hostile') - Number(a.frame === 'hostile'));
  const sym = (t: Track, x: number, y: number) => (
    <g key={t.id} transform={`translate(${x - s / 2} ${y - s / 2}) scale(${s / 200})`}>
      <GlanceSymbol variant="V3" sensor={t.sensor} frame={t.frame} score={t.score} sizePx={s} reducedMotion={args.reducedMotion} blinkOn={!args.acknowledged} />
    </g>
  );
  const stackX = 210;
  const rowH = s * 0.62;
  const stackTop = cy - (ordered.length * rowH) / 2;
  const panel = (title: string, body: ReactNode) => (
    <figure style={{ margin: 0, display: 'grid', gap: 4 }}>
      <figcaption style={{ ...mono, color: 'var(--text-secondary)' }}>{title}</figcaption>
      <svg width={W} height={H} style={{ ...mapSurface, display: 'block' }} overflow="hidden">
        <circle cx={cx} cy={cy} r={2} fill="var(--sym-ink)" />
        {body}
      </svg>
    </figure>
  );
  const ink = { stroke: 'var(--sym-ink)', strokeWidth: 1.25, fill: 'none' } as const;
  return (
    <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
      {panel('Raw: 5 tracks within 1.5·s — overlap', CLUSTER.map((t) => sym(t, t.x, t.y)))}
      {panel(
        'E: bracketed stack + one locator line (¶5-8, Fig 5-6, p 5-41/42), hostile first',
        <>
          <path d={`M${cx},${cy} H${stackX - 14}`} {...ink} />
          <path d={`M${stackX - 6},${stackTop} h-8 V${stackTop + ordered.length * rowH} h8`} {...ink} />
          {ordered.map((t, i) => sym(t, stackX + s / 2, stackTop + rowH * (i + 0.5)))}
        </>,
      )}
      {panel(
        'E (compact, Hamilton convention): first 3 frames + "+n"',
        <>
          <path d={`M${cx},${cy} H${stackX - 14}`} {...ink} />
          <path d={`M${stackX - 6},${cy - rowH * 1.5} h-8 V${cy + rowH * 1.5} h8`} {...ink} />
          {ordered.slice(0, 3).map((t, i) => sym(t, stackX + s / 2, cy - rowH * 1.5 + rowH * (i + 0.5)))}
          <text x={stackX + s + 6} y={cy + 4} fill="var(--sym-ink)" style={{ ...mono, fontSize: 11 }}>
            +{ordered.length - 3}
          </text>
        </>,
      )}
    </div>
  );
}

export const EDeclutter: Story = {
  name: 'E — doctrinal declutter',
  render: (args) => (
    <div style={page}>
      <GlanceStyles />
      <p style={para}>
        Research candidate E. When three or more symbols overlap within 1.5·s: stack them in a bracket with one locator line from the bracket centre to
        the true location ({MANUAL} ¶5-8, Fig 5-6, pp 5-41/5-42); hostile first. If the stack still collides, show up to three frames plus a
        &ldquo;+n&rdquo; count (Hamilton convention, labelled). Symbols are V3 (C). The dot marks the true centroid.
      </p>
      {[24, 32].map((s) => (
        <Declutter key={s} size={s} args={args} />
      ))}
    </div>
  ),
};

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
              {GLANCE_VARIANTS.map((v) => (
                <GlanceMatrix key={v} variant={v} sizePx={size} score={score} reducedMotion caption={v} />
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
  },
  render: () => (
    <div style={page}>
      <GlanceStyles />
      <ProtocolNote />
      <ResultsTable />
      {(['REF', ...GLANCE_VARIANTS] as const).map((v) => (
        <Section key={v} title={`${v}${v === 'REF' ? ' — doctrinal reference (milsymbol-default sizes)' : v === 'V0' ? ' — current' : ` (${RESEARCH_ID[v]})`}`}>
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
  name: 'Reference — MCRP 5-12A vs 2525E, unverified',
  render: () => (
    <div style={page}>
      <ProtocolNote />
      <Section title={`Differences — ${MANUAL} vs MIL-STD-2525E / FM 1-02.2 (research §2.2 + bench findings)`}>
        <DifferencesTable />
      </Section>
      <Section title="Sensor type → MCRP icon → codes (research §2.1, validated with milsymbol 3.0.4 isValid())">
        <SidcTable variant="V1" withEchelon />
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
