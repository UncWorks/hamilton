import { useMemo, useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import { MapSpine } from '@/components/cop/MapSpine';
import { MissionQueue } from '@/components/fires/MissionQueue';
import { CandidateCards } from '@/components/panel/CandidateCards';
import { UNIT_EVALUATION } from '@/stories/fixtures/avdiivka';
import { B_SCORES, ab1001, liveTracks, missionState, missionsRecord } from '@/stories/fixtures/missions';
import {
  AOE_CANDIDATES,
  AOE_EVAL,
  AOE_TRUTH,
  BEARINGS,
  BEAT_LABEL,
  ESTIMATES,
  ESTIMATE_AGE_S,
  FLOT_PRIOR,
  ILLUSTRATIVE_LAYERS,
  PREVIEW_METHOD_ID,
  PREVIEW_METHOD_LABEL,
  aoeTracks,
  estimateExtent,
  inMultiPolygon,
  type BeatId,
  type FitScope,
  type RxClass,
} from '@/stories/fixtures/aoe-preview';
import { AoeMapFrame } from '@/stories/support/AoeOverlay';
import { AoeAdvisoryInjector, AoeCandidateBlock, ab1001Advisories } from '@/stories/support/AoePanels';
import { AOE_RGB, VISIONS, aoeCssVars, hex, paletteChecks } from '@/stories/support/aoe-palette';
import { TrustHeartbeat } from '@/stories/support/mocks';
import { withDeuteranopia } from '@/stories/support/vision-filters';

// Previews/Jammer AoE — visual PREVIEWS of docs/plans/jammer-aoe.md. Real
// components (MapSpine over the offline basemap, the production symbol and
// declutter, MissionQueue, CandidateCards); the AoE graphics come from a
// story-only layer (src/stories/support/AoeOverlay.tsx) fed by generated,
// deterministic geometry (src/stories/fixtures/aoe-preview.ts ←
// scripts/aoe-preview/gen_fixtures.py). Nothing here is production code.

const T = { timeout: 20_000 };

interface AoeArgs {
  beat: BeatId;
  layers: RxClass[];
  showNai: boolean;
  /** Draw DF bearings (only the 1:35 beat has real ones). */
  bearings: boolean;
  /** Camera fit: the 90% AoE + tracks (proposed default) or the whole estimate incl. NAI. */
  fitScope: FitScope;
  /** Illustrative UHF / FPV layers (Pole-21-class does not cover those bands). */
  illustrative: boolean;
  /** EVALUATION ONLY: draw the hidden truth. */
  truth: boolean;
  deuteranopia?: boolean;
}

function AoePreviewMap(args: AoeArgs & { legendExtra?: ReactNode }) {
  const e = ESTIMATES[args.beat];
  const [layers, setLayers] = useState<RxClass[]>(args.layers);
  const [nai, setNai] = useState(args.showNai);
  const tracks = useMemo(() => Object.values(aoeTracks(args.beat)), [args.beat]);
  const fitPoints = useMemo(
    () => [...tracks.map((t) => ({ lat: t.lat, lon: t.lon })), ...estimateExtent(e, 'gnss_civil', args.fitScope)],
    [tracks, e, args.fitScope],
  );
  const mode = e.emitter.mode;
  // The suspected emitter goes through MapSpine's production candidate-site path: hostile EW, status 1 (dashed).
  const sites = useMemo(
    () => (mode && e.state === 'active' ? [{ lat: mode.lat, lon: mode.lon, label: 'J1?', method_id: PREVIEW_METHOD_ID }] : undefined),
    [mode, e.state],
  );
  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative', ...(aoeCssVars() as object) }}>
      <AoeMapFrame
        estimate={e}
        layers={layers}
        extraLayers={args.illustrative ? ILLUSTRATIVE_LAYERS : undefined}
        available={args.illustrative ? ['gnss_civil', 'gnss_mil', 'uhf_comms', 'fpv_link'] : ['gnss_civil', 'gnss_mil']}
        onToggle={(rx) => setLayers((l) => (l.includes(rx) ? l.filter((x) => x !== rx) : [...l, rx]))}
        showNai={nai}
        onToggleNai={() => setNai((n) => !n)}
        bearings={args.bearings ? BEARINGS : undefined}
        ageS={ESTIMATE_AGE_S[args.beat]}
        methodLabel={PREVIEW_METHOD_LABEL}
        fitPoints={fitPoints}
        truth={args.truth ? { lat: AOE_TRUTH.lat, lon: AOE_TRUTH.lon, aoe: AOE_TRUTH.aoe.gnss_civil, flot: FLOT_PRIOR } : undefined}
        legendExtra={args.legendExtra}
      >
        <MapSpine evaluations={UNIT_EVALUATION} {...(sites ? { candidateSites: sites } : {})} />
      </AoeMapFrame>
    </div>
  );
}

