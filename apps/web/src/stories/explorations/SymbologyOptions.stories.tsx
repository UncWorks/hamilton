import type { Decorator, Meta, StoryObj } from '@storybook/react';
import type { CSSProperties, ReactNode } from 'react';
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
import { CANDIDATES, JAMMER_LOCATION, PHASE_TRACKS } from '@/stories/fixtures/avdiivka';
import { mono } from '@/stories/support/foundation-ui';

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
}

/** Machado 2009 deuteranopia, severity 1.0 — linear RGB (feColorMatrix default). */
const MACHADO_DEUTERANOPIA = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
];
const FILTER_ID = 'hamilton-deuteranopia';

const withDeuteranopia: Decorator = (Story, ctx) => {
  if (!ctx.args.deuteranopia) return <Story />;
  const values = MACHADO_DEUTERANOPIA.map((row) => `${row.join(' ')} 0 0`).join('  ') + '  0 0 0 1 0';
  return (
    <div style={{ filter: `url(#${FILTER_ID})` }}>
      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
        <filter id={FILTER_ID} colorInterpolationFilters="linearRGB">
          <feColorMatrix type="matrix" values={values} />
        </filter>
      </svg>
      <Story />
    </div>
  );
};

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
  args: { deuteranopia: false, reducedMotion: false, phase: 'degraded', size: 24 },
  argTypes: {
    deuteranopia: { control: 'boolean' },
    reducedMotion: { control: 'boolean' },
    phase: { control: 'inline-radio', options: ['nominal', 'watching', 'degraded', 'failed'] },
    size: { control: 'inline-radio', options: [16, 24, 32] },
  },
} satisfies Meta<SymbologyArgs>;

export default meta;
type Story = StoryObj<SymbologyArgs>;

const matrixOnly = { phase: { table: { disable: true } }, size: { table: { disable: true } } } as const;

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

/** A, B and C at 24px, same rows/columns, for direct comparison. */
export const SideBySide: Story = {
  name: 'Side by side',
  argTypes: matrixOnly,
  render: ({ reducedMotion }) => (
    <div style={{ display: 'grid', gap: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--surface-panel)' }}>
      {(['A', 'B', 'C'] as const).map((o) => (
        <div key={o} style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <p style={{ margin: 0, maxWidth: 980, fontSize: 12, color: 'var(--text-secondary)' }}>{RATIONALE[o]}</p>
          <Matrix option={o} size={24} reducedMotion={reducedMotion} margin={12} />
        </div>
      ))}
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
