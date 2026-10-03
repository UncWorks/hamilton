'use client';

import { Wordmark } from './Wordmark';
import { LlmToggle } from '@/components/toggle/LlmToggle';
import { useTssFailedThisSession } from '@/store/hamilton';

const BAR_HEIGHT = 56;

export function BrandBar() {
  const tssFailed = useTssFailedThisSession();

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        height: BAR_HEIGHT,
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: 'var(--space-6)',
        padding: '0 var(--space-6)',
        background: 'var(--surface-base)',
        borderBottom: '1px solid var(--surface-panel)',
      }}
    >
      <div style={{ display: 'grid', gap: 4 }}>
        <Wordmark />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-micro)',
            color: 'var(--text-tertiary)',
            letterSpacing: 0,
          }}
        >
          link reliability for fires
        </span>
        {/* Hairline rule — Branding §8.1 / §10.6.
         * Activates when any fire mission has failed TSS this session, and
         * stays on for the rest of the session. The visual stamp of "Hamilton was on its
         * feet."
         */}
        <div
          aria-hidden
          className={tssFailed ? 'motion-hairline-extend' : undefined}
          style={{
            height: 1,
            background: 'var(--gating-primary)',
            opacity: tssFailed ? 0.6 : 0,
            transition: 'opacity 240ms var(--ease-out-expo)',
          }}
        />
      </div>
      <div />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-micro)',
          color: 'var(--text-tertiary)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        <LlmToggle />
        <span aria-label="Operator">FDC · ADAM</span>
      </div>
    </header>
  );
}
