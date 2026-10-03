import type { Meta, StoryObj } from '@storybook/react';
import { TssInForceStrip, TssTableView } from './TssInForce';
import { DEFAULT_TSS_TABLE } from '@/lib/tss';

const meta = {
  title: 'Fires/TSS in force',
  component: TssTableView,
  parameters: {
    docs: {
      description: {
        component:
          'Target selection standards / attack-guidance thresholds per munition class (assessment §3 Alternative B; HS-10). ' +
          'A versioned configuration (`TssTable`: version, DTG, approver role, rows) — commander-approved via the FSO — ' +
          'replacing the single `NEXT_PUBLIC_ROE_FLOOR` constant. Read-only here; an editor is deferred. ' +
          'The strip is what the mission panel shows above the queue.',
      },
    },
  },
  args: { table: DEFAULT_TSS_TABLE },
} satisfies Meta<typeof TssTableView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** TSS-1, the user-accepted defaults. */
export const Table: Story = {};

/** The one-line "TSS in force" strip on the mission panel. */
export const Strip: Story = {
  render: ({ table }) => (
    <div style={{ maxWidth: 520, background: 'var(--surface-panel)', padding: 'var(--space-4)' }}>
      <TssInForceStrip table={table} />
    </div>
  ),
};

/** A tightened version (GPS-guided at B, e.g. inside an RFA) — what a re-approval would put in force. */
export const Tightened: Story = {
  args: {
    table: {
      ...DEFAULT_TSS_TABLE,
      version: 'TSS-2',
      dtg: '2024-02-15T18:30:00.000Z',
      rows: DEFAULT_TSS_TABLE.rows.map((r) =>
        r.id === 'gps_guided' ? { ...r, min_reliability: 'B' as const, notes: 'Tightened to B: RFA around OBJ IRON.' } : r,
      ),
    },
  },
};
