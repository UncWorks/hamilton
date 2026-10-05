// Admin · Demo simulation view state. A per-screen view filter: this store
// never imports or writes the domain store (useHamilton). Logic lives in
// the pure @/lib/demo-view; see docs/plans/admin-demo-menu.md (D2, D4, D6).

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import {
  FULL_VIEW,
  adminEnabled,
  applyPreset as applyPresetPure,
  hiddenCount,
  isVisible,
  layoutFor,
  resolveInitial,
  serialize,
  toggle as togglePure,
  type DemoComponentId,
  type DemoViewState,
  type PresetId,
} from '@/lib/demo-view';

export const DEMO_VIEW_STORAGE_KEY = 'hamilton.demoView.v1';

export interface DemoViewStore extends DemoViewState {
  toggle: (id: DemoComponentId) => void;
  applyPreset: (id: PresetId) => void;
  reset: () => void;
  hydrate: (s: DemoViewState) => void;
}

const pick = (s: DemoViewStore): DemoViewState => ({ v: 1, hidden: s.hidden, preset: s.preset });

export const useDemoView = create<DemoViewStore>((set, get) => ({
  ...FULL_VIEW,
  toggle: (id) => set(togglePure(pick(get()), id)),
  applyPreset: (id) => set(applyPresetPure(pick(get()), id)),
  reset: () => set({ v: 1, hidden: FULL_VIEW.hidden, preset: FULL_VIEW.preset }),
  hydrate: (s) => set({ v: 1, hidden: s.hidden, preset: s.preset }),
}));

/** True when the component and all its ancestors are shown. */
export function useDemoVisible(id: DemoComponentId): boolean {
  return useDemoView((s) => isVisible(s, id));
}

/** Grid templates for the page; selects primitives, then memoises. */
export function useDemoLayout(): ReturnType<typeof layoutFor> {
  const hidden = useDemoView((s) => s.hidden);
  const preset = useDemoView((s) => s.preset);
  return useMemo(() => layoutFor({ v: 1, hidden, preset }), [hidden, preset]);
}

/** Number of effectively hidden components (children of hidden parents included). */
export function useDemoHiddenCount(): number {
  return useDemoView((s) => hiddenCount(s));
}

function readGate(): boolean {
  return adminEnabled({
    adminEnv: process.env.NEXT_PUBLIC_ADMIN,
    nodeEnv: process.env.NODE_ENV,
    search: window.location.search,
  });
}

/** Admin gate, evaluated after mount: false on the server and first render. */
export function useAdminEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(readGate());
  }, []);
  return enabled;
}

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Hydrates once (URL → localStorage → Full) and persists changes, only in an
 * admin session. Without admin nothing is read or written and the view stays Full.
 */
export function useDemoViewPersistence(): void {
  useIsomorphicLayoutEffect(() => {
    if (!readGate()) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(DEMO_VIEW_STORAGE_KEY);
    } catch {
      stored = null;
    }
    const { hydrate } = useDemoView.getState();
    hydrate(resolveInitial({ adminEnabled: true, search: window.location.search, stored }));
    const write = (s: DemoViewState) => {
      try {
        window.localStorage.setItem(DEMO_VIEW_STORAGE_KEY, serialize(s));
      } catch {
        // storage blocked or full: the view still works for this session
      }
    };
    // Persist the resolved view so a URL-chosen view survives a reload.
    write(useDemoView.getState());
    return useDemoView.subscribe(write);
  }, []);
}
