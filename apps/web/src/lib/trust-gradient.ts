// Trust gradient — Branding §3.3.
// Returns the OKLCH color string for any score in [0,1].
// SOURCE OF TRUTH for the phosphor-discipline lint (filename allowlisted).

export type Oklch = string;

const ROE_FLOOR = 0.6;

/**
 * Map a score to its band token. The gradient inflection at 0.6 is the
 * ROE-floor visualization (§3.3): below it, the icon enters gated territory.
 */
export function trustBand(score: number): 'nominal' | 'watching' | 'degraded' | 'failed' {
  if (score >= 0.85) return 'nominal';
  if (score >= ROE_FLOOR) return 'watching';
  if (score >= 0.3) return 'degraded';
  return 'failed';
}

export function trustVarForBand(band: ReturnType<typeof trustBand>): string {
  return `var(--trust-${band})`;
}

/**
 * Return the OKLCH literal for a score. Called from deck.gl getColor where
 * we need actual numeric channels, not a CSS var. Mirrors tokens.css §3.3.
 */
export function trustOklch(score: number): Oklch {
  const band = trustBand(score);
  switch (band) {
    case 'nominal':
      return 'oklch(85% 0.18 145)';
    case 'watching':
      return 'oklch(80% 0.17 117)';
    case 'degraded':
      return 'oklch(72% 0.18 75)';
    case 'failed':
      return 'oklch(54% 0.16 47)';
  }
}

/** True when the icon's pulsing halo should activate (Branding §5.2). */
export function shouldHaloPulse(score: number): boolean {
  return score < ROE_FLOOR;
}

/** Halo radius in CSS px. (1 - score) * 24 per Branding §5.2. */
export function haloRadiusPx(score: number): number {
  return Math.max(0, (1 - score) * 24);
}

/** Halo period in ms — pulses faster as trust falls. */
export function haloPeriodMs(score: number): number {
  return Math.max(600, 1200 - (1 - score) * 600);
}

/**
 * Live halo animation — Branding §5.2, "Option 1 (spec-faithful)" in
 * Storybook Archive/Halo Options. ONE definition shared by every
 * renderer (deck.gl, Cesium, the SVG reference glyph via motion.css
 * `halo-pulse`) so the halo is identical and always concentric with the icon.
 *
 * Geometry: the halo is a disc + edge ring centred on the icon. Its outer
 * radius is measured from the icon EDGE: iconRadius + (1 - c) * 24px (the
 * bare (1 - c) * 24 value is smaller than the 18px icon at every c >= 0.25, so
 * as an absolute radius it would sit hidden under the icon). Over one period
 * it scales FROM ITS CENTRE between HALO_MIN_EXTENT and 1 of that extent and
 * breathes opacity with the smooth in-out curve.
 */
export const HALO_MIN_EXTENT = 0.35;

export interface HaloFrame {
  /** Outer radius in CSS px, measured from the icon centre. */
  radiusPx: number;
  /** 0..1 intensity; renderers map it to fill / ring alpha. */
  intensity: number;
}

/** Halo outer radius at full extent (icon edge + (1 - c) * 24px). */
export function haloOuterRadiusPx(score: number, iconRadiusPx: number): number {
  return iconRadiusPx + haloRadiusPx(score);
}

/**
 * Halo frame at absolute time `tMs` (e.g. performance.now()). Never wrap
 * tMs to an arbitrary modulus before calling — the phase is taken modulo the
 * score's own period here, so it is continuous across frames.
 */
export function haloFrameAt(
  score: number,
  iconRadiusPx: number,
  tMs: number,
  reducedMotion = false,
): HaloFrame {
  const extent = haloRadiusPx(score);
  if (reducedMotion) {
    // Static ring at the full spec radius — no motion (Branding §6.4).
    return { radiusPx: iconRadiusPx + extent, intensity: 0.75 };
  }
  const period = haloPeriodMs(score);
  const phase = (((tMs % period) + period) % period) / period;
  const e = 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI); // 0 → 1 → 0, smooth
  return {
    radiusPx: iconRadiusPx + extent * (HALO_MIN_EXTENT + (1 - HALO_MIN_EXTENT) * e),
    intensity: 0.35 + 0.65 * e,
  };
}

/**
 * Approximate sRGB triple for the band's OKLCH literal. Used by deck.gl,
 * which can't consume CSS colors. Values approximate the OKLCH literals in
 * tokens.css §3.3.
 */
export function trustRgb(score: number): [number, number, number] {
  const band = trustBand(score);
  switch (band) {
    case 'nominal':
      return [134, 222, 124];
    case 'watching':
      return [188, 210, 110];
    case 'degraded':
      return [220, 178, 90];
    case 'failed':
      return [170, 100, 70];
  }
}