const base: AoeArgs = { beat: 'b115', layers: ['gnss_civil'], showNai: true, bearings: false, fitScope: 'evidence', illustrative: false, truth: false };

const meta = {
  title: 'Previews/Jammer AoE',
  render: (args) => <AoePreviewMap {...args} />,
  args: base,
  argTypes: {
    beat: { control: 'inline-radio', options: ['b115', 'b135', 'b150', 'b215'], labels: BEAT_LABEL },
    layers: { control: 'inline-check', options: ['gnss_civil', 'gnss_mil', 'uhf_comms', 'fpv_link'] },
    fitScope: { control: 'inline-radio', options: ['evidence', 'all'] },
  },
  parameters: {
    layout: 'fullscreen',
    hamilton: (args: Record<string, unknown>) => ({ tracks: aoeTracks((args.beat as BeatId | undefined) ?? 'b115') }),
    docs: {
      story: { iframeHeight: 640 },
      description: {
        component:
          '**PREVIEW — not implemented.** Visual mocks of the jammer area-of-effect (AoE) plan, `docs/plans/jammer-aoe.md`. ' +
          '**MVP scope after the 2026-10-04 plan review (§0):** the civil-GNSS 90% / 50% areas, the label, the card block and ' +
          'stale / retire. The NAI outline, the `J1?` symbol and bearings (1:35), the layer chips, "Fit to NAI" and the mission-row ' +
          'advisory shown in some stories here are **deferred**, not MVP.\n\n' +
          'Real components: **COP/MapSpine** over the offline basemap, the production track symbol and declutter, **Fires/Mission Row**, ' +
          '**Panel/CandidateCards**. The AoE graphics are a story-only layer (`src/stories/support/AoeOverlay.tsx`) portalled under ' +
          'MapSpine\'s symbol overlay; the suspected emitter goes through MapSpine\'s existing `candidateSites` path, so it is the ' +
          'production status-1 (dashed) hostile EW symbol.\n\n' +
          '**Geometry is computed, not drawn**: `scripts/aoe-preview/gen_fixtures.py` (the design worked example: two-ray + horizon ' +
          'link budget, fixed 0.25 km grid, 3 × 3 EIRP × mast hypotheses, σ 6 dB, seeded shadowing) re-parameterised with the **verified ' +
          'Pole-21E envelope** (EIRP 300–1000 W, mast ≤ 60 m, ≥125° sector; nominal C/A −125 dBm; civil loss of fix at J/S ≥ 36 dB). ' +
          'Hidden emitter: a 300 W / 10 m / west-facing module 9.6 km east of B. Eight units spread over ~16 × 11 km.\n\n' +
          '**Palette** (proposal, preview tokens in `support/aoe-palette.ts`): violet = GNSS (civil tint, military denser hatch), ' +
          'teal = UHF (hatch), magenta = FPV (cross-hatch). Never trust amber / red. 90% = fill + 2 px edge; 50% = dashed outline; ' +
          'beyond the evidence footprint = outline only. No flashing: one 300 ms fade-in, off under reduced motion.\n\n' +
          'Basemap note: the committed `make fetch-tiles` extract stops at 37.90 E; these previews were reviewed with a wider local ' +
          'extract (plan row `scripts/fetch-tiles.sh`).',
      },
    },
  },
} satisfies Meta<AoeArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

const svgReady = async (canvasElement: HTMLElement) => {
  const c = within(canvasElement);
  await waitFor(() => c.getByTestId('aoe-svg'), T);
  return c;
};

// ---------------------------------------------------------------------------
// 2–5. The beats
// ---------------------------------------------------------------------------

