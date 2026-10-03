// Small presentational helpers for the Foundations pages. Story-only.

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { readRootTokens, type Token } from './tokens';

export function useTokens(): Token[] {
  const [tokens, setTokens] = useState<Token[]>(() => readRootTokens());
  useEffect(() => {
    // Stylesheets can attach after first paint in the static build.
    const id = requestAnimationFrame(() => setTokens(readRootTokens()));
    const t = setTimeout(() => setTokens(readRootTokens()), 300);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
  }, []);
  return tokens;
}

export const mono: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
};

export function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 'var(--space-3)', marginBottom: 'var(--space-8)' }}>
      <header style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <h3
          style={{
            margin: 0,
            fontSize: 'var(--text-micro)',
            textTransform: 'uppercase',
            letterSpacing: '0.16em',
            color: 'var(--text-tertiary)',
          }}
        >
          {title}
        </h3>
        {note && <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--text-secondary)' }}>{note}</p>}
      </header>
      {children}
    </section>
  );
}

export function Swatch({ token, value, extra }: { token: string; value: string; extra?: ReactNode }) {
  return (
    <figure
      style={{
        margin: 0,
        display: 'grid',
        gridTemplateRows: '72px auto',
        background: 'var(--surface-panel)',
        border: '1px solid var(--surface-elevated)',
      }}
    >
      <div style={{ background: `var(${token})` }} />
      <figcaption style={{ padding: 'var(--space-2) var(--space-3)', display: 'grid', gap: 2 }}>
        <code style={{ ...mono, color: 'var(--text-primary)' }}>{token}</code>
        <code style={{ ...mono, color: 'var(--text-tertiary)' }}>{value}</code>
        {extra}
      </figcaption>
    </figure>
  );
}

export const grid = (min = 200): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
  gap: 'var(--space-3)',
});

export function Page({ children }: { children: ReactNode }) {
  return <div style={{ padding: 'var(--space-6)', maxWidth: 1200 }}>{children}</div>;
}
