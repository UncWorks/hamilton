'use client';

import { trustBand } from '@/lib/trust-gradient';

interface TrustReadoutProps {
  score: number;
  /** TSS minimum link reliability for GPS-guided fires, as a score (C → 0.60). */
  tssMin: number;
}

export function TrustReadout({ score, tssMin }: TrustReadoutProps) {
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
      <TssMinIndicator score={score} tssMin={tssMin} />
    </div>
  );
}

function TssMinIndicator({ score, tssMin }: { score: number; tssMin: number }) {
  const above = score >= tssMin;
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
        TSS MIN · GPS · {tssMin.toFixed(2)}{above ? '' : ' · BELOW'}
      </span>
    </div>
  );
}
