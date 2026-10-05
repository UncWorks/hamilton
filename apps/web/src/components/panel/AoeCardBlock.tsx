'use client';

// The "Area of effect" block of the top candidate card (plan W15, FR-06a
// output, HS-21 / HS-22 / HS-25). Every string comes from
// lib/emitter-estimate aoeCard (unit-tested): evidence ✕ degraded / ○ healthy
// with ages; "Inside: OBS B (AB1001 observer) — 90%", GPS-dependent first
// (civil, then DAGR); "Emitter not located (90% region ~N km²)"; "UHF links:
// not assessed — ground GNSS only"; "M982 in flight: not assessed — ground
// receivers only"; unbounded → "edge not observed"; stale → "Last est.
// HHMMZ". Never "clear" or "window open".

import type { CSSProperties } from 'react';
import type { AoeCardModel } from '@/lib/emitter-estimate';
import { AOE_RGB, cssRgb } from '@/lib/aoe-style';

const mono: CSSProperties = { fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' };

export function AoeCardBlock({ model }: { model: AoeCardModel }) {
  const stale = model.state === 'stale';
  return (
    <section
      data-testid="aoe-card-block"
      data-state={model.state}
      aria-label="Area of effect"
      style={{
        ...mono,
        display: 'grid',
        gap: 4,
        padding: 'var(--space-2) var(--space-3)',
        background: 'var(--surface-base)',
        borderLeft: `2px ${stale ? 'dashed' : 'solid'} ${cssRgb(AOE_RGB.gnss_civil)}`,
        fontSize: 'var(--text-micro)',
        color: 'var(--text-secondary)',
        lineHeight: 1.5,
        minWidth: 0,
        overflowWrap: 'anywhere',
      }}
    >
      <div data-testid="aoe-card-title" style={{ color: 'var(--text-primary)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {model.title}
      </div>
      <div data-testid="aoe-card-evidence" aria-label="Evidence: ✕ degraded, ○ healthy, with report age" style={{ display: 'flex', flexWrap: 'wrap', columnGap: 10, minWidth: 0 }}>
        {model.evidence.map((e) => (
          <span
            key={e.key}
            data-evidence={e.designation}
            data-state={e.state}
            style={{ color: e.state === 'degraded' ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}
          >
            {e.text}
          </span>
        ))}
      </div>
      {model.lines.map((l) => (
        <div key={l.key} data-aoe-line={l.key} style={{ color: l.key === 'inside' ? 'var(--text-primary)' : undefined }}>
          {l.text}
        </div>
      ))}
    </section>
  );
}