export const FirstEstimate: Story = {
  name: '1:15 first estimate',
  args: { beat: 'b115' },
  parameters: {
    docs: {
      description: {
        story:
          '**1:15 — first estimate** (the MVP milestone). Fingerprint 6/6, B / D / E / H degraded, C / A / F / G healthy → the engine publishes ' +
          '`integrity/emitter/estimate`. The operator sees the **civil GPS AoE** (90% tint over the friendly sector, 50% dashed edge, the ' +
          'far side outline-only = extrapolated), the dashed **NAI J1** east of the FLOT, **evidence marks** (✕ / ○ + age) under each unit, ' +
          'the label `Est. GPS denial · Pole-21-class · 90% · 3 s ago · 4 degraded / 4 healthy` and the legend. **No emitter symbol**: the ' +
          '90% emitter region is ~900 km² (> 25 km²) and there are no bearings. No bearing line, no 120 m ring. Implemented by: ' +
          '`crates/estimator` (engine), `contracts` (estimate payload), `store/hamilton.ts`, `MapSpine.tsx` / `CesiumSpine.tsx` AoE layers, ' +
          '`components/cop/AoeLegend.tsx`, `spine-symbols.ts` (symbol gate).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = await svgReady(canvasElement);
    await waitFor(() => c.getByTestId('aoe-nai'), T);
    await expect(c.getByTestId('aoe-label-gnss_civil')).toHaveTextContent(/Est\. GPS denial · Pole-21-class · 90% · 3 s ago · 4 degraded \/ 4 healthy/);
    await expect(canvasElement.querySelector('[data-cop-symbol^="__candidate"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-cop-symbol="__jammer"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-testid^="aoe-bearing-"]')).toBeNull();
    await expect(c.getByTestId('aoe-evidence-B')).toHaveAttribute('data-state', 'degraded');
    await expect(c.getByTestId('aoe-evidence-C')).toHaveAttribute('data-state', 'healthy');
  },
};

export const WithBearings: Story = {
  name: '1:35 with bearings',
  args: { beat: 'b135', bearings: true },
  parameters: {
    docs: {
      description: {
        story:
          '**1:35 — optional v3 beat**: two KrakenSDR-class DF bearings (σ 5°) from **B and H** (crossing ≈ 32°; B + C would cross at only ' +
          '~8°, below the 30° gate) plus graded C/N0. The emitter region collapses to ~9 km², so the **dashed hostile EW symbol `J1?`** ' +
          'appears at the posterior mode (production symbol, status 1 = anticipated, via `candidateSites`) with a dotted ce90 circle. ' +
          'Bearing wedges are drawn because they are real. Implemented by: `contracts` (`df/bearing`), `crates/estimator` (AOA likelihood), ' +
          '`spine-symbols.ts` (gate: ≤ 25 km² or ≥ 2 bearings).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = await svgReady(canvasElement);
    await waitFor(() => c.getByTestId('cop-symbol-__candidate_0'), T);
    const sidc = canvasElement.querySelector('[data-cop-symbol="__candidate_0"] [data-sidc]')?.getAttribute('data-sidc') ?? '';
    // 2525E status digit (position 7) = 1: anticipated / planned → dashed frame.
    await expect(sidc.charAt(6)).toBe('1');
    await expect(c.getByTestId('aoe-bearing-B')).toBeTruthy();
    await expect(c.getByTestId('aoe-bearing-H')).toBeTruthy();
  },
};

export const Tightened: Story = {
  name: '1:50 tightened',
  args: { beat: 'b150' },
  parameters: {
    docs: {
      description: {
        story:
          '**1:50 — B displaces 5 km west** and reports healthy at its new position; its earlier degraded report stays as evidence ' +
          '(faded "earlier" mark at the old position). The civil 50% AoE shrinks slightly at the near edge, the NAI shrinks ~906 → ~809 km². ' +
          'Honest result: without DF the emitter is **still not located** — "tightened" is the AoE edge and the NAI, not a fix. ' +
          '(The design said 3 km; with the verified 300 W truth B is still denied 3 km west.) Implemented by: `crates/estimator` ' +
          '(time update), `comms-sim` scenario (B waypoint).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = await svgReady(canvasElement);
    await waitFor(() => c.getByTestId('aoe-evidence-B-earlier'), T);
    await expect(c.getAllByTestId('aoe-evidence-B')[0]).toHaveAttribute('data-state', 'healthy');
  },
};

export const Stale: Story = {
  name: '2:15 stale',
  args: { beat: 'b215' },
  parameters: {
    docs: {
      description: {
        story:
          '**2:15 — jammer off**: every unit healthy, the trigger drops, the estimate is held 10 s and then marked **STALE**: outline only ' +
          '(no fills, thinner and dimmer edges), no evidence marks, label `Last est. <DTG> · …`. It retires 120 s after the last estimate or ' +
          'on dismissal (logged). Implemented by: `ticker.rs` (hysteresis), `store/hamilton.ts` (stale timer), spine AoE layers (stale style).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = await svgReady(canvasElement);
    await waitFor(() => expect(c.getByTestId('aoe-svg')).toHaveAttribute('data-state', 'stale'), T);
    await expect(canvasElement.querySelector('[data-testid^="aoe-fill90-"]')).toBeNull();
    await expect(c.getByTestId('aoe-label-gnss_civil')).toHaveTextContent(/^Last est\./);
  },
};

// ---------------------------------------------------------------------------
// 6. Receiver layers
// ---------------------------------------------------------------------------

export const ReceiverLayers: Story = {
  name: 'Receiver layers',
  args: { beat: 'b115', layers: ['gnss_civil', 'gnss_mil'], illustrative: false },
  parameters: {
    docs: {
      description: {
        story:
          'The **layer chips** (`Civil GPS · Military GPS · UHF comms · FPV link · NAI`) switch one AoE per receiver class. Military GPS ' +
          '(DAGR-class, J/S 41 dB) is a smaller core with a denser hatch; at 1:15 it has no 90% area. **UHF and FPV are disabled** for a ' +
          'Pole-21-class match (1176–1602 MHz covers neither band). Turn on the `illustrative` control to see their style on a hypothetical ' +
          'multi-band jammer (teal hatch for 5 km UHF links, magenta cross-hatch for 3 km FPV links) — labelled ILLUSTRATIVE. Implemented by: ' +
          '`components/cop/AoeLegend.tsx` (chips), `store/hamilton.ts` (layer state), estimator per-class kernels, `receivers.json` thresholds.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = await svgReady(canvasElement);
    await waitFor(() => c.getByTestId('aoe-layer-gnss_mil'), T);
    await expect(c.getByTestId('aoe-chip-uhf_comms')).toBeDisabled();
    await userEvent.click(c.getByTestId('aoe-chip-gnss_mil'));
    await waitFor(() => expect(c.queryByTestId('aoe-layer-gnss_mil')).toBeNull());
    await userEvent.click(c.getByTestId('aoe-chip-gnss_mil'));
    await waitFor(() => c.getByTestId('aoe-layer-gnss_mil'));
  },
};

export const ReceiverLayersIllustrative: Story = {
  name: 'Receiver layers · illustrative UHF / FPV',
  args: { beat: 'b135', layers: ['uhf_comms', 'fpv_link'], illustrative: true, showNai: false },
  parameters: {
    docs: {
      description: {
        story:
          'Style preview only: UHF (teal diagonal hatch, `5 km links`) and FPV (magenta cross-hatch, `3 km links`) on a **hypothetical** ' +
          'multi-band jammer at the 1:35 (DF-located) emitter posterior. Neither layer exists for the Pole-21-class match; labels say ILLUSTRATIVE.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = await svgReady(canvasElement);
    await waitFor(() => c.getByTestId('aoe-layer-uhf_comms'), T);
    await expect(c.getByTestId('aoe-layer-uhf_comms')).toHaveAttribute('data-illustrative', 'true');
  },
};

// ---------------------------------------------------------------------------
// Fit / declutter check
// ---------------------------------------------------------------------------

export const FitWholeEstimate: Story = {
  name: '1:15 · fit whole estimate (declutter check)',
  args: { beat: 'b115', fitScope: 'all' },
  parameters: {
    docs: {
      description: {
        story:
          'Camera-fit check for the km-scale AO. Framing the **whole** estimate (50% AoE + NAI, ~60 × 50 km) drops the map to ~zoom 9.6: ' +
          'the eight units crowd into ~150 px, D / H and C / B touch and evidence marks overlap neighbours, yet the production **declutter** ' +
          'does not stack them (it needs ≥ 3 symbols within 1.5 symbol widths) — a zoom-out of one more level would. Hence the plan\'s fit ' +
          'rule: frame tracks + the 90% AoE (the stories above, zoom ~11, no crowding); the NAI is framed only by an explicit "Fit to NAI". ' +
          'Implemented by: `lib/camera-fit.ts`, `MapSpine.tsx` / `CesiumSpine.tsx` fit points.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = await svgReady(canvasElement);
    await waitFor(() => expect(c.getByTestId('aoe-legend')).toHaveTextContent(/map zoom 9\.\d/), T);
  },
};

// ---------------------------------------------------------------------------
// 7. Mission row with AoE advisory
// ---------------------------------------------------------------------------

function MissionAdvisoryPreview() {
  const e = ESTIMATES.b115;
  const adv = ab1001Advisories(e);
  return (
    <TrustHeartbeat>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 600px) minmax(320px, 440px)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div style={{ background: 'var(--surface-panel)' }}>
          <MissionQueue />
          <AoeAdvisoryInjector missionId="AB1001" advisories={adv} />
        </div>
        <div style={{ display: 'grid', gap: 'var(--space-3)', background: 'var(--surface-panel)', padding: 'var(--space-6)' }}>
          <CandidateCards candidates={AOE_CANDIDATES} />
          <AoeCandidateBlock estimate={e} ageS={ESTIMATE_AGE_S.b115} advisories={adv} />
        </div>
      </div>
    </TrustHeartbeat>
  );
}

export const MissionRowAdvisory: Story = {
  name: 'Mission row with AoE advisory',
  render: () => <MissionAdvisoryPreview />,
  parameters: {
    layout: 'padded',
    engineApi: { events: [] },
    hamilton: () => ({ tracks: liveTracks(B_SCORES.e5), missions: missionsRecord(missionState(ab1001())) }),
    docs: {
      description: {
        story:
          '**1:15 panel side.** The production **MissionQueue** row for AB1001 (M982, OBS B at E5) keeps its verdict ' +
          '`TSS: FAIL — RELIABILITY E5 (min C)` — reliability stays the hard gate — and gains an **ADVISORY** from the proposed geometry ' +
          'term, evaluated on the same contours the map draws: `OBS B in est. GPS denial (90%) · TGT in est. GPS denial (civil rx, 90%)`. ' +
          'Right: the production candidate cards with the Pole-21-class match, and the proposed **Area of effect** block (areas, evidence, ' +
          'NAI, which mission points are inside, what it denies per receiver class). Implemented by: `lib/tss.ts` (+ `tss.test.ts`), ' +
          '`components/fires/MissionRow.tsx`, `components/panel/CandidateCards.tsx`.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const row = await c.findByTestId('fm-row-AB1001', {}, T);
    await waitFor(() => expect(row).toHaveTextContent('TSS: FAIL — RELIABILITY E5 (min C)'), T);
    await waitFor(() => expect(c.getByTestId('fm-aoe-advisory-AB1001')).toHaveTextContent('OBS B in est. GPS denial (90%)'), T);
    await expect(row).toHaveAttribute('data-verdict', 'FAIL');
    await expect(c.getByTestId('aoe-candidate-block')).toHaveTextContent(/not located \(no bearings\)/);
  },
};

// ---------------------------------------------------------------------------
// 8. Evaluation (truth overlay) — INTERNAL
// ---------------------------------------------------------------------------

function EvalTable() {
  const rows = (['b115', 'b135', 'b150'] as const).map((b) => {
    const e = ESTIMATES[b];
    const contained = inMultiPolygon(AOE_TRUTH, e.emitter.region90);
    return { b, contained, ...AOE_EVAL[b], gated: !!e.emitter.mode };
  });
  const td = { padding: '1px 6px', textAlign: 'right' as const };
  return (
    <table data-testid="aoe-eval-table" style={{ borderCollapse: 'collapse', fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
      <thead>
        <tr style={{ color: 'var(--text-tertiary)' }}>
          <th style={{ textAlign: 'left' }}>beat</th>
          <th style={td}>truth in 90%</th>
          <th style={td}>NAI km²</th>
          <th style={td}>mode err km</th>
          <th style={td}>IoU civil (fp)</th>
          <th style={td}>symbol</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.b} data-testid={`aoe-eval-${r.b}`} data-contained={r.contained}>
            <td>{BEAT_LABEL[r.b]}</td>
            <td style={td}>{r.contained ? 'yes' : 'NO'}</td>
            <td style={td}>{Math.round(r.area90)}</td>
            <td style={td}>{r.modeErrorKm.toFixed(1)}</td>
            <td style={td}>
              {r.iouCivil.toFixed(2)} ({r.iouCivilFootprint.toFixed(2)})
            </td>
            <td style={td}>{r.gated ? 'shown' : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const Evaluation: Story = {
  name: 'Evaluation (truth overlay)',
  args: { beat: 'b115', truth: true, fitScope: 'all' },
  render: (args) => (
    <AoePreviewMap
      {...args}
      legendExtra={
        <div style={{ borderTop: '1px solid var(--surface-elevated)', paddingTop: 4 }}>
          <div style={{ color: 'var(--text-primary)' }}>
            INTERNAL · hidden truth: {Math.round(10 ** (AOE_TRUTH.erp_dbm / 10) / 1000)} W EIRP, {AOE_TRUTH.mast_m} m mast, {AOE_TRUTH.sector_width_deg}° sector facing{' '}
            {AOE_TRUTH.sector_az_deg}° · true civil radius {AOE_TRUTH.radius_km.gnss_civil} km (dotted)
          </div>
          <EvalTable />
        </div>
      }
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          '**INTERNAL — never an operator view.** The hidden emitter (crosshair), its true **sectoral** civil denial area (dotted: the omni ' +
          'estimator cannot see the sector because every unit is inside it, so its far-side AoE over-reaches — exactly the part drawn ' +
          'outline-only), the prior FLOT, and the scenario test numbers: truth inside the 90% emitter region at every beat, region area, ' +
          'mode error, AoE IoU against truth (whole / evidence footprint) and whether the symbol gate opened. Implemented by: ' +
          '`crates/estimator/tests/golden.rs`, `comms-sim` `truth.json`, the DuckDB `eval` table.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = await svgReady(canvasElement);
    await waitFor(() => c.getByTestId('aoe-truth'), T);
    for (const b of ['b115', 'b135', 'b150']) await expect(c.getByTestId(`aoe-eval-${b}`)).toHaveAttribute('data-contained', 'true');
  },
};

// ---------------------------------------------------------------------------
// 9. Colour vision
// ---------------------------------------------------------------------------

function PaletteTable() {
  const { pairs, contrast } = paletteChecks();
  const worst = pairs.filter((p) => p.deltaE < p.min + 10).sort((a, b) => a.deltaE / a.min - b.deltaE / b.min);
  return (
    <div data-testid="aoe-palette-checks" style={{ fontSize: 10, display: 'grid', gap: 3, borderTop: '1px solid var(--surface-elevated)', paddingTop: 4 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(Object.keys(AOE_RGB) as (keyof typeof AOE_RGB)[]).map((k) => (
          <span key={k} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <span style={{ width: 10, height: 10, background: hex(AOE_RGB[k]) }} /> {k} {hex(AOE_RGB[k])} · {contrast.find((x) => x.hue === k)!.ratio.toFixed(1)}:1
          </span>
        ))}
      </div>
      <div style={{ color: 'var(--text-tertiary)' }}>Closest pairs (min ΔE76 over {VISIONS.join(' / ')}):</div>
      {worst.map((p) => (
        <div key={p.a + p.b} data-testid="aoe-palette-pair" data-kind={p.kind} data-pass={p.pass} style={{ color: p.pass ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
          {p.pass ? '✓' : '✕'} {p.a} vs {p.b}: ΔE {p.deltaE.toFixed(0)} ({p.worstVision}) · min {p.min} [{p.kind}]
        </div>
      ))}
    </div>
  );
}

export const ColourVision: Story = {
  name: 'Colour vision',
  args: { beat: 'b135', bearings: true, layers: ['gnss_civil', 'gnss_mil'], deuteranopia: true },
  decorators: [withDeuteranopia],
  render: (args) => <AoePreviewMap {...args} legendExtra={<PaletteTable />} />,
  parameters: {
    docs: {
      description: {
        story:
          'The 1:35 view (civil + military layers, NAI, DF wedges, the dashed symbol) through the existing **deuteranopia** decorator ' +
          '(Machado 2009, severity 1.0; toggle the `deuteranopia` control). The legend adds the palette checks: ΔE76 between AoE hues ' +
          '≥ 15 and against trust / gating / enemy ≥ 30 under normal, deuteranopia and protanopia; edge contrast vs `--surface-base` ' +
          '≥ 3:1. Advisory pairs (friendly blue, symbol ink) are reported, not gated: civil violet vs friendly blue falls to ΔE ≈ 7 under protanopia, ' +
          'which is acceptable only because AoE areas and friendly frames never share a mark type (open decision). ' +
          'Implemented by: `src/styles/tokens.css` (`--aoe-*`, if accepted), `scripts/basemap/contrast-check.mjs` (add the AoE colours).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = await svgReady(canvasElement);
    await waitFor(() => c.getByTestId('aoe-palette-checks'), T);
    const { pairs, contrast } = paletteChecks();
    await expect(pairs.filter((p) => p.kind !== 'advisory' && !p.pass)).toEqual([]);
    await expect(contrast.every((x) => x.pass)).toBe(true);
  },
};
