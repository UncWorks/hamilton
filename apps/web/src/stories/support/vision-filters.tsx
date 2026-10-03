// Story-only vision filters, shared by Explorations/Track Symbology and
// Explorations/At-a-Glance Symbols. Every filter is an SVG <filter> referenced
// from CSS (`filter: url(#id)`), so the same pixels the user sees are filtered.

import type { Decorator } from '@storybook/react';
import type { ReactNode } from 'react';
import { MACHADO } from '@/lib/glance-metrics';

/** Machado, Oliveira & Fernandes 2009, severity 1.0, linear RGB (one source: lib/glance-metrics). */
export const MACHADO_DEUTERANOPIA = MACHADO.deuteranopia;

const matrixValues = (m: number[][]) => m.map((row) => `${row.join(' ')} 0 0`).join('  ') + '  0 0 0 1 0';

export type VisionMode = 'normal' | 'blur1' | 'blur2' | 'grayscale' | 'deuteranopia' | 'protanopia';

export const VISION_LABEL: Record<VisionMode, string> = {
  normal: 'Normal',
  blur1: 'Gaussian blur σ 1 px',
  blur2: 'Gaussian blur σ 2 px',
  grayscale: 'Grayscale (luminance only)',
  deuteranopia: 'Deuteranopia (Machado 2009, severity 1.0)',
  protanopia: 'Protanopia (Machado 2009, severity 1.0)',
};

const FILTER_ID: Record<Exclude<VisionMode, 'normal'>, string> = {
  blur1: 'hamilton-vision-blur1',
  blur2: 'hamilton-vision-blur2',
  grayscale: 'hamilton-vision-grayscale',
  deuteranopia: 'hamilton-deuteranopia',
  protanopia: 'hamilton-protanopia',
};

/** All filter definitions. Render once per document (idempotent if repeated: same ids, same content). */
export function VisionFilterDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
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
      {/* σ in CSS px: the filtered element is HTML, so user space = CSS px. */}
      <filter id={FILTER_ID.blur1} x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation={1} />
      </filter>
      <filter id={FILTER_ID.blur2} x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation={2} />
      </filter>
    </svg>
  );
}

export function visionFilterCss(mode: VisionMode): string | undefined {
  return mode === 'normal' ? undefined : `url(#${FILTER_ID[mode]})`;
}

/** Wraps children in the given vision filter. */
export function VisionFilter({ mode, children }: { mode: VisionMode; children: ReactNode }) {
  return (
    <div style={{ filter: visionFilterCss(mode) }} data-vision={mode}>
      <VisionFilterDefs />
      {children}
    </div>
  );
}

/** Decorator driven by a boolean `deuteranopia` arg (Explorations/Track Symbology). */
export const withDeuteranopia: Decorator = (Story, ctx) => {
  if (!ctx.args.deuteranopia) return <Story />;
  return (
    <VisionFilter mode="deuteranopia">
      <Story />
    </VisionFilter>
  );
};

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
