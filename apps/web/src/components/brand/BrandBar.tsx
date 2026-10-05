'use client';

import { Wordmark } from './Wordmark';
import { LlmToggle } from '@/components/toggle/LlmToggle';
import { AdminMenu } from '@/components/admin/AdminMenu';
import { useTssFailedThisSession } from '@/store/hamilton';
import {
  useAdminEnabled,
  useDemoHiddenCount,
  useDemoViewPersistence,
  useDemoVisible,
} from '@/store/demo-view';

const BAR_HEIGHT = 56;

export interface BrandBarProps {
  /**
   * Force the admin gate (stories / tests only). Omitted in the app, where the
   * gate is `useAdminEnabled()` (docs/plans/admin-demo-menu.md D6).
   */
  adminOverride?: boolean;
}

export function BrandBar({ adminOverride }: BrandBarProps) {
  const tssFailed = useTssFailedThisSession();
  // BrandBar always mounts, so the demo view hydrates / persists here (admin only).
  useDemoViewPersistence();
  const adminGate = useAdminEnabled();
  const admin = adminOverride ?? adminGate;
  const hiddenCount = useDemoHiddenCount();
  const showLlm = useDemoVisible('bar.llmToggle');
  const showOperator = useDemoVisible('bar.operator');
  const showHairline = useDemoVisible('bar.hairline');

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        height: BAR_HEIGHT,
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: 'var(--space-6)',
        padding: '0 var(--space-6)',
        background: 'var(--surface-base)',
        borderBottom: '1px solid var(--surface-panel)',
      }}
    >
      <div style={{ display: 'grid', gap: 4 }}>
        <Wordmark />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-micro)',
            color: 'var(--text-tertiary)',
            letterSpacing: 0,
          }}
        >
          link reliability for fires
        </span>
        {/* Hairline rule — Branding §8.1 / §10.6.
         * Activates when any fire mission has failed TSS this session, and
         * stays on for the rest of the session. The visual stamp of "Hamilton was on its
         * feet."
         * Demo view (plan D8): when `bar.hairline` is hidden it never shows;
         * the 1px box stays at opacity 0, as when off, so the lockup does
         * not shift.
         */}
        <div
          data-demo-hidden={showHairline ? undefined : ''}
          aria-hidden
          className={tssFailed && showHairline ? 'motion-hairline-extend' : undefined}
          style={{
            height: 1,
            background: 'var(--gating-primary)',
            opacity: tssFailed && showHairline ? 0.6 : 0,
            transition: 'opacity 240ms var(--ease-out-expo)',
          }}
        />
      </div>
      <div />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-micro)',
          color: 'var(--text-tertiary)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {showLlm ? <LlmToggle /> : null}
        {showOperator ? <span aria-label="Operator">FDC · ADAM</span> : null}
        {admin && hiddenCount > 0 ? (
          <span
            data-testid="demo-view-marker"
            title="Demo view: some COP components are hidden on this screen"
            style={{
              padding: '1px 6px',
              border: '1px dashed var(--text-tertiary)',
              borderRadius: 2,
              color: 'var(--text-tertiary)',
              whiteSpace: 'nowrap',
            }}
          >
            Demo view · {hiddenCount} hidden
          </span>
        ) : null}
        {admin ? <AdminMenu /> : null}
      </div>
    </header>
  );
}
