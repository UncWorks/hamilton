'use client';

// Beat 1:20 — THE LOAD-BEARING BEAT (Branding §10.5).
// Frame-perfect 5-frame `gating-modal-arrival` choreography.
// The subtitle is the largest, brightest line on the projector.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ModalOption } from '@hamilton/contracts';
import { useHamilton } from '@/store/hamilton';

const OPTIONS: Array<{ id: ModalOption; label: string }> = [
  { id: 'delay_60s', label: '(a) delay 60s for link recovery' },
  { id: 'shift_non_gps', label: '(b) shift to non-GPS munition' },
  { id: 'confirm_alt_channel', label: '(c) confirm B via alt channel before commit' },
];

const HTTP_BASE = (() => {
  if (typeof window === 'undefined') return '';
  return window.location.protocol + '//' + window.location.hostname + ':8080';
})();

export function KillChainGate() {
  const gateActive = useHamilton((s) => s.gateActive);
  const closeGate = useHamilton((s) => s.closeGate);
  const lastGate = useHamilton((s) => s.gateHistory.at(-1));
  const tracks = useHamilton((s) => s.tracks);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !gateActive || !lastGate) return null;

  const sourceLabel = (lastGate.source_id || '').toUpperCase();
  const score = tracks[lastGate.source_id]?.score ?? lastGate.score_at_trigger;

  const onSelect = async (option: ModalOption) => {
    closeGate(option);
    try {
      await fetch(`${HTTP_BASE}/api/modal/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: lastGate.source_id,
          option,
          trust_score_at_selection: score,
        }),
      });
    } catch {
      // After-action log unreachable — non-fatal for the demo path.
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gate-headline"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--surface-modal-scrim)',
      }}
    >
      <article
        className="motion-modal-frame"
        style={{
          background: 'var(--surface-elevated)',
          padding: 'var(--space-12) var(--space-12) var(--space-8) var(--space-12)',
          maxWidth: 720,
          width: '90vw',
          border: '1px solid var(--gating-primary)',
          boxShadow: '0 0 24px var(--gating-primary)',
          display: 'grid',
          gap: 'var(--space-6)',
        }}
      >
        <h2
          id="gate-headline"
          style={{
            margin: 0,
            fontSize: 'var(--text-modal)',
            fontWeight: 500,
            color: 'var(--text-primary)',
            letterSpacing: '0.01em',
            lineHeight: 1.1,
          }}
        >
          Trust on {sourceLabel}-position + {sourceLabel}-GPS below ROE floor.
        </h2>
        <p
          className="motion-modal-subtitle"
          style={{
            margin: 0,
            fontSize: 'var(--text-modal)',
            fontWeight: 600,
            color: 'var(--gating-primary)',
            letterSpacing: '0.01em',
            lineHeight: 1.1,
            textShadow: '0 0 12px var(--gating-primary)',
          }}
        >
          Kill-chain gated below ROE floor.
        </p>
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gap: 'var(--space-3)',
          }}
        >
          {OPTIONS.map((opt, idx) => (
            <li key={opt.id}>
              <button
                onClick={() => onSelect(opt.id)}
                className="motion-modal-frame"
                style={{
                  width: '100%',
                  padding: 'var(--space-4) var(--space-6)',
                  background: 'transparent',
                  borderLeft: '2px solid var(--gating-secondary)',
                  borderTop: '1px solid var(--surface-panel)',
                  borderRight: '1px solid var(--surface-panel)',
                  borderBottom: '1px solid var(--surface-panel)',
                  textAlign: 'left',
                  fontSize: 'var(--text-panel)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.01em',
                  cursor: 'pointer',
                  animationDelay: `${600 + idx * 80}ms`,
                  transition: 'background 200ms var(--ease-out-expo)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-panel)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      </article>
    </div>,
    document.body,
  );
}
