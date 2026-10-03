'use client';

// Fire-mission queue — the home of the TSS check (HS-05). Renders nothing
// while no mission is open: monitoring stays silent (HS-15, escalation
// level 0–2). Re-evaluates TSS at 1 Hz so report age and the hysteresis hold
// advance even between trust payloads.

import { useEffect, useState } from 'react';
import { sortMissions, useHamilton } from '@/store/hamilton';
import { MissionRow } from './MissionRow';
import { TssInForceStrip } from './TssInForce';

export const TSS_TICK_MS = 1000;

export function MissionQueue({ showDpPlaceholder = true }: { showDpPlaceholder?: boolean }) {
  const missions = useHamilton((s) => s.missions);
  const table = useHamilton((s) => s.tssTable);
  const selected = useHamilton((s) => s.selectedMission);
  const selectMission = useHamilton((s) => s.selectMission);
  const chooseBranch = useHamilton((s) => s.chooseBranch);
  const evaluateMissions = useHamilton((s) => s.evaluateMissions);
  const [now, setNow] = useState(() => Date.now());
  const count = Object.keys(missions).length;

  useEffect(() => {
    if (!count) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      evaluateMissions(new Date(t).toISOString());
    };
    tick();
    const id = setInterval(tick, TSS_TICK_MS);
    return () => clearInterval(id);
  }, [count, evaluateMissions]);

  if (!count) return null;
  const list = sortMissions(missions);
  const failing = list.filter((m) => m.tss?.verdict === 'FAIL').length;

  return (
    <section
      aria-label="Fire missions"
      data-testid="mission-queue"
      style={{
        display: 'grid',
        gap: 'var(--space-2)',
        padding: 'var(--space-4) var(--space-6)',
        background: 'var(--surface-panel)',
        borderLeft: '1px solid var(--surface-elevated)',
        borderBottom: '1px solid var(--surface-elevated)',
        overflowY: 'auto',
        maxHeight: '58vh',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 'var(--text-micro)',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          color: 'var(--text-tertiary)',
        }}
      >
        Fire missions · {list.length} open{failing ? ` · ${failing} TSS FAIL` : ''}
      </h2>
      <TssInForceStrip table={table} />
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-2)' }}>
        {list.map((ms) => (
          <li key={ms.mission.mission_id}>
            <MissionRow
              ms={ms}
              now={now}
              selected={selected === ms.mission.mission_id}
              onSelect={() => {
                if (selected !== ms.mission.mission_id) selectMission(ms.mission.mission_id);
              }}
              onBranch={(branch, opts) => chooseBranch(ms.mission.mission_id, branch, opts)}
              showDpPlaceholder={showDpPlaceholder && ms.tss?.verdict === 'FAIL' && !!ms.tss.gated}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
