'use client';

// Admin · Demo simulation — show / hide wrapper for side-column and log blocks.
//
// RULE: HIDE, NEVER UNMOUNT (docs/plans/admin-demo-menu.md D8). The children
// stay mounted while hidden so anything that owns a timer or feeds data keeps
// running: the MissionQueue 1 Hz TSS tick (verdicts, journal, hairline) and
// the EventTerminal engine polling. Do not "optimise" this into a conditional
// render; the Pages/COP HiddenQueueStillTicks play test guards it.
//
// Shown: `display: contents`, so the wrapper generates no box and the page
// lays out exactly as without it (grid gaps, flex: 1 and empty children are
// untouched). Hidden: the `hidden` attribute (display: none, out of the a11y
// tree and tab order). The inline style is omitted when hidden so it cannot
// override the attribute.

import type { ReactNode } from 'react';
import type { DemoComponentId } from '@/lib/demo-view';
import { useDemoVisible } from '@/store/demo-view';

const SHOWN_STYLE = { display: 'contents' } as const;

export function DemoSlot({ id, children }: { id: DemoComponentId; children: ReactNode }) {
  const visible = useDemoVisible(id);
  return (
    <div
      data-demo-id={id}
      data-demo-slot={id}
      data-demo-hidden={visible ? undefined : ''}
      hidden={!visible}
      style={visible ? SHOWN_STYLE : undefined}
    >
      {children}
    </div>
  );
}
