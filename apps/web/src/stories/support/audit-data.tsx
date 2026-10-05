// Data + table renderers for src/stories/BrandingAudit.mdx. FINDINGS holds
// only what is still open; RESOLVED is a one-line record of everything the
// audit raised that has since been fixed, decided or made moot.

import type { ReactNode } from 'react';

export type Severity = 'high' | 'med' | 'low';

export interface Finding {
  id: string;
  severity: Severity;
  area: string;
  where: string;
  finding: string;
  spec: string;
}

export const FINDINGS: Finding[] = [
  {
    id: 'A01',
    severity: 'high',
    area: 'Fonts',
    where: 'public/fonts/ · src/styles/typography.css',
    finding:
      'No woff2 files are committed, so every @font-face 404s and the whole UI renders in the system fallback (-apple-system / SF Mono). Inter Tight + JetBrains Mono never appear on screen. See Foundations/Typography → Families (live load check).',
    spec: '§4.1, §4.4',
  },
  {
    id: 'A05',
    severity: 'high',
    area: 'Color',
    where: 'tokens.css (--trust-*) · trust-gradient.ts',
    finding:
      'Spec defines watching/degraded/failed as continuous gradients (→ oklch(75% .16 90) → oklch(62% .18 60) → oklch(45% .14 35)). Tokens are single flat stops with different values (80%/.17/117, 72%/.18/75, 54%/.16/47) and trustBand() steps between them. See Foundations/Trust Bands → Gradient Strip.',
    spec: '§3.3, §6.3',
  },
  {
    id: 'A11',
    severity: 'med',
    area: 'Semantics',
    where: 'LlmToggle.tsx · EventTerminal.tsx · tokens.css (--status-*)',
    finding:
      'Infrastructure/status meanings borrow trust + gating tokens (LLM "active" = --trust-nominal phosphor with glow; terminal "recovery" = --trust-nominal, "fingerprint" = --trust-degraded). The --status-* tier is defined but unused. Phosphor leaks semantically even though lint-phosphor.sh (literal grep) passes.',
    spec: '§3.6, §13 R-phosphor-overuse',
  },
  {
    id: 'A12',
    severity: 'med',
    area: 'Wordmark',
    where: 'Wordmark.tsx',
    finding:
      'Rendered as live text in a span (depends on the missing font, A01). Spec and the file header comment say inline SVG with flattened paths.',
    spec: '§8.1',
  },
  {
    id: 'A13',
    severity: 'med',
    area: 'Brand bar',
    where: 'BrandBar.tsx',
    finding: 'Hairline rule sits inside the lockup column under the tagline with a 4px (px literal) gap; spec: 12px below the wordmark.',
    spec: '§8.1',
  },
  {
    id: 'A17',
    severity: 'low',
    area: 'Radii',
    where: 'CandidateCards · LlmToggle · BrandBar · AdminPanel · AoeKey · BasemapAttribution · SpineOverlay',
    finding: 'Corners are rounded with px literals (2–4 px) in some components and square everywhere else. No radius token.',
    spec: '§2 (instrument register)',
  },
  {
    id: 'A18',
    severity: 'low',
    area: 'Tracking',
    where: 'TrustPanel · CandidateCards · BrandBar · LlmToggle · EventTerminal · Spine · TrustReadout · Wordmark',
    finding: 'Ad-hoc letter-spacing values (0 → 0.32em) and no tracking tokens. See Foundations/Typography → Letter Spacing Inventory.',
    spec: '§4',
  },
  {
    id: 'A19',
    severity: 'low',
    area: 'Typography',
    where: 'CandidateCards · TrustPanel vs EventTerminal · Spine',
    finding:
      'The uppercase micro "eyebrow" label is sans in the panel but mono in the terminal and loader, with 0.06/0.08/0.16em tracking. See Foundations/Typography → Eyebrow Variants.',
    spec: '§4.1',
  },
  {
    id: 'A20',
    severity: 'low',
    area: 'Citation',
    where: 'CandidateCards.tsx (CitationHover) · tokens.css (--citation-*)',
    finding:
      'Citation is always-visible text with a native title tooltip, not the z-50 hover card on --citation-bg-hover (unused). --text-citation duplicates --citation-text and is unused.',
    spec: '§3.7, §7.2',
  },
  {
    id: 'A21',
    severity: 'low',
    area: 'Layout',
    where: 'app/page.tsx',
    finding: 'Terminal spans full width (spec: cols 1–8); no 12-column grid or 24px gutters; the terminal height is a 160px literal.',
    spec: '§7.2',
  },
  {
    id: 'A22',
    severity: 'low',
    area: 'Color literals',
    where: 'CesiumSpine.tsx (globe base colour) · app/layout.tsx (themeColor)',
    finding:
      '#0a0d12 is hard-coded (≈ but ≠ --surface-base #06090d). WebGL cannot read CSS custom properties, so the Cesium value needs a resolved literal. See Foundations/Colors → Hard-coded Literals.',
    spec: '§3.1',
  },
  {
    id: 'A23',
    severity: 'low',
    area: 'Icons',
    where: 'EventTerminal.tsx',
    finding: 'Unicode "⏸" glyph for pause; the §5.3 custom 16-glyph SVG set does not exist.',
    spec: '§5.3',
  },
  {
    id: 'A24',
    severity: 'low',
    area: 'Copy',
    where: 'BrandBar.tsx',
    finding: 'Operator renders "FDC · ADAM" (spec "FDC · Adam").',
    spec: '§7.2',
  },
  {
    id: 'A25',
    severity: 'low',
    area: 'Motion',
    where: 'motion.css · tokens.css (--duration-*, --ease-*)',
    finding:
      'trust-decay, score-numeral-tick and playhead-scrub primitives are not implemented; their tokens (--duration-trust-decay/numeral-tick/roe-cross, --ease-in-out-smooth) are unused. .motion-recovery-pulse is defined but unused. See Foundations/Motion.',
    spec: '§6.1',
  },
  {
    id: 'A27',
    severity: 'low',
    area: 'Dark scheme',
    where: 'app/global.css · app/layout.tsx',
    finding:
      'Dark color-scheme is declared only via the Next viewport meta; global.css has no `color-scheme: dark`, so native scrollbars/form controls render light wherever the meta is absent (visible in Storybook, e.g. the TrustPanel scrollbar).',
    spec: '§3.1',
  },
];

