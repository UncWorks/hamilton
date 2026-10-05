// AoE drawing style shared by MapSpine (deck.gl RGBA arrays) and CesiumSpine
// (Cesium.Color), from the tokens.css --aoe-* values (W19). WebGL layers
// cannot read CSS custom properties, so the OKLCH sources are repeated here
// and aoe-style.test.ts pins them to tokens.css.
//
// Pattern (FR-06a, design §3.2): 90% = 18% tint + 2 px solid edge; 50% =
// 1.5 px dashed outline; stale = both outlines only, no fill; one ≤ 300 ms
// fade-in, none under prefers-reduced-motion. Civil GNSS is the only layer
// drawn in the MVP (D6: DAGR is listed in the card only).
//
// Dependency-free so it runs under `node --test`.

export type Rgb = readonly [number, number, number];

/** OKLCH (L 0–1, C, h°) → sRGB 0–255 (CSS Color 4; same maths as scripts/basemap/contrast-check.mjs). */
export function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const [L, M, S] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return lin.map((x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  }) as unknown as Rgb;
}

/** tokens.css OKLCH sources (L %, C, h). */
export const AOE_TOKEN_OKLCH = {
  'aoe-gnss-civil': [78, 0.13, 315],
  'aoe-gnss-mil': [62, 0.19, 300],
} as const;

export const AOE_RGB: Record<'gnss_civil' | 'gnss_mil', Rgb> = {
  gnss_civil: oklchToRgb(AOE_TOKEN_OKLCH['aoe-gnss-civil'][0] / 100, AOE_TOKEN_OKLCH['aoe-gnss-civil'][1], AOE_TOKEN_OKLCH['aoe-gnss-civil'][2]),
  gnss_mil: oklchToRgb(AOE_TOKEN_OKLCH['aoe-gnss-mil'][0] / 100, AOE_TOKEN_OKLCH['aoe-gnss-mil'][1], AOE_TOKEN_OKLCH['aoe-gnss-mil'][2]),
};

/** --aoe-fill-opacity. */
export const AOE_FILL_ALPHA = 0.18;
export const AOE_EDGE90_PX = 2;
export const AOE_EDGE50_PX = 1.5;
/** 50% dash, px on / px off. */
export const AOE_DASH_PX: readonly [number, number] = [7, 5];
/** Stale outlines (no fill): thinner, still ≥ 3:1 (the colour is unchanged). */
export const AOE_STALE_EDGE_PX = 1.25;
/** One fade-in (FR-06a (5)): ≤ 300 ms, none under reduced motion. */
export const AOE_FADE_MS = 300;

/** Receiver classes drawn on the map in the MVP. */
export const AOE_DRAWN_CLASSES = ['gnss_civil'] as const;

export const cssRgb = (c: Rgb, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
