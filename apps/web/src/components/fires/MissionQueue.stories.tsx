import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import type { ReactNode } from 'react';
import { MissionQueue } from './MissionQueue';
import { EventTerminal } from '@/components/terminal/EventTerminal';
import { AT_MY_COMMAND_S, useHamilton, type MissionBranches } from '@/store/hamilton';
import { TrustHeartbeat, type HamiltonSeed } from '@/stories/support/mocks';
import {
  B_SCORES,
  ab1001,
  ab1002,
  ab1003,
  liveTracks,
  missionState,
  missionsRecord,
} from '@/stories/fixtures/missions';

// Fires/Mission Row — the non-modal TSS fire-mission row that replaces the
// retired kill-chain modal (docs/plans/tss-mission-row.md). Every story seeds
// the real store; MissionQueue evaluates TSS at 1 Hz exactly as in the app, and
// a TrustHeartbeat re-stamps tracks like the engine's 1 Hz trust payloads.

function Frame({ frozen = [], children }: { frozen?: string[]; children?: ReactNode }) {
  return (
    <TrustHeartbeat frozen={frozen}>
      <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: 560 }}>
        <div style={{ background: 'var(--surface-panel)' }}>
          <MissionQueue />
        </div>
        {children}
        <EventTerminal height={150} />
      </div>
    </TrustHeartbeat>
  );
}

const seed = (bScore: number, missions: ReturnType<typeof missionState>[], extra: HamiltonSeed = {}, ageS: Parameters<typeof liveTracks>[1] = {}) =>
  (): HamiltonSeed => ({ tracks: liveTracks(bScore, ageS), missions: missionsRecord(...missions), ...extra });

const meta = {
  title: 'Fires/Mission Row',
  component: MissionQueue,
  parameters: {
    layout: 'padded',
    engineApi: { events: [] },
    docs: {
      story: { iframeHeight: 560 },
      description: {
        component:
          'Fire-mission queue with the inline **TSS** status (assessment §3 Alternative A; HS-05, HS-07, HS-16). ' +
          'Evaluated by `lib/tss.ts` against the TSS table in force (`DEFAULT_TSS_TABLE`, TSS-1): reliability = live J letter, ' +
          'report age = time since the source\'s last good update, accuracy = "n/a — no TLE source". Gated rows get a 2px ' +
          '`--gating-primary` left rule and a text chip ("FAIL", "E5") — never colour alone. Branches are buttons and keys ' +
          '`1`–`4` on a focused row. No modal, no scrim, no blur, no focus moves; the chip is `aria-live="polite"` only for the ' +
          'selected mission. Every branch is logged (terminal below: web FDC journal + the engine copy via `/api/modal/selection`). ' +
          'The `[DP 1 · FFIR-2 (planned)]` tag is a placeholder for Alternative C (not implemented).',
      },
    },
  },
  render: () => <Frame />,
} satisfies Meta<typeof MissionQueue>;

export default meta;
type Story = StoryObj<typeof meta>;

const row = (c: HTMLElement, id = 'AB1001') => within(c).findByTestId(`fm-row-${id}`);

/** 1:12 — the call for fire arrives while B is still C3 (0.65): TSS met, no rule, no branches. */
export const Pass: Story = {
  parameters: { hamilton: seed(B_SCORES.c3, [missionState(ab1001())]) },
  play: async ({ canvasElement }) => {
    const r = await row(canvasElement);
    await waitFor(() => expect(r).toHaveAttribute('data-verdict', 'PASS'));
    await expect(r).toHaveTextContent('TSS: PASS — RELIABILITY C3 (min C)');
  },
};

/** The target row: B rated D4 → TSS FAIL, rec. DO NOT LOAD, four branches. */
export const FailReliability: Story = {
  name: 'Fail — reliability (D4)',
  parameters: { hamilton: seed(B_SCORES.d4, [missionState(ab1001())]) },
  play: async ({ canvasElement }) => {
    const r = await row(canvasElement);
    await waitFor(() => expect(r).toHaveTextContent('TSS: FAIL — RELIABILITY D4 (min C)'));
    await expect(r).toHaveTextContent('DO NOT LOAD');
    await expect(document.querySelector('[role="dialog"], [aria-modal]')).toBeNull();
  },
};