export interface Resolved {
  id: string;
  area: string;
  outcome: string;
}

/** Findings that are no longer open, one line each. */
export const RESOLVED: Resolved[] = [
  { id: 'A02', area: 'Iconography', outcome: 'Fixed: both spines draw the decided MCRP 5-12A symbol (src/components/symbol); no circles remain.' },
  { id: 'A03', area: 'Trust RGB mirrors', outcome: 'Moot: no renderer uses trustRgb() any more; symbol colours resolve from tokens.css.' },
  { id: 'A04', area: 'Affiliation RGB mirrors', outcome: 'Moot: the n-gon renderer and its RGB mirrors are gone; frames use the doctrinal fills.' },
  { id: 'A06', area: 'Jammer and directional-vector overlay', outcome: "Moot: the jammer's position is never presumed, so there is no jammer point or vector to style." },
  { id: 'A07–A09, A16', area: 'Modal motion, focus, copy and layering', outcome: 'Moot: the blocking modal was replaced by the non-modal TSS fire-mission row (T01).' },
  { id: 'A10', area: 'Cesium label font', outcome: 'Fixed: Cesium draws billboards rendered from the SVG symbol, not Cesium labels.' },
  { id: 'A14', area: 'Icon opacity floors', outcome: 'Moot: opacity no longer encodes trust; the side gauge and J do.' },
  { id: 'A15', area: 'Halo', outcome: 'Fixed by decision: no halo or pulse anywhere (Decisions/Track Symbology, decision 2).' },
  { id: 'A26', area: 'COP framing', outcome: 'Fixed: camera fit (lib/camera-fit.ts) and declutter stacks.' },
  { id: 'S01–S03, S05, S06, S10', area: 'Symbology conformance (frame, echelon, EW, amplifiers, J)', outcome: 'Fixed by decision and wired into both spines (Decisions/Track Symbology, decisions 1–4).' },
  { id: 'S04', area: 'Bearing-line styling', outcome: "Moot: no bearing line is drawn (the jammer's position is never presumed)." },
  { id: 'S07–S09', area: 'Option B trust-on-frame collisions', outcome: 'Moot: Option B was rejected; trust stays off the frame and the fill.' },
  { id: 'G01', area: 'At-a-glance distinctness', outcome: 'Fixed by decision: the decided symbol passes T1–T7 (Decisions/Track Symbology, bench scores).' },
  { id: 'F01, F02', area: 'Fixture fidelity', outcome: "Fixed: fixtures carry the engine's per-beat output (link-trust-rating.ts AVDIIVKA_BEATS, pinned by tests)." },
  { id: 'T01', area: 'Decision surface', outcome: 'Fixed: the non-modal TSS fire-mission row (Fires/Mission Row) is the decision surface.' },
];

