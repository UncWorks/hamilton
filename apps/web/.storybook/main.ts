import { existsSync } from 'node:fs';
import path from 'node:path';
import type { StorybookConfig } from '@storybook/nextjs';

// Storybook for the Hamilton COP. Dev-only tooling: nothing here ships in the
// Next.js bundle and every package is a devDependency (NFR-07 runtime budget
// is untouched — see src/stories/BrandingAudit.mdx §Dependency impact).

const MQTT_MOCK = path.resolve(__dirname, 'mocks/mqtt-client.ts');
const MQTT_REAL = path.resolve(__dirname, '../src/lib/mqtt-client');

const config: StorybookConfig = {
  stories: [
    '../src/stories/**/*.mdx',
    '../src/**/*.stories.@(ts|tsx)',
  ],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/nextjs',
    options: {},
  },
  // /public carries the self-hosted fonts (/fonts) and the staged Cesium
  // build (/cesium, copied by scripts/stage-cesium.mjs on postinstall) and
  // the offline basemap (/tiles, provisioned by `make fetch-tiles`), so
  // stories resolve the same on-origin URLs as the app (NFR-01).
  staticDirs: ['../public'],
  docs: {
    defaultName: 'Docs',
  },
  core: {
    disableTelemetry: true,
  },
  // Same basemap default as next.config.mjs: offline when `make fetch-tiles`
  // has provisioned /public/tiles, none otherwise (src/lib/basemap.ts).
  env: (cfg) => ({
    ...cfg,
    NEXT_PUBLIC_BASEMAP:
      process.env.NEXT_PUBLIC_BASEMAP ||
      (existsSync(path.resolve(__dirname, '../public/tiles/avdiivka.pmtiles')) ? 'offline' : 'none'),
  }),
  webpackFinal: async (cfg) => {
    // Swap the live MQTT client for a scripted, broker-free replay. Both the
    // alias request and the tsconfig-path-resolved absolute request are
    // covered so the swap holds regardless of resolver plugin order.
    cfg.resolve ??= {};
    cfg.resolve.alias = {
      ...(cfg.resolve.alias as Record<string, string> | undefined),
      '@/lib/mqtt-client$': MQTT_MOCK,
      [MQTT_REAL]: MQTT_MOCK,
      [`${MQTT_REAL}.ts`]: MQTT_MOCK,
    };
    // Cesium/deck.gl chunks are large by nature; size hints are noise here.
    cfg.performance = { hints: false };
    return cfg;
  },
};

export default config;
