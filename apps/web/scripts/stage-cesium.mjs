#!/usr/bin/env node
// Copy node_modules/cesium/Build/Cesium/* into public/cesium/ so the demo
// loads Cesium as a static <script> tag from same-origin (NFR-01).
// Skipped silently if cesium isn't installed (e.g. in a partial install).

import { existsSync, mkdirSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const candidates = [
  path.join(root, 'node_modules/cesium/Build/Cesium'),
  path.join(root, '../../node_modules/cesium/Build/Cesium'),
  path.join(root, '../../node_modules/.pnpm/node_modules/cesium/Build/Cesium'),
];

const src = candidates.find((c) => existsSync(c));
if (!src) {
  console.log('[stage-cesium] cesium not installed; skipping');
  process.exit(0);
}

const dest = path.join(root, 'public/cesium');
mkdirSync(dest, { recursive: true });

await cp(src, dest, { recursive: true });
console.log(`[stage-cesium] copied ${src} -> ${dest}`);
