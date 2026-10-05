'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { aoeCard, displayStateAt, type AoeCardModel, type AoeDisplayState, type EstimateEntry } from '@/lib/emitter-estimate';
import { useHamilton } from '@/store/hamilton';
import { AOE_FADE_MS } from '@/lib/aoe-style';

/** Wall clock, re-read every `periodMs` (age label, C2-side stale). */
export function useNowMs(periodMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), periodMs);
    return () => window.clearInterval(id);
  }, [periodMs]);
  return now;
}

/** The estimate as the COP shows it now: display state on the C2's own clock. */
export function useEstimateView(entry: EstimateEntry | null | undefined): { entry: EstimateEntry | null; state: AoeDisplayState | null; nowMs: number } {
  const nowMs = useNowMs(1000);
  const e = entry ?? null;
  return { entry: e, state: displayStateAt(e, Math.max(nowMs, e?.receivedAtMs ?? 0)), nowMs: Math.max(nowMs, e?.receivedAtMs ?? 0) };
}

/**
 * One opacity fade-in (0 → 1 over ≤ 300 ms) each time a new estimate episode
 * appears (FR-06a (5)); 1 at once under reduced motion. No flashing, no loop.
 */
export function useAoeFade(episodeKey: string | null, reducedMotion: boolean): number {
  const [opacity, setOpacity] = useState(1);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!episodeKey || seen.current === episodeKey) return;
    seen.current = episodeKey;
    if (reducedMotion) {
      setOpacity(1);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / AOE_FADE_MS);
      setOpacity(k);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    setOpacity(0);
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      setOpacity(1);
    };
  }, [episodeKey, reducedMotion]);
  return opacity;
}

/** The card block for the store's estimate (null when nothing is shown). */
export function useAoeCard(): (AoeCardModel & { method_id: string }) | null {
  const entry = useHamilton((s) => s.emitterEstimate);
  const tracks = useHamilton((s) => s.tracks);
  const missions = useHamilton((s) => s.missions);
  const { state, nowMs } = useEstimateView(entry);
  return useMemo(() => {
    if (!entry || !state) return null;
    const model = aoeCard(entry, state, nowMs, Object.values(tracks), Object.values(missions).map((m) => m.mission));
    return { ...model, method_id: entry.payload.method_id };
  }, [entry, state, nowMs, tracks, missions]);
}
