import type { Meta, StoryObj } from '@storybook/react';
import type { CSSProperties, ReactNode } from 'react';
import { trustBand } from '@/lib/trust-gradient';
import { haloOuterRadiusPx, haloPeriodMs } from '@/stories/archive/halo';
import { TrackGlyph, type HaloVariant } from '@/stories/support/TrackGlyph';
import { mono } from '@/stories/support/foundation-ui';

interface HaloOptionsArgs {
  /** Trust score for the Playground story. */
  score: number;
  /** Multiplies the §5.2 period (1 = spec). */
  periodScale: number;
  /** Force the reduced-motion rendering (the OS setting also applies). */
  reducedMotion: boolean;
}

const SCORES = [0.55, 0.4, 0.2] as const;
const ICON_RADIUS = 18; // MapSpine ICON_RADIUS_PX

interface Option {
  n: number;
  variant: HaloVariant;
  name: string;
  live?: boolean;
  rationale: string;
}

const OPTIONS: Option[] = [
  {
    n: 1,
    variant: 'pulse',
    name: 'Spec-faithful pulse (fixed)',
    live: true,
    rationale:
      'Trust-coloured disc + edge ring, scaled FROM ITS CENTRE (transform-box: fill-box) between 35% and 100% of the halo extent while opacity breathes. Outer radius = icon edge + (1−c)×24px, period 1200 − (1−c)×600ms. MapSpine and CesiumSpine drew this (haloFrameAt) until they adopted the decided symbol, which has no halo.',
  },
  {
    n: 2,
    variant: 'ping',
    name: 'Radar ping',
    rationale:
      'A single thin ring emitted at the icon edge that travels out to the spec radius and fades to zero — one-way, sonar-like. Reads as "signal being lost"; lighter than a filled disc but the repeated motion is busier on dense maps.',
  },
  {
    n: 3,
    variant: 'band',
    name: 'Static band ring',
    rationale:
      'No motion. Ring at the spec radius whose stroke encodes the band: watching 1px dotted · degraded 2px solid · failed 3px dashed. Zero animation cost, legible in screenshots and print, and the natural reduced-motion fallback — but loses the "accelerating concern" cue of §6.3.',
  },
  {
    n: 4,
    variant: 'glow',
    name: 'Breathing glow',
    rationale:
      'A blurred trust-coloured glow whose opacity breathes at the spec period; no geometric expansion, so nothing moves outward into neighbouring tracks. Least visual noise and closest to the §6.2 "filter: drop-shadow" wording, but the softest signal and costliest to render (blur per icon).',
  },
];

const mapSurface: CSSProperties = {
  background: 'var(--surface-base)',
  backgroundImage:
    'linear-gradient(var(--surface-elevated) 1px, transparent 1px), linear-gradient(90deg, var(--surface-elevated) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
  border: '1px solid var(--surface-elevated)',
};

function Cell({ children }: { children: ReactNode }) {
  return (
    <div style={{ ...mapSurface, display: 'grid', placeItems: 'center', padding: 'var(--space-2)' }}>{children}</div>
  );
}

function ScoreMeta({ s, periodScale }: { s: number; periodScale: number }) {
  return (
    <code style={{ ...mono, color: 'var(--text-tertiary)' }}>
      c={s.toFixed(2)} · {trustBand(s)} · r={haloOuterRadiusPx(s, ICON_RADIUS).toFixed(1)}px ·{' '}
      {(haloPeriodMs(s) * periodScale).toFixed(0)}ms
    </code>
  );
}

function ComparisonGrid({ periodScale, reducedMotion }: HaloOptionsArgs) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--surface-panel)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 320px) repeat(3, minmax(150px, 1fr))',
          gap: 'var(--space-2)',
          alignItems: 'stretch',
        }}
      >
        <div />
        {SCORES.map((s) => (
          <div key={s} style={{ textAlign: 'center' }}>
            <ScoreMeta s={s} periodScale={periodScale} />
          </div>
        ))}
        {OPTIONS.map((o) => (
          <OptionRow key={o.n} option={o} periodScale={periodScale} reducedMotion={reducedMotion} />
        ))}
      </div>
      {reducedMotion && (
        <p style={{ ...mono, margin: 0, color: 'var(--text-secondary)' }}>
          Reduced motion forced: every animated option collapses to a static ring at the full spec radius (same as the
          OS `prefers-reduced-motion: reduce` path in motion.css and the renderers).
        </p>
      )}
    </div>
  );
}