export interface PortRow {
  uncwork: string;
  path: string;
  hamilton: string;
  note: string;
}

export const UNCWORK_MAP: PortRow[] = [
  { uncwork: 'App', path: 'src/app.tsx', hamilton: 'app/page.tsx (Pages/COP)', note: 'Both compose header / map / panel / terminal.' },
  { uncwork: 'Panel', path: 'src/components/ui/panel.tsx', hamilton: 'none — candidate to port', note: 'Hamilton has no shared panel primitive; each component inlines surface + eyebrow styles (A19).' },
  { uncwork: 'Toggle', path: 'src/components/ui/toggle.tsx', hamilton: 'LlmToggle (inline buttons)', note: 'Port as a token-driven primitive and rebuild LlmToggle on it.' },
  { uncwork: 'MissionHeader', path: 'src/features/hud/components/mission-header.tsx', hamilton: 'BrandBar', note: 'uncwork adds UTC clock + blinking status dot.' },
  { uncwork: 'FooterStrip', path: 'src/features/hud/components/footer-strip.tsx', hamilton: 'none — candidate to port', note: 'AO / datum / keyboard hints strip.' },
  { uncwork: 'StatusSummary', path: 'src/features/hud/components/status-summary.tsx', hamilton: 'none — candidate to port', note: 'Natural home for the unused --status-* tokens (A11).' },
  { uncwork: 'TypeLegend', path: 'src/features/hud/components/type-legend.tsx', hamilton: 'none — candidate to port', note: 'Track-symbology legend; Foundations/Iconography is the design reference.' },
  { uncwork: 'LinkDetailPanel', path: 'src/features/links/components/link-detail-panel.tsx', hamilton: 'TrustPanel', note: 'uncwork shows link status + detectors; Hamilton shows trust readout, trace, candidates.' },
  { uncwork: 'TrackContextMenu', path: 'src/features/links/components/track-context-menu.tsx', hamilton: 'none — candidate to port', note: 'Hamilton selection is click-only (selectSource).' },
  { uncwork: 'LayerTogglePanel', path: 'src/features/map/components/layer-toggle-panel.tsx', hamilton: 'AdminPanel (Demo simulation)', note: 'Hamilton\'s layer toggles are presenter-only view filters (Admin → Demo simulation); there are no operator layer controls.' },
  { uncwork: 'MapView', path: 'src/features/map/components/map-view.tsx', hamilton: 'MapSpine (+ CesiumSpine, Spine)', note: 'Hamilton draws over the offline Protomaps basemap (MapLibre 2D, Cesium raster 3D).' },
  { uncwork: 'ReplayControls', path: 'src/features/replay/components/replay-controls.tsx', hamilton: 'none — candidate to port', note: 'Would implement the §6.1 playhead-scrub primitive.' },
  { uncwork: 'ScenarioSwitcher', path: 'src/features/scenarios/components/scenario-switcher.tsx', hamilton: 'none — candidate to port', note: 'Hamilton scenario is fixed (Avdiivka).' },
  { uncwork: 'DataSourceToggle', path: 'src/features/data-source/components/data-source-toggle.tsx', hamilton: 'none — candidate to port', note: 'Live vs mock feed; Storybook MQTT mock is the Hamilton analogue.' },
  { uncwork: 'EventTerminal', path: 'src/features/terminal/components/event-terminal.tsx', hamilton: 'EventTerminal', note: 'Same role; uncwork derives log client-side, Hamilton polls /api/events.' },
  { uncwork: 'attribution layer + fingerprintTone', path: 'src/features/attribution/lib/*', hamilton: 'CandidateCards + AoeCardBlock', note: 'uncwork tones attribution on the map; Hamilton shows fingerprint candidates in the panel and the jammer\'s area of effect (never its position) on the map.' },
  { uncwork: 'link icons (iconFor / previewSvg)', path: 'src/features/links/lib/icons.ts', hamilton: 'components/symbol (TrackSymbol)', note: 'uncwork has a bespoke SVG icon set; Hamilton draws FM 1-02 / MCRP 5-12A symbols (Decisions/Track Symbology).' },
  { uncwork: 'heatmap layer', path: 'src/features/heatmap/lib/build-heatmap-layer.ts', hamilton: 'none — candidate to port', note: '' },
  { uncwork: 'trails layer', path: 'src/features/trails/lib/build-trails-layer.ts', hamilton: 'none — candidate to port', note: '' },
];

