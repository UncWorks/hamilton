'use client';

// Screen-space layer shared by CesiumSpine and MapSpine, on top of the map:
//
//  - declutter stacks: the production DeclutterStack (bracket, one locator
//    line to the true location, hostile first, "+n" past three — FM 1-02 /
//    MCRP 5-12A ¶5-8, Decisions/Track Symbology decision 6), grouped by
//    lib/declutter.ts. Hover / click / Enter lists every member;
//  - for MapSpine only (`drawSingles`), the single symbols themselves
//    (TrackSymbolG — the same React component as the Decisions page);
//  - an invisible, focusable hit target over every symbol: hover or Tab opens
//    the rating breakdown (RatingExplanation, WCAG 1.4.13: hoverable,
//    Escape dismisses), click / Enter selects the track;
//  - the "Fit to tracks" control;
//  - Admin · Demo simulation view filter (docs/plans/admin-demo-menu.md D8):
//    `showTracks` / `showFit` drop the symbols and the Fit control from the
//    render. The F shortcut lives in each spine, so it still fits.
//  - the area-of-effect label, key and state marker (AoeKey.tsx), below the symbols.
//
// Renderer-agnostic: each spine projects its own points.

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import {
  DeclutterStack,
  RatingExplanation,
  TRIGGER_CSS,
  TrackSymbolG,
  TrackSymbolWithTooltip,
  isDetail,
  placeSymbol,
  stackGeometry,
  stackOrder,
  tooltipSurface,
  STACK_MAX_SHOWN,
} from '@/components/symbol';
import { unitName } from '@/lib/display-names';
import { CHAR_W, labelFontPx } from '@/components/symbol/geometry';
import { FIT_SHORTCUT_LABEL } from '@/lib/camera-fit';
import { stackOffsetPx } from '@/lib/cop-symbols';
import type { DeclutterResult } from '@/lib/declutter';
import type { SpineSymbol } from './spine-symbols';

export interface PlacedSymbol {
  sym: SpineSymbol;
  x: number;
  y: number;
}

export interface PlacedStack {
  /** lib/declutter group key. */
  key: string;
  /** Mean true screen position of the members (the locator line's end). */
  anchor: { x: number; y: number };
  /** Members in declutter order (rank, then id). */
  members: SpineSymbol[];
}

export interface SpineOverlayProps {
  singles: readonly PlacedSymbol[];
  stacks: readonly PlacedStack[];
  /** Draw the single symbols here (MapSpine). CesiumSpine draws them as billboards. */
  drawSingles: boolean;
  sizePx: number;
  viewport: { width: number; height: number };
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Hovered / focused symbol id — the renderer reveals its J (active state). */
  onActiveChange?: ((id: string | null) => void) | undefined;
  onFit: () => void;
  /** Auto-fit is suspended because the operator navigated. */
  manual: boolean;
  reducedMotion: boolean;
  nowIso: () => string;
  /** Area-of-effect label / key (AoeScreen), drawn under the symbols. */
  aoe?: ReactNode;
  /**
   * Demo view (`map.tracks`): false skips the singles, stacks, hit targets and
   * rating tips — nothing to hover, focus or click. Default true.
   */
  showTracks?: boolean | undefined;
  /** Demo view (`map.fitButton`): false removes the Fit control; F still fits. Default true. */
  showFit?: boolean | undefined;
}

/** Singles + stacks in screen space from a declutter result. */
export function placeSymbols(
  symbols: readonly SpineSymbol[],
  result: DeclutterResult,
  positions: Readonly<Record<string, { x: number; y: number }>>,
): { singles: PlacedSymbol[]; stacks: PlacedStack[] } {
  const byId = new Map(symbols.map((s) => [s.id, s]));
  const grouped = new Set(result.groups.flatMap((g) => g.ids));
  const singles: PlacedSymbol[] = [];
  for (const s of symbols) {
    const p = positions[s.id];
    if (!p || grouped.has(s.id)) continue;
    singles.push({ sym: s, x: p.x, y: p.y });
  }
  const stacks: PlacedStack[] = [];
  for (const g of result.groups) {
    const members = g.ids.map((id) => byId.get(id)).filter((m): m is SpineSymbol => !!m);
    if (members.length === 0) continue;
    const pts = g.ids.map((id) => positions[id]).filter((p): p is { x: number; y: number } => !!p);
    const anchor = pts.length ? { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length } : g.anchor;
    stacks.push({ key: g.key, anchor, members });
  }
  return { singles, stacks };
}

