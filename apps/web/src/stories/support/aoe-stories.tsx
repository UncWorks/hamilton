'use client';

// Shared harness for the production AoE stories on COP/MapSpine and
// COP/CesiumSpine (plan W25 / §5.4): the store is seeded with the 8-unit
// tracks of a beat, the frozen CP1 estimate (packages/contracts/fixtures/aoe,
// via fixtures/avdiivka.ts), AB1001 and the FR-04a candidates; the frame
// draws the spine beside the real TrustPanel, whose top candidate card
// carries the Area of effect block. Play functions assert plan §5.4.

import { useEffect, type ReactNode } from 'react';
import { expect, waitFor, within } from '@storybook/test';
import { TrustPanel } from '@/components/panel/TrustPanel';
import { useHamilton } from '@/store/hamilton';
import { payloadClockIso, reduceEstimate, terminalLine } from '@/lib/emitter-estimate';
import {
  CANDIDATES,
  EMITTER_ESTIMATE_B115,
  EMITTER_ESTIMATE_B150,
  EMITTER_ESTIMATE_B215_STALE,
  EMITTER_ESTIMATE_UNBOUNDED,
  aoeBeatTracks,
  clockIso,
  estimateEntry,
  type AoeBeat,
} from '@/stories/fixtures/avdiivka';
import { AB1001_AT_CLOCK_S, ab1001, missionState, missionsRecord } from '@/stories/fixtures/missions';
import type { HamiltonSeed } from './mocks';
import { paletteChecks } from './aoe-palette';

export type AoeStoryBeat = AoeBeat | 'unbounded';

const PAYLOAD = {
  b115: EMITTER_ESTIMATE_B115,
  b150: EMITTER_ESTIMATE_B150,
  b215: EMITTER_ESTIMATE_B215_STALE,
  unbounded: EMITTER_ESTIMATE_UNBOUNDED,
} as const;

/** Store seed for a beat (a function: the receipt time is the story's own clock). */
export function aoeSeed(beat: AoeStoryBeat): () => HamiltonSeed {
  return () => {
    const entry = estimateEntry(PAYLOAD[beat], beat === 'b150' ? 4 : 3);
    const step = reduceEstimate({ entry: null, state: null }, { type: 'receive', payload: entry.payload, nowMs: entry.receivedAtMs });
    const tracks = aoeBeatTracks(beat === 'unbounded' ? 'b115' : beat);
    const mission = ab1001(clockIso(AB1001_AT_CLOCK_S));
    return {
      tracks,
      candidates: { source_id: 'unit_b', items: CANDIDATES },
      selectedSource: 'unit_b',
      missions: missionsRecord(missionState(mission)),
      emitterEstimate: entry,
      emitterState: step.state,
      emitterLog: step.log
        ? [
            {
              id: `seed-${beat}`,
              dtg: payloadClockIso(entry, entry.receivedAtMs),
              kind: step.log.kind,
              estimate_id: entry.payload.estimate_id,
              message: terminalLine(step.log.kind, entry, Object.values(tracks), [mission]),
            },
          ]
        : [],
    };
  };
}

/**
 * Stand-in for the engine's 10 s heartbeat while the story is open: re-stamps
 * the receipt of an ACTIVE estimate so it does not go stale on the C2 clock
 * after 20 s (that path is unit-tested in emitter-estimate.test.ts).
 */
