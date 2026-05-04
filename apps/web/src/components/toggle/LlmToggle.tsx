'use client';

import type { LlmMode, LlmStatus } from '@/store/hamilton';
import { useHamilton } from '@/store/hamilton';

const OPTIONS: Array<{ id: LlmMode; label: string }> = [
  { id: 'claude', label: 'Claude' },
  { id: 'local', label: 'Local' },
  { id: 'off', label: 'Off' },
];

const STATUS_COLOR: Record<LlmStatus, string> = {
  pending: 'var(--text-tertiary)',
  active: 'var(--trust-nominal)',
  fallback: 'var(--trust-degraded)',
  unreachable: 'var(--gating-primary)',
};

export function LlmToggle() {
  const mode = useHamilton((s) => s.llmMode);
  const setMode = useHamilton((s) => s.setLlmMode);
  const status = useHamilton((s) => s.llmStatus);

  return (
    <div
      role="radiogroup"
      aria-label="LLM provider"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-1) var(--space-2)',
        background: 'var(--surface-panel)',
        borderRadius: 2,
      }}
    >
      <span
        aria-label={`status: ${status}`}
        title={`status: ${status}`}
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: STATUS_COLOR[status],
          boxShadow: `0 0 6px ${STATUS_COLOR[status]}`,
        }}
      />
      <span
        style={{
          color: 'var(--text-tertiary)',
          fontSize: 'var(--text-micro)',
          letterSpacing: '0.06em',
        }}
      >
        LLM
      </span>
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          role="radio"
          aria-checked={mode === opt.id}
          onClick={() => setMode(opt.id)}
          style={{
            padding: '2px 6px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-micro)',
            letterSpacing: '0.04em',
            color: mode === opt.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
            borderBottom:
              mode === opt.id ? '1px solid var(--gating-secondary)' : '1px solid transparent',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
