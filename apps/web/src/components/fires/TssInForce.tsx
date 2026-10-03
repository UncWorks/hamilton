'use client';

// TSS / attack-guidance thresholds in force (assessment §3 Alternative B).
// Read-only: the table is commander-approved configuration (HS-10); an editor
// is out of scope (docs/plans/tss-mission-row.md).

import { formatDtg } from '@/lib/link-trust-rating';
import { minScoreForLetter, type TssRow, type TssTable } from '@/lib/tss';

const mono = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '0.04em',
} as const;

function short(row: TssRow): string {
  if (!row.gated) return 'not gated';
  const min = row.min_reliability ?? '—';
  const age = row.max_report_age_s === null ? '—' : `${row.max_report_age_s}s`;
  return `${min}/${age}${row.requires_risk_acceptance ? ' (risk acc.)' : ''}`;
}

const SHORT_LABEL: Record<TssRow['id'], string> = {
  gps_guided: 'GPS',
  laser_guided: 'LASER',
  unguided: 'UNGUIDED',
  hpt_exception: 'HPT EXC.',
};

/** One-line "TSS in force" strip for the mission panel. */
export function TssInForceStrip({ table }: { table: TssTable }) {
  return (
    <p
      aria-label={`Target selection standards in force: ${table.version}, approved by ${table.approver_role}`}
      style={{
        ...mono,
        margin: 0,
        color: 'var(--text-tertiary)',
        lineHeight: 1.6,
      }}
    >
      <span style={{ color: 'var(--text-secondary)' }}>TSS IN FORCE</span> · {table.version} ·{' '}
      {formatDtg(table.dtg)} · {table.approver_role} ·{' '}
      {table.rows.map((r, i) => (
        <span key={r.id}>
          {i > 0 ? ' · ' : ''}
          {SHORT_LABEL[r.id]} {short(r)}
        </span>
      ))}
    </p>
  );
}

/** Full read-only table (Storybook "TSS in force"; HS-10). */
export function TssTableView({ table }: { table: TssTable }) {
  const cell = { padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--surface-elevated)', textAlign: 'left' as const, verticalAlign: 'top' as const };
  return (
    <section aria-label="Target selection standards in force" style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: 880 }}>
      <h3
        style={{
          margin: 0,
          fontSize: 'var(--text-micro)',
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          color: 'var(--text-tertiary)',
        }}
      >
        TSS / attack guidance in force · {table.version} · {formatDtg(table.dtg)} · approved {table.approver_role}
      </h3>
      <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-body)', color: 'var(--text-secondary)' }}>
        <thead>
          <tr style={{ ...mono, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
            <th style={cell} scope="col">Munition class</th>
            <th style={cell} scope="col">Min link reliability</th>
            <th style={cell} scope="col">Max report age</th>
            <th style={cell} scope="col">Accuracy (TLE)</th>
            <th style={cell} scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => {
            const minScore = r.min_reliability ? minScoreForLetter(r.min_reliability) : undefined;
            return (
              <tr key={r.id}>
                <th scope="row" style={{ ...cell, color: 'var(--text-primary)', fontWeight: 500 }}>
                  {r.label}
                  <div style={{ ...mono, color: 'var(--text-tertiary)', fontWeight: 400 }}>{r.examples}</div>
                </th>
                <td style={{ ...cell, ...mono }}>
                  {r.min_reliability
                    ? `${r.min_reliability} (score ≥ ${minScore?.toFixed(2) ?? '?'})`
                    : 'none — never gated'}
                </td>
                <td style={{ ...cell, ...mono }}>{r.max_report_age_s === null ? '—' : `${r.max_report_age_s} s`}</td>
                <td style={{ ...cell, ...mono, color: 'var(--text-tertiary)' }}>n/a — no TLE source</td>
                <td style={cell}>{r.notes}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
