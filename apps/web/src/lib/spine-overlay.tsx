'use client';

// HTML overlay shared by CesiumSpine and MapSpine: declutter stacks (FM 1-02 /
// MCRP 5-12A ¶5-8 offset locator + bracketed stack) and the "Fit to tracks"
// control. Renderer-agnostic — each spine projects its own points and passes
// screen-space groups from lib/declutter.ts.
//
// PLACEHOLDER SYMBOLS: stacks draw plain circles in the affiliation fill /
// trust outline the spines already use. The production symbol component
// replaces <StackGlyph> once it is wired; grouping and layout don't change.

import { useEffect, useState, type CSSProperties } from 'react';
import type { DeclutterGroup } from './declutter';
import { FIT_SHORTCUT_LABEL } from './camera-fit';

export interface StackMember {
  id: string;
  score: number;
  affiliation: string;
  fill: readonly [number, number, number];
  outline: readonly [number, number, number];
}

export interface SpineOverlayProps {
  groups: readonly DeclutterGroup[];
  members: Readonly<Record<string, StackMember>>;
  /** True screen positions of grouped tracks (location dots). */
  positions: Readonly<Record<string, { x: number; y: number }>>;
  onSelect: (id: string) => void;
  onFit: () => void;
  /** Auto-fit is suspended because the operator navigated. */
  manual: boolean;
  reducedMotion: boolean;
}

