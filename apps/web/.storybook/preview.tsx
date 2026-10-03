import type { Preview } from '@storybook/react';
import { themes } from 'storybook/internal/theming';
// The app's real global stylesheet: tokens.css + typography.css (@font-face
// for Inter Tight / JetBrains Mono from /public/fonts) + motion.css.
import '../app/global.css';
import {
  installEngineApi,
  seedHamilton,
  setMqttScript,
  type EngineApiMock,
  type HamiltonSeed,
  type MqttScript,
} from '../src/stories/support/mocks';

type SeedParam = HamiltonSeed | ((args: Record<string, unknown>) => HamiltonSeed);

const SURFACES = {
  base: 'var(--surface-base)',
  panel: 'var(--surface-panel)',
  elevated: 'var(--surface-elevated)',
} as const;

const preview: Preview = {
  parameters: {
    layout: 'padded',
    controls: { expanded: true, matchers: { color: /(background|color)$/i } },
    // Hamilton is dark-only by spec (Branding §3.1, viewport colorScheme
    // 'dark'). The canvas background is driven by the Surface toolbar below,
    // so the stock backgrounds addon is disabled to avoid two sources.
    backgrounds: { disable: true },
    docs: {
      // Every story renders in its own iframe in Docs: the Zustand store is a
      // module singleton, so inline stories on one Docs page would share it.
      story: { inline: false, iframeHeight: 320 },
      theme: themes.dark,
    },
    options: {
      storySort: {
        order: [
          'Introduction',
          'Foundations',
          ['Colors', 'Trust Bands', 'Typography', 'Iconography', 'Spacing', 'Motion'],
          'Branding Audit',
          'Decisions',
          ['Track Symbology', 'Evidence'],
          'Brand',
          'Panel',
          'Fires',
          ['Mission Row', 'TSS in force'],
          'Terminal',
          'Toggle',
          'COP',
          'Pages',
          'Archive',
          ['Track Symbology', 'Halo Options', 'At-a-Glance Variants'],
        ],
      },
    },
  },
  globalTypes: {
    surface: {
      description: 'Canvas surface tier (Branding §3.1)',
      toolbar: {
        title: 'Surface',
        icon: 'paintbrush',
        items: [
          { value: 'base', title: '--surface-base' },
          { value: 'panel', title: '--surface-panel' },
          { value: 'elevated', title: '--surface-elevated' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { surface: 'base' },
  beforeEach: async ({ parameters, args }) => {
    const seed = parameters.hamilton as SeedParam | undefined;
    seedHamilton(typeof seed === 'function' ? seed(args as Record<string, unknown>) : seed);
    installEngineApi(parameters.engineApi as EngineApiMock | undefined);
    const mqtt = parameters.mqtt as { script?: MqttScript; tickMs?: number } | undefined;
    setMqttScript(mqtt?.script, mqtt?.tickMs);
  },
  decorators: [
    (Story, { globals, parameters }) => {
      const surface = SURFACES[(globals.surface as keyof typeof SURFACES) ?? 'base'];
      if (typeof document !== 'undefined') {
        document.body.style.background = surface;
      }
      return (
        <div
          style={{
            background: surface,
            color: 'var(--text-secondary)',
            minHeight: parameters.layout === 'fullscreen' ? '100vh' : undefined,
          }}
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
