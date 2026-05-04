'use client';

// Cesium is loaded as a static <script> from /cesium/Cesium.js (see
// app/layout.tsx). It exposes the global `window.Cesium`. CESIUM_BASE_URL
// MUST be set before that script runs so all worker / asset / widget fetches
// stay on-origin (NFR-01: no cesium.com calls).
//
// We expose a small typed accessor so component code never reaches into
// `window` directly.

import type * as CesiumNs from 'cesium';

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
    Cesium?: typeof CesiumNs;
  }
}

export const CESIUM_BASE_URL = '/cesium/';

/** Resolve once the global is available. Polls at 16ms; gives up after
 * `timeoutMs`. Used by lazy-mounted spine components. */
export function waitForCesium(timeoutMs = 8000): Promise<typeof CesiumNs> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('cesium not available server-side'));
      return;
    }
    const start = performance.now();
    const tick = () => {
      if (window.Cesium) {
        resolve(window.Cesium);
        return;
      }
      if (performance.now() - start > timeoutMs) {
        reject(new Error(`cesium global not available after ${timeoutMs}ms`));
        return;
      }
      setTimeout(tick, 16);
    };
    tick();
  });
}
