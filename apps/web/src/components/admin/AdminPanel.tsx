'use client';

// Admin panel · Demo simulation (docs/plans/admin-demo-menu.md D7 and the
// "Accessibility and keyboard" section). A non-modal disclosure region: no
// scrim, no focus trap. It sits under the brand bar's right edge, over the top
// of the side column, never over the map. It is a VIEW FILTER only: it writes
// the demo-view store, never the domain store.
//
// Loaded through next/dynamic from AdminMenu, so it is never fetched unless an
// admin session opens it.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ADMIN_SHORTCUT_LABEL,
  DEMO_COMPONENTS,
  DEMO_GROUP_LABELS,
  DEMO_PRESETS,
  isVisible,
  type DemoComponent,
  type DemoComponentId,
  type DemoGroup,
} from '@/lib/demo-view';
import { useDemoView } from '@/store/demo-view';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

const PANEL_WIDTH = 280;
const BAR_HEIGHT = 56;

const GROUP_ORDER: readonly DemoGroup[] = ['map', 'side', 'bar', 'log'];

const BY_ID = new Map(DEMO_COMPONENTS.map((c) => [c.id, c]));

function depthOf(c: DemoComponent): number {
  let d = 0;
  let cur = c.parent;
  while (cur && d < 8) {
    d += 1;
    cur = BY_ID.get(cur)?.parent;
  }
  return d;
}

/** Nearest hidden ancestor, if any (the reason a child is disabled). */
function hiddenAncestor(hidden: readonly DemoComponentId[], c: DemoComponent): DemoComponent | undefined {
  let cur = c.parent ? BY_ID.get(c.parent) : undefined;
  let guard = 0;
  while (cur && guard < 8) {
    if (hidden.includes(cur.id)) return cur;
    cur = cur.parent ? BY_ID.get(cur.parent) : undefined;
    guard += 1;
  }
  return undefined;
}

export interface AdminPanelProps {
  id: string;
}

