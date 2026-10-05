'use client';

// Admin trigger + shortcut listener (docs/plans/admin-demo-menu.md D6, D7).
// Mounted by BrandBar ONLY when the admin gate is open, so in an operator
// build there is no trigger, no keydown listener, and the panel chunk below
// is never requested.

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ADMIN_SHORTCUT_LABEL, matchAdminShortcut } from '@/lib/demo-view';
import { useDemoView } from '@/store/demo-view';

const AdminPanel = dynamic(() => import('./AdminPanel').then((m) => m.AdminPanel), { ssr: false });

export const ADMIN_PANEL_ID = 'admin-panel';

export interface AdminMenuProps {
  /** Start open (stories only). */
  defaultOpen?: boolean;
}

export function AdminMenu({ defaultOpen = false }: AdminMenuProps) {
  const [open, setOpen] = useState(defaultOpen);
  const openRef = useRef(open);
  openRef.current = open;
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The element that had focus before the panel opened (may be a mission row).
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const openPanel = useCallback(() => {
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : triggerRef.current;
    setOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    const el = target && target.isConnected ? target : triggerRef.current;
    el?.focus();
  }, []);

  const togglePanel = useCallback(() => {
    if (openRef.current) closePanel();
    else openPanel();
  }, [closePanel, openPanel]);

  // Window shortcuts: registered only while this component is mounted.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const hit = matchAdminShortcut(e);
      if (!hit) return;
      e.preventDefault();
      if (hit.kind === 'toggleMenu') togglePanel();
      else useDemoView.getState().applyPreset(hit.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePanel]);

  // While open: Escape closes (capture phase, so the spine's window Escape
  // does not also collapse a pinned stack), and a click outside closes.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      closePanel();
    };
    const onPointerDown = (e: PointerEvent) => {
      const wrap = wrapRef.current;
      if (wrap && e.target instanceof Node && wrap.contains(e.target)) return;
      closePanel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, closePanel]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <style>{TRIGGER_CSS}</style>
      <button
        ref={triggerRef}
        type="button"
        className="admin-trigger"
        aria-expanded={open}
        aria-controls={ADMIN_PANEL_ID}
        aria-keyshortcuts={ADMIN_SHORTCUT_LABEL}
        title={`Admin (${ADMIN_SHORTCUT_LABEL})`}
        data-testid="admin-trigger"
        onClick={togglePanel}
        style={{
          padding: '2px 6px',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-micro)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: open ? 'var(--text-primary)' : 'var(--text-tertiary)',
          borderBottom: open ? '1px solid var(--gating-secondary)' : '1px solid transparent',
        }}
      >
        Admin
      </button>
      {open ? <AdminPanel id={ADMIN_PANEL_ID} /> : null}
    </div>
  );
}

const TRIGGER_CSS = `
.admin-trigger { outline: none; }
.admin-trigger:focus-visible { outline: 2px solid var(--gating-secondary); outline-offset: 2px; }
`;
