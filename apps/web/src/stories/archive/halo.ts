// ARCHIVED — the Branding §5.2 pulsing halo. No live renderer draws it any
// more: the decided symbol (Decisions/Track Symbology, decision 2) shows
// trust as a side gauge + J, with no halo and no pulse. Kept only for the
// Archive / evidence stories (Halo Options, At-a-Glance variants, the retired
// n-gon glyph) that still render the old treatment for comparison.

const TSS_MIN_GPS_SCORE = 0.6;

/** True when the icon's pulsing halo should activate (Branding §5.2). */
export function shouldHaloPulse(score: number): boolean {
  return score < TSS_MIN_GPS_SCORE;
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

