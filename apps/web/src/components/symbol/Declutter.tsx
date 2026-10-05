// Decision 6 (research candidate E, doctrinal declutter) — the SYMBOL-SIDE
// pieces only: stack ordering, the bracket + one locator line (FM 1-02 /
// MCRP 5-12A ¶5-8, Fig 5-6, pp 5-41/5-42) and the "+n" overflow glyph (Hamilton
// convention, labelled as such). Deciding WHEN tracks collide (≥ 3 within
// 1.5·s) belongs to the map renderers.

import type { ReactNode } from 'react';
import { isDetail, type SymbolOptions, type SymbolTrack } from './describe';
import { TrackSymbolG, placeSymbol } from './TrackSymbol';

/** Overlap rule from research E: three or more symbols within this many symbol sizes. */
export const DECLUTTER_RADIUS_S = 1.5;
export const DECLUTTER_MIN_COUNT = 3;
/** Frames shown before "+n" (Hamilton convention). */
export const STACK_MAX_SHOWN = 3;

/** Stack order: hostile first (research E), then unknown, neutral, friendly; stable otherwise. */
export function stackOrder<T extends Pick<SymbolTrack, 'affiliation'>>(tracks: readonly T[]): T[] {
  const rank = { enemy: 0, unknown: 1, neutral: 2, friendly: 3 } as const;
  return tracks.map((t, i) => [t, i] as const).sort((a, b) => rank[a[0].affiliation] - rank[b[0].affiliation] || a[1] - b[1]).map(([t]) => t);
}

export interface StackGeometry {
  /** Frame centres of the shown symbols, px. */
  slots: [number, number][];
  /** "[" bracket path, px. */
  bracket: string;
  /** Locator line from the true location to the bracket, px. */
  leader: string;
  /** "+n" glyph anchor (left, middle), px; undefined when everything is shown. */
  overflow: { x: number; y: number; n: number } | undefined;
}

/**
 * Bracketed stack to the right of `at` (the true / centroid location).
 * Row pitch 0.8·s keeps the hostile diamond (0.72·s tall) clear of its
 * neighbour; in the detail state (≥ 28 px) it also clears the echelon mark.
 * `labelPx` reserves a gutter between the bracket and the frames for the T
 * labels (left of each frame), so they never sit on the bracket.
 */
export function stackGeometry(
  at: readonly [number, number],
  count: number,
  sizePx: number,
  opts: { maxShown?: number | undefined; offsetPx?: number | undefined; detail?: boolean | undefined; labelPx?: number | undefined } = {},
): StackGeometry {
  const shown = Math.min(count, opts.maxShown ?? STACK_MAX_SHOWN);
  const rowH = 0.8 * sizePx + (isDetail(sizePx, opts.detail) ? 2 + 0.165 * sizePx : 0);
  const bx = at[0] + (opts.offsetPx ?? 2.5 * sizePx);
  const top = at[1] - (shown * rowH) / 2;
  const bottom = top + shown * rowH;
  const slots = Array.from({ length: shown }, (_, i) => [bx + 6 + (opts.labelPx ?? 0) + sizePx / 2, top + rowH * (i + 0.5)] as [number, number]);
  return {
    slots,
    bracket: `M${bx + 4},${top} h-4 V${count > shown ? bottom + 16 : bottom} h4`,
    leader: `M${at[0]},${at[1]} H${bx}`,
    // "+n" sits under the last frame, inside the bracket column, clear of every amplifier.
    overflow: count > shown ? { x: bx + 6, y: bottom + 8, n: count - shown } : undefined,
  };
}

const ink = { stroke: 'var(--sym-ink)', strokeWidth: 1.25, fill: 'none' } as const;

/** The "[" bracket + locator line + true-location dot, in px. */
export function StackBracket({ g, at }: { g: StackGeometry; at: readonly [number, number] }) {
  return (
    <g data-declutter="bracket">
      <circle cx={at[0]} cy={at[1]} r={2} fill="var(--sym-ink)" />
      <path d={g.leader} {...ink} />
      <path d={g.bracket} {...ink} strokeLinejoin="miter" />
    </g>
  );
}

/** "+n" overflow count (Hamilton convention, not doctrinal). */
export function OverflowCount({ x, y, n, fontPx = 11 }: { x: number; y: number; n: number; fontPx?: number }) {
  return (
    <text
      data-declutter="overflow"
      x={x}
      y={y}
      dominantBaseline="central"
      fill="var(--sym-ink)"
      stroke="var(--surface-base)"
      strokeWidth={3}
      strokeLinejoin="round"
      paintOrder="stroke"
      style={{ fontFamily: 'var(--font-mono)', fontSize: fontPx, fontVariantNumeric: 'tabular-nums' }}
    >
      +{n}
    </text>
  );
}

/** A complete stack: bracket, locator line, up to `maxShown` symbols (hostile first) and "+n". */
export function DeclutterStack({
  at,
  tracks,
  maxShown,
  offsetPx,
  labelPx,
  ...opts
}: SymbolOptions & {
  at: readonly [number, number];
  tracks: readonly SymbolTrack[];
  maxShown?: number | undefined;
  offsetPx?: number | undefined;
  labelPx?: number | undefined;
}): ReactNode {
  const ordered = stackOrder(tracks);
  const g = stackGeometry(at, ordered.length, opts.sizePx, { maxShown, offsetPx, detail: opts.detail, labelPx });
  return (
    <g data-declutter="stack" data-count={ordered.length}>
      <StackBracket g={g} at={at} />
      {g.slots.map(([x, y], i) => (
        <g key={i} transform={placeSymbol(x, y, opts.sizePx)}>
          <TrackSymbolG track={ordered[i]!} {...opts} />
        </g>
      ))}
      {g.overflow && <OverflowCount {...g.overflow} />}
    </g>
  );
}
