'use client';

// Basemap attribution, shared by both spines (OSM ODbL + Protomaps terms
// require it whenever the map is shown). Plain text, bottom-right, below the
// symbol overlay so it never covers a track; no outbound link (NFR-01).

import { basemapAttribution, type BasemapMode } from '@/lib/basemap';

export function BasemapAttribution({ mode }: { mode: BasemapMode }) {
  const text = basemapAttribution(mode);
  if (!text) return null;
  return (
    <div
      data-testid="basemap-attribution"
      data-basemap={mode}
      style={{
        position: 'absolute',
        right: 6,
        bottom: 4,
        zIndex: 1,
        pointerEvents: 'none',
        padding: '1px 6px',
        borderRadius: 2,
        background: 'oklch(14% 0.01 250 / 0.6)',
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-micro)',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
}
