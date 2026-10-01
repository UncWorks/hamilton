import type { Meta, StoryObj } from '@storybook/react';
import { EventTerminal } from './EventTerminal';
import {
  TERMINAL_EVENTS,
  TERMINAL_EVENTS_API,
  TERMINAL_EVENTS_FULL,
  at,
} from '@/stories/fixtures/avdiivka';
import type { DetectionEvent } from '@hamilton/contracts';

const meta = {
  title: 'Terminal/EventTerminal',
  component: EventTerminal,
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { iframeHeight: 200 },
      description: {
        component:
          'After-action log (Branding §7.2, 160px sticky bottom). Polls `GET :8080/api/events` every 1s — here the ' +
          'engine API is mocked via `parameters.engineApi`. Hover pauses tail-following (header flips to ' +
          '`--gating-primary`). Kind colors: modal_* → gating, fingerprint → trust-degraded, recovery → ' +
          'trust-nominal, everything else → text-secondary.',
      },
    },
  },
  args: { height: 160 },
  argTypes: { height: { control: { type: 'range', min: 64, max: 480, step: 8 } } },
} satisfies Meta<typeof EventTerminal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Avdiivka crescendo — `[18:42:14] unit_b · temporal_anomaly · cadence 1.0s → 6.1s` onward. */
export const Crescendo: Story = { parameters: { engineApi: { events: TERMINAL_EVENTS_API } } };

/** Lines arrive one per poll (tail-following live). Hover to pause. */
export const Streaming: Story = {
  parameters: { engineApi: { events: TERMINAL_EVENTS_API, stream: true } },
};

/** Engine up, no events yet. */
export const Empty: Story = { parameters: { engineApi: { events: [] } } };

/** Engine unreachable (503) — terminal keeps prior state (empty here). */
export const EngineUnreachable: Story = { parameters: { engineApi: { unreachable: true } } };

/** MAX_ROWS (80) — scroll + overflow behaviour. */
export const FullBuffer: Story = { parameters: { engineApi: { events: TERMINAL_EVENTS_FULL } } };

const ALL_KINDS: DetectionEvent[] = (
  [
    'temporal_anomaly',
    'stability',
    'spatial',
    'fingerprint',
    'modal_gated',
    'modal_selection',
    'recovery',
  ] as const
)
  .map((kind, i) => ({
    source_id: 'unit_b',
    kind,
    message: TERMINAL_EVENTS[i]?.message ?? kind,
    timestamp: at(i * 7),
  }))
  .reverse();

/** One line per `DetectionKind` — the kind → color mapping at a glance. */
export const AllKinds: Story = {
  args: { height: 220 },
  parameters: { engineApi: { events: ALL_KINDS }, docs: { story: { iframeHeight: 240 } } },
};

/** Expanded terminal (ops-center window, §7.3). */
export const Tall: Story = {
  args: { height: 420 },
  parameters: { engineApi: { events: TERMINAL_EVENTS_FULL }, docs: { story: { iframeHeight: 440 } } },
};