function OptionRow({
  option: o,
  periodScale,
  reducedMotion,
}: {
  option: Option;
  periodScale: number;
  reducedMotion: boolean;
}) {
  return (
    <>
      <div style={{ display: 'grid', gap: 'var(--space-1)', alignContent: 'center' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'baseline' }}>
          <strong style={{ color: 'var(--text-primary)' }}>
            Option {o.n} — {o.name}
          </strong>
          {o.live && (
            <code
              style={{
                ...mono,
                color: 'var(--surface-base)',
                background: 'var(--trust-degraded)',
                padding: '0 var(--space-1)',
              }}
            >
              LIVE
            </code>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{o.rationale}</span>
      </div>
      {SCORES.map((s) => (
        <Cell key={s}>
          <TrackGlyph
            affiliation="friendly"
            sensorType="offense"
            score={s}
            radius={ICON_RADIUS}
            haloVariant={o.variant}
            haloPeriodScale={periodScale}
            reducedMotion={reducedMotion}
            showLabel={false}
          />
        </Cell>
      ))}
    </>
  );
}

const meta = {
  title: 'Archive/Halo Options',
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { inline: true },
      description: {
        component:
          '**ARCHIVED — superseded by Decisions/Track Symbology, decision 2:** the decided symbol shows trust as a side gauge + J ' +
          'text outside the frame, with no circular halo (a circle is the friendly equipment frame, MCRP Table 4-1 p 4-3, and the ' +
          'variable-rate pulse conflicts with MIL-STD-1472H §5.17.27). Kept for the record; the live renderers still draw Option 1 ' +
          'until they adopt the production symbol.\n\n' +
          'Below-ROE-floor halo treatments (Branding §5.2 / §6.3) compared at trust 0.55 · 0.40 · 0.20 on the dark map ' +
          'surface. Colours are the real `--trust-degraded` / `--trust-failed` tokens.\n\n' +
          '**Live: Option 1 (spec-faithful pulse).** MapSpine (deck.gl) and CesiumSpine draw it from the shared ' +
          '`haloFrameAt()` (now archived in `src/stories/archive/halo.ts`; no live renderer draws a halo); the SVG reference uses the `halo-pulse` keyframe in `motion.css`.\n\n' +
          '**Bug fixed (off-centre pulse):** the halo-pulse keyframe applied `transform: scale()` to an SVG `<circle>` ' +
          'with `transform-origin: center` but no `transform-box`. SVG elements default to `transform-box: view-box`, ' +
          'so "center" resolved to the middle of the SVG *viewport* measured from the user-space origin (46px, 46px), ' +
          'not the circle at (0,0) — the halo slid ~8px up-left on every pulse. `.halo` now sets ' +
          '`transform-box: fill-box; transform-origin: center`. deck.gl (phase wrapped at 4000ms → mid-pulse jumps; ' +
          'halo smaller than the icon) and Cesium (metre-sized ground ellipse foreshortened by the −55° camera pitch, ' +
          'never pulsing) were rebuilt on the same screen-space geometry.\n\n' +
          'Controls: `periodScale` multiplies the spec period; `reducedMotion` forces the static fallback ' +
          '(the OS setting also applies).',
      },
    },
  },
  args: { score: 0.4, periodScale: 1, reducedMotion: false },
  argTypes: {
    score: { control: { type: 'range', min: 0, max: 0.59, step: 0.01 } },
    periodScale: { control: { type: 'range', min: 0.25, max: 4, step: 0.25 } },
    reducedMotion: { control: 'boolean' },
  },
} satisfies Meta<HaloOptionsArgs>;

export default meta;
type Story = StoryObj<HaloOptionsArgs>;

/** All four options side by side at c = 0.55 / 0.40 / 0.20. */
export const Comparison: Story = {
  render: (args) => <ComparisonGrid {...args} />,
};

/** One score (use the `score` control) across all four options, enlarged. */
export const Playground: Story = {
  render: ({ score, periodScale, reducedMotion }) => (
    <div style={{ padding: 'var(--space-4)', background: 'var(--surface-panel)', display: 'grid', gap: 'var(--space-3)' }}>
      <ScoreMeta s={score} periodScale={periodScale} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-2)' }}>
        {OPTIONS.map((o) => (
          <div key={o.n} style={{ display: 'grid', gap: 'var(--space-1)' }}>
            <code style={{ ...mono, color: 'var(--text-secondary)' }}>
              Option {o.n} — {o.name}
              {o.live ? ' (live)' : ''}
            </code>
            <Cell>
              <TrackGlyph
                affiliation="friendly"
                sensorType="offense"
                score={score}
                radius={28}
                haloVariant={o.variant}
                haloPeriodScale={periodScale}
                reducedMotion={reducedMotion}
              />
            </Cell>
          </div>
        ))}
      </div>
    </div>
  ),
};

/** Concentricity check: crosshair through the icon centre at peak scale (animation paused at 50%). */
export const CentreCheck: Story = {
  render: ({ score }) => (
    <div style={{ padding: 'var(--space-4)', background: 'var(--surface-panel)' }}>
      <div style={{ ...mapSurface, position: 'relative', display: 'inline-grid', placeItems: 'center', padding: 'var(--space-4)' }}>
        <style>{`.centre-check .halo{animation-play-state:paused;animation-delay:calc(var(--halo-period) * -0.5)}`}</style>
        <div className="centre-check">
          <TrackGlyph affiliation="friendly" sensorType="offense" score={score} radius={36} showLabel={false} />
        </div>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(var(--text-tertiary), var(--text-tertiary)), linear-gradient(var(--text-tertiary), var(--text-tertiary))',
            backgroundSize: '1px 100%, 100% 1px',
            backgroundPosition: 'center, center',
            backgroundRepeat: 'no-repeat',
            opacity: 0.6,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  ),
};
