'use client';

import { useEffect, useRef, useState } from 'react';
import type { DetectionEvent } from '@hamilton/contracts';

const HTTP_BASE = (() => {
  if (typeof window === 'undefined') return '';
  return window.location.protocol + '//' + window.location.hostname + ':8080';
})();

const POLL_MS = 1_000;
const MAX_ROWS = 80;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

interface EventTerminalProps {
  height?: number;
}

export function EventTerminal({ height = 160 }: EventTerminalProps) {
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      if (paused || cancelled) return;
      try {
        const res = await fetch(`${HTTP_BASE}/api/events?limit=${MAX_ROWS}`);
        if (!res.ok) return;
        const data = (await res.json()) as DetectionEvent[];
        if (!cancelled) setEvents(data);
      } catch {
        /* engine unreachable — leave previous state in place */
      }
    };
    fetchOnce();
    const id = setInterval(fetchOnce, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [paused]);

  useEffect(() => {
    if (paused) return;
    const node = containerRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [events, paused]);

  return (
    <section
      aria-label="Event terminal"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        position: 'relative',
        background: 'var(--surface-panel)',
        borderTop: '1px solid var(--surface-elevated)',
        height,
      }}
    >
      <header
        style={{
          padding: 'var(--space-2) var(--space-4)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-micro)',
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          color: 'var(--text-tertiary)',
          display: 'grid',
          gridTemplateColumns: '1fr auto',
        }}
      >
        <span>after-action log</span>
        <span style={{ color: paused ? 'var(--gating-primary)' : 'var(--text-tertiary)' }}>
          {paused ? '⏸ paused (hover)' : 'tail-following'}
        </span>
      </header>
      <div
        ref={containerRef}
        style={{
          height: height - 32,
          overflowY: 'auto',
          padding: '0 var(--space-4) var(--space-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-micro)',
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
        }}
      >
        {events
          .slice()
          .reverse()
          .map((e, idx) => (
            <div key={`${e.timestamp}-${idx}`} style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>[{fmtTime(e.timestamp)}]</span>
              <span style={{ color: 'var(--text-primary)' }}>{e.source_id}</span>
              <span>·</span>
              <span style={{ color: kindColor(e.kind) }}>{e.kind}</span>
              <span style={{ color: 'var(--text-secondary)' }}>· {e.message}</span>
            </div>
          ))}
      </div>
    </section>
  );
}

function kindColor(kind: string): string {
  switch (kind) {
    case 'modal_gated':
    case 'modal_selection':
      return 'var(--gating-primary)';
    case 'fingerprint':
      return 'var(--trust-degraded)';
    case 'recovery':
      return 'var(--trust-nominal)';
    default:
      return 'var(--text-secondary)';
  }
}
