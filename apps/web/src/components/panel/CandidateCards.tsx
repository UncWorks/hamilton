'use client';

import type { FingerprintCandidate } from '@hamilton/contracts';
import { trustBand } from '@/lib/trust-gradient';
import { methodName } from '@/lib/display-names';
import type { AoeCardModel } from '@/lib/emitter-estimate';
import { AoeCardBlock } from './AoeCardBlock';
import { DemoSlot } from '@/components/admin/DemoSlot';

interface CandidateCardsProps {
  candidates: FingerprintCandidate[];
  /**
   * FR-06a "Area of effect" block (lib/emitter-estimate aoeCard), shown in the
   * top card when the estimate's method is that card's method.
   */
  areaOfEffect?: (AoeCardModel & { method_id: string }) | null | undefined;
}

export function CandidateCards({ candidates, areaOfEffect }: CandidateCardsProps) {
  if (!candidates.length) return null;
  return (
    <section
      aria-label="Likely jamming methods"
      style={{ display: 'grid', gap: 'var(--space-3)' }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 'var(--text-micro)',
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          color: 'var(--text-tertiary)',
        }}
      >
        Likely jamming methods
      </h3>
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gap: 'var(--space-2)',
        }}
      >
        {candidates.map((c, idx) => (
          <li
            key={`${c.method_id}-${idx}`}
            className="motion-candidate-reveal"
            style={{ animationDelay: `${idx * 60}ms` }}
          >
            <CandidateCard candidate={c} areaOfEffect={idx === 0 && areaOfEffect?.method_id === c.method_id ? areaOfEffect : null} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function CandidateCard({ candidate, areaOfEffect }: { candidate: FingerprintCandidate; areaOfEffect: AoeCardModel | null }) {
  const empty = candidate.method_id === '' || candidate.score === 0;
  if (empty) {
    return (
      <article
        style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'transparent',
          border: '1px dashed var(--surface-panel)',
          borderRadius: 4,
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-micro)',
          letterSpacing: '0.06em',
        }}
      >
        — no further match
      </article>
    );
  }
  const band = trustBand(candidate.score);
  return (
    <article
      style={{
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--surface-panel)',
        borderLeft: `2px solid var(--trust-${band})`,
        display: 'grid',
        gap: 'var(--space-2)',
      }}
    >
      <header
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 'var(--space-2)',
          alignItems: 'baseline',
        }}
      >
        <div
          style={{
            fontSize: 'var(--text-body)',
            color: 'var(--text-primary)',
          }}
          data-method-id={candidate.method_id}
        >
          {methodName(candidate.method_id)}
        </div>
        <div
          className="trust-readout"
          style={{
            fontSize: 'var(--text-body)',
            color: `var(--trust-${band})`,
            fontWeight: 500,
          }}
        >
          {candidate.score.toFixed(2)}
        </div>
      </header>
      {candidate.named_systems.length > 0 && (
        <div
          style={{
            fontSize: 'var(--text-micro)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {candidate.named_systems.join(' · ')}
        </div>
      )}
      {candidate.munitions_affected.length > 0 ? (
        <div
          style={{
            fontSize: 'var(--text-body)',
            color: 'var(--text-secondary)',
          }}
        >
          Affected:{' '}
          <span style={{ color: 'var(--text-primary)' }}>
            {candidate.munitions_affected.join(', ')}
          </span>
        </div>
      ) : (
        <div
          style={{
            fontSize: 'var(--text-micro)',
            color: 'var(--text-tertiary)',
            fontStyle: 'italic',
          }}
        >
          (none in current inventory)
        </div>
      )}
      {areaOfEffect && (
        <DemoSlot id="side.aoeCard">
          <AoeCardBlock model={areaOfEffect} />
        </DemoSlot>
      )}
      <CitationHover citation={candidate.source_citation} />
    </article>
  );
}

function CitationHover({ citation }: { citation: string }) {
  return (
    <div
      title={citation}
      style={{
        marginTop: 'var(--space-1)',
        paddingTop: 'var(--space-2)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-micro)',
        color: 'var(--citation-text)',
        borderTop: '1px solid var(--citation-rule)',
        letterSpacing: '0.02em',
      }}
    >
      {citation}
    </div>
  );
}