/** 1:15 live value: B collapses to E5 (0.13). */
export const FailReliabilityE5: Story = {
  name: 'Fail — reliability (E5, 1:15)',
  parameters: { hamilton: seed(B_SCORES.e5, [missionState(ab1001())]) },
};

/** B's last report is 14 s old (> 10 s max report age): STALE → F6, both checks fail. B's timestamp is frozen. */
export const FailAge: Story = {
  name: 'Fail — report age (STALE → F6)',
  parameters: { hamilton: seed(0.9, [missionState(ab1001())], {}, { unit_b: 14 }) },
  render: () => <Frame frozen={['unit_b']} />,
  play: async ({ canvasElement }) => {
    const r = await row(canvasElement);
    await waitFor(() => expect(r).toHaveTextContent(/RELIABILITY F6 \(min C\) · AGE 1\ds > 10s \(STALE\)/));
  },
};

/** AB1001 planned as M795 HE with B at E5: unguided is never gated — trust still shown, no rule, no rec. */
export const UnguidedNeverGated: Story = {
  parameters: {
    hamilton: seed(B_SCORES.e5, [
      missionState(ab1001(undefined, { munition: { designation: 'M795', name: 'HE', class: 'unguided' } })),
    ]),
  },
  play: async ({ canvasElement }) => {
    const r = await row(canvasElement);
    await waitFor(() => expect(r).toHaveTextContent('NOT GATED'));
    await expect(r).toHaveTextContent('E5');
    await expect(within(r).queryByText(/DO NOT LOAD/)).toBeNull();
  },
};

function ConfirmMock() {
  const receive = useHamilton((s) => s.receiveConfirmation);
  const awaiting = useHamilton((s) => s.missions.AB1001?.branches.confirmation?.status === 'awaiting');
  return (
    <button
      type="button"
      data-testid="mock-confirm"
      disabled={!awaiting}
      onClick={() => receive('AB1001', 'FM voice (S6)')}
      style={{ justifySelf: 'start', padding: 'var(--space-2) var(--space-3)', border: '1px dashed var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-micro)' }}
    >
      Storybook mock: S6 confirmation received (FM voice)
    </button>
  );
}

/** [2] chosen: AWAITING CONFIRMATION. The mock button plays the S6 — credibility → 1 (E1), TSS re-runs and passes (HS-13). */
export const AwaitingConfirmation: Story = {
  name: 'Awaiting confirmation → confirmed',
  parameters: {
    hamilton: seed(B_SCORES.e5, [
      missionState(ab1001(), { confirmation: { status: 'awaiting', requested_at: new Date().toISOString() } } satisfies MissionBranches),
    ]),
  },
  render: () => (
    <Frame>
      <ConfirmMock />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const r = await row(canvasElement);
    await waitFor(() => expect(r).toHaveTextContent('AWAITING CONFIRMATION'));
    await userEvent.click(await c.findByTestId('mock-confirm'));
    await waitFor(() => expect(r).toHaveAttribute('data-verdict', 'PASS'));
    await expect(r).toHaveTextContent('RELIABILITY E1 CONFIRMED');
  },
};

/** [3] chosen: method of control AT MY COMMAND, visible 60 s re-rate countdown; guns may lay. */
export const AtMyCommand: Story = {
  name: 'AT MY COMMAND countdown',
  parameters: {
    hamilton: () => {
      const now = Date.now();
      return seed(B_SCORES.e5, [
        missionState(ab1001(), {
          atMyCommand: { started_at: new Date(now).toISOString(), until: new Date(now + AT_MY_COMMAND_S * 1000).toISOString() },
        }),
      ])();
    },
  },
  play: async ({ canvasElement }) => {
    const r = await row(canvasElement);
    await waitFor(() => expect(r).toHaveTextContent(/AT MY COMMAND — re-rate in \d+ s/));
    await expect(r).toHaveTextContent('guns may lay');
  },
};

