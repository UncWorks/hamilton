// Reads design tokens straight from the loaded stylesheets (tokens.css,
// typography.css via app/global.css) so Foundations pages can never drift
// from code: add a token in CSS and it shows up here.

export interface Token {
  name: string;
  value: string;
}

export function readRootTokens(): Token[] {
  if (typeof document === 'undefined') return [];
  const out = new Map<string, string>();
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule && rule.selectorText === ':root') {
        for (const prop of Array.from(rule.style)) {
          if (prop.startsWith('--')) out.set(prop, rule.style.getPropertyValue(prop).trim());
        }
      } else if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
        visit((rule as CSSGroupingRule).cssRules);
      }
      if (rule instanceof CSSImportRule && rule.styleSheet) {
        try {
          visit(rule.styleSheet.cssRules);
        } catch {
          /* cross-origin */
        }
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      /* cross-origin sheet */
    }
  }
  return Array.from(out, ([name, value]) => ({ name, value }));
}

export function tokensWithPrefix(tokens: Token[], prefix: string): Token[] {
  return tokens.filter((t) => t.name.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// OKLCH → sRGB (Björn Ottosson's OKLab matrices). Used to measure how far the
// hand-tuned deck.gl / Cesium RGB mirrors drift from the OKLCH source tokens.
// ---------------------------------------------------------------------------

export type Rgb = [number, number, number];

export function parseOklch(value: string): { l: number; c: number; h: number; alpha: number } | null {
  const m = value.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)/i);
  if (!m) return null;
  return {
    l: Number(m[1]) / 100,
    c: Number(m[2]),
    h: Number(m[3]),
    alpha: m[4] === undefined ? 1 : Number(m[4]),
  };
}

export function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const lin: Rgb = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return lin.map((x) => {
    const v = Math.min(1, Math.max(0, x));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  }) as Rgb;
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Euclidean distance in sRGB 0–255 space. >20 is visibly different side by side. */
export function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
}
