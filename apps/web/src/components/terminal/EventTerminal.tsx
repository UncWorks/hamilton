'use client';

import { useEffect, useRef, useState } from 'react';
import type { DetectionEvent } from '@hamilton/contracts';
import { useHamilton, type DecisionLogEntry } from '@/store/hamilton';
import { engineUrl } from '@/lib/engine-api';


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

/** A terminal line: an engine DetectionEvent or a web-side FDC journal entry. */
interface TerminalRow {
  timestamp: string;
  who: string;
  kind: string;
  message: string;
  journal: boolean;
}

/**
 * Display labels for engine kinds whose wire names predate the TSS row
 * (the wire enum is the engine's; renaming it is an engine change —
 * docs/plans/tss-mission-row.md).
 */
const KIND_LABEL: Record<string, string> = {
  modal_gated: 'tss_fail',
  modal_selection: 'branch',
};

function journalRow(e: DecisionLogEntry): TerminalRow {
  const who = e.role ? ` · ${e.role}/${e.initials ?? ''}` : '';
  const facts =
    e.kind === 'branch'
      ? ` · TSS ${e.verdict ?? '—'} · J ${e.j ?? '—'} · age ${e.report_age_s ?? '—'}s${who}`
      : who;
  return {
    timestamp: e.dtg,
    who: `FM ${e.mission_id}`,
    kind: e.kind === 'branch' ? 'branch' : e.kind === 're_rate' ? 're-rate' : e.kind === 'received' ? 'call for fire' : e.kind,
    message: `${e.message}${facts}`,
    journal: true,
  };
}

export function EventTerminal({ height = 160 }: EventTerminalProps) {
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const journal = useHamilton((s) => s.decisionLog);
  const [paused, setPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      if (paused || cancelled) return;
      try {
        const res = await fetch(engineUrl('events', `?limit=${MAX_ROWS}`));
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
  }, [events, journal, paused]);

  // Engine log (newest-first) + FDC journal, oldest-first for display.
  const rows: TerminalRow[] = [
    ...events.map((e) => ({
      timestamp: e.timestamp,
      who: e.source_id,
      kind: KIND_LABEL[e.kind] ?? e.kind,
      message: e.message,
      journal: false,
    })),
    ...journal.map(journalRow),
  ]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-MAX_ROWS);

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
        {rows.map((e, idx) => (
          <div
            key={`${e.timestamp}-${idx}`}
            data-journal={e.journal ? 'true' : undefined}
            style={{ display: 'flex', gap: 'var(--space-3)' }}
          >
            <span style={{ color: 'var(--text-tertiary)', flex: 'none' }}>[{fmtTime(e.timestamp)}]</span>
            <span style={{ color: 'var(--text-primary)', flex: 'none' }}>{e.who}</span>
            <span>·</span>
            <span style={{ color: kindColor(e.kind), flex: 'none' }}>{e.kind}</span>
            <span style={{ color: 'var(--text-secondary)' }}>· {e.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function kindColor(kind: string): string {
  switch (kind) {
    case 'tss_fail':
    case 'tss':
    case 'branch':
    case 're-rate':
      return 'var(--gating-primary)';
    case 'fingerprint':
      return 'var(--trust-degraded)';
    case 'recovery':
      return 'var(--trust-nominal)';
    default:
      return 'var(--text-secondary)';
  }
}
