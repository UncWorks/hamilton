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