const SEV_COLOR: Record<Severity, string> = {
  high: 'var(--gating-primary)',
  med: 'var(--trust-watching)',
  low: 'var(--text-tertiary)',
};

const cell = {
  padding: '6px 8px',
  verticalAlign: 'top' as const,
  borderTop: '1px solid var(--surface-elevated)',
  fontSize: 13,
};

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} style={{ ...cell, textAlign: 'left', borderTop: 'none' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function FindingsTable({ severity }: { severity?: Severity }) {
  const rows = severity ? FINDINGS.filter((f) => f.severity === severity) : FINDINGS;
  return (
    <Table head={['ID', 'Sev', 'Area', 'Where', 'Finding', 'Spec']}>
      {rows.map((f) => (
        <tr key={f.id}>
          <td style={cell}>
            <code>{f.id}</code>
          </td>
          <td style={{ ...cell, color: SEV_COLOR[f.severity], fontWeight: 600 }}>{f.severity}</td>
          <td style={cell}>{f.area}</td>
          <td style={cell}>
            <code style={{ fontSize: 12 }}>{f.where}</code>
          </td>
          <td style={cell}>{f.finding}</td>
          <td style={cell}>{f.spec}</td>
        </tr>
      ))}
    </Table>
  );
}

export function ResolvedTable() {
  return (
    <Table head={['ID', 'Area', 'Outcome']}>
      {RESOLVED.map((r) => (
        <tr key={r.id}>
          <td style={cell}>
            <code>{r.id}</code>
          </td>
          <td style={cell}>{r.area}</td>
          <td style={cell}>{r.outcome}</td>
        </tr>
      ))}
    </Table>
  );
}

export function UncworkTable() {
  return (
    <Table head={['uncwork component', 'path (frontend/)', 'Hamilton equivalent', 'Note']}>
      {UNCWORK_MAP.map((r) => (
        <tr key={r.uncwork}>
          <td style={cell}>
            <strong>{r.uncwork}</strong>
          </td>
          <td style={cell}>
            <code style={{ fontSize: 12 }}>{r.path}</code>
          </td>
          <td style={{ ...cell, color: r.hamilton.startsWith('none') ? 'var(--gating-primary)' : undefined }}>{r.hamilton}</td>
          <td style={cell}>{r.note}</td>
        </tr>
      ))}
    </Table>
  );
}
