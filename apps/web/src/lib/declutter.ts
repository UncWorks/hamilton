// Screen-space declutter for COP track symbols — FM 1-02 / MCRP 5-12A ¶5-8
// (pp. 5-41/42): when symbols at true position would overlap, display them as
// a bracketed stack displaced from the location, tied back to it with an
// offset locator (leader) line.
//
// Pure function from screen points + sizes to groups, renderer-agnostic. The
// live spines supply the production symbol's box (lib/cop-symbols.ts
// declutterBoxFor) and draw groups with components/symbol DeclutterStack.

export interface DeclutterItem {
  id: string;
  /** Screen position of the symbol centre (CSS px). */
  x: number;
  y: number;
  /** Symbol box (CSS px), centred on x/y. */
  width: number;
  height: number;
  /** Listing order inside a stack; lower first. See affiliationRank. */
  rank?: number;
}

export interface DeclutterGroup {
  /** Stable key: member ids sorted alphabetically, joined by '|'. */
  key: string;
  /** Member ids in stack order (rank asc, then id). ids[0] is the top symbol. */
  ids: string[];
  /** Mean true screen position — where the offset locator line lands. */
  anchor: { x: number; y: number };
  /** Where the stack is drawn (anchor + offset, kept inside the viewport). */
  stack: { x: number; y: number };
}

export interface DeclutterResult {
  singles: string[];
  groups: DeclutterGroup[];
}

export interface DeclutterOptions {
  /** Boxes closer than this (px, edge to edge) are grouped. */
  minSeparationPx?: number;
  /** Stack displacement from the anchor (px). Default up-right. */
  offset?: { dx: number; dy: number };
  /** Keep the stack inside this frame, with `edgePx` margin. */
  viewport?: { width: number; height: number };
  edgePx?: number;
  /**
   * Smallest cluster drawn as a stack (default 2). Smaller clusters stay
   * singles. The production symbol uses 3 (Decisions/Track Symbology,
   * decision 6: three or more symbols within 1.5·s).
   */
  minCount?: number;
}

export const DECLUTTER_MIN_SEPARATION_PX = 6;
export const DECLUTTER_OFFSET = { dx: 44, dy: -44 } as const;
export const DECLUTTER_EDGE_PX = 28;
/** Throttle for camera-driven recompute (ms). */
export const DECLUTTER_THROTTLE_MS = 80;

/** Hostile first (FM 1-02 stack listing), then unknown, neutral, friendly. */
export function affiliationRank(affiliation: string): number {
  switch (affiliation) {
    case 'enemy':
    case 'hostile':
      return 0;
    case 'unknown':
      return 1;
    case 'neutral':
      return 2;
    default:
      return 3;
  }
}

/** Whether two boxes overlap or sit closer than `sep` px edge to edge. */
export function tooClose(a: DeclutterItem, b: DeclutterItem, sep: number): boolean {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + sep &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + sep
  );
}

/**
 * Single-linkage grouping (union-find): any chain of too-close symbols is one
 * stack. O(n²) pair test — fine for COP track counts (hundreds); swap in a
 * grid hash if that ever grows.
 */
export function declutter(items: readonly DeclutterItem[], opts: DeclutterOptions = {}): DeclutterResult {
  const sep = opts.minSeparationPx ?? DECLUTTER_MIN_SEPARATION_PX;
  const valid = items.filter((i) => Number.isFinite(i.x) && Number.isFinite(i.y));
  const parent = valid.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      if (tooClose(valid[i]!, valid[j]!, sep)) {
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
  }
  const buckets = new Map<number, DeclutterItem[]>();
  valid.forEach((it, i) => {
    const r = find(i);
    const arr = buckets.get(r);
    if (arr) arr.push(it);
    else buckets.set(r, [it]);
  });

  const off = opts.offset ?? DECLUTTER_OFFSET;
  const edge = opts.edgePx ?? DECLUTTER_EDGE_PX;
  const minCount = Math.max(2, opts.minCount ?? 2);
  const singles: string[] = [];
  const groups: DeclutterGroup[] = [];
  for (const members of buckets.values()) {
    if (members.length < minCount) {
      for (const m of members) singles.push(m.id);
      continue;
    }
    const ordered = [...members].sort(
      (a, b) => (a.rank ?? 3) - (b.rank ?? 3) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const anchor = {
      x: members.reduce((s, m) => s + m.x, 0) / members.length,
      y: members.reduce((s, m) => s + m.y, 0) / members.length,
    };
    let sx = anchor.x + off.dx;
    let sy = anchor.y + off.dy;
    if (opts.viewport) {
      const { width, height } = opts.viewport;
      // Flip the displacement rather than pin it against an edge, so the
      // leader line keeps its length and never collapses to zero.
      if (sx > width - edge) sx = anchor.x - off.dx;
      if (sx < edge) sx = anchor.x + Math.abs(off.dx);
      if (sy < edge) sy = anchor.y + Math.abs(off.dy);
      if (sy > height - edge) sy = anchor.y - Math.abs(off.dy);
      sx = Math.min(width - edge, Math.max(edge, sx));
      sy = Math.min(height - edge, Math.max(edge, sy));
    }
    groups.push({
      key: members.map((m) => m.id).sort().join('|'),
      ids: ordered.map((m) => m.id),
      anchor,
      stack: { x: sx, y: sy },
    });
  }
  singles.sort();
  groups.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { singles, groups };
}

/** Cheap equality on grouping + rounded positions, to skip no-op re-renders. */
export function sameDeclutter(a: DeclutterResult | null, b: DeclutterResult | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.singles.join() !== b.singles.join() || a.groups.length !== b.groups.length) return false;
  return a.groups.every((g, i) => {
    const h = b.groups[i]!;
    return (
      g.key === h.key &&
      g.ids.join() === h.ids.join() &&
      Math.round(g.stack.x) === Math.round(h.stack.x) &&
      Math.round(g.stack.y) === Math.round(h.stack.y) &&
      Math.round(g.anchor.x) === Math.round(h.anchor.x) &&
      Math.round(g.anchor.y) === Math.round(h.anchor.y)
    );
  });
}

/** Leading + trailing throttle. */
export function throttle(fn: () => void, ms: number): { call: () => void; cancel: () => void } {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    timer = null;
    last = Date.now();
    fn();
  };
  return {
    call() {
      const wait = last + ms - Date.now();
      if (wait <= 0 && !timer) run();
      else if (!timer) timer = setTimeout(run, Math.max(0, wait));
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
