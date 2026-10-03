// Mirrors app/layout.tsx: set CESIUM_BASE_URL, then load the staged static
// build from /public/cesium (served by Storybook staticDirs). Used as a story
// `loader` so only Cesium stories pay the ~4 MB script cost.

let pending: Promise<boolean> | null = null;

export function loadCesiumGlobal(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Cesium) return Promise.resolve(true);
  if (pending) return pending;
  pending = new Promise<boolean>((resolve) => {
    window.CESIUM_BASE_URL = '/cesium/';
    if (!document.querySelector('link[data-cesium-widgets]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/cesium/Widgets/widgets.css';
      link.dataset.cesiumWidgets = 'true';
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = '/cesium/Cesium.js';
    script.async = true;
    script.onload = () => resolve(true);
    // Not staged (fresh clone without postinstall) — the story renders the
    // component's own "no cesium" path instead of throwing.
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return pending;
}

export const cesiumLoader = async () => ({ cesiumAvailable: await loadCesiumGlobal() });
