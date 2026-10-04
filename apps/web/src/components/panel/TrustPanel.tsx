'use client';

import { useHamilton } from '@/store/hamilton';
import { minScoreForLetter, tssRow } from '@/lib/tss';
import { UNIT_ROLES, sensorTypeLabel, unitName } from '@/lib/display-names';
import { TrustReadout } from './TrustReadout';
import { CandidateCards } from './CandidateCards';

export function TrustPanel() {
  const tracks = useHamilton((s) => s.tracks);
  const selectedSource = useHamilton((s) => s.selectedSource);
  const candidates = useHamilton((s) => s.candidates);
  const tssTable = useHamilton((s) => s.tssTable);
  const gpsMin = tssRow(tssTable, 'gps_guided').min_reliability;
  const tssMin = (gpsMin && minScoreForLetter(gpsMin)) ?? 0.6;

  const focused =
    (selectedSource && tracks[selectedSource]) ??
    Object.values(tracks).sort((a, b) => a.score - b.score)[0];

  if (!focused) {
    return (
      <aside
        aria-label="Trust panel"
        style={{
          padding: 'var(--space-6)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-micro)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Awaiting telemetry…
      </aside>
    );
  }

  const candidatesForFocused =
    candidates && candidates.source_id === focused.source_id ? candidates.items : [];

  return (
    <aside
      aria-label={`Trust panel for ${unitName(focused.source_id)}`}
      style={{
        display: 'grid',
        gap: 'var(--space-6)',
        padding: 'var(--space-6)',
        background: 'var(--surface-panel)',
        borderLeft: '1px solid var(--surface-elevated)',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <header style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--text-panel)',
            fontWeight: 500,
            color: 'var(--text-primary)',
            letterSpacing: '0.04em',
          }}
        >
          {unitName(focused.source_id)}
        </h2>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-micro)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.08em',
          }}
        >
          {focused.affiliation.toUpperCase()} · {UNIT_ROLES[focused.source_id] ?? sensorTypeLabel(focused.sensor_type)}
        </span>
      </header>

      <TrustReadout score={focused.score} tssMin={tssMin} />

      <TraceBullets bullets={focused.trace_bullets} />

      <CandidateCards candidates={candidatesForFocused} />
    </aside>
  );
}

function TraceBullets({ bullets }: { bullets: string[] }) {
  if (!bullets.length) return null;
  return (
    <section aria-label="Trust trace">
      <h3
        style={{
          margin: '0 0 var(--space-2) 0',
          fontSize: 'var(--text-micro)',
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          color: 'var(--text-tertiary)',
        }}
      >
        Trust trace
      </h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-2)' }}>
        {bullets.map((bullet, idx) => (
          <li
            key={idx}
            style={{
              borderLeft: '2px solid var(--gating-secondary)',
              paddingLeft: 'var(--space-3)',
              fontSize: 'var(--text-body)',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            {bullet}
          </li>
        ))}
      </ul>
    </section>
  );
}
