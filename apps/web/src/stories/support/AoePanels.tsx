'use client';

// PREVIEW ONLY — panel-side AoE mocks for Previews/Jammer AoE:
// - AoeAdvisoryInjector: adds the proposed TSS geometry ADVISORY line to the
//   PRODUCTION mission row (components/fires/MissionRow.tsx) without changing
//   it. It portals into the row's TSS line; the verdict stays the reliability
//   term's (the geometry term is advisory, never a hard FAIL — design §3.4).
//   Plan: lib/tss.ts geometry term + MissionRow.tsx renders tss.advisories.
// - AoeCandidateBlock: the "Area of effect" block the plan adds to
//   components/panel/CandidateCards.tsx (design §3.3).

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { formatDtg } from '@/lib/link-trust-rating';
import {
  AB1001_TARGET,
  UNIT_BY_KEY,
  contourLevelAt,
  dbmToW,
  type AoeLayer,
  type EmitterEstimate,
} from '@/stories/fixtures/aoe-preview';
import { AOE_RGB, rgba } from './aoe-palette';

const mono: CSSProperties = { fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' };

export interface Advisory {
  /** e.g. "OBS B in est. GPS denial (90%)". */
  text: string;
  level: 0.5 | 0.9;
}

/**
 * The proposed geometry term for AB1001 (design §3.4), evaluated on the
 * contours the map draws: observer link → civil GNSS at OBS B; target for a
 * GPS-guided round → military + CRPA class (no CRPA contour exists in this
 * estimate, so the munition core is reported "outside"); FU nav → DAGR at FU A.
 */
export function ab1001Advisories(e: EmitterEstimate, obsPos: { lat: number; lon: number } = UNIT_BY_KEY.B!): Advisory[] {
  const civil = e.aoe.find((l) => l.rx_class === 'gnss_civil');
  const mil = e.aoe.find((l) => l.rx_class === 'gnss_mil');
  const out: Advisory[] = [];
  const add = (label: string, layer: AoeLayer | undefined, pt: { lat: number; lon: number }, cls: string) => {
    if (!layer) return;
    const lvl = contourLevelAt(pt, layer);
    if (lvl) out.push({ text: `${label} in est. GPS denial (${cls ? `${cls}, ` : ''}${Math.round(lvl * 100)}%)`, level: lvl });
  };
  add('OBS B', civil, obsPos, '');
  add('TGT', civil, AB1001_TARGET, 'civil rx');
  add('FU A', mil, UNIT_BY_KEY.A!, 'mil rx');
  return out;
}

/** Portals the advisory into the production row `fm-row-{missionId}`, next to the TSS headline. */
export function AoeAdvisoryInjector({ missionId, advisories }: { missionId: string; advisories: Advisory[] }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const ensure = () => {
      const row = document.querySelector(`[data-testid="fm-row-${missionId}"]`);
      const line = row?.children[1] as HTMLElement | undefined; // line 1b: chips + "TSS: …"
      if (!line) return;
      let el = line.querySelector<HTMLElement>('[data-aoe-advisory-host]');
      if (!el) {
        el = document.createElement('span');
        el.dataset.aoeAdvisoryHost = 'true';
        el.style.display = 'contents';
        line.appendChild(el);
      }
      setHost((p) => (p === el ? p : el));
    };
    ensure();
    const id = window.setInterval(ensure, 250);
    return () => window.clearInterval(id);
  }, [missionId]);
  if (!host || !advisories.length) return null;
  const hue = AOE_RGB.gnssCivil;
  return createPortal(
    <span data-testid={`fm-aoe-advisory-${missionId}`} style={{ ...mono, display: 'inline-flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
      <span aria-hidden style={{ color: 'var(--text-tertiary)' }}>·</span>
      <span
        style={{
          fontSize: 'var(--text-micro)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          padding: '0 6px',
          border: `1px solid ${rgba(hue, 1)}`,
          color: 'var(--text-primary)',
        }}
      >
        Advisory
      </span>
      <span style={{ color: 'var(--text-primary)' }}>{advisories.map((a) => a.text).join(' · ')}</span>
    </span>,
    host,
  );
}

/** "Area of effect" block for the top candidate card (design §3.3). */
export function AoeCandidateBlock({ estimate, ageS, advisories }: { estimate: EmitterEstimate; ageS: number; advisories: Advisory[] }) {
  const civil = estimate.aoe.find((l) => l.rx_class === 'gnss_civil')!;
  const mil = estimate.aoe.find((l) => l.rx_class === 'gnss_mil')!;
  const a = (l: AoeLayer, p: number) => Math.round(l.contours.find((c) => c.p === p)?.area_km2 ?? 0);
  const ev = estimate.evidence.filter((x) => !x.superseded);
  const deg = ev.filter((x) => x.state === 'degraded');
  const ok = ev.filter((x) => x.state === 'healthy');
  const w = estimate.model.hypotheses.erp_dbm.map(dbmToW);
  const row: CSSProperties = { display: 'grid', gridTemplateColumns: '92px 1fr', gap: 8 };
  const k: CSSProperties = { color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 'var(--text-micro)' };
  return (
    <section
      data-testid="aoe-candidate-block"
      aria-label="Area of effect"
      style={{ ...mono, display: 'grid', gap: 6, padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-base)', borderLeft: `2px solid ${rgba(AOE_RGB.gnssCivil, 1)}`, fontSize: 'var(--text-micro)', color: 'var(--text-secondary)', lineHeight: 1.5 }}
    >
      <div style={{ color: 'var(--text-primary)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Area of effect · preview</div>
      <div style={row}>
        <span style={k}>GPS denial</span>
        <span>
          civil rx: 90% ~{a(civil, 0.9)} km² · 50% ~{a(civil, 0.5)} km² · radius {Math.round(civil.radius_km_range[0])}–{Math.round(civil.radius_km_range[1])} km
          <br />
          mil rx: 90% {a(mil, 0.9) ? `~${a(mil, 0.9)} km²` : 'none'} · 50% ~{a(mil, 0.5)} km² · link budget, EIRP {w[0]}–{w[w.length - 1]} W (Pole-21E envelope, verified MFR claim)
        </span>
      </div>
      <div style={row}>
        <span style={k}>Evidence</span>
        <span>
          {deg.map((x) => `✕ ${x.designation} ${x.age_s}s`).join('  ')}
          {'   '}
          {ok.map((x) => `○ ${x.designation}`).join('  ')} ({ev.length} units)
        </span>
      </div>
      <div style={row}>
        <span style={k}>Emitter</span>
        <span>
          NAI J1 ~{Math.round(estimate.emitter.area90_km2)} km² —{' '}
          {estimate.emitter.mode ? `located ±${(estimate.emitter.mode.ce90_m / 1000).toFixed(1)} km (ce90, ${estimate.bearings_used} bearings)` : 'not located (no bearings)'} · est. {formatDtg(estimate.computed_at)} (age {ageS}s)
        </span>
      </div>
      <div style={row}>
        <span style={k}>Inside AoE</span>
        <span>{advisories.length ? advisories.map((x) => x.text.replace(' in est. GPS denial', '')).join(' · ') : 'no mission dependency inside'}</span>
      </div>
      <div style={row}>
        <span style={k}>Denies</span>
        <span>ATAK PLI · OBS GNSS fix · FPV GNSS hold (civil rx) · Excalibur / GMLRS: only inside a CRPA-class core — none estimated (CRPA +25 dB is an assumption)</span>
      </div>
    </section>
  );
}
