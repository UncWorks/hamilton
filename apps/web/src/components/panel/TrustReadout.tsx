'use client';

import { trustBand } from '@/lib/trust-gradient';

interface TrustReadoutProps {
  score: number;
  roeFloor: number;
}

export function TrustReadout({ score, roeFloor }: TrustReadoutProps) {
  const band = trustBand(score);
  const formatted = score.toFixed(2);
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <div
        className="trust-readout"
        style={{
          fontSize: 'var(--text-readout)',
          fontWeight: 500,
          color: `var(--trust-${band})`,
          lineHeight: 1,
        }}
      >
        {formatted}
      </div>
      <RoeFloorIndicator score={score} roeFloor={roeFloor} />
    </div>
  );
}

function RoeFloorIndicator({ score, roeFloor }: { score: number; roeFloor: number }) {
  const above = score >= roeFloor;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-micro)',
        color: 'var(--text-tertiary)',
        letterSpacing: '0.04em',
      }}
    >
      <div
        style={{
          height: 1,
          background: 'var(--trust-roe-line)',
          opacity: 0.7,
        }}
      />
      <span style={{ color: above ? 'var(--text-tertiary)' : 'var(--gating-primary)' }}>
        ROE FLOOR · {roeFloor.toFixed(2)}
      </span>
    </div>
  );
}
