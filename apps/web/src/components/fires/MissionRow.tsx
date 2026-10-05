'use client';

// One fire mission in the queue, with its inline TSS status (assessment §3
// Alternative A). Non-modal by construction: no portal, no scrim, no blur, no
// focus moves. Attention is a 2px left rule + a text chip ("FAIL", "D4"),
// never colour alone, and only when mission ∩ failing source ∩ gated munition.
//
//   FM AB1001 | OBS B (FO) | M982 (GPS) | TSS: FAIL — RELIABILITY D4 (min C) · AGE 3s OK
//             | Rec. method of control: DO NOT LOAD (M982)
//             | Branches: [1] Shift → M795 HE …  [2] Confirm via alt channel
//             |           [3] AT MY COMMAND — re-rate in 60 s   [4] Accept risk… (FSO)

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import type { DependencyRole, MunitionClass } from '@hamilton/contracts';
import { formatDtg } from '@/lib/link-trust-rating';
import {
  AT_MY_COMMAND_S,
  BRANCH_KEYS,
  SHIFT_MUNITION,
  type Decider,
  type DeciderRole,
  type MissionState,
  type TssBranchId,
} from '@/store/hamilton';

const CLASS_SHORT: Record<MunitionClass, string> = {
  gps_guided: 'GPS',
  laser_guided: 'LASER',
  unguided: 'UNGUIDED',
};

const ROLE_SHORT: Record<DependencyRole, string> = {
  observer_link: 'obs',
  target_location: 'tgt loc',
  firing_unit_nav: 'FU nav',
};

