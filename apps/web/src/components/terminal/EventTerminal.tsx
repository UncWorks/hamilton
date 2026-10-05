'use client';

import { useEffect, useRef, useState } from 'react';
import type { DetectionEvent } from '@hamilton/contracts';
import { useHamilton, type DecisionLogEntry, type EmitterLogEntry } from '@/store/hamilton';
import { engineUrl } from '@/lib/engine-api';
import { eventKind, eventMessage, eventWho } from '@/lib/display-names';


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

/** Engine kinds are relabelled in lib/display-names (the wire enum is the engine's). */
const JOURNAL_KIND_LABEL: Record<DecisionLogEntry['kind'], string> = {
  received: 'call for fire',
  tss: 'TSS',
  branch: 'branch',
  re_rate: 're-rate',
  confirmation: 'confirmation',
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
    kind: JOURNAL_KIND_LABEL[e.kind],
    message: `${e.message}${facts}`,
    journal: true,
  };
}

/** C2-side estimate state change (HS-24): one line per state, from the store (lib/emitter-estimate terminalLine). */
function estimateRow(e: EmitterLogEntry): TerminalRow {
  return { timestamp: e.dtg, who: 'C2', kind: 'est. GPS denial', message: e.message, journal: true };
}

export function EventTerminal({ height = 160 }: EventTerminalProps) {
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const journal = useHamilton((s) => s.decisionLog);
  const estimateLog = useHamilton((s) => s.emitterLog);
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
  }, [events, journal, estimateLog, paused]);

  // Engine log (newest-first) + FDC journal + estimate lines, oldest-first for display.
  // The engine's own `emitter_estimate` rows are the after-action record; the
  // terminal shows the C2's line for the same change instead (it names who is
  // inside and includes the C2-side stale), so they are not listed twice.
  const rows: TerminalRow[] = [
    ...events.filter((e) => e.kind !== 'emitter_estimate' || estimateLog.length === 0).map((e) => ({
      timestamp: e.timestamp,
      who: eventWho(e.source_id),
      kind: eventKind(e.kind),
      message: eventMessage(e),
      journal: false,
    })),
    ...journal.map(journalRow),
    ...estimateLog.map(estimateRow),
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
        <span>After-action log</span>
        <span style={{ color: paused ? 'var(--gating-primary)' : 'var(--text-tertiary)' }}>
          {paused ? '⏸ paused (hover)' : 'live'}
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
    case 'TSS fail':
    case 'TSS':
    case 'branch':
    case 're-rate':
      return 'var(--gating-primary)';
    case 'jammer match':
      return 'var(--trust-degraded)';
    case 'est. GPS denial':
      return 'var(--aoe-gnss-civil)';
    case 'recovery':
      return 'var(--trust-nominal)';
    default:
      return 'var(--text-secondary)';
  }
}
