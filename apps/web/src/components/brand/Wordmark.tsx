// Hamilton wordmark — typographic-only, no companion glyph (Branding §8).
// Rendered as inline SVG so the mark itself does not depend on a font load
// (NFR-01: nothing loads at runtime).

import type { CSSProperties } from 'react';

interface WordmarkProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

export function Wordmark({ size = 18, color = 'currentColor', style }: WordmarkProps) {
  return (
    <span
      aria-label="Hamilton"
      role="img"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        fontSize: size,
        letterSpacing: '0.32em',
        color,
        ...style,
      }}
    >
      H A M I L T O N
    </span>
  );
}