const rgb = (c: readonly [number, number, number], a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const LEADER = 'rgba(245, 240, 230, 0.75)';
const BRACKET = 'rgba(245, 240, 230, 0.85)';

export function SpineOverlay(p: SpineOverlayProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const expanded = pinned ?? hovered;

  // Drop expansion state for stacks that dissolved.
  useEffect(() => {
    const keys = new Set(p.groups.map((g) => g.key));
    if (pinned && !keys.has(pinned)) setPinned(null);
    if (hovered && !keys.has(hovered)) setHovered(null);
  }, [p.groups, pinned, hovered]);

  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinned]);

  const transition = p.reducedMotion ? 'none' : 'opacity 140ms var(--ease-out-expo, ease-out), transform 140ms var(--ease-out-expo, ease-out)';

  return (
    <div
      data-testid="spine-overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 2 }}
    >
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        {p.groups.map((g) => (
          <g key={g.key}>
            {/* Offset locator line: stack → mean true position. */}
            <line x1={g.stack.x} y1={g.stack.y} x2={g.anchor.x} y2={g.anchor.y} stroke={LEADER} strokeWidth={1.5} />
            {g.ids.map((id) => {
              const pos = p.positions[id];
              const m = p.members[id];
              if (!pos || !m) return null;
              return <circle key={id} cx={pos.x} cy={pos.y} r={3} fill={rgb(m.fill)} stroke="#0a0d12" strokeWidth={1} />;
            })}
            <circle cx={g.anchor.x} cy={g.anchor.y} r={1.5} fill={LEADER} />
          </g>
        ))}
      </svg>

      {p.groups.map((g) => {
        const top = p.members[g.ids[0]!];
        const isOpen = expanded === g.key;
        const listBelow = g.stack.y < 260;
        return (
          <div
            key={g.key}
            style={{ position: 'absolute', left: g.stack.x, top: g.stack.y, transform: 'translate(-50%, -50%)', zIndex: isOpen ? 2 : 1 }}
            onMouseEnter={() => setHovered(g.key)}
            onMouseLeave={() => setHovered((h) => (h === g.key ? null : h))}
          >
            <button
              type="button"
              data-testid="declutter-stack"
              aria-expanded={isOpen}
              aria-label={`Stack of ${g.ids.length} tracks: ${g.ids.join(', ')}. ${isOpen ? 'Collapse' : 'Expand'}.`}
              onClick={() => setPinned((k) => (k === g.key ? null : g.key))}
              onFocus={() => setHovered(g.key)}
              onBlur={() => setHovered((h) => (h === g.key ? null : h))}
              style={stackButton}
            >
              <Bracket side="left" />
              <span style={{ position: 'relative', width: 26, height: 22, display: 'inline-block' }}>
                {g.ids.slice(1, 3).reverse().map((id, i, arr) => {
                  const m = p.members[id];
                  const depth = arr.length - i; // 2 = furthest back
                  return m ? <StackGlyph key={id} m={m} size={16} style={{ left: 4 + depth * 3, top: 3 - depth * 3, opacity: 0.7 }} /> : null;
                })}
                {top && <StackGlyph m={top} size={16} style={{ left: 4, top: 3 }} />}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary, #f5f0e6)', paddingRight: 2 }}>
                +{g.ids.length - 1}
              </span>
              <Bracket side="right" />
            </button>

            <div
              role="list"
              aria-hidden={!isOpen}
              style={{
                position: 'absolute',
                left: '50%',
                ...(listBelow ? { top: '100%', marginTop: 6 } : { bottom: '100%', marginBottom: 6 }),
                transform: `translateX(-50%) ${isOpen || p.reducedMotion ? '' : `translateY(${listBelow ? -4 : 4}px)`}`,
                opacity: isOpen ? 1 : 0,
                visibility: isOpen ? 'visible' : 'hidden',
                pointerEvents: isOpen ? 'auto' : 'none',
                transition: p.reducedMotion ? 'none' : `${transition}, visibility 0s linear ${isOpen ? '0s' : '140ms'}`,
                ...listBox,
              }}
            >
              {g.ids.map((id) => {
                const m = p.members[id];
                if (!m) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    role="listitem"
                    data-testid="declutter-member"
                    tabIndex={isOpen ? 0 : -1}
                    onClick={() => p.onSelect(id)}
                    style={memberRow}
                  >
                    <StackGlyph m={m} size={12} style={{ position: 'static' }} />
                    <span style={{ flex: 1, textAlign: 'left' }}>{id.toUpperCase()}</span>
                    <span style={{ color: 'var(--text-secondary, #b8b2a6)' }}>{m.score.toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        data-testid="fit-to-tracks"
        onClick={p.onFit}
        title={`Fit to tracks (${FIT_SHORTCUT_LABEL})`}
        aria-keyshortcuts={FIT_SHORTCUT_LABEL}
        style={fitButton}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ display: 'block' }}>
          <path d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <span>Fit to tracks</span>
        <kbd style={kbd}>{FIT_SHORTCUT_LABEL}</kbd>
        {p.manual && <span style={{ color: 'var(--text-tertiary, #8a857b)' }}>· manual</span>}
      </button>
    </div>
  );
}

function StackGlyph({ m, size, style }: { m: StackMember; size: number; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        display: 'inline-block',
        flex: 'none',
        width: size,
        height: size,
        borderRadius: '50%',
        background: rgb(m.fill, Math.max(0.35, m.score)),
        border: `2px solid ${rgb(m.outline, 0.95)}`,
        boxSizing: 'border-box',
        ...style,
      }}
    />
  );
}

function Bracket({ side }: { side: 'left' | 'right' }) {
  return (
    <span
      aria-hidden
      style={{
        width: 4,
        alignSelf: 'stretch',
        borderTop: `1.5px solid ${BRACKET}`,
        borderBottom: `1.5px solid ${BRACKET}`,
        [side === 'left' ? 'borderLeft' : 'borderRight']: `1.5px solid ${BRACKET}`,
      }}
    />
  );
}

const stackButton: CSSProperties = {
  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  padding: '3px 2px',
  height: 30,
  background: 'rgba(10, 13, 18, 0.82)',
  border: 'none',
  borderRadius: 2,
  cursor: 'pointer',
  boxShadow: '0 0 0 1px rgba(10,13,18,0.6)',
};

const listBox: CSSProperties = {
  minWidth: 150,
  padding: 4,
  background: 'var(--surface-elevated, #161b22)',
  border: '1px solid rgba(245, 240, 230, 0.18)',
  borderRadius: 3,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const memberRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '3px 6px',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary, #f5f0e6)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const fitButton: CSSProperties = {
  pointerEvents: 'auto',
  position: 'absolute',
  top: 12,
  right: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 8px',
  background: 'rgba(10, 13, 18, 0.82)',
  color: 'var(--text-primary, #f5f0e6)',
  border: '1px solid rgba(245, 240, 230, 0.22)',
  borderRadius: 3,
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

const kbd: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  padding: '0 4px',
  border: '1px solid rgba(245, 240, 230, 0.3)',
  borderRadius: 2,
};
