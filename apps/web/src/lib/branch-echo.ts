// The web journal is the FDC's record of a branch choice; postToEngine (store)
// also persists it in the engine's after-action log, which the terminal polls.
// The engine row for a choice this console made is an echo of a journal line
// and is not listed again. Each journal line hides at most one engine row (the
// nearest in time), so a choice another console posted to the same engine —
// even the same branch on the same mission — still shows.
//
// Dependency-free (type-only imports) so it runs under `node --test`.

import type { DetectionEvent, ModalOption } from '@hamilton/contracts';

/** Engine option for a branch; accept_risk has none and stays web-side. */
export const ENGINE_OPTION: Readonly<Partial<Record<string, ModalOption>>> = {
  shift_munition: 'shift_non_gps',
  confirm_alt: 'confirm_alt_channel',
  at_my_command: 'delay_60s',
};

/** How far apart the journal DTG and the engine timestamp may be (POST latency + clock skew). */
export const ECHO_WINDOW_MS = 15_000;

export interface JournalBranch {
  kind: string;
  mission_id: string;
  branch?: string;
  dtg: string;
}

const optionOf = (e: DetectionEvent): unknown => (e.values as { option?: unknown } | null | undefined)?.option;

/** Indexes into `events` of engine rows that echo a branch in this console's journal. */
export function journalEchoes(events: readonly DetectionEvent[], journal: readonly JournalBranch[]): Set<number> {
  const hidden = new Set<number>();
  for (const j of journal) {
    if (j.kind !== 'branch' || j.branch === undefined) continue;
    const option = ENGINE_OPTION[j.branch];
    if (!option) continue;
    const tj = Date.parse(j.dtg);
    let best = -1;
    let bestDt = Infinity;
    events.forEach((e, i) => {
      if (hidden.has(i) || e.kind !== 'modal_selection' || optionOf(e) !== option) return;
      if (e.source_id.split('/')[0] !== j.mission_id) return;
      const dt = Math.abs(Date.parse(e.timestamp) - tj);
      if (dt <= ECHO_WINDOW_MS && dt < bestDt) {
        best = i;
        bestDt = dt;
      }
    });
    if (best >= 0) hidden.add(best);
  }
  return hidden;
}
