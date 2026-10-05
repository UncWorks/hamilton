// Run with `pnpm --filter @hamilton/web test`. Pins the WebGL AoE colours to tokens.css (W19).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
// @ts-ignore TS5097 — explicit .ts extension for Node's ESM loader
import * as S from './aoe-style.ts';

const M: typeof import('./aoe-style') = S;
const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');

test('AOE_TOKEN_OKLCH matches tokens.css', () => {
  for (const [name, [l, c, h]] of Object.entries(M.AOE_TOKEN_OKLCH)) {
    const m = new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`).exec(css);
    assert.ok(m, `--${name} in tokens.css`);
    assert.deepEqual([Number(m![1]), Number(m![2]), Number(m![3])], [l, c, h]);
  }
  assert.equal(Number(/--aoe-fill-opacity:\s*([\d.]+)/.exec(css)![1]), M.AOE_FILL_ALPHA);
});

test('civil violet is not the trust amber / red (hue, not just value)', () => {
  const [r, g, b] = M.AOE_RGB.gnss_civil;
  assert.ok(b > g && r > g, `violet: ${M.AOE_RGB.gnss_civil}`);
});
