import { existsSync } from 'node:fs';

// Basemap (System Design §6c, src/lib/basemap.ts): offline when the
// provisioned assets exist (`make fetch-tiles`), none otherwise;
// NEXT_PUBLIC_BASEMAP overrides. Resolved at build time — NEXT_PUBLIC_*
// values are inlined into the client bundle.
const tilesPresent = existsSync(new URL('./public/tiles/avdiivka.pmtiles', import.meta.url));
const basemap = process.env.NEXT_PUBLIC_BASEMAP || (tilesPresent ? 'offline' : 'none');
// DEV ONLY, not NFR-01: the online basemap pulls OSM raster tiles. The CSP
// opens that one origin only in this mode; offline / none stay 'self'-only.
const ONLINE_TILE_ORIGIN = 'https://tile.openstreetmap.org';
const onlineOrigins = basemap === 'online' ? ` ${ONLINE_TILE_ORIGIN}` : '';
// The broker WebSocket the client connects to (useHamiltonMqtt); a stack on
// other ports (e.g. ws://localhost:9002) must be allowed by connect-src too.
const mqttWsOrigin = process.env.NEXT_PUBLIC_MQTT_WS_URL || 'ws://localhost:9001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASEMAP: basemap,
  },
  // NFR-01: no external assets at runtime. Disable image optimization domains
  // (we self-host everything in /public).
  images: {
    unoptimized: true,
  },
  transpilePackages: ['@hamilton/contracts'],
  async headers() {
    const csp = [
      "default-src 'self'",
      // Cesium ships inline workers and shader compilation needs eval.
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${onlineOrigins}`,
      "font-src 'self'",
      "worker-src 'self' blob:",
      // Basemap tiles + glyphs (/tiles) are same-origin.
      `connect-src 'self' ${mqttWsOrigin} http://localhost:8080${onlineOrigins}`,
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ');
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