const mono = { fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' } as const;

/** "unit_b" → "B" (COP designation). */
export const designation = (source_id: string) => source_id.replace(/^unit_/, '').toUpperCase();

export interface MissionRowProps {
  ms: MissionState;
  /** Wall clock, epoch ms (drives the AT MY COMMAND countdown). */
  now: number;
  selected: boolean;
  onSelect: () => void;
  onBranch: (branch: TssBranchId, opts?: { by?: Decider; reason?: string }) => void;
}

export function MissionRow({ ms, now, selected, onSelect, onBranch }: MissionRowProps) {
  const [riskOpen, setRiskOpen] = useState(false);
  const { mission, tss, branches } = ms;
  if (!tss) return null;

  const fail = tss.verdict === 'FAIL';
  const firing = mission.status === 'firing';
  const amcLeft = branches.atMyCommand
    ? Math.max(0, Math.ceil((Date.parse(branches.atMyCommand.until) - now) / 1000))
    : null;
  const awaiting = branches.confirmation?.status === 'awaiting';
  const hpt = mission.target.class === 'hpt';
  const showBranches = fail && tss.gated && !firing;

  const enabled: Record<TssBranchId, boolean> = {
    shift_munition: showBranches,
    confirm_alt: showBranches && !branches.confirmation,
    at_my_command: showBranches && !branches.atMyCommand,
    accept_risk: showBranches && hpt && !branches.riskAccepted,
  };

  const trigger = (b: TssBranchId) => {
    if (!enabled[b]) return;
    if (b === 'accept_risk') setRiskOpen(true);
    else onBranch(b);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const el = e.target as HTMLElement;
    if (el.closest('input, textarea, select')) {
      if (e.key === 'Escape') setRiskOpen(false);
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const branch = (Object.keys(BRANCH_KEYS) as TssBranchId[]).find((b) => BRANCH_KEYS[b] === e.key);
    if (branch && showBranches) {
      e.preventDefault();
      trigger(branch);
    } else if (e.key === 'Escape' && riskOpen) {
      setRiskOpen(false);
    }
  };

  // A mission that needs nothing from the FDC (not selected, no recommendation,
  // no branches) folds to its two status lines so a FAIL row below keeps room.
  const compact = !selected && !tss.recommended && !showBranches && !riskOpen;
  const chip = !tss.gated ? 'NOT GATED' : tss.verdict;
  const state = stateText(ms, amcLeft);

  return (
    <article
      className="fm-row"
      tabIndex={0}
      data-testid={`fm-row-${mission.mission_id}`}
      data-verdict={tss.verdict}
      data-compact={compact || undefined}
      aria-label={`Fire mission ${mission.mission_id}, ${mission.observer.label}, ${mission.munition.designation}. TSS ${tss.headline}${
        tss.recommended ? `. Recommended method of control: ${tss.recommended}` : ''
      }${showBranches ? '. Branches: keys 1 to 4.' : ''}`}
      aria-current={selected ? 'true' : undefined}
      onFocus={onSelect}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      style={{
        display: 'grid',
        gap: 'var(--space-2)',
        padding: 'var(--space-3) var(--space-3) var(--space-3) var(--space-4)',
        background: selected ? 'var(--surface-elevated)' : 'var(--surface-base)',
        borderLeft: `2px solid ${fail ? 'var(--gating-primary)' : 'var(--surface-elevated)'}`,
        color: 'var(--text-secondary)',
        fontSize: 'var(--text-body)',
      }}
    >
      {/* Line 1: FM id | observer | munition | TSS */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 'var(--space-3)', rowGap: 'var(--space-1)' }}>
        <span style={{ ...mono, color: 'var(--text-primary)', fontWeight: 600 }}>FM {mission.mission_id}</span>
        <Sep />
        <span style={mono}>{mission.observer.label}</span>
        <Sep />
        <span style={mono}>
          {mission.munition.designation} ({CLASS_SHORT[mission.munition.class]})
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        {/* Live only for the selected mission; never assertive. */}
        <span aria-live={selected ? 'polite' : 'off'} aria-atomic="true" style={{ display: 'inline-flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Chip tone={fail ? 'gating' : 'quiet'} testId={`fm-chip-${mission.mission_id}`}>
            {chip}
          </Chip>
          {state && <Chip tone="quiet">{state}</Chip>}
          <span className="sr-only" style={srOnly}>
            TSS {tss.headline}
          </span>
        </span>
        <span aria-hidden style={{ ...mono, color: fail ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          TSS: {tss.headline}
        </span>
      </div>

      {/* Line 2: recommended method of control (text to the FDC, never a command) */}
      {compact ? null : tss.recommended ? (
        <div style={{ ...mono, color: 'var(--text-primary)' }} data-testid={`fm-rec-${mission.mission_id}`}>
          {firing ? 'Rec. to FDC: ' : 'Rec. method of control: '}
          <strong style={{ color: 'var(--gating-primary)', fontWeight: 600 }}>{tss.recommended}</strong>{' '}
          ({firing ? `mission firing; ${designation(tss.lead.source_id)} ${tss.lead.j}` : mission.munition.designation})
          {tss.recommended === 'AT MY COMMAND' && ' · guns may lay'}
        </div>
      ) : tss.gated ? (
        <div style={{ ...mono, color: 'var(--text-tertiary)' }}>Rec. method of control: none — TSS met</div>
      ) : null}

      {/* Detail: checks + dependency set */}
      {!compact && (
        <div style={{ ...mono, fontSize: 'var(--text-micro)', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
          <div>
            Checks: reliability {checkText(tss.checks.reliability)} · report age {checkText(tss.checks.reportAge)} · accuracy{' '}
            {tss.checks.accuracy.text}
          </div>
          <div>
            Depends on:{' '}
            {tss.sources.map((s, i) => (
              <span key={s.source_id} style={{ color: s.failing ? 'var(--text-primary)' : undefined }}>
                {i > 0 ? ' · ' : ''}
                {designation(s.source_id)} {s.roles.map((r) => ROLE_SHORT[r]).join('/')} {s.j}
                {s.failing ? ' FAIL' : ''}
              </span>
            ))}{' '}
            · {mission.firing_unit.label} · tgt {mission.target.grid}
            {mission.target.class === 'hpt' ? ' (HPT)' : ''}
          </div>
          {branches.shifted && (
            <div>
              Re-planned {branches.shifted.from.designation} → {mission.munition.designation} {mission.munition.name} by{' '}
              {branches.shifted.by.role}/{branches.shifted.by.initials} {formatDtg(branches.shifted.at)}
            </div>
          )}
          {branches.confirmation?.status === 'confirmed' && (
            <div>
              Confirmed via {branches.confirmation.via} {branches.confirmation.confirmed_at ? formatDtg(branches.confirmation.confirmed_at) : ''} ·
              credibility → 1
            </div>
          )}
          {branches.riskAccepted && (
            <div>
              Risk accepted by {branches.riskAccepted.by.role}/{branches.riskAccepted.by.initials} {formatDtg(branches.riskAccepted.at)} — “
              {branches.riskAccepted.reason}” · evaluated against {tss.row.label}
            </div>
          )}
        </div>
      )}

      {showBranches && (
        <div role="group" aria-label={`Branches for ${mission.mission_id}`} style={{ display: 'grid', gap: 'var(--space-1)' }}>
          <span style={{ ...mono, fontSize: 'var(--text-micro)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Branches
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-1)' }}>
            <Branch
              k="1"
              id={mission.mission_id}
              enabled={enabled.shift_munition}
              onClick={() => trigger('shift_munition')}
              label={`Shift → ${SHIFT_MUNITION.designation} ${SHIFT_MUNITION.name}, adjust fire`}
              consequence="Re-plans the round; unguided is not gated"
            />
            <Branch
              k="2"
              id={mission.mission_id}
              enabled={enabled.confirm_alt}
              pressed={!!branches.confirmation}
              onClick={() => trigger('confirm_alt')}
              label={awaiting ? 'Awaiting confirmation…' : 'Confirm via alt channel'}
              consequence="Credibility → 1 if confirmed"
            />
            <Branch
              k="3"
              id={mission.mission_id}
              enabled={enabled.at_my_command}
              pressed={amcLeft !== null}
              onClick={() => trigger('at_my_command')}
              label={amcLeft !== null ? `AT MY COMMAND — re-rate in ${amcLeft} s` : `AT MY COMMAND — re-rate in ${AT_MY_COMMAND_S} s`}
              consequence="Guns may lay; TSS re-rated at 0"
            />
            <Branch
              k="4"
              id={mission.mission_id}
              enabled={enabled.accept_risk}
              pressed={riskOpen}
              onClick={() => trigger('accept_risk')}
              label={hpt ? 'Accept risk… (FSO)' : 'Accept risk… (HPT only)'}
              consequence={hpt ? 'FSO / CDR; HPT exception min D' : 'No exception row for this target'}
            />
          </div>
        </div>
      )}

      {riskOpen && showBranches && (
        <RiskForm
          missionId={mission.mission_id}
          onCancel={() => setRiskOpen(false)}
          onSubmit={(by, reason) => {
            setRiskOpen(false);
            onBranch('accept_risk', { by, reason });
          }}
        />
      )}
    </article>
  );
}

function stateText(ms: MissionState, amcLeft: number | null): string | null {
  const b = ms.branches;
  if (amcLeft !== null) return `AT MY COMMAND · ${amcLeft} s`;
  if (b.confirmation?.status === 'awaiting') return 'AWAITING CONFIRMATION';
  if (b.riskAccepted) return 'RISK ACCEPTED';
  if (b.confirmation?.status === 'confirmed') return 'CONFIRMED';
  if (b.shifted) return 'RE-PLANNED';
  if (ms.mission.status === 'firing') return 'FIRING';
  return null;
}

const checkText = (s: 'pass' | 'fail' | 'na') => (s === 'pass' ? 'OK' : s === 'fail' ? 'FAIL' : 'n/a (not gated)');

const srOnly = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

function Sep() {
  return (
    <span aria-hidden style={{ color: 'var(--text-tertiary)' }}>
      |
    </span>
  );
}

function Chip({ children, tone, testId }: { children: ReactNode; tone: 'gating' | 'quiet'; testId?: string }) {
  return (
    <span
      data-testid={testId}
      style={{
        ...mono,
        fontSize: 'var(--text-micro)',
        fontWeight: 600,
        letterSpacing: '0.08em',
        padding: '1px var(--space-2)',
        border: `1px solid ${tone === 'gating' ? 'var(--gating-primary)' : 'var(--text-tertiary)'}`,
        color: tone === 'gating' ? 'var(--gating-primary)' : 'var(--text-secondary)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function Branch({
  k,
  id,
  label,
  consequence,
  enabled,
  pressed,
  onClick,
}: {
  k: string;
  id: string;
  label: string;
  consequence: string;
  enabled: boolean;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="fm-branch"
      data-testid={`fm-branch-${k}-${id}`}
      aria-keyshortcuts={k}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={!enabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        display: 'grid',
        gap: 2,
        textAlign: 'left',
        padding: 'var(--space-2) var(--space-3)',
        border: `1px solid ${pressed ? 'var(--gating-primary)' : 'var(--surface-elevated)'}`,
        color: 'var(--text-primary)',
        fontSize: 'var(--text-body)',
      }}
    >
      <span style={mono}>
        [{k}] {label}
      </span>
      <span style={{ fontSize: 'var(--text-micro)', color: 'var(--text-tertiary)' }}>{consequence}</span>
    </button>
  );
}

const ROLES: DeciderRole[] = ['FDC', 'FSO', 'CDR'];

function RiskForm({
  missionId,
  onCancel,
  onSubmit,
}: {
  missionId: string;
  onCancel: () => void;
  onSubmit: (by: Decider, reason: string) => void;
}) {
  const [role, setRole] = useState<DeciderRole>('FDC');
  const [initials, setInitials] = useState('');
  const [reason, setReason] = useState('');
  const authorised = role === 'FSO' || role === 'CDR';
  const valid = authorised && initials.trim().length >= 2 && reason.trim().length > 0;
  const field = {
    ...mono,
    fontSize: 'var(--text-body)',
    background: 'var(--surface-base)',
    color: 'var(--text-primary)',
    border: '1px solid var(--text-tertiary)',
    padding: 'var(--space-1) var(--space-2)',
  } as const;
  const label = { display: 'grid', gap: 2, fontSize: 'var(--text-micro)', color: 'var(--text-tertiary)', ...mono } as const;

  return (
    <form
      aria-label={`Accept risk on ${missionId}`}
      data-testid={`fm-risk-form-${missionId}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ role, initials: initials.trim().toUpperCase() }, reason.trim());
      }}
      style={{
        display: 'grid',
        gap: 'var(--space-2)',
        padding: 'var(--space-3)',
        border: '1px solid var(--gating-primary)',
      }}
    >
      <p style={{ margin: 0, fontSize: 'var(--text-micro)', color: 'var(--text-secondary)', ...mono }}>
        Risk decision. TSS are commander-approved: FSO or CDR only. Evaluated against the HPT exception row; logged.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: 'var(--space-2)', alignItems: 'end' }}>
        <label style={label}>
          Role
          <select className="fm-field" style={field} value={role} onChange={(e) => setRole(e.target.value as DeciderRole)} data-testid={`fm-risk-role-${missionId}`}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label style={label}>
          Initials
          <input
            className="fm-field"
            style={{ ...field, width: '6ch' }}
            value={initials}
            maxLength={4}
            onChange={(e) => setInitials(e.target.value)}
            data-testid={`fm-risk-initials-${missionId}`}
          />
        </label>
        <label style={label}>
          Reason
          <input
            className="fm-field"
            style={field}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid={`fm-risk-reason-${missionId}`}
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="submit"
          className="fm-branch"
          disabled={!valid}
          data-testid={`fm-risk-submit-${missionId}`}
          style={{ ...mono, padding: 'var(--space-1) var(--space-3)', border: '1px solid var(--gating-primary)', color: 'var(--text-primary)' }}
        >
          Accept risk
        </button>
        <button type="button" className="fm-branch" onClick={onCancel} style={{ ...mono, padding: 'var(--space-1) var(--space-3)', border: '1px solid var(--surface-elevated)' }}>
          Cancel
        </button>
        {!authorised && (
          <span style={{ ...mono, fontSize: 'var(--text-micro)', color: 'var(--text-tertiary)' }}>
            Disabled for {role}: requires FSO or CDR.
          </span>
        )}
      </div>
    </form>
  );
}
