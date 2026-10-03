'use client';

// Rasterises the production symbol (components/symbol trackSymbolSvg) to a
// PNG data URL for Cesium billboards, cached by lib/cop-symbols symbolImageKey.
//
// Why PNG and not the SVG data URL directly: Cesium 1.141 rasterises SVG
// billboard URIs at the billboard's CSS size (Billboard#_computeImageTextureProperties),
// i.e. 1× — blurry J / T text on a HiDPI screen. A PNG drawn at devicePixelRatio
// and shown at CSS width/height is crisp, and its data URL doubles as the
// texture-atlas id, so billboards that share a key share one atlas entry.

import { trackSymbolSvg, type SymbolOptions, type SymbolTrack } from '@/components/symbol';

export interface RasterSymbol {
  /** PNG data URL at `pixelRatio`×. */
  url: string;
  /** CSS px. */
  width: number;
  height: number;
  /** Frame centre within the image, CSS px. */
  anchor: [number, number];
}

const MAX_ENTRIES = 512;
const cache = new Map<string, RasterSymbol>();
const pending = new Map<string, Promise<RasterSymbol>>();

export function symbolPixelRatio(): number {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.min(3, Math.max(2, Math.ceil(dpr)));
}

/** Cached raster for `key`, if it is ready. */
export function cachedRaster(key: string): RasterSymbol | undefined {
  return cache.get(key);
}

export function rasterizeSymbol(key: string, track: SymbolTrack, opts: SymbolOptions, pixelRatio: number): Promise<RasterSymbol> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const img = trackSymbolSvg(track, { ...opts, pixelRatio });
  const p = new Promise<RasterSymbol>((resolve, reject) => {
    const el = new Image();
    el.decoding = 'async';
    el.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(img.width);
      canvas.height = Math.ceil(img.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('2d context unavailable'));
      ctx.drawImage(el, 0, 0, img.width, img.height);
      const r: RasterSymbol = {
        url: canvas.toDataURL('image/png'),
        width: img.width / pixelRatio,
        height: img.height / pixelRatio,
        anchor: [img.anchor[0] / pixelRatio, img.anchor[1] / pixelRatio],
      };
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
      cache.set(key, r);
      pending.delete(key);
      resolve(r);
    };
    el.onerror = () => {
      pending.delete(key);
      reject(new Error(`symbol raster failed: ${key}`));
    };
    el.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(img.svg)}`;
  });
  pending.set(key, p);
  return p;
}