export function AdminPanel({ id }: AdminPanelProps) {
  const hidden = useDemoView((s) => s.hidden);
  const preset = useDemoView((s) => s.preset);
  const applyPreset = useDemoView((s) => s.applyPreset);
  const toggle = useDemoView((s) => s.toggle);
  const reset = useDemoView((s) => s.reset);
  const reduced = usePrefersReducedMotion();

  const firstPresetRef = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState(false);

  // Opening moves focus to the first preset button (also when opened by shortcut).
  useEffect(() => {
    firstPresetRef.current?.focus();
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const view = { v: 1 as const, hidden, preset };

  return (
    <section
      id={id}
      role="region"
      aria-label="Admin"
      data-testid="admin-panel"
      style={{
        ...surface,
        opacity: reduced || shown ? 1 : 0,
        transition: reduced ? 'none' : 'opacity 120ms var(--ease-out-expo)',
      }}
    >
      <style>{PANEL_CSS}</style>
      <h2 style={heading}>Demo simulation</h2>
      <p style={note}>Changes this screen only. Data, timers and the after-action record keep running.</p>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 'var(--space-3)' }}>
        <span id={`${id}-presets-label`} style={sectionLabel}>
          Presets
        </span>
        <span data-testid="admin-preset-state" style={{ ...micro, color: 'var(--text-tertiary)' }}>
          {preset === 'custom' ? 'Custom' : null}
        </span>
      </div>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-presets-label`}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}
      >
        {DEMO_PRESETS.map((p, i) => {
          const checked = preset === p.id;
          return (
            <button
              key={p.id}
              ref={i === 0 ? firstPresetRef : undefined}
              type="button"
              role="radio"
              aria-checked={checked}
              data-testid={`admin-preset-${p.id}`}
              title={`Alt+Shift+${i}`}
              className="admin-ctl"
              onClick={() => applyPreset(p.id)}
              style={{
                padding: '2px 6px',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-micro)',
                letterSpacing: '0.04em',
                background: 'var(--surface-panel)',
                borderRadius: 2,
                color: checked ? 'var(--text-primary)' : 'var(--text-tertiary)',
                borderBottom: checked ? '1px solid var(--gating-secondary)' : '1px solid transparent',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {GROUP_ORDER.map((g) => {
        const items = DEMO_COMPONENTS.filter((c) => c.group === g);
        if (items.length === 0) return null;
        return (
          <fieldset key={g} style={fieldset}>
            <legend style={{ ...sectionLabel, padding: 0 }}>{DEMO_GROUP_LABELS[g]}</legend>
            {items.map((c) => {
              const own = !hidden.includes(c.id);
              const visible = isVisible(view, c.id);
              const blocker = hiddenAncestor(hidden, c);
              const inputId = `${id}-cb-${c.id}`;
              const whyId = `${inputId}-why`;
              return (
                <div key={c.id} style={{ paddingLeft: depthOf(c) * 16 }}>
                  <label
                    htmlFor={inputId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: '1px 0',
                      cursor: blocker ? 'default' : 'pointer',
                      color: blocker ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                    }}
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      className="admin-ctl"
                      data-testid={`admin-cb-${c.id}`}
                      checked={own}
                      disabled={!!blocker}
                      aria-describedby={blocker ? whyId : undefined}
                      onChange={() => toggle(c.id)}
                      style={{ margin: 0, accentColor: 'var(--text-secondary)' }}
                    />
                    <span style={{ flex: 1, fontSize: 'var(--text-body)', lineHeight: 1.3 }}>{c.label}</span>
                    <span data-testid={`admin-state-${c.id}`} style={{ ...micro, color: 'var(--text-tertiary)' }}>
                      {visible ? 'shown' : 'hidden'}
                    </span>
                  </label>
                  {blocker ? (
                    <span id={whyId} style={{ ...micro, display: 'block', color: 'var(--text-tertiary)', paddingLeft: 22 }}>
                      Hidden with {blocker.label}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </fieldset>
        );
      })}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-3)' }}>
        <button
          type="button"
          className="admin-ctl"
          data-testid="admin-show-all"
          onClick={reset}
          style={{
            padding: '2px 6px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-micro)',
            letterSpacing: '0.04em',
            color: 'var(--text-secondary)',
            border: '1px solid var(--surface-panel)',
            borderRadius: 2,
          }}
        >
          Show all
        </button>
      </div>

      <dl style={hints}>
        <dt style={kbd}>{ADMIN_SHORTCUT_LABEL}</dt>
        <dd style={{ margin: 0 }}>Open / close</dd>
        <dt style={kbd}>Alt+Shift+0–{DEMO_PRESETS.length - 1}</dt>
        <dd style={{ margin: 0 }}>Presets, in order</dd>
        <dt style={kbd}>Esc</dt>
        <dd style={{ margin: 0 }}>Close</dd>
      </dl>
    </section>
  );
}

const micro: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '0.04em',
};

const surface: CSSProperties = {
  // Fixed under the bar's right edge: over the side column, never the map.
  position: 'fixed',
  top: BAR_HEIGHT + 4,
  right: 'var(--space-6)',
  zIndex: 30,
  width: PANEL_WIDTH,
  maxHeight: `calc(100vh - ${BAR_HEIGHT + 16}px)`,
  overflowY: 'auto',
  padding: 'var(--space-3)',
  background: 'var(--surface-elevated)',
  border: '1px solid var(--surface-panel)',
  boxShadow: '0 8px 24px var(--surface-modal-scrim)',
  textAlign: 'left',
  // The brand bar's right cluster is mono uppercase; the panel resets it.
  textTransform: 'none',
  letterSpacing: 'normal',
  fontFamily: 'var(--font-sans)',
  color: 'var(--text-secondary)',
};

const heading: CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-panel)',
  fontWeight: 600,
  color: 'var(--text-primary)',
};

const note: CSSProperties = {
  margin: 'var(--space-1) 0 0',
  fontSize: 'var(--text-micro)',
  color: 'var(--text-tertiary)',
};

const sectionLabel: CSSProperties = {
  ...micro,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-tertiary)',
};

const fieldset: CSSProperties = {
  margin: 'var(--space-3) 0 0',
  padding: 0,
  border: 'none',
  borderTop: '1px solid var(--surface-panel)',
  paddingTop: 'var(--space-2)',
};

const hints: CSSProperties = {
  ...micro,
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  columnGap: 'var(--space-3)',
  rowGap: 2,
  margin: 'var(--space-3) 0 0',
  paddingTop: 'var(--space-2)',
  borderTop: '1px solid var(--surface-panel)',
  color: 'var(--text-tertiary)',
};

const kbd: CSSProperties = { color: 'var(--text-secondary)' };

const PANEL_CSS = `
.admin-ctl { outline: none; }
.admin-ctl:focus-visible { outline: 2px solid var(--gating-secondary); outline-offset: 2px; }
.admin-ctl:disabled { cursor: default; }
`;
