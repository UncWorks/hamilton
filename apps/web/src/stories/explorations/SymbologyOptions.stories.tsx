import type { Meta, StoryObj } from '@storybook/react';
import { useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { expect, fireEvent, userEvent, waitFor, within } from '@storybook/test';
import type { SensorType } from '@hamilton/contracts';
import { trustBand } from '@/lib/trust-gradient';
import {
  BAND_DASH,
  FRAME_PATH,
  MilSymbol,
  MilSymbolCell,
  trustStrokeVar,
  type Echelon,
  type FrameKind,
  type IconKind,
  type MilSymbolProps,
  type SymbologyOption,
} from '@/stories/support/MilSymbol';
import {
  BAND_SAMPLES,
  BAND_SAMPLE_SOURCE,
  CANDIDATES,
  JAMMER_LOCATION,
  PHASE_TRACKS,
  at,
  beatAt,
  clockIso,
  componentsFor,
  telemetryFor,
} from '@/stories/fixtures/avdiivka';
import { ROE_FLOOR, STALE_AFTER_S, firstCrossingClock, formatDtg, rateLinkTrust } from '@/lib/link-trust-rating';
import {
  FireMissionPopup,
  LegendPrime,
  MilSymbolPrime,
  RatingCell,
  RatingExplanation,
  SIDC_TABLE_PRIME_MD,
  SidcTablePrime,
  TRIGGER_CSS,
  explainRating,
  useAnchoredTips,
  type ExplanationProps,
} from '@/stories/support/OptionBPrime';
import { mono } from '@/stories/support/foundation-ui';
import { withDeuteranopia } from '@/stories/support/vision-filters';

// ---------------------------------------------------------------------------
// Args + deuteranopia decorator
// ---------------------------------------------------------------------------

interface SymbologyArgs {
  /** Simulate deuteranopia (Machado, Oliveira & Fernandes 2009, severity 1.0). */
  deuteranopia: boolean;
  /** Force the reduced-motion (static) halo. */
  reducedMotion: boolean;
  /** COP story: scenario phase from the Avdiivka fixture. */
  phase: 'nominal' | 'watching' | 'degraded' | 'failed';
  /** COP story: symbol size in px. */
  size: 16 | 24 | 32;
  /** Option B′: Hamilton link-trust overlay (non-2525 halo). */
  overlay: boolean;
  /** COP – Option B′: scenario clock in seconds (0:45 → 1:20). */
  clock: number;
}

// ---------------------------------------------------------------------------
// Matrix definition
// ---------------------------------------------------------------------------

interface Row {
  label: string;
  frame: FrameKind;
  icon: IconKind;
  designation?: string;
  echelon?: Echelon;
  sensorType: SensorType;
  /** Jammer rows are not trust-scored; the column value becomes the candidate score. */
  jammer?: 'confirmed' | 'candidate';
  selected?: boolean;
}

const ROWS: Row[] = [
  { label: 'friend · FA battery (B)', frame: 'friend', icon: 'fa', designation: 'B', echelon: 'battery', sensorType: 'offense' },
  { label: 'hostile · EW', frame: 'hostile', icon: 'ew', designation: 'H1', sensorType: 'defense' },
  { label: 'neutral · relay', frame: 'neutral', icon: 'recon', designation: 'N1', sensorType: 'recon_mobile' },
  { label: 'unknown · emitter', frame: 'unknown', icon: 'radar', designation: 'U1', sensorType: 'detection' },
  { label: 'jammer · confirmed', frame: 'hostile', icon: 'jamming', designation: 'J1', sensorType: 'defense', jammer: 'confirmed' },
  { label: 'jammer · candidate (status 1)', frame: 'hostile', icon: 'jamming', designation: 'J?', sensorType: 'defense', jammer: 'candidate' },
  { label: 'friend · SELECTED', frame: 'friend', icon: 'fa', designation: 'B', echelon: 'battery', sensorType: 'offense', selected: true },
];

const SCORES = [0.95, 0.72, 0.45, 0.2] as const;
const SIZES = [16, 24, 32] as const;

function rowProps(row: Row, score: number, option: SymbologyOption, size: number, reducedMotion: boolean): MilSymbolProps {
  return {
    option,
    frame: row.frame,
    icon: row.icon,
    sizePx: size,
    designation: row.designation,
    echelon: row.echelon,
    sensorType: row.sensorType,
    selected: row.selected,
    reducedMotion,
    ...(row.jammer
      ? {
          status: row.jammer === 'candidate' ? ('anticipated' as const) : ('present' as const),
          candidateScore: row.jammer === 'candidate' ? score : undefined,
        }
      : { score }),
  };
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

const mapSurface: CSSProperties = {
  background: 'var(--surface-base)',
  backgroundImage:
    'linear-gradient(var(--surface-elevated) 1px, transparent 1px), linear-gradient(90deg, var(--surface-elevated) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
};

const th: CSSProperties = { ...mono, color: 'var(--text-tertiary)', fontWeight: 400, padding: 'var(--space-1) var(--space-2)' };

function Matrix({ option, size, reducedMotion, margin = 20 }: { option: SymbologyOption; size: number; reducedMotion: boolean; margin?: number }) {
  return (
    <table style={{ borderCollapse: 'collapse', justifySelf: 'start', ...mapSurface }}>
      <thead>
        <tr>
          <th style={{ ...th, textAlign: 'right' }}>{size}px</th>
          {SCORES.map((s) => (
            <th key={s} style={{ ...th, color: `var(--trust-${trustBand(s)})` }}>
              {s.toFixed(2)} · {trustBand(s)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => (
          <tr key={row.label} style={{ borderTop: '1px solid var(--surface-elevated)' }}>
            <th style={{ ...th, textAlign: 'right', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{row.label}</th>
            {SCORES.map((s) => (
              <td key={s} style={{ textAlign: 'center', padding: 0 }}>
                <MilSymbolCell {...rowProps(row, s, option, size, reducedMotion)} margin={margin} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LegendSwatch({ children, label }: { children: ReactNode; label: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
      <svg width={40} height={28} viewBox="0 0 40 28" overflow="visible">
        {children}
      </svg>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}

function Legend({ option }: { option: SymbologyOption }) {
  const frames: FrameKind[] = ['friend', 'hostile', 'neutral', 'unknown'];
  return (
    <section style={{ display: 'grid', gap: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--surface-panel)', maxWidth: 980 }}>
      <h3 style={{ ...mono, margin: 0, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-tertiary)' }}>Legend</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-2)' }}>
        {frames.map((f) => (
          <LegendSwatch key={f} label={`${f} frame${option === 'B' ? ' — affiliation by shape only' : ''}`}>
            <g transform="translate(4 -2)">
              <path d={FRAME_PATH[f]} fill={option === 'A' ? `var(--sym-fill-${f})` : 'none'} stroke={option === 'C' ? 'var(--text-secondary)' : 'var(--sym-ink)'} strokeWidth={1.5} />
            </g>
          </LegendSwatch>
        ))}
        {option === 'B' &&
          (['nominal', 'watching', 'degraded', 'failed'] as const).map((b) => (
            <LegendSwatch
              key={b}
              label={
                b === 'nominal'
                  ? 'nominal ≥0.85 — solid frame'
                  : b === 'watching'
                    ? 'watching 0.60–0.85 — dash 6 2'
                    : b === 'degraded'
                      ? 'degraded 0.30–0.60 — dash 3 3 (dashed = unconfirmed)'
                      : 'failed <0.30 — dotted + APP-6 "damaged" slash'
              }
            >
              <line x1={2} x2={38} y1={14} y2={14} stroke="var(--sym-ink)" strokeWidth={1.5} strokeDasharray={BAND_DASH[b]?.join(' ')} strokeLinecap={b === 'failed' ? 'round' : 'butt'} />
            </LegendSwatch>
          ))}
        {option === 'B' && (
          <LegendSwatch label="Condition bar — length = score, colour = trust band (Hamilton extension, not APP-6)">
            <rect x={2} y={12} width={36} height={4} fill="var(--sym-ink)" opacity={0.14} />
            <rect x={2} y={12} width={16} height={4} fill={trustStrokeVar(0.45)} />
          </LegendSwatch>
        )}
        <LegendSwatch label={option === 'B' ? 'Halo below 0.60 — frame-shaped outline ring, pulses about the centre' : 'Halo below 0.60 — circular pulse (Halo Options, Option 1)'}>
          {option === 'B' ? (
            <path d={FRAME_PATH.friend} transform="translate(4 -2)" fill="none" stroke={trustStrokeVar(0.45)} strokeWidth={5} />
          ) : (
            <circle cx={20} cy={14} r={12} fill={trustStrokeVar(0.45)} fillOpacity={0.3} stroke={trustStrokeVar(0.45)} />
          )}
        </LegendSwatch>
        <LegendSwatch label="Dash 4 4 — anticipated / candidate (APP-6 status 1)">
          <line x1={2} x2={38} y1={14} y2={14} stroke="var(--sym-ink)" strokeWidth={1.5} strokeDasharray="4 4" />
        </LegendSwatch>
        <LegendSwatch label="T amplifier (left) · J = trust value, shown only below 0.60">
          <text x={0} y={18} fill="var(--sym-ink)" style={{ ...mono, fontSize: 11 }}>
            B
          </text>
          <text x={14} y={18} fill={trustStrokeVar(0.45)} style={{ ...mono, fontSize: 11 }}>
            0.45
          </text>
        </LegendSwatch>
        <LegendSwatch label="Echelon: • team · ••• platoon · | battery">
          <g fill="var(--sym-ink)">
            <circle cx={5} cy={14} r={1.5} />
            <circle cx={14} cy={14} r={1.5} />
            <circle cx={18} cy={14} r={1.5} />
            <circle cx={22} cy={14} r={1.5} />
            <rect x={32} y={9} width={1.5} height={10} />
          </g>
        </LegendSwatch>
        <LegendSwatch label="Selected — solid double frame">
          <rect x={6} y={6} width={28} height={18} fill="none" stroke="var(--sym-select)" strokeWidth={1.25} />
          <rect x={3} y={3} width={34} height={24} fill="none" stroke="var(--sym-select)" strokeWidth={1.25} />
        </LegendSwatch>
      </div>
    </section>
  );
}

const RATIONALE: Record<SymbologyOption, ReactNode> = {
  A: (
    <>
      <strong>Option A — APP-6 conformant, palette-tuned.</strong> Standard filled frames in the --sym-fill-* palette, frame + icon in
      --sym-ink-strong. Trust = opacity (floor 0.45) + dim fill below 0.60 + circular halo. Weakness: colour now carries both
      affiliation and trust; hostile fill sits near --trust-failed and neutral/hostile collide under deuteranopia (try the toggle).
    </>
  ),
  B: (
    <>
      <strong>Option B — RECOMMENDED: monochrome APP-6 frames, trust on the frame.</strong> Unfilled frames on --sym-plate in --sym-ink;
      affiliation by shape only, colour reserved for trust. Trust four ways: frame dash per band, condition bar, opacity floor 0.45,
      and a frame-shaped outline halo. Reverses Branding §5.1 (&ldquo;not 2525&rdquo;) — decision pending.
    </>
  ),
  C: (
    <>
      <strong>Option C — hybrid bespoke.</strong> APP-6 frames in the existing --affiliation-* colours with Hamilton&apos;s n-gon sensor polygon
      (track-symbol.ts) as the interior icon, opacity floor 0.45, circular halo. Shown for comparison; the polygon side count is
      expected to be illegible at 16–24px.
    </>
  ),
};

function OptionPage({ option, reducedMotion }: { option: SymbologyOption; reducedMotion: boolean }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--surface-panel)' }}>
      <p style={{ margin: 0, maxWidth: 980, fontSize: 13, color: 'var(--text-secondary)' }}>{RATIONALE[option]}</p>
      {SIZES.map((size) => (
        <Matrix key={size} option={option} size={size} reducedMotion={reducedMotion} />
      ))}
      <Legend option={option} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const SIDC_TABLE = `
| Entity | SIDC (2525D/E numeric) | Meaning |
|---|---|---|
| unit_a | 10031000111304000000 | FA observer, team (echelon assumed) |
| unit_b | 10031000151303000000 | Field artillery, battery (echelon assumed) |
| unit_c | 10031000141303025000 | FA target acquisition, platoon, radar (echelon assumed) |
| jammer (confirmed) | 10065200001102002500 | Hostile SIGINT jammer, barrage |
| candidate, barrage | 10065210001102002500 | Status 1 (anticipated) |
| candidate, swept | 10065210001102002800 | Status 1 (anticipated) |
| bearing line | 10032500002201070000 | Bearing Line – Jammer |
| NAI | 10032500001202000000 | Named Area of Interest |
| hostile_ew_1 | 10061000001505040000 | (fixture sensor_type 'defense' is wrong) |
| civ_relay | 10045200001101000000 | |
| unk_emitter | 10015200001103000000 | |
`;

const meta = {
  title: 'Explorations/Track Symbology',
  decorators: [withDeuteranopia],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { inline: true },
      description: {
        component:
          'APP-6(E) / MIL-STD-2525E track-symbology options. Rows = friend / hostile / neutral / unknown frames + jammer ' +
          '(confirmed, candidate) + one selected state; columns = trust 0.95 · 0.72 · 0.45 · 0.20; sizes 16 / 24 / 32px; dark ' +
          'map surface. Halos use the fixed, centred implementation (`.halo` → transform-box: fill-box). Text amplifiers: T left, ' +
          'J (trust) right only below 0.60, dark text outline. Toggle **deuteranopia** for the Machado 2009 simulation ' +
          '(SVG feColorMatrix decorator). Proposed tokens: `--sym-*`, `--trust-failed-stroke` (tokens.css). ' +
          '**No live renderer uses these yet** — Branding §5.1 currently says "not 2525"; the option is pending a decision.\n\n' +
          'Jammer rows are not trust-scored: the column value is used as the candidate score (J) for the candidate row and ' +
          'ignored for the confirmed row.\n\n### Proposed SIDCs\n' +
          SIDC_TABLE,
      },
    },
  },
  args: { deuteranopia: false, reducedMotion: false, phase: 'degraded', size: 24, overlay: true, clock: 75 },
  argTypes: {
    deuteranopia: { control: 'boolean' },
    reducedMotion: { control: 'boolean' },
    phase: { control: 'inline-radio', options: ['nominal', 'watching', 'degraded', 'failed'] },
    size: { control: 'inline-radio', options: [16, 24, 32] },
    overlay: { control: 'boolean', table: { disable: true } },
    clock: { control: { type: 'range', min: 45, max: 80, step: 1 }, table: { disable: true } },
  },
} satisfies Meta<SymbologyArgs>;

export default meta;
type Story = StoryObj<SymbologyArgs>;

const matrixOnly = { phase: { table: { disable: true } }, size: { table: { disable: true } } } as const;
const shown = { table: { disable: false } } as const;

export const OptionA: Story = {
  name: 'Option A — APP-6 palette-tuned',
  argTypes: matrixOnly,
  render: ({ reducedMotion }) => <OptionPage option="A" reducedMotion={reducedMotion} />,
};

export const OptionB: Story = {
  name: 'Option B — monochrome frames, trust on frame (recommended)',
  argTypes: matrixOnly,
  render: ({ reducedMotion }) => <OptionPage option="B" reducedMotion={reducedMotion} />,
};

export const OptionC: Story = {
  name: 'Option C — hybrid bespoke',
  argTypes: matrixOnly,
  render: ({ reducedMotion }) => <OptionPage option="C" reducedMotion={reducedMotion} />,
};

/** A, B, C and B′ at 24px, same rows/columns, for direct comparison. */
export const SideBySide: Story = {
  name: 'Side by side',
  argTypes: { ...matrixOnly, overlay: shown },
  render: ({ reducedMotion, overlay }) => (
    <div style={{ display: 'grid', gap: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--surface-panel)' }}>
      {(['A', 'B', 'C'] as const).map((o) => (
        <div key={o} style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <p style={{ margin: 0, maxWidth: 980, fontSize: 12, color: 'var(--text-secondary)' }}>{RATIONALE[o]}</p>
          <Matrix option={o} size={24} reducedMotion={reducedMotion} margin={12} />
        </div>
      ))}
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <p style={{ margin: 0, maxWidth: 980, fontSize: 12, color: 'var(--text-secondary)' }}>{RATIONALE_PRIME}</p>
        <MatrixPrime size={24} reducedMotion={reducedMotion} overlay={overlay} margin={4} />
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// COP – Option B: Avdiivka scene as an SVG overlay mock
// ---------------------------------------------------------------------------

const SCENE_W = 960;
const SCENE_H = 560;
const LON0 = 37.728;
const LON1 = 37.778;
const LAT0 = 48.1335;
const LAT1 = 48.1485;
const project = (lat: number, lon: number): [number, number] => [
  ((lon - LON0) / (LON1 - LON0)) * SCENE_W,
  ((LAT1 - lat) / (LAT1 - LAT0)) * SCENE_H,
];

/**
 * Mock geolocations for the three FR-04a candidates (the fixture carries
 * scores, not positions): the top-ranked candidate sits on the confirmed fix,
 * the others are spread inside the NAI.
 */
const CANDIDATE_SITES = [
  { lat: JAMMER_LOCATION.lat - 0.0012, lon: JAMMER_LOCATION.lon - 0.0035, label: 'C1' },
  { lat: JAMMER_LOCATION.lat + 0.0022, lon: JAMMER_LOCATION.lon + 0.0035, label: 'C2' },
  { lat: JAMMER_LOCATION.lat - 0.0024, lon: JAMMER_LOCATION.lon + 0.0045, label: 'C3' },
];

const UNIT_META: Record<string, { designation: string; icon: IconKind; echelon: Echelon; sidc: string }> = {
  unit_a: { designation: 'A', icon: 'fa-observer', echelon: 'team', sidc: '10031000111304000000' },
  unit_b: { designation: 'B', icon: 'fa', echelon: 'battery', sidc: '10031000151303000000' },
  unit_c: { designation: 'C', icon: 'fa-radar', echelon: 'platoon', sidc: '10031000141303025000' },
};

function Placed({ at, size, children }: { at: [number, number]; size: number; children: ReactNode }) {
  return <g transform={`translate(${at[0]} ${at[1]}) scale(${size / 32}) translate(-16 -16)`}>{children}</g>;
}

function CopScene({ phase, size, reducedMotion }: Pick<SymbologyArgs, 'phase' | 'size' | 'reducedMotion'>) {
  const tracks = Object.values(PHASE_TRACKS[phase]);
  const b = PHASE_TRACKS[phase].unit_b!;
  const bPt = project(b.lat, b.lon);
  const jPt = project(JAMMER_LOCATION.lat, JAMMER_LOCATION.lon);
  const sites = CANDIDATE_SITES.map((s) => project(s.lat, s.lon));
  const all = [jPt, ...sites];
  const cx = all.reduce((a, p) => a + p[0], 0) / all.length;
  const cy = all.reduce((a, p) => a + p[1], 0) / all.length;
  const rx = Math.max(...all.map((p) => Math.abs(p[0] - cx))) + 44;
  const ry = Math.max(...all.map((p) => Math.abs(p[1] - cy))) + 36;
  // Bearing from B to the jammer (flat-earth approximation, fine at this scale).
  const dx = (JAMMER_LOCATION.lon - b.lon) * Math.cos((b.lat * Math.PI) / 180);
  const dy = JAMMER_LOCATION.lat - b.lat;
  const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  const showCandidates = phase !== 'nominal';
  const ordered = [...CANDIDATES].sort((p, q) => q.score - p.score);

  return (
    <div style={{ padding: 'var(--space-4)', background: 'var(--surface-panel)', display: 'grid', gap: 'var(--space-3)' }}>
      <svg width={SCENE_W} height={SCENE_H} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} style={{ ...mapSurface, maxWidth: '100%', height: 'auto' }}>
        {/* NAI — control measure, ink, dashed */}
        {showCandidates && (
          <g>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="var(--sym-ink)" strokeOpacity={0.7} strokeWidth={1.25} strokeDasharray="8 5" />
            <text x={cx} y={cy - ry - 6} textAnchor="middle" fill="var(--sym-ink)" style={{ ...mono, fontSize: 11 }}>
              NAI 1 — JAMMER
            </text>
          </g>
        )}
        {/* Bearing Line – Jammer — ink, label at far end */}
        {phase !== 'nominal' && (
          <g>
            <line x1={bPt[0]} y1={bPt[1]} x2={jPt[0]} y2={jPt[1]} stroke="var(--sym-ink)" strokeOpacity={0.8} strokeWidth={1.25} />
            <text
              x={jPt[0] - 28}
              y={jPt[1] + (bPt[1] > jPt[1] ? 26 : -18)}
              textAnchor="end"
              fill="var(--sym-ink)"
              stroke="var(--surface-base)"
              strokeWidth={3}
              paintOrder="stroke"
              style={{ ...mono, fontSize: 11 }}
            >
              BRG {bearing.toFixed(0).padStart(3, '0')}° — J
            </text>
          </g>
        )}
        {/* Candidate sites — status 1 dashed hostile diamonds; only the top-ranked takes the trust colour */}
        {showCandidates &&
          ordered.map((c, i) => (
            <Placed key={c.method_id} at={sites[i]!} size={size}>
              <MilSymbol
                option="B"
                frame="hostile"
                icon="jamming"
                sizePx={size}
                status="anticipated"
                candidateScore={c.score}
                highlight={i === 0}
                designation={CANDIDATE_SITES[i]!.label}
                info={c.method_id}
                reducedMotion={reducedMotion}
              />
            </Placed>
          ))}
        {/* Confirmed jammer fix */}
        {(phase === 'degraded' || phase === 'failed') && (
          <Placed at={jPt} size={size}>
            <MilSymbol option="B" frame="hostile" icon="jamming" sizePx={size} designation="J1" reducedMotion={reducedMotion} />
          </Placed>
        )}
        {/* Own units */}
        {tracks.map((t) => {
          const m = UNIT_META[t.source_id]!;
          return (
            <Placed key={t.source_id} at={project(t.lat, t.lon)} size={size}>
              <MilSymbol
                option="B"
                frame="friend"
                icon={m.icon}
                score={t.score}
                sizePx={size}
                designation={m.designation}
                echelon={m.echelon}
                selected={t.source_id === 'unit_b' && phase !== 'nominal'}
                reducedMotion={reducedMotion}
              />
            </Placed>
          );
        })}
      </svg>
      <table style={{ borderCollapse: 'collapse', justifySelf: 'start', maxWidth: 960 }}>
        <thead>
          <tr>
            {['Entity', 'Shown as', 'SIDC', 'Score'].map((h) => (
              <th key={h} style={{ ...th, textAlign: 'left' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tracks.map((t) => (
            <tr key={t.source_id} style={{ borderTop: '1px solid var(--surface-elevated)' }}>
              <td style={th}>{t.source_id}</td>
              <td style={th}>{UNIT_META[t.source_id]?.designation} · friend</td>
              <td style={{ ...th, color: 'var(--text-secondary)' }}>{UNIT_META[t.source_id]?.sidc}</td>
              <td style={{ ...th, color: `var(--trust-${trustBand(t.score)})` }}>{t.score.toFixed(2)}</td>
            </tr>
          ))}
          {[
            ['jammer (confirmed fix)', 'J1 · hostile', '10065200001102002500', '—'],
            ['candidate · barrage', 'C1–C2 · status 1', '10065210001102002500', ordered.slice(0, 2).map((c) => c.score.toFixed(2)).join(' / ')],
            ['candidate · swept', 'C3 · status 1', '10065210001102002800', ordered[2]?.score.toFixed(2) ?? '—'],
            ['bearing line', 'B → J1', '10032500002201070000', '—'],
            ['NAI', 'NAI 1', '10032500001202000000', '—'],
          ].map(([e, s, sidc, sc]) => (
            <tr key={e} style={{ borderTop: '1px solid var(--surface-elevated)' }}>
              <td style={th}>{e}</td>
              <td style={th}>{s}</td>
              <td style={{ ...th, color: 'var(--text-secondary)' }}>{sidc}</td>
              <td style={th}>{sc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Legend option="B" />
    </div>
  );
}

/**
 * Avdiivka fixture scene (A, B, C; jammer; candidate sites in a dashed NAI;
 * bearing line) drawn with Option B as an SVG overlay mock. CesiumSpine /
 * MapSpine are NOT changed. Candidate positions are mocked around the
 * confirmed fix (the fixture has scores, not locations). Unit B is selected.
 */
export const CopOptionB: Story = {
  name: 'COP – Option B',
  render: ({ phase, size, reducedMotion }) => <CopScene phase={phase} size={size} reducedMotion={reducedMotion} />,
  parameters: {
    docs: {
      description: {
        story:
          'Option B on the Avdiivka scene. SIDCs (echelons assumed):\n' +
          SIDC_TABLE +
          '\nCandidate positions are mock (fixture carries scores only); top-ranked candidate takes the trust colour, ' +
          'the rest are ink. Bearing line and NAI are control measures in ink, not trust colour.',
      },
    },
  },
};

// ===========================================================================
// Option B′ — US MIL-STD-2525E / FM 1-02.2 conformant ("modified Option B")
// ===========================================================================

const RATIONALE_PRIME: ReactNode = (
  <>
    <strong>Option B′ — US 2525E-conformant.</strong> Monochrome standard frames that stay <em>solid</em> regardless of trust; dashes only
    for status 1 (candidate sites). No AL condition bar, no damaged slash, no frame colour. Trust travels in standard fields where the
    meaning matches — J (evaluation rating, exported), W (DTG of last good update), AR = NRT + grey frame when stale — and as the
    centred <strong>Hamilton link-trust overlay (non-2525)</strong> halo, toggleable, trust tokens only. Visible label: semantic name +
    score, J code secondary. Hover or focus a scored symbol for the factor breakdown. ROE / Excalibur gate → fire-mission popup.
  </>
);

/** Fixed "now" for the matrix / tooltip stories — the 1:20 gating beat. */
const NOW_ISO = at(41);

interface PrimeCol {
  score: number;
  stale?: boolean;
}
/** Band samples (fixtures BAND_SAMPLES): engine beats 0:00 / 0:45 / 1:15 + the synthetic DEGRADED 0.45. */
const PRIME_COLS: PrimeCol[] = [
  { score: BAND_SAMPLES.nominal },
  { score: BAND_SAMPLES.watching },
  { score: BAND_SAMPLES.degraded },
  { score: BAND_SAMPLES.failed },
  { score: BAND_SAMPLES.watching, stale: true },
];
const STALE_AGE_S = STALE_AFTER_S + 4;

function explanationFor(title: string, score: number, stale = false, neighbours = 'neighbours'): ExplanationProps {
  return {
    title,
    components: componentsFor(score),
    payloadScore: score,
    lastGoodIso: at(41 - (stale ? STALE_AGE_S : 1)),
    nowIso: NOW_ISO,
    neighbours,
    topCandidate: CANDIDATES[0],
    telemetry: telemetryFor(score),
  };
}

function MatrixPrime({ size, reducedMotion, overlay, margin = 8 }: { size: number; reducedMotion: boolean; overlay: boolean; margin?: number }) {
  return (
    <table style={{ borderCollapse: 'collapse', justifySelf: 'start', ...mapSurface }}>
      <thead>
        <tr>
          <th style={{ ...th, textAlign: 'right' }}>{size}px</th>
          {PRIME_COLS.map((c) => {
            const r = rateLinkTrust(c.score, { stale: c.stale ?? false });
            return (
              <th key={`${c.score}${c.stale ?? ''}`} style={{ ...th, color: r.labelToken }}>
                {c.score.toFixed(2)} · {r.label} {r.jCode}
                {c.stale ? ` (${STALE_AGE_S}s, NRT)` : ''}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => (
          <tr key={row.label} style={{ borderTop: '1px solid var(--surface-elevated)' }}>
            <th style={{ ...th, textAlign: 'right', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{row.label}</th>
            {PRIME_COLS.map((c) => {
              const stale = c.stale ?? false;
              const scored = !row.jammer;
              const lastGood = at(41 - (stale ? STALE_AGE_S : 1));
              return (
                <td key={`${c.score}${stale}`} style={{ padding: 0, verticalAlign: 'middle' }}>
                  <RatingCell
                    frame={row.frame}
                    icon={row.icon}
                    sizePx={size}
                    designation={row.designation}
                    echelon={row.echelon}
                    selected={row.selected}
                    overlay={overlay}
                    reducedMotion={reducedMotion}
                    margin={margin}
                    {...(scored
                      ? { score: c.score, stale, dtg: formatDtg(lastGood), explanation: explanationFor(row.label, c.score, stale) }
                      : row.jammer === 'candidate'
                        ? { status: 'anticipated' as const, info: `match ${c.score.toFixed(2)}` }
                        : {})}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const PRIME_DOCS =
  'Option B′ — US MIL-STD-2525E / FM 1-02.2 conformant. Rating scale and J mapping: `src/lib/link-trust-rating.ts` ' +
  '(single source of truth, unit-tested with `pnpm --filter @hamilton/web test`). Scores shown in tooltips are RECOMPUTED from the ' +
  'fixture components with the aggregator formula (0.6 × Σwᵢcᵢ + 0.4 × min c; weights 0.2/0.3/0.2/0.3 from ' +
  '`services/trust-engine/crates/aggregator/src/lib.rs`); a mismatch with the payload score is flagged in red inside the tooltip. ' +
  'Fingerprint is a TRUST component (1 − match strength, 1.0 = no match; PR #1); candidate scores are match strength.\n\n' +
  '### SIDCs\n' +
  SIDC_TABLE_PRIME_MD;

export const OptionBPrimeMatrix: Story = {
  name: 'Option B′ – Matrix',
  argTypes: { ...matrixOnly, overlay: shown },
  parameters: { docs: { description: { story: PRIME_DOCS } } },
  render: ({ reducedMotion, overlay }) => (
    <div style={{ display: 'grid', gap: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--surface-panel)' }}>
      <style>{TRIGGER_CSS}</style>
      <p style={{ margin: 0, maxWidth: 1080, fontSize: 13, color: 'var(--text-secondary)' }}>{RATIONALE_PRIME}</p>
      {SIZES.map((size) => (
        <MatrixPrime key={size} size={size} reducedMotion={reducedMotion} overlay={overlay} />
      ))}
      <LegendPrime />
      <SidcTablePrime />
    </div>
  ),
};

const TOOLTIP_STATES: { key: string; score: number; stale?: boolean; source: string }[] = [
  { key: 'nominal', score: BAND_SAMPLES.nominal, source: BAND_SAMPLE_SOURCE.nominal },
  { key: 'watch', score: BAND_SAMPLES.watching, source: BAND_SAMPLE_SOURCE.watching },
  { key: 'degraded', score: BAND_SAMPLES.degraded, source: BAND_SAMPLE_SOURCE.degraded },
  { key: 'unreliable', score: BAND_SAMPLES.failed, source: BAND_SAMPLE_SOURCE.failed },
  { key: 'stale', score: BAND_SAMPLES.degraded, stale: true, source: `${BAND_SAMPLE_SOURCE.degraded}, last good update ${STALE_AGE_S} s old` },
];

/**
 * Every band with its explanation forced open (static, for review), plus one
 * live symbol at the top — the play function hovers it, checks the tooltip
 * opens with the recomputed formula, closes on unhover, opens on keyboard
 * focus and closes on Escape, then leaves it open.
 */
export const OptionBPrimeRatingTooltip: Story = {
  name: 'Option B′ – Rating Tooltip',
  argTypes: { ...matrixOnly, overlay: shown },
  parameters: { docs: { description: { story: PRIME_DOCS } } },
  render: ({ reducedMotion, overlay }) => (
    <div style={{ display: 'grid', gap: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--surface-panel)' }}>
      <style>{TRIGGER_CSS}</style>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', minHeight: 120, ...mapSurface, padding: 'var(--space-3)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 220 }}>
          Live: hover, or Tab to focus, the symbol (or its label). Escape closes.
        </span>
        <RatingCell
          testId="live-trigger"
          frame="friend"
          icon="fa"
          sizePx={32}
          designation="B"
          echelon="battery"
          score={BAND_SAMPLES.failed}
          dtg={formatDtg(at(40))}
          overlay={overlay}
          reducedMotion={reducedMotion}
          explanation={explanationFor('B · FA battery', BAND_SAMPLES.failed, false, 'neighbours A, C')}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(620px, 1fr))', gap: 'var(--space-4)' }}>
        {TOOLTIP_STATES.map((st) => (
          <div key={st.key} data-testid={`tooltip-state-${st.key}`} style={{ ...mapSurface, padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}>
            <span style={{ ...mono, fontSize: 11, color: 'var(--text-tertiary)' }}>
              {st.score.toFixed(2)} — {st.source}
            </span>
            <RatingCell
              forceOpen
              frame="friend"
              icon="fa"
              sizePx={32}
              designation="B"
              echelon="battery"
              score={st.score}
              stale={st.stale}
              dtg={formatDtg(at(41 - (st.stale ? STALE_AGE_S : 1)))}
              overlay={overlay}
              reducedMotion={reducedMotion}
              explanation={explanationFor('B · FA battery', st.score, st.stale ?? false, 'neighbours A, C')}
            />
          </div>
        ))}
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByTestId('live-trigger');
    const tipId = trigger.getAttribute('aria-describedby');
    await expect(tipId).toBeTruthy();
    const tip = canvasElement.ownerDocument.getElementById(tipId!)!;
    await expect(tip).toHaveAttribute('role', 'tooltip');
    await expect(tip).not.toBeVisible();
    await userEvent.hover(trigger);
    await waitFor(() => expect(tip).toBeVisible());
    // Engine beat 1:15 (Unit B): components 0 / 0.308 / 0.6 / 0 → 0.127.
    await expect(tip).toHaveTextContent('UNRELIABLE');
    await expect(tip).toHaveTextContent('J E5');
    await expect(within(tip).getByTestId('formula')).toHaveTextContent(/= 0\.127$/);
    await expect(tip).toHaveTextContent('1.0s → 6.1s');
    await expect(tip).toHaveTextContent('0.2% → 14%');
    // Every fixture reproduces its payload score: no mismatch warning anywhere.
    await expect(canvasElement.ownerDocument.querySelectorAll('[role="alert"]')).toHaveLength(0);
    await expect(tip).toHaveTextContent('Below ROE floor 0.60 → GPS-guided fires gated');
    await userEvent.unhover(trigger);
    await waitFor(() => expect(tip).not.toBeVisible());
    // Keyboard path. element.focus() does not dispatch focus events while the
    // browser window itself is unfocused (CI / background tabs), so also fire
    // focusin (what React's onFocus listens to) explicitly.
    trigger.focus();
    fireEvent.focusIn(trigger);
    await waitFor(() => expect(tip).toBeVisible());
    fireEvent.keyDown(trigger, { key: 'Escape' });
    await waitFor(() => expect(tip).not.toBeVisible());
    await userEvent.hover(trigger);
    await waitFor(() => expect(tip).toBeVisible());
  },
};

// ---------------------------------------------------------------------------
// COP – Option B′
// ---------------------------------------------------------------------------

/**
 * Scenario clock (s) → engine beat (fixtures AVDIIVKA_BEATS, PR #1 @ 6733817). The engine holds
 * state between beats, so the clock steps:
 * 0:45 B WATCH 0.70 (cadence 1.0 s → 1.17 s, 3.4σ) → 0:55 WATCH 0.65 (CRC 0.2% → 6%) → 1:05 0.65
 * (localized, A and C 1.00) → 1:15 0.13: the 6.1 s gap, 14% CRC and the jammer fingerprint (6/6)
 * land together, B's first crossing below the ROE floor; candidates and the bearing line appear
 * (the web draws the directional vector when B < 0.60) → 1:20 call for fire: the fire-mission
 * gate holds. A and C stay at 1.00 throughout.
 */
const B_CROSSING_CLOCK = firstCrossingClock() ?? 75;
/** Branding §10.5: the call for fire / kill-chain modal beat. */
const FIRE_MISSION_CLOCK = 80;
/** Fixed J1 shown with the call for fire. */
const FIX_CLOCK = FIRE_MISSION_CLOCK;

/**
 * Clock of B's last frame before `clock`. Frames arrive at the beat's cadence (1.0 s, 1.17 s, then
 * 6.1 s from 1:15) — every gap stays under STALE_AFTER_S, so B never goes STALE in the demo.
 */
function lastFrameClock(clock: number): number {
  const beat = beatAt(clock);
  const cadence = beat.telemetry.unit_b.cadenceS;
  return beat.clockS + Math.floor((clock - beat.clockS) / cadence) * cadence;
}
const NEIGHBOURS: Record<string, string> = { unit_a: 'neighbours B, C', unit_b: 'neighbours A, C', unit_c: 'neighbours A, B' };
const UNIT_TITLE: Record<string, string> = { unit_a: 'A · FA observer team', unit_b: 'B · FA battery', unit_c: 'C · FA target-acq radar platoon' };

const isoAt = clockIso;
const fmtClock = (c: number) => `${Math.floor(c / 60)}:${String(Math.round(c % 60)).padStart(2, '0')}`;

function CopScenePrime({ clock, size, reducedMotion, overlay }: Pick<SymbologyArgs, 'clock' | 'size' | 'reducedMotion' | 'overlay'>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tips = useAnchoredTips(containerRef);
  const baseId = `cop-bprime-${useId().replace(/:/g, '')}`;
  const nowIso = isoAt(clock);
  const tracks = Object.values(PHASE_TRACKS.degraded);
  const beat = beatAt(clock);
  const units = tracks.map((t) => {
    const id = t.source_id as 'unit_a' | 'unit_b' | 'unit_c';
    const out = beat.units[id];
    const score = out.score;
    const lastGoodClock = id === 'unit_b' ? lastFrameClock(clock) : clock - 1;
    const ex: ExplanationProps = {
      title: UNIT_TITLE[t.source_id]!,
      components: { ...out.components },
      payloadScore: score,
      lastGoodIso: isoAt(lastGoodClock),
      nowIso,
      neighbours: NEIGHBOURS[t.source_id],
      topCandidate: clock >= B_CROSSING_CLOCK ? CANDIDATES[0] : undefined,
      telemetry: beat.telemetry[id],
    };
    return { t, score, ex, ...explainRating(ex) };
  });
  const b = units.find((u) => u.t.source_id === 'unit_b')!;
  const bPt = project(b.t.lat, b.t.lon);
  const jPt = project(JAMMER_LOCATION.lat, JAMMER_LOCATION.lon);
  const sites = CANDIDATE_SITES.map((st) => project(st.lat, st.lon));
  const all = [jPt, ...sites];
  const cx = all.reduce((a, p) => a + p[0], 0) / all.length;
  const cy = all.reduce((a, p) => a + p[1], 0) / all.length;
  const rx = Math.max(...all.map((p) => Math.abs(p[0] - cx))) + 44;
  const ry = Math.max(...all.map((p) => Math.abs(p[1] - cy))) + 36;
  const dx = (JAMMER_LOCATION.lon - b.t.lon) * Math.cos((b.t.lat * Math.PI) / 180);
  const dy = JAMMER_LOCATION.lat - b.t.lat;
  const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  const ordered = [...CANDIDATES].sort((p, q) => q.score - p.score);
  const showBearing = b.score < ROE_FLOOR;
  const showCandidates = clock >= B_CROSSING_CLOCK;
  const showFix = clock >= FIX_CLOCK;
  const missionRequested = clock >= FIRE_MISSION_CLOCK;
  const label: CSSProperties = { ...mono, fontSize: 11 };
  const outlined = { stroke: 'var(--surface-base)', strokeWidth: 3, paintOrder: 'stroke' as const };

  return (
    <div style={{ padding: 'var(--space-4)', background: 'var(--surface-panel)', display: 'grid', gap: 'var(--space-3)' }}>
      <style>{TRIGGER_CSS}</style>
      <div style={{ ...mono, fontSize: 12, color: 'var(--text-secondary)' }}>
        Scenario clock <span style={{ color: 'var(--text-primary)' }}>{fmtClock(clock)}</span> · {formatDtg(nowIso)} · B{' '}
        <span style={{ color: b.rating.labelToken }}>{b.rating.label}</span> {b.rating.score.toFixed(2)} (J {b.rating.jCode}) — drag the
        <em> clock</em> control (0:45 → 1:20). Hover or Tab to a unit for its rating breakdown.
        <span data-testid="cop-beat"> Engine beat: {beat.label}.</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <div ref={containerRef} style={{ position: 'relative', width: SCENE_W, maxWidth: '100%' }}>
          <svg width={SCENE_W} height={SCENE_H} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} style={{ ...mapSurface, display: 'block', maxWidth: '100%', height: 'auto' }}>
            {showCandidates && (
              <g aria-label="NAI 1 — jammer">
                <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="var(--sym-ink)" strokeOpacity={0.7} strokeWidth={1.25} strokeDasharray="8 5" />
                <text x={cx} y={cy - ry - 20} textAnchor="middle" fill="var(--sym-ink)" style={label} {...outlined}>
                  NAI 1 — JAMMER
                </text>
                <text x={cx} y={cy - ry - 6} textAnchor="middle" fill="var(--text-secondary)" style={{ ...label, fontSize: 10 }} {...outlined}>
                  T FDC-1 · W {formatDtg(isoAt(B_CROSSING_CLOCK))}
                </text>
              </g>
            )}
            {showBearing && (
              <g aria-label="Bearing line — jammer">
                <line x1={bPt[0]} y1={bPt[1]} x2={jPt[0]} y2={jPt[1]} stroke="var(--sym-ink)" strokeOpacity={0.8} strokeWidth={1.25} />
                <text x={jPt[0] - 28} y={jPt[1] - 34} textAnchor="end" fill="var(--sym-ink)" style={label} {...outlined}>
                  BRG {bearing.toFixed(0).padStart(3, '0')}° — J
                </text>
                <text x={jPt[0] - 28} y={jPt[1] - 20} textAnchor="end" fill="var(--text-secondary)" style={{ ...label, fontSize: 10 }} {...outlined}>
                  T FDC-1 · W {formatDtg(isoAt(B_CROSSING_CLOCK))}
                </text>
              </g>
            )}
            {showCandidates &&
              ordered.map((c, i) => (
                <Placed key={c.method_id} at={sites[i]!} size={size}>
                  <MilSymbolPrime
                    frame="hostile"
                    icon="jamming"
                    sizePx={size}
                    status="anticipated"
                    designation={CANDIDATE_SITES[i]!.label}
                    info={`${i === 0 ? '#1 ' : ''}${c.method_id} ${c.score.toFixed(2)}`}
                  />
                </Placed>
              ))}
            {showFix && (
              <Placed at={jPt} size={size}>
                <MilSymbolPrime frame="hostile" icon="jamming" sizePx={size} designation="J1" />
              </Placed>
            )}
            {units.map((u) => {
              const m = UNIT_META[u.t.source_id]!;
              const tipId = `${baseId}-${u.t.source_id}`;
              return (
                <g
                  key={u.t.source_id}
                  data-testid={`cop-${u.t.source_id}`}
                  aria-label={`${m.designation}: friend, link trust ${u.rating.label} ${u.rating.score.toFixed(2)}, J ${u.rating.jCode}`}
                  {...tips.trigger(u.t.source_id, tipId)}
                >
                  <Placed at={project(u.t.lat, u.t.lon)} size={size}>
                    <MilSymbolPrime
                      frame="friend"
                      icon={m.icon}
                      sizePx={size}
                      designation={m.designation}
                      echelon={m.echelon}
                      score={u.rating.score}
                      stale={u.rating.stale}
                      dtg={formatDtg(u.ex.lastGoodIso)}
                      selected={u.t.source_id === 'unit_b'}
                      overlay={overlay}
                      active={tips.open?.key === u.t.source_id}
                      reducedMotion={reducedMotion}
                    />
                  </Placed>
                </g>
              );
            })}
          </svg>
          {units.map((u) => {
            const tipId = `${baseId}-${u.t.source_id}`;
            return (
              <div key={u.t.source_id} {...tips.tip(u.t.source_id, tipId)}>
                <RatingExplanation {...u.ex} />
              </div>
            );
          })}
        </div>
        <FireMissionPopup
          target="TGT AB1001 · J1"
          observer="B"
          rating={b.rating}
          dtg={formatDtg(b.ex.lastGoodIso)}
          requested={missionRequested}
          requestedAt="1:20"
        />
      </div>
      <SidcTablePrime />
      <LegendPrime />
    </div>
  );
}

/**
 * Avdiivka scene with Option B′ (US 2525E). A, B, C; candidate sites (status 1,
 * dashed) inside the dashed NAI; confirmed fix J1; bearing line labelled with
 * T and W. The **clock** control steps through the engine beats: B WATCH 0.70
 * at 0:45, 0.65 at 0:55 / 1:05, first below the ROE floor at 1:15 (0.13), and
 * the fire-mission gate holds at the 1:20 call for fire. A and C stay at 1.00.
 * CesiumSpine / MapSpine are NOT changed.
 */
export const OptionBPrimeCop: Story = {
  name: 'COP – Option B′',
  argTypes: { phase: { table: { disable: true } }, overlay: shown, clock: shown },
  parameters: {
    docs: {
      description: {
        story:
          PRIME_DOCS +
          '\n\nCandidate positions are mock (the fixture carries scores only). Every value is the fixed engine\'s (PR #1 @ 6733817, ' +
          '`avdiivka_beats_end_to_end` on comms-sim `scenarios/avdiivka.py` telemetry; fixtures AVDIIVKA_BEATS). B timeline: ' +
          '0:00 1.00 → 0:45 0.70 WATCH (cadence 1.0 s → 1.17 s, 3.4σ; temporal 0.52, spatial localized 0.6) → 0:55 0.65 WATCH ' +
          '(CRC 0.2% → 6%; stability 0.72) → 1:05 0.65 (localized; A, C 1.00) → 1:15 0.13: 6.1 s gap (temporal 0), 14% CRC ' +
          '(stability 0.31) and the jammer fingerprint 6/6 (fingerprint trust 0) land together — first crossing below 0.60; ' +
          'candidates, NAI and bearing line appear (the web draws the directional vector when B < 0.60) → 1:20 call for fire: ' +
          'the fire-mission gate holds (ROE GATE — HOLD) and fix J1 is placed. B keeps reporting (6.1 s cadence < ' +
          'STALE_AFTER_S), so it never goes STALE here. Tooltip components are the engine\'s, so the recomputed score always ' +
          'matches the payload. Assumes PR #1 is merged.',
      },
    },
  },
  args: { clock: FIRE_MISSION_CLOCK },
  render: ({ clock, size, reducedMotion, overlay }) => <CopScenePrime clock={clock} size={size} reducedMotion={reducedMotion} overlay={overlay} />,
};
