// Story-only vision filters for the AoE colour-vision stories (COP/CesiumSpine,
// COP/MapSpine). Every filter is an SVG <filter> referenced from CSS
// (`filter: url(#id)`), so the same pixels the user sees are filtered.

import type { Decorator } from '@storybook/react';
import type { ReactNode } from 'react';
import { MACHADO } from '@/lib/glance-metrics';

const matrixValues = (m: number[][]) => m.map((row) => `${row.join(' ')} 0 0`).join('  ') + '  0 0 0 1 0';

export type VisionMode = 'normal' | 'grayscale' | 'deuteranopia' | 'protanopia';

const FILTER_ID: Record<Exclude<VisionMode, 'normal'>, string> = {
  grayscale: 'hamilton-vision-grayscale',
  deuteranopia: 'hamilton-deuteranopia',
  protanopia: 'hamilton-protanopia',
};

/** All filter definitions. Render once per document (idempotent if repeated: same ids, same content). */
function VisionFilterDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      {/* Machado, Oliveira & Fernandes 2009, severity 1.0, linear RGB (one source: lib/glance-metrics). */}
      <filter id={FILTER_ID.deuteranopia} colorInterpolationFilters="linearRGB">
        <feColorMatrix type="matrix" values={matrixValues(MACHADO.deuteranopia)} />
      </filter>
      <filter id={FILTER_ID.protanopia} colorInterpolationFilters="linearRGB">
        <feColorMatrix type="matrix" values={matrixValues(MACHADO.protanopia)} />
      </filter>
      <filter id={FILTER_ID.grayscale} colorInterpolationFilters="linearRGB">
        {/* Rec. 709 luminance — what is left when hue carries nothing. */}
        <feColorMatrix type="matrix" values={matrixValues([[0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722]])} />
      </filter>
    </svg>
  );
}

/** Wraps children in the given vision filter. */
function VisionFilter({ mode, children }: { mode: VisionMode; children: ReactNode }) {
  return (
    <div style={{ filter: mode === 'normal' ? undefined : `url(#${FILTER_ID[mode]})` }} data-vision={mode}>
      <VisionFilterDefs />
      {children}
    </div>
  );
}

/** Decorator driven by a `vision` arg (VisionMode). */
export const withVision: Decorator = (Story, ctx) => {
  const mode = (ctx.args.vision as VisionMode | undefined) ?? 'normal';
  if (mode === 'normal') return <Story />;
  return (
    <VisionFilter mode={mode}>
      <Story />
    </VisionFilter>
  );
};
