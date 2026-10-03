// SVG string / data-URL renderer for the decided track symbol — for map
// renderers that need an image (Cesium billboards, deck.gl IconLayer). Same
// describeTrackSymbol() output as the React component; CSS tokens are resolved
// to literals because an <img>-loaded SVG cannot see the page's custom
// properties. Text uses a system monospace stack: SVG images cannot load web
// fonts.

import { trustOklch } from '@/lib/trust-gradient';
import { describeTrackSymbol, type SymbolOptions, type SymbolTrack } from './describe';
import type { PPrim } from './geometry';

/**
 * Token literals (values copied from src/styles/tokens.css; the trust band
 * colours come from trust-gradient.ts, the phosphor source of truth).
 */
export const SYMBOL_COLOR_LITERALS: Readonly<Record<string, string>> = {
  '--sym-ink': 'oklch(90% 0.01 90)',
  '--sym-ink-stale': 'oklch(58% 0.01 90)',
  '--sym-select': 'oklch(96% 0.005 90)',
  '--surface-base': 'oklch(14% 0.01 250)',
  '--text-secondary': 'oklch(78% 0.008 90)',
  '--trust-nominal': trustOklch(1),
  '--trust-watching': trustOklch(0.7),
  '--trust-degraded': trustOklch(0.45),
  '--trust-failed-stroke': 'oklch(62% 0.16 47)',
};

export function resolveSymbolColor(css: string): string {
  return css.replace(/var\((--[\w-]+)\)/g, (m, name: string) => SYMBOL_COLOR_LITERALS[name] ?? m);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (x: number) => (Math.round(x * 1000) / 1000).toString();

function primSvg(p: PPrim): string {
  if (p.svgSkip) return '';
  const tf = p.scale ? ` transform="translate(100 100) scale(${n(p.scale)}) translate(-100 -100)"` : '';
  const op = p.opacity !== undefined ? ` opacity="${n(p.opacity)}"` : '';
  const c = esc(resolveSymbolColor(p.color));
  if (p.mode === 'fill') return `<path d="${p.d}" fill="${c}"${op}${tf}/>`;
  const dash = p.dash ? ` stroke-dasharray="${p.dash.map(n).join(' ')}"` : '';
  return `<path d="${p.d}" fill="none" stroke="${c}" stroke-width="${n(p.w ?? 1)}" stroke-linecap="${p.cap ?? 'butt'}" stroke-linejoin="round"${dash}${op}${tf}/>`;
}

export interface SymbolImage {
  svg: string;
  /** Image size, px (1×; pass `pixelRatio` for crisper billboards). */
  width: number;
  height: number;
  /** Frame centre within the image, px — the billboard anchor / pixel offset. */
  anchor: [number, number];
  sidc2525E: string;
  sidc2525C: string;
  cot: string;
}

const FONT = "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace";

/** Standalone SVG document for a track symbol. */
export function trackSymbolSvg(track: SymbolTrack, opts: SymbolOptions & { pixelRatio?: number | undefined }): SymbolImage {
  const d = describeTrackSymbol(track, opts);
  const { box, u, fontPx, pad } = d.layout;
  const w = box + pad.left + pad.right;
  const h = box + pad.top + pad.bottom;
  const ratio = opts.pixelRatio ?? 1;
  const texts = d.texts
    .map(
      (t) =>
        `<text x="${n(t.x)}" y="${n(t.y)}" text-anchor="${t.anchor}" dominant-baseline="central" fill="${esc(resolveSymbolColor(t.color))}" ` +
        `stroke="${esc(SYMBOL_COLOR_LITERALS['--surface-base']!)}" stroke-width="${n(3 * u)}" stroke-linejoin="round" paint-order="stroke" ` +
        `font-family="${esc(FONT)}" font-size="${n(fontPx * u)}">${esc(t.text)}</text>`,
    )
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w * ratio)}" height="${n(h * ratio)}" viewBox="0 0 ${n(w)} ${n(h)}">` +
    `<title>${esc(d.label)}</title>` +
    `<g transform="translate(${n(pad.left)} ${n(pad.top)}) scale(${n(box / 200)})">${d.prims.map(primSvg).join('')}${texts}</g></svg>`;
  return {
    svg,
    width: w * ratio,
    height: h * ratio,
    anchor: [(pad.left + box / 2) * ratio, (pad.top + box / 2) * ratio],
    sidc2525E: d.codes.sidc2525E,
    sidc2525C: d.codes.sidc2525C,
    cot: d.codes.cot,
  };
}

/** `data:image/svg+xml` URL for a track symbol (billboard / icon image). */
export function trackSymbolDataUrl(track: SymbolTrack, opts: SymbolOptions & { pixelRatio?: number | undefined }): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trackSymbolSvg(track, opts).svg)}`;
}