const TIP_W = 400;
const HIT_PAD = 3;

interface Tip {
  id: string;
  /** Hit-target box, overlay px. */
  box: { left: number; top: number; right: number };
}

const NO_SINGLES: readonly PlacedSymbol[] = [];
const NO_STACKS: readonly PlacedStack[] = [];

export function SpineOverlay(props: SpineOverlayProps) {
  // Hidden tracks: the overlay sees no symbols at all, so open tips and
  // pinned / hovered stacks are dropped by the clean-up effects below.
  const tracksShown = props.showTracks !== false;
  const p: SpineOverlayProps = tracksShown ? props : { ...props, singles: NO_SINGLES, stacks: NO_STACKS };
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [hoveredStack, setHoveredStack] = useState<string | null>(null);
  const [pinnedStack, setPinnedStack] = useState<string | null>(null);
  const expanded = pinnedStack ?? hoveredStack;
  const s = p.sizePx;

  const showTip = (id: string, box: Tip['box']) => {
    window.clearTimeout(timer.current);
    setTip({ id, box });
  };
  const hideTip = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTip(null), 150);
  };
  const keepTip = () => window.clearTimeout(timer.current);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onActive = p.onActiveChange;
  const activeId = tip?.id ?? null;
  useEffect(() => {
    onActive?.(activeId);
  }, [activeId, onActive]);

  // Drop state for symbols / stacks that went away.
  const ids = new Set([...p.singles.map((x) => x.sym.id), ...p.stacks.flatMap((g) => g.members.map((m) => m.id))]);
  const stackKeys = p.stacks.map((g) => g.key).join(';');
  useEffect(() => {
    const keys = new Set(stackKeys.split(';'));
    if (pinnedStack && !keys.has(pinnedStack)) setPinnedStack(null);
    if (hoveredStack && !keys.has(hoveredStack)) setHoveredStack(null);
  }, [stackKeys, pinnedStack, hoveredStack]);
  const tipGone = tip !== null && !ids.has(tip.id);
  useEffect(() => {
    if (tipGone) setTip(null);
  }, [tipGone]);

  useEffect(() => {
    if (!pinnedStack && !tip) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPinnedStack(null);
      setTip(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinnedStack, tip]);

  const all = [...p.singles.map((x) => x.sym), ...p.stacks.flatMap((g) => g.members)];
  const tipSym = tip ? all.find((m) => m.id === tip.id) : undefined;
  const tipId = (id: string) => `cop-tip-${id.replace(/[^\w-]/g, '_')}`;

  /** Focusable hit target over a symbol's frame at (x, y). */
  const hit = (sym: SpineSymbol, x: number, y: number, testId: string) => {
    const half = s / 2 + HIT_PAD;
    const box = { left: x - half, top: y - half, right: x + half };
    const selected = p.selectedId === sym.id;
    return (
      <div
        key={`${testId}`}
        role="button"
        tabIndex={0}
        className="symbol-trigger"
        data-testid={testId}
        data-symbol-id={sym.id}
        data-kind={sym.kind}
        aria-label={`${sym.label}${selected ? ' · selected' : ''}${sym.explain ? ' — hover or focus for the rating breakdown' : ''}`}
        aria-describedby={sym.explain ? tipId(sym.id) : undefined}
        aria-pressed={sym.kind === 'track' ? selected : undefined}
        onMouseEnter={() => showTip(sym.id, box)}
        onMouseLeave={hideTip}
        onFocus={() => showTip(sym.id, box)}
        onBlur={hideTip}
        onClick={() => sym.kind === 'track' && p.onSelect(sym.id)}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Escape') setTip(null);
          if ((e.key === 'Enter' || e.key === ' ') && sym.kind === 'track') {
            e.preventDefault();
            p.onSelect(sym.id);
          }
        }}
        style={{ position: 'absolute', left: box.left, top: box.top, width: 2 * half, height: 2 * half, pointerEvents: 'auto', cursor: sym.explain ? 'help' : 'default', zIndex: 3 }}
      />
    );
  };

  // Stack layout — the SAME stackGeometry() call DeclutterStack makes, so the
  // hit targets land exactly on its frames.
  const placed = p.stacks.map((g) => {
    const tracks = g.members.map((m) => m.track);
    const order = stackOrder(tracks).map((t) => g.members[tracks.indexOf(t)]!);
    const at: [number, number] = [g.anchor.x, g.anchor.y];
    // Gutter for the T labels (left of each frame), mono at the symbol's label size.
    const labelPx = Math.max(0, ...order.slice(0, STACK_MAX_SHOWN).map((m) => (m.track.designation?.length ?? 0) * CHAR_W * labelFontPx(s) + 4));
    const offsetPx = stackOffsetPx(g.anchor.x, s, p.viewport.width, s + labelPx + 64);
    const geo = stackGeometry(at, order.length, s, { offsetPx, labelPx });
    const rowH = 0.8 * s + (isDetail(s) ? 2 + 0.165 * s : 0);
    const shown = Math.min(order.length, STACK_MAX_SHOWN);
    const top = g.anchor.y - (shown * rowH) / 2;
    const bottom = top + shown * rowH + (geo.overflow ? 16 : 0);
    const bx = g.anchor.x + offsetPx;
    return { g, order, at, offsetPx, labelPx, geo, top, bottom, bx };
  });

  return (
    <div data-testid="spine-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 2 }}>
      <style>{TRIGGER_CSS}</style>
      {p.aoe}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden>
        {p.drawSingles &&
          p.singles.map(({ sym, x, y }) => (
            <g key={sym.id} transform={placeSymbol(x, y, s)} data-cop-symbol={sym.id}>
              <TrackSymbolG track={sym.track} sizePx={s} selected={p.selectedId === sym.id} active={tip?.id === sym.id} />
            </g>
          ))}
        {placed.map(({ g, order, at, offsetPx, labelPx }) => (
          <g key={g.key} data-cop-stack={g.key}>
            <DeclutterStack at={at} tracks={order.map((m) => m.track)} sizePx={s} offsetPx={offsetPx} labelPx={labelPx} />
          </g>
        ))}
      </svg>

      {p.singles.map(({ sym, x, y }) => hit(sym, x, y, `cop-symbol-${sym.id}`))}

      {placed.map(({ g, order, geo, top, bottom, bx, labelPx }) => {
        const isOpen = expanded === g.key;
        const left = bx - 8;
        const width = 8 + 6 + labelPx + s + 72;
        const listBelow = top < p.viewport.height / 2;
        return (
          <div
            key={g.key}
            onMouseEnter={() => setHoveredStack(g.key)}
            onMouseLeave={() => setHoveredStack((h) => (h === g.key ? null : h))}
            style={{ position: 'absolute', left, top: top - 4, width, height: bottom - top + 8, pointerEvents: 'auto', zIndex: isOpen ? 4 : 2 }}
          >
            <button
              type="button"
              data-testid="declutter-stack"
              aria-expanded={isOpen}
              aria-label={`Stack of ${order.length}: ${order.map((m) => m.track.designation ?? m.id).join(', ')}. ${isOpen ? 'Collapse' : 'Expand'} the list.`}
              onClick={() => setPinnedStack((k) => (k === g.key ? null : g.key))}
              onFocus={() => setHoveredStack(g.key)}
              onBlur={() => setHoveredStack((h) => (h === g.key ? null : h))}
              className="symbol-trigger"
              style={stackButton}
            />
            {/* Frames shown in the stack: same hit targets as singles, in the stack's own box. */}
            <div style={{ position: 'absolute', left: -left, top: -(top - 4), width: 0, height: 0 }}>
              {geo.slots.map(([x, y], i) => hit(order[i]!, x, y, `stack-slot-${order[i]!.id}`))}
            </div>
            <div
              role="list"
              aria-label={`Stack members (${order.length})`}
              aria-hidden={!isOpen}
              style={{
                position: 'absolute',
                left: 0,
                ...(listBelow ? { top: '100%', marginTop: 4 } : { bottom: '100%', marginBottom: 4 }),
                opacity: isOpen ? 1 : 0,
                visibility: isOpen ? 'visible' : 'hidden',
                pointerEvents: isOpen ? 'auto' : 'none',
                transform: isOpen || p.reducedMotion ? 'none' : `translateY(${listBelow ? -4 : 4}px)`,
                transition: p.reducedMotion
                  ? 'none'
                  : `opacity 140ms var(--ease-out-expo, ease-out), transform 140ms var(--ease-out-expo, ease-out), visibility 0s linear ${isOpen ? '0s' : '140ms'}`,
                ...listBox,
              }}
            >
              {order.map((m) => {
                const explanation = m.explain?.(p.nowIso());
                return (
                  <div key={m.id} role="listitem" data-testid="declutter-member" data-symbol-id={m.id} style={memberRow}>
                    <TrackSymbolWithTooltip track={m.track} sizePx={20} explanation={explanation} selected={false} />
                    <button
                      type="button"
                      tabIndex={isOpen ? 0 : -1}
                      disabled={m.kind !== 'track'}
                      onClick={() => p.onSelect(m.id)}
                      style={memberButton}
                      aria-label={`${m.label}${m.kind === 'track' ? ' — select' : ''}`}
                    >
                      <span style={{ flex: 1, textAlign: 'left' }}>{m.kind === 'track' ? unitName(m.id) : m.track.designation}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {m.track.score !== undefined ? m.track.score.toFixed(2) : 'CAND'}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* One rating breakdown at a time, beside the hovered / focused symbol. */}
      {all
        .filter((m) => m.explain)
        .map((m) => {
          const open = tipSym?.id === m.id && tip;
          const flip = open ? tip.box.right + 12 + TIP_W > p.viewport.width : false;
          const left = open ? (flip ? Math.max(4, tip.box.left - 12 - TIP_W) : tip.box.right + 12) : 0;
          const top = open ? Math.max(4, Math.min(tip.box.top - 8, p.viewport.height - 440)) : 0;
          return (
            <div
              key={m.id}
              id={tipId(m.id)}
              role="tooltip"
              data-testid={open ? 'cop-rating-tip' : undefined}
              onMouseEnter={keepTip}
              onMouseLeave={hideTip}
              style={{ ...tooltipSurface, position: 'absolute', left, top, zIndex: 10, display: open ? 'block' : 'none', pointerEvents: 'auto' }}
            >
              {open && m.explain ? <RatingExplanation {...m.explain(p.nowIso())} /> : null}
            </div>
          );
        })}

      {p.showFit !== false && (
        <button type="button" data-testid="fit-to-tracks" onClick={p.onFit} title={`Fit to tracks (${FIT_SHORTCUT_LABEL})`} aria-keyshortcuts={FIT_SHORTCUT_LABEL} style={fitButton}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ display: 'block' }}>
            <path d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          <span>Fit to tracks</span>
          <kbd style={kbd}>{FIT_SHORTCUT_LABEL}</kbd>
          {p.manual && <span style={{ color: 'var(--text-tertiary)' }}>· manual</span>}
        </button>
      )}
    </div>
  );
}

const stackButton: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  padding: 0,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
};

const listBox: CSSProperties = {
  minWidth: 190,
  padding: 4,
  background: 'var(--surface-elevated)',
  border: '1px solid var(--surface-panel)',
  boxShadow: '0 8px 24px var(--surface-popover-shadow)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const memberRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px' };

const memberButton: CSSProperties = {
  flex: 1,
  display: 'flex',
  gap: 8,
  padding: '3px 4px',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary)',
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
  background: 'var(--surface-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--surface-panel)',
  borderRadius: 3,
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  zIndex: 5,
};

const kbd: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  padding: '0 4px',
  border: '1px solid var(--text-tertiary)',
  borderRadius: 2,
};
