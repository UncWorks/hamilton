import type { Meta, StoryObj } from '@storybook/react';
import type { CSSProperties, ReactNode } from 'react';
import {
  D_LOD_BELOW_PX,
  D_MIN_BOX_PX,
  GLANCE_VARIANTS,
  GlanceCell,
  GlanceMatrix,
  GlanceStyles,
  HALO_CANDIDATES,
  RESEARCH_ID,
  mapSurface,
  renderBoxPx,
  type GlanceVariant,
} from '@/stories/support/GlanceSymbol';
import { MANUAL, ProtocolNote, ResultsTable, SidcTable, VARIANT_DOCS, VariantHeatmaps, mono } from '@/stories/support/glance-bench';
import type { FrameKind } from '@/stories/support/MilSymbol';
import { withVision, type VisionMode } from '@/stories/support/vision-filters';

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
  title: 'Archive/At-a-Glance Variants',
  decorators: [withVision],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { inline: true },
      description: {
        component:
          '**ARCHIVED — decided in Decisions/Track Symbology** (base V1 + V4 label treatment, side gauge + J, no halo; E declutter). ' +
          'The evaluation stories (blur, thumbnail, grayscale, colour vision, distinctness, search, radar T7) moved to ' +
          '**Decisions/Evidence/At-a-Glance**, which also scores the decided symbol (FINAL).\n\n' +
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