export function EstimateHeartbeat() {
  useEffect(() => {
    const id = window.setInterval(() => {
      const e = useHamilton.getState().emitterEstimate;
      if (e && e.payload.state === 'active') useHamilton.setState({ emitterEstimate: { ...e, receivedAtMs: Date.now() - 3000 } });
    }, 10_000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}

/** Spine (left, given the store's estimate) + the real TrustPanel (right). */
export function AoeStoryFrame({ spine }: { spine: (emitterEstimate: ReturnType<typeof useHamilton.getState>['emitterEstimate']) => ReactNode }) {
  const emitterEstimate = useHamilton((s) => s.emitterEstimate);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(340px, 1fr)', height: '100vh', width: '100%' }}>
      <EstimateHeartbeat />
      <div style={{ position: 'relative', minHeight: 0 }} data-testid="aoe-story-spine">
        {spine(emitterEstimate)}
      </div>
      <div style={{ minHeight: 0, overflow: 'hidden' }}>
        <TrustPanel />
      </div>
    </div>
  );
}

const T = { timeout: 20_000 };
const NEVER = /clear|window open/i;

async function common(canvasElement: HTMLElement) {
  const c = within(canvasElement);
  const layer = await waitFor(() => c.getByTestId('aoe-layer'), T);
  // HS-20: no jammer symbol, ring or bearing — the only map graphics are the area's.
  await expect(canvasElement.querySelector('[data-symbol-id^="__jammer"], [data-symbol-id^="__candidate"]')).toBeNull();
  return { c, layer };
}

export const aoePlay = {
  /** 1:15: civil 90% + 50% drawn, label, card strings, B ✕ / C ○. */
  b115: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const { c, layer } = await common(canvasElement);
    await waitFor(() => expect(layer.getAttribute('data-layers')).toBe('fill90-gnss_civil edge90-gnss_civil edge50-gnss_civil'), T);
    await expect(layer).toHaveAttribute('data-state', 'active');
    const label = await waitFor(() => c.getByTestId('aoe-label'), T);
    await expect(label.textContent).toMatch(/^Est\. GPS denial · Pole-21-class · 90% · \d+ s ago · 4 degraded \/ 4 healthy$/);
    await expect(c.getByTestId('aoe-key')).toBeTruthy();
    const card = await waitFor(() => c.getByTestId('aoe-card-block'), T);
    const text = card.textContent ?? '';
    await expect(text).toContain('Inside: OBS B (AB1001 observer) — 90%');
    await expect(text).toContain('Emitter not located (90% region ~906 km²)');
    await expect(text).toContain('UHF links: not assessed — ground GNSS only');
    await expect(text).toContain('M982 in flight: not assessed — ground receivers only');
    await expect(card.querySelector('[data-evidence="B"]')).toHaveAttribute('data-state', 'degraded');
    await expect(card.querySelector('[data-evidence="C"]')).toHaveAttribute('data-state', 'healthy');
  },
  /** 1:50: still active; B's old degraded report and its new healthy one are both listed. */
  b150: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const { c, layer } = await common(canvasElement);
    await waitFor(() => expect(layer.getAttribute('data-layers')).toContain('fill90-gnss_civil'), T);
    const card = await waitFor(() => c.getByTestId('aoe-card-block'), T);
    const b = [...card.querySelectorAll('[data-evidence="B"]')].map((x) => x.textContent);
    await expect(b).toEqual(['✕ B 39s', '○ B 2s']);
    await expect(card.textContent).toContain('Emitter not located (90% region ~809 km²)');
  },
  /** 2:15 stale: outline only, "Last est.", never "clear" / "window open". */
  b215: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const { c, layer } = await common(canvasElement);
    await expect(layer).toHaveAttribute('data-state', 'stale');
    await waitFor(() => expect(layer.getAttribute('data-layers')).toBe('edge90-gnss_civil edge50-gnss_civil'), T);
    await expect(c.getByTestId('aoe-label').textContent).toMatch(/^Last est\. \d{4}Z/);
    const card = await waitFor(() => c.getByTestId('aoe-card-block'), T);
    await expect(card.textContent).toContain('Last est.');
    await expect(canvasElement.textContent ?? '').not.toMatch(NEVER);
  },
  /** Every reporting unit degraded: "edge not observed", nothing drawn, no label. */
  unbounded: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const { c, layer } = await common(canvasElement);
    await expect(layer).toHaveAttribute('data-state', 'unbounded');
    await expect(layer.getAttribute('data-layers')).toBe('');
    await expect(c.queryByTestId('aoe-label')).toBeNull();
    const card = await waitFor(() => c.getByTestId('aoe-card-block'), T);
    await expect(card.textContent).toContain('edge not observed');
  },
};

// ---------------------------------------------------------------------------
// Colour vision (converted from Previews/Jammer AoE → Colour vision)
// ---------------------------------------------------------------------------

/** Production palette checks (FR-06a (4)): GNSS hues only, as shipped in tokens.css. */
export function gnssPaletteChecks() {
  const { pairs, contrast } = paletteChecks();
  const gnss = (h: string) => h === 'gnssCivil' || h === 'gnssMil';
  return { pairs: pairs.filter((p) => gnss(p.a) && (p.kind !== 'aoe' || gnss(p.b))), contrast: contrast.filter((x) => gnss(x.hue)) };
}

export function GnssPaletteTable() {
  const { pairs, contrast } = gnssPaletteChecks();
  const worst = [...pairs].sort((a, b) => a.deltaE / a.min - b.deltaE / b.min).slice(0, 8);
  return (
    <aside
      data-testid="aoe-palette-checks"
      style={{ position: 'absolute', top: 12, left: 12, zIndex: 6, maxWidth: 420, padding: '6px 10px', background: 'oklch(14% 0.01 250 / 0.9)', border: '1px solid var(--surface-elevated)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', display: 'grid', gap: 3 }}
    >
      <div style={{ color: 'var(--text-primary)' }}>
        {contrast.map((x) => `${x.hue} ${x.ratio.toFixed(1)}:1 vs --surface-base`).join(' · ')} (basemap pixels: scripts/basemap/contrast-check.mjs)
      </div>
      <div>Closest pairs, min ΔE76 over normal / deuteranopia / protanopia:</div>
      {worst.map((p) => (
        <div key={p.a + p.b} data-testid="aoe-palette-pair" data-kind={p.kind} data-pass={p.pass}>
          {p.pass ? '✓' : '✕'} {p.a} vs {p.b}: ΔE {p.deltaE.toFixed(0)} ({p.worstVision}) · min {p.min} [{p.kind}]
        </div>
      ))}
    </aside>
  );
}

export const colourVisionPlay = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const c = within(canvasElement);
  await waitFor(() => c.getByTestId('aoe-layer'), T);
  await waitFor(() => c.getByTestId('aoe-palette-checks'), T);
  const { pairs, contrast } = gnssPaletteChecks();
  await expect(pairs.filter((p) => p.kind !== 'advisory' && !p.pass)).toEqual([]);
  await expect(contrast.every((x) => x.pass)).toBe(true);
};