/** [4]: inline risk form (no modal). Disabled for FDC; FSO + initials + reason accepts risk; HPT exception (min D) → D4 passes. */
export const AcceptRisk: Story = {
  name: 'Accept risk form',
  parameters: { hamilton: seed(B_SCORES.d4, [missionState(ab1001())]) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const r = await row(canvasElement);
    await waitFor(() => expect(r).toHaveAttribute('data-verdict', 'FAIL'));
    await userEvent.click(await c.findByTestId('fm-branch-4-AB1001'));
    const submit = await c.findByTestId('fm-risk-submit-AB1001');
    await userEvent.type(c.getByTestId('fm-risk-initials-AB1001'), 'JD');
    await userEvent.type(c.getByTestId('fm-risk-reason-AB1001'), 'HPT; mortar firing on A');
    await expect(submit).toBeDisabled(); // role still FDC
    await userEvent.selectOptions(c.getByTestId('fm-risk-role-AB1001'), 'FSO');
    await expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await waitFor(() => expect(r).toHaveTextContent('RISK ACCEPTED'));
    await expect(r).toHaveAttribute('data-verdict', 'PASS');
  },
};

/** Form open, untouched — the FDC sees why it is disabled. */
export const AcceptRiskFormOpen: Story = {
  name: 'Accept risk form (open, FDC)',
  parameters: { hamilton: seed(B_SCORES.d4, [missionState(ab1001())]) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByTestId('fm-branch-4-AB1001'));
  },
};

/** HS-16: the mission is already firing when B collapses — the row recommends CHECK FIRING / CEASE LOADING as text to the FDC. Nothing auto-executes. */
export const FiringThenCollapse: Story = {
  name: 'Firing → collapse (CHECK FIRING rec.)',
  parameters: { hamilton: seed(B_SCORES.e5, [missionState(ab1001(undefined, { status: 'firing' }))]) },
  play: async ({ canvasElement }) => {
    const r = await row(canvasElement);
    await waitFor(() => expect(r).toHaveTextContent('Rec. to FDC: CHECK FIRING / CEASE LOADING'));
  },
};

/** Three open missions: only AB1001 (B ∩ failing ∩ GPS) carries the rule; AB1002 (unguided) and AB1003 (laser, A healthy) are quiet. */
export const MultipleMissions: Story = {
  parameters: {
    hamilton: () => {
      const t = Date.now();
      const iso = (s: number) => new Date(t - s * 1000).toISOString();
      return seed(B_SCORES.e5, [missionState(ab1002(iso(42))), missionState(ab1001(iso(3))), missionState(ab1003(iso(1)))])();
    },
  },
};

/** Escalation ladder levels 0–2: B is E5 but no mission is open — the queue renders nothing (HS-15). */
export const NoMissionNoChange: Story = {
  name: 'Degraded source, no mission (renders nothing)',
  parameters: { hamilton: seed(B_SCORES.e5, []) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByTestId('mission-queue')).toBeNull();
  },
};

/** Keyboard: Tab to the row, press 1 → re-planned to M795, TSS PASS, journal line logged. Focus stays on the row. */
export const KeyboardPlay: Story = {
  name: 'Keyboard (Tab, 1)',
  parameters: { hamilton: seed(B_SCORES.e5, [missionState(ab1001())]) },
  play: async ({ canvasElement }) => {
    const r = await row(canvasElement);
    await waitFor(() => expect(r).toHaveAttribute('data-verdict', 'FAIL'));
    await userEvent.tab();
    await expect(r).toHaveFocus();
    await expect(r.querySelector('[aria-live="polite"]')).not.toBeNull();
    await userEvent.keyboard('1');
    await waitFor(() => expect(r).toHaveAttribute('data-verdict', 'PASS'));
    await expect(r).toHaveFocus();
    await expect(r).toHaveTextContent('M795 (UNGUIDED)');
    await waitFor(() => expect(canvasElement).toHaveTextContent('[1] shift M982 → M795 HE'));
  },
};
