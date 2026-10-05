// Data + table renderers for src/stories/BrandingAudit.mdx.
// Line numbers refer to the tree at the commit that introduced Storybook.

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
    where: 'public/fonts/ (only .gitkeep) · src/styles/typography.css:12-38',
    finding:
      'No woff2 files are committed, so every @font-face 404s and the whole UI renders in the system fallback (-apple-system / SF Mono). Inter Tight + JetBrains Mono never appear on screen. See Foundations/Typography → Families (live load check).',
    spec: '§4.1, §4.4',
  },
  {
    id: 'A02',
    severity: 'high',
    area: 'Iconography',
    where: 'CesiumSpine.tsx:142-148 · MapSpine.tsx:100-126 · MapSpine.tsx:28-47',
    finding:
      'FIXED IN THE LIVE RENDERERS (PR #3, symbol wiring): CesiumSpine draws the production symbol as billboards and MapSpine as a viewport-projected SVG overlay (src/components/symbol); no `point` circles or ScatterplotLayer remain. Original: ' +
      'DECIDED (Decisions/Track Symbology): the target is now the production MCRP 5-12A symbol (src/components/symbol), not the §5.2 polygons. ' +
      'Both renderers draw tracks as circles (Cesium `point`, deck.gl ScatterplotLayer). The §5.2 polygon rule (sides = sensor type, enemy 45°, neutral outlined, unknown dashed) exists in track-symbol.ts and buildIconPolygons() but is never used. Reference rendering: COP/TrackSymbol.',
    spec: '§5.2, FR-06',
  },
  {
    id: 'A03',
    severity: 'high',
    area: 'Color',
    where: 'trust-gradient.ts:62-73 (trustRgb)',
    finding:
      'Hand-tuned RGB mirrors of the trust tokens drift badly: degraded [220,178,90] vs token ≈ #e49000 (yellow-tan vs amber), watching blue channel 110 vs 48, failed [170,100,70] vs ≈ #b54800. The map shows different trust colors than the panel. See Foundations/Colors → Renderer Mirrors.',
    spec: '§3.3',
  },
  {
    id: 'A04',
    severity: 'high',
    area: 'Color',
    where: 'track-symbol.ts:35-41 (affiliationRgb) · tokens.css:33-36',
    finding:
      'Affiliation RGB mirrors drift from the OKLCH tokens (friendly [70,140,220] vs ≈ #28acdf; enemy [180,70,80] vs ≈ #cf4040). The CSS --affiliation-* tokens are defined but referenced nowhere.',
    spec: '§3.5',
  },
  {
    id: 'A05',
    severity: 'high',
    area: 'Color',
    where: 'tokens.css:23-25 · trust-gradient.ts:13-40',
    finding:
      'Spec defines watching/degraded/failed as continuous gradients (→ oklch(75% .16 90) → oklch(62% .18 60) → oklch(45% .14 35)). Tokens are single flat stops with different values (80%/.17/117, 72%/.18/75, 54%/.16/47) and trustBand() steps between them. See Foundations/Trust Bands → Gradient Strip.',
    spec: '§3.3, §6.3',
  },
  {
    id: 'A06',
    severity: 'high',
    area: 'Overlay',
    where: 'CesiumSpine.tsx:228,230,235,258 · MapSpine.tsx:140',
    finding:
      'Jammer + directional-vector overlays use the trustRgb("degraded") literal (#dbb25a / Color(0.86,0.7,0.35)) at 0.55 (Cesium) vs 0.43 (deck.gl) alpha, solid line. Spec: --gating-primary at 40%, dashed, drawn outward with clip-path.',
    spec: '§10.3',
  },
  {
    id: 'A07',
    severity: 'high',
    area: 'Modal motion',
    where: 'motion.css:6-22, 59-61 · KillChainGate.tsx:56-69',
    finding:
      'SUPERSEDED (TSS mission row, docs/plans/tss-mission-row.md): KillChainGate is deleted; there is no modal, scrim, blur or z-index layer to fix. Original: The COP never blurs behind the gate: .motion-cop-blur is defined but not applied anywhere, and gating-modal-arrival animates filter blur(0) → blur(0) (no-op). Frame 1 of the load-bearing beat is missing.',
    spec: '§6.1, §6.2, §10.5',
  },
  {
    id: 'A08',
    severity: 'med',
    area: 'Modal',
    where: 'KillChainGate.tsx:128, 141-146',
    finding:
      'SUPERSEDED (TSS mission row, docs/plans/tss-mission-row.md): KillChainGate is deleted; there is no modal, scrim, blur or z-index layer to fix. Original: Option-button leaders use --gating-secondary (phosphor) always; spec puts --gating-primary on leaders and phosphor only on the focused option. No :focus-visible treatment — hover is inline style mutation, keyboard focus is invisible.',
    spec: '§10.5, §10.6',
  },
  {
    id: 'A09',
    severity: 'med',
    area: 'Copy',
    where: 'KillChainGate.tsx:15, 36, 94',
    finding:
      'SUPERSEDED (TSS mission row, docs/plans/tss-mission-row.md): KillChainGate is deleted; there is no modal, scrim, blur or z-index layer to fix. Original: Headline renders "Trust on UNIT_B-position + UNIT_B-GPS…" (uppercased source_id) vs spec "B-position + B-GPS". Option (c) hard-codes "B" regardless of the gated source (was Modal/KillChainGate → Other Source).',
    spec: '§10.5 verbatim text',
  },
  {
    id: 'A10',
    severity: 'med',
    area: 'Typography',
    where: 'CesiumSpine.tsx:151, 234',
    finding:
      'Cesium label font is "500 12px JetBrainsMono, …" — family name without the space never matches @font-face "JetBrains Mono", and px sizes bypass --text-micro.',
    spec: '§4.1, §4.2',
  },
  {
    id: 'A11',
    severity: 'med',
    area: 'Semantics',
    where: 'LlmToggle.tsx:12-17 · EventTerminal.tsx:116-127 · tokens.css:39-42',
    finding:
      'Infrastructure/status meanings borrow trust + gating tokens (LLM "active" = --trust-nominal phosphor with glow; terminal "recovery" = --trust-nominal, "fingerprint" = --trust-degraded). The --status-* tier is defined but unused. Phosphor leaks semantically even though lint-phosphor.sh (literal grep) passes.',
    spec: '§3.6, §13 R-phosphor-overuse',
  },
  {
    id: 'A12',
    severity: 'med',
    area: 'Wordmark',
    where: 'Wordmark.tsx:1-3, 14-30',
    finding:
      'Rendered as live text in a span (depends on the missing font, A01). Spec and the file header comment say inline SVG with flattened paths.',
    spec: '§8.1',
  },
  {
    id: 'A13',
    severity: 'med',
    area: 'Brand bar',
    where: 'BrandBar.tsx:28, 45-54',
    finding:
      'Hairline rule sits inside the lockup column under the tagline with a 4px (px literal) gap; spec: 12px below the wordmark (§8.1) and full bar width when the gate fires (§10.5).',
    spec: '§8.1, §10.5',
  },
  {
    id: 'A14',
    severity: 'med',
    area: 'Opacity',
    where: 'CesiumSpine.tsx:127 · MapSpine.tsx:42, 110',
    finding:
      'Three different icon-opacity floors: Cesium max(0.25, score), deck.gl max(60/255≈0.24, score), buildIconPolygons max(70/255≈0.27). FR-06 says opacity = score (30% at failed). See Foundations/Trust Bands → Mapping.',
    spec: '§3.3, §5.2, FR-06',
  },
  {
    id: 'A15',
    severity: 'med',
    area: 'Halo — removed from the live renderers',
    where:
      'was TrackGlyph.tsx:62-70 + motion.css:45-48 (off-centre) · MapSpine.tsx:59-98 · CesiumSpine.tsx:174-196 → now trust-gradient.ts haloFrameAt() + motion.css .halo',
    finding:
      'FIXED IN THE LIVE RENDERERS (PR #3, symbol wiring): no halo and no pulse anywhere in CesiumSpine / MapSpine; trust is the side gauge + J. haloFrameAt() and friends moved to src/stories/archive/halo.ts for the Archive stories only. ' +
      'SUPERSEDED BY DECISION (Decisions/Track Symbology, decision 2): the decided symbol has no halo. ' +
      'FIXED. Root cause of the off-centre pulse: halo-pulse scaled an SVG <circle> with transform-origin: center but no transform-box, so it resolved against the SVG viewport (view-box) — origin (46px,46px) instead of the circle at (0,0); the halo slid ~8px up-left each pulse. Also: deck.gl wrapped its clock at 4000ms (mid-pulse jumps) and its halo radius (1−c)×24 was smaller than the 18px icon; Cesium drew a static metre-sized ground ellipse (foreshortened by the −55° pitch, re-added every tick). All three now share one concentric screen-space geometry (icon edge + (1−c)×24px, spec period, static ring under prefers-reduced-motion). Live treatment = Option 1 in Archive/Halo Options.',
    spec: '§5.2, §6.3, §6.4',
  },
  {
    id: 'A16',
    severity: 'med',
    area: 'Modal',
    where: 'KillChainGate.tsx:57-69, 78, 101, 105',
    finding:
      'SUPERSEDED (TSS mission row, docs/plans/tss-mission-row.md): KillChainGate is deleted; there is no modal, scrim, blur or z-index layer to fix. Original: Scrim and frame share one z-100 container (spec: scrim z90, frame z100). Glow is box-shadow (spec: filter drop-shadow); subtitle adds an unspecified text-shadow and weight 600 vs headline 500.',
    spec: '§6.2, §7.2',
  },
  {
    id: 'A17',
    severity: 'low',
    area: 'Radii',
    where: 'CandidateCards.tsx:60 · LlmToggle.tsx:34, 43',
    finding: 'Only two components round corners (4px dashed empty card, 2px toggle); everything else is square. No radius token.',
    spec: '§2 (instrument register)',
  },
  {
    id: 'A18',
    severity: 'low',
    area: 'Tracking',
    where:
      'TrustPanel.tsx:26,58,68,93 · CandidateCards.tsx:22,64,160 · BrandBar.tsx:35,65 · LlmToggle.tsx:52,67 · KillChainGate.tsx:90,103,136 · EventTerminal.tsx:76 · Spine.tsx:54 · TrustReadout.tsx:43 · Wordmark.tsx:24',
    finding: 'Eight ad-hoc letter-spacing values (0 → 0.32em) and no tracking tokens.',
    spec: '§4',
  },
  {
    id: 'A19',
    severity: 'low',
    area: 'Typography',
    where: 'CandidateCards.tsx:17-27 · TrustPanel.tsx:88-97 vs EventTerminal.tsx:70-86 · Spine.tsx:45-58',
    finding:
      'The uppercase micro "eyebrow" label is sans in the panel but mono in the terminal and loader, with 0.06/0.08/0.16em tracking. See Foundations/Typography → Eyebrow Variants.',
    spec: '§4.1',
  },
  {
    id: 'A20',
    severity: 'low',
    area: 'Citation',
    where: 'CandidateCards.tsx:149-164 · tokens.css:19, 45-47',
    finding:
      'Citation is always-visible text with a native title tooltip, not the z-50 hover card on --citation-bg-hover (unused). Citation set in sans inside a mono card. --text-citation duplicates --citation-text and is unused.',
    spec: '§3.7, §7.2',
  },
  {
    id: 'A21',
    severity: 'low',
    area: 'Layout',
    where: 'app/page.tsx:72-99',
    finding: 'Terminal spans full width (spec: cols 1–8); no 12-column grid or 24px gutters; grid rows hard-coded 56px / 160px.',
    spec: '§7.2',
  },
  {
    id: 'A22',
    severity: 'low',
    area: 'Color literals',
    where: 'CesiumSpine.tsx:67, 152, 153, 236 · app/layout.tsx:13',
    finding: '#0a0d12 (≈ but ≠ --surface-base #06090d) and #f5f0e6 (≈ --text-primary) hard-coded.',
    spec: '§3.1, §3.2',
  },
  {
    id: 'A23',
    severity: 'low',
    area: 'Icons',
    where: 'EventTerminal.tsx:84',
    finding: 'Unicode "⏸" glyph for pause; the §5.3 custom 16-glyph SVG set does not exist.',
    spec: '§5.3',
  },
  {
    id: 'A24',
    severity: 'low',
    area: 'Copy',
    where: 'BrandBar.tsx:66, 70 · TrustPanel.tsx:71',
    finding:
      'Operator renders "FDC · ADAM" via text-transform (spec "FDC · Adam"). Panel subtitle uppercases affiliation but leaves sensor type lowercase and only replaces the first underscore.',
    spec: '§7.2',
  },
  {
    id: 'A25',
    severity: 'low',
    area: 'Motion',
    where: 'motion.css (absent) · tokens.css:59, 64, 67, 68',
    finding:
      'trust-decay, score-numeral-tick, roe-floor-cross and playhead-scrub primitives are not implemented; their tokens (--duration-trust-decay/numeral-tick/roe-cross, --ease-in-out-smooth) are unused. .motion-recovery-pulse is defined but unused.',
    spec: '§6.1',
  },
  {
    id: 'A26',
    severity: 'med',
    area: 'COP framing',
    where: 'CesiumSpine.tsx:19-21, 76-88',
    finding:
      'FIXED (PR #3): camera fit (lib/camera-fit.ts) + declutter stacks; the stacks now use the production DeclutterStack. Original: ' +
      'Fixed camera (4.5 km alt, 0.06° south of the AO, pitch −55°) puts units A/B/C at the very top edge of the Cesium view, and fully off-screen at wide aspect ratios (e.g. a 2:1 canvas). Observed while verifying COP/CesiumSpine; stories use a near-square canvas to keep tracks visible.',
    spec: '§7.2, §10.1 (B icon must be the focal point)',
  },
  {
    id: 'A27',
    severity: 'low',
    area: 'Dark scheme',
    where: 'app/global.css:11-19 · app/layout.tsx:14',
    finding:
      'Dark color-scheme is declared only via the Next viewport meta; global.css has no `color-scheme: dark`, so native scrollbars/form controls render light wherever the meta is absent (visible in Storybook, e.g. the TrustPanel scrollbar).',
    spec: '§3.1',
  },
  // --- COP symbology conformance vs APP-6(E) / 2525E (Archive/Track Symbology → Decisions/Track Symbology) ---
  {
    id: 'S01',
    severity: 'high',
    area: 'Symbology — resolved, wired into the live renderers',
    where: 'CesiumSpine.tsx:156-161 · MapSpine.tsx:119-145',
    finding:
      'RESOLVED BY DECISION (Decisions/Track Symbology, decisions 1 + 4): MCRP 5-12A filled land-unit frames (Table 4-1) with enlarged Table 5-3 icons, 2525E numeric SIDC stored, 2525B/C letter + CoT exported — production component src/components/symbol. FIXED IN THE LIVE RENDERERS (PR #3, symbol wiring): both spines draw it. Original: ' +
      'OPEN — pending option selection. Deviation: tracks are circles; in APP-6 a circle reads as the friend sea-surface frame. Options A/B/C/B′ in Archive/Track Symbology. B′: standard 2525E land-unit frames (monochrome --sym-ink, affiliation by shape), solid regardless of trust; SIDC stored as 2525E numeric, 2525C letter code for TAK export.',
    spec: 'APP-6(E) frames · §5.1, §5.2',
  },
  {
    id: 'S02',
    severity: 'med',
    area: 'Symbology — resolved, wired into the live renderers',
    where: 'CesiumSpine.tsx · MapSpine.tsx (absent)',
    finding:
      'RESOLVED BY DECISION (Decisions/Track Symbology, decision 1): echelon marks (Table 5-6, team Ø / platoon ••• / battery |) drawn at ≥ 28 px and hidden below with every amplifier but T; status-1 dash for candidates only; no AL bar. FIXED IN THE LIVE RENDERERS (PR #3, symbol wiring): live symbols are 32 px (detail state), candidate sites (candidateSites prop) draw dashed. Original: ' +
      'OPEN — pending option selection. Missing: echelon marks, status (anticipated) dash, operational-condition bar. B′: echelon marks (team • / platoon ••• / battery |) and the status-1 dash for candidate sites are drawn; the AL operational-condition bar is deliberately NOT used — it is equipment-only and yellow/red reads as damaged/destroyed (see S08).',
    spec: 'APP-6(E) amplifiers B, status, AL',
  },
  {
    id: 'S03',
    severity: 'med',
    area: 'Symbology — resolved, wired into the live renderers',
    where: 'Spine.tsx:37-40 · MapSpine.tsx',
    finding:
      'SUPERSEDED BY HS-20 (jammer AoE MVP, docs/plans/jammer-aoe.md W6–W9): the jammer\'s position is never presumed — the live spines no longer draw J1, the ring or the bearing line, and Spine takes `emitterEstimate` (an area of effect, FR-06a) instead of `jammerLocation`. Earlier record: ' +
      'RESOLVED BY DECISION (Decisions/Track Symbology → COP): confirmed fix J1 = hostile EW jamming (p 5-18, 150504 / UUMSEJ), candidates = status-1 dashed hostile EW inside the dashed NAI. FIXED IN THE LIVE RENDERERS (PR #3, symbol wiring): both spines draw the jammer as J1 (hostile EW jamming, method as H) and candidateSites as status-1 EW; Spine passes jammerLocation to both. Original: ' +
      'OPEN — pending option selection. Missing: MapSpine has no jammer symbol; Spine.tsx drops jammerLocation before it reaches MapSpine. B′ (story mock): confirmed fix J1 as a solid hostile jammer, candidates as status-1 dashed hostile diamonds inside a dashed NAI labelled with T (controlling HQ) and W (DTG). Renderer wiring still open.',
    spec: 'SIDC 10065200001102002500',
  },
  {
    id: 'S04',
    severity: 'med',
    area: 'Symbology — resolved by decision (bearing-line wiring open)',
    where: 'MapSpine.tsx (directional LineLayer) · CesiumSpine.tsx (directional polyline)',
    finding:
      'RESOLVED BY DECISION (Decisions/Track Symbology → COP): bearing line drawn in ink with T / W at the far end. Renderer wiring still open: the live bearing line is unchanged in this change (still the trust-degraded colour, unlabelled). Original: ' +
      'OPEN — pending option selection. Deviation: directional line uses the --trust-degraded colour and is not a standard graphic; should be "Bearing Line – Jammer" (25 220107) in ink with the label at the far end. B′: drawn as the bearing line in ink, labelled at the far end with T and W per FM 1-02.2 ¶5-42.',
    spec: 'SIDC 10032500002201070000',
  },
  {
    id: 'S05',
    severity: 'med',
    area: 'Symbology — halo removed (live renderers fixed)',
    where: 'MapSpine.tsx track-halo · CesiumSpine.tsx halo point',
    finding:
      'RESOLVED BY DECISION (Decisions/Track Symbology, decision 2): the decided symbol has NO halo — trust is a side gauge + J outside the frame, so nothing covers T / J / W / AR (T2 +0.01 vs +0.72 for the halo). FIXED IN THE LIVE RENDERERS (PR #3, symbol wiring): the halo is gone from both spines. Original: ' +
      'OPEN — pending option selection. Deviation: the filled halo disc (now concentric, see A15) covers the amplifier slots (T, J). Option B replaces it with a frame-shaped outline halo. B′: keeps the live centred halo (Option 1) as the "Hamilton link-trust overlay (non-2525)" — trust tokens only, toggleable, stripped on export, frozen when stale — and pushes the text amplifiers outside its extent so it never covers T / J / W / AR.',
    spec: 'APP-6(E) amplifier layout',
  },
  {
    id: 'S06',
    severity: 'low',
    area: 'Symbology — resolved, wired into the live renderers',
    where: 'CesiumSpine.tsx (label entity) · MapSpine.tsx (none)',
    finding:
      'RESOLVED BY DECISION (Decisions/Track Symbology, decisions 1 + 3): T left in the V4 treatment (mono, ≥ 10 px, shown at every size); J right at ≥ 28 px when below 0.60, stale or overridden, AR NRT when stale; hover / focus opens the production RatingTooltip. FIXED IN THE LIVE RENDERERS (PR #3, symbol wiring): the Cesium label entity is gone; T / J / AR / H are part of the symbol image, and every symbol has a focusable hit target with the RatingExplanation breakdown. Original: ' +
      'OPEN — pending option selection. Deviation: labels are Cesium-only and always on (raw source_id + score); spec wants T left, J (trust) right only below 0.60, with a dark text outline. B′: T left; right line = semantic rating + score + J code ("DEGRADED 0.31 D4") shown below 0.60, when stale, or on hover/focus; W (last-good DTG) and AR NRT when stale; hover/focus opens the factor-breakdown tooltip. Scale: src/lib/link-trust-rating.ts.',
    spec: 'APP-6(E) amplifiers T, J',
  },
  // --- Option B conflicts with US 2525E / FM 1-02.2 (us-symbology-findings.md) ---
  {
    id: 'S07',
    severity: 'high',
    area: 'Symbology — Option B conflict, resolved (holds in the decided symbol)',
    where: 'Archive/Track Symbology → Option B (BAND_DASH)',
    finding:
      'Holds in the decided symbol: frames are solid at every trust level; the only dash is status 1. ' +
      'Option B dashes the frame by trust band. In 2525 a dashed frame already means status 1 (anticipated/planned) or the assumed-friend / suspect / pending identities — a trust-degraded friend reads as "assumed friend". RESOLVED IN B′: frames stay solid; dashes only for status 1 (candidate jammer sites).',
    spec: 'MIL-STD-2525E status / identity · FM 1-02.2',
  },
  {
    id: 'S08',
    severity: 'high',
    area: 'Symbology — Option B conflict, resolved (holds in the decided symbol)',
    where: 'Archive/Track Symbology → Option B (condition bar)',
    finding:
      'Holds in the decided symbol: no AL bar; trust is the non-2525 side gauge + J. ' +
      'Option B draws the AL operational-condition bar in the trust colour. AL is defined for equipment/installations only; on a unit yellow/red reads as damaged/destroyed. RESOLVED IN B′: no AL bar; trust is carried by J / W / AR and the non-2525 overlay.',
    spec: 'MIL-STD-2525E amplifier AL',
  },
  {
    id: 'S09',
    severity: 'high',
    area: 'Symbology — Option B conflict, resolved (holds in the decided symbol)',
    where: 'Archive/Track Symbology → Option B (failed band)',
    finding:
      'Holds in the decided symbol: no slash; UNRELIABLE is a rating, not a condition. ' +
      'Option B adds the "damaged" slash in the failed band. It means physical damage — dangerous in a fires context. RESOLVED IN B′: no slash; UNRELIABLE (E5) is a rating label, not a condition.',
    spec: 'MIL-STD-2525E operational condition',
  },
  {
    id: 'S10',
    severity: 'med',
    area: 'Symbology — resolved by decision (J split)',
    where: 'Archive/Track Symbology → Option B (J amplifier)',
    finding:
      'RESOLVED BY DECISION (Decisions/Track Symbology, decision 3): J is the evaluation rating with the J split — score → reliability letter, corroboration → credibility digit (confirmed = 1), STALE = F6, optional S2 override; names NOMINAL / WATCH / DEGRADED / UNRELIABLE / STALE kept. Original: ' +
      'Option B writes a raw score ("0.31") into J, breaking the A–F × 1–6 evaluation-rating format. RESOLVED IN B′: J = mapped code (B2 / C3 / D4 / E5) used for export; the visible label is the semantic name + score (NOMINAL / WATCH / DEGRADED / UNRELIABLE, STALE) with the J code secondary.',
    spec: 'MIL-STD-2525E amplifier J · FM 2-22.3 App. B',
  },
  // --- Story fixtures vs engine semantics ---
  {
    id: 'F01',
    severity: 'low',
    area: 'Fixtures — fingerprint semantics, resolved (assumes PR #1 merged)',
    where: 'stories/fixtures/avdiivka.ts · stories/support/OptionBPrime.tsx (evidenceFor) · lib/link-trust-rating.ts (solveComponents)',
    finding:
      'RESOLVED. The Storybook workaround that read components.fingerprint as 1 − overlap is removed: stories now treat it directly as trust (1 − match strength, 1.0 = no match), and evidence strings derive the overlap ratio as 1 − trust, as the narrator does. Fixtures align with PR #1 (fix/fingerprint-trust-inversion) semantics, so the stories assume PR #1 is merged. ' +
      'Candidates are what the engine emits for the Avdiivka jammer: ground_based_gps_uhf_barrage 1.00 (6/6), pulsed_uhf_wide 0.67 (4/6), cellular_uhf_barrage 0.17 (1/6), with munitions and citations from assets/fingerprints/library.json (replacing the unreachable 0.81 / 0.42 / 0.18). ' +
      'Every fixture payload uses engine-reachable components (fingerprint ∈ {1, .5, .33, .17, 0}; spatial 1 / 0.6 / 0.3, mirroring the trust-oriented spatial detector) and reproduces its score exactly, so the B′ tooltip mismatch warning stays silent. ' +
      'Band samples changed: degraded 0.42 → 0.31 (a 6/6 match caps a localized source at 0.372), failed 0.18 → 0.13 (the engine\'s B-1:15 output); B now drops below the 0.60 TSS minimum (then "ROE floor") on the jammer match (0.72 → 0.31) instead of a gradual slide. ' +
      'SUPERSEDED by F02: fixtures now carry the engine\'s per-beat values (PR #1 @ 6733817) instead of solved approximations.',
    spec: 'FRS FR-04 / FR-04a / FR-05 · PR #1',
  },
  {
    id: 'F02',
    severity: 'low',
    area: 'Fixtures — engine beats (PR #1 @ 6733817), assumes PR #1 merged',
    where: 'stories/fixtures/avdiivka.ts · lib/link-trust-rating.ts (AVDIIVKA_BEATS, engineTick, solveComponents) · .storybook/mocks/mqtt-client.ts · Archive/Track Symbology → COP – Option B′ · Decisions/Track Symbology → COP',
    finding:
      'RESOLVED. Stories now mirror the PR #1 engine beats (fix/fingerprint-trust-inversion @ 6733817): the fixture beat table is derived from comms-sim scenarios/avdiivka.py telemetry through the engine\'s detector mappings and is unit-tested against the Rust end-to-end test avdiivka_beats_end_to_end. ' +
      'A and C 1.00 throughout (idle is 1.00, not 0.97 / 0.79). Unit B: 0:00 1.00 → 0:45 0.70 WATCH (cadence 1.0 s → 1.17 s, 3.4σ) → 0:55 0.65 (CRC 0.2% → 6%) → 1:05 0.65 (localized) → 1:15 0.13, first below 0.60, as the 6.1 s gap, 14% CRC and the jammer fingerprint 6/6 land together → 1:20 0.13 (TSS beat) → 1:50 0.22 → 2:15 1.00. ' +
      'Spatial trust is the engine\'s Nominal 1.0 / Localized 0.6 / Blanket 0.3. Fixture trust payloads carry the optional lat/lon PR #1 adds to TrustScorePayload, from the comms-sim positions (mirrored locally, since this branch\'s contracts lack them). ' +
      'Band samples: NOMINAL 1.00 (0:00), WATCH 0.70 (0:45), UNRELIABLE 0.13 (1:15) are engine beats; DEGRADED 0.45 is synthetic (the timeline never sits in 0.30–0.60) but engine-reachable. Every tooltip reproduces its payload score, so the mismatch warning stays silent. ' +
      'OPEN UX ITEM: the directional vector appears at 1:15, because app/page.tsx draws it when B < 0.60, whereas Branding §10.3 puts it at 1:05 (B is still 0.65 then). Driving it from components.spatial (localized) would show it from 0:45; neither is 1:05 without a scripted timer. Web-owner decision. ' +
      'Related (SUPERSEDED by T01): the store used to raise the kill-chain modal on the first crossing (1:15) vs the storyboard\'s 1:20 modal beat; there is no modal now — AB1001 arrives at 1:12 and fails TSS in its row at 1:15.',
    spec: 'Branding §10.1–§10.5 · System Design §2 / §5.1 · FRS FR-01–FR-05 · PR #1',
  },
  // --- Decision workflow ---
  {
    id: 'T01',
    severity: 'high',
    area: 'Decision surface — TSS fire-mission row (replaces the kill-chain modal)',
    where: 'components/fires/MissionQueue.tsx · MissionRow.tsx · TssInForce.tsx · lib/tss.ts · store/hamilton.ts · Fires/Mission Row · Fires/TSS in force · Pages/COP',
    finding:
      'RESOLVED (feat/tss-mission-row). The blocking modal is gone. A call for fire (fires/mission/{id}) is evaluated against the target selection standards in force (TSS-1: GPS-guided C / 10 s, laser C / 30 s, unguided never gated, HPT exception D / 10 s with risk acceptance): ' +
      'reliability = live J letter, report age = time since the last good update, accuracy = "n/a — no TLE source"; hysteresis 5 s. Only mission ∩ failing source ∩ gated munition draws attention: a 2px --gating-primary rule, text chips (FAIL / E5), "Rec. method of control: DO NOT LOAD" and four branch buttons (keys 1–4). ' +
      'No portal, scrim, blur or focus move; aria-live polite only on the selected mission; motion: none. Terminology: TSS / DO NOT LOAD / AT MY COMMAND replace kill chain / HOLD / delay 60 s. ' +
      'Resolves A07, A08, A09 and A16 by removal (this audit has no C14; the modal copy item is A09). Open: DP star / DSM row / CCIR queue (Alternatives C, D) and an engine-side decision endpoint.',
    spec: 'decision-workflow assessment §3 A + B, §4 HS-05/07/13/15/16, §6 · FRS FR-07 · Branding §10 (superseded parts)',
  },
  // --- At-a-glance symbology ---
  {
    id: 'G01',
    severity: 'high',
    area: 'Symbology — at-a-glance, resolved by decision',
    where: 'components/cop/track-symbol.ts · COP/TrackSymbol → ShapeMatrix · Decisions/Evidence/At-a-Glance',
    finding:
      'RESOLVED BY DECISION (Decisions/Track Symbology): the decided symbol (FINAL, src/components/symbol) passes every automated test — T1 0.81 / F-H 0.62 / σ2 0.83, T2 +0.01, T3 0.315 (REF 0.243), T4 100 % at 16/24/32, T5 and T6 pass, T7 6.52 · 5.69 · 2.07 · 4.20 (condition iii fixed by enlarging the TA-radar glyph, 1.11 → 2.07). FIXED IN THE LIVE RENDERERS (PR #3, symbol wiring): the n-gons and circles are no longer drawn anywhere live. Original: ' +
      'The Branding §5.2 n-gon scheme (sides = sensor type, enemy +45°, colour/fill/dash = affiliation, one circular amber halo) fails the at-a-glance protocol (glance-symbology-research.md §5), measured in-browser on the exact rendered pixels: ' +
      'T1 affiliation silhouette soft-IoU 0.97 at σ 1 px and 0.985 at σ 2 (pass ≤ 0.85 / ≤ 0.92; friend–hostile ≤ 0.70); T2 the halo raises pair similarity by +0.72 (pass ≤ +0.05); ' +
      'recon_static vs recon_mobile (hexagon vs heptagon) soft-IoU 0.87 → indistinguishable; T7 salience R 0.51 for a hostile among friends with mixed trust (pass ≥ 2). ' +
      'The FM 1-02 / MCRP 5-12A frames score 0.81 max (hostile/unknown) and friend–hostile 0.62 (all of V1–V4 and the doctrinal reference pass T1), function icons ≤ 0.70. ' +
      'Doctrinal basis: MCRP ¶4-10 p 4-10 ("easily distinguishable", "distinguishable without color"); a circle is the friendly equipment frame (Table 4-1 p 4-3). ' +
      'Open: none of V1–V4 passes T7 condition (iii) FA among TA radar (R 0.93–1.49 vs REF 2.17), V2–V4 fail T2 (H1 outline +0.09 – +0.10), and the doctrinal reference itself misses T4 affiliation at 16 px (98.8 % vs 100 %) — the provisional thresholds need calibration.',
    spec: 'Branding §5.2 · FM 1-02 / MCRP 5-12A ¶4-10, Table 4-1 · MIL-STD-1472H §5.17.27',
  },
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
  { uncwork: 'LayerTogglePanel', path: 'src/features/map/components/layer-toggle-panel.tsx', hamilton: 'none — candidate to port', note: 'Hamilton has no layer controls.' },
  { uncwork: 'MapView', path: 'src/features/map/components/map-view.tsx', hamilton: 'MapSpine (+ CesiumSpine, Spine)', note: 'Both deck.gl; uncwork has a basemap style, Hamilton has none yet.' },
  { uncwork: 'ReplayControls', path: 'src/features/replay/components/replay-controls.tsx', hamilton: 'none — candidate to port', note: 'Would implement the §6.1 playhead-scrub primitive.' },
  { uncwork: 'ScenarioSwitcher', path: 'src/features/scenarios/components/scenario-switcher.tsx', hamilton: 'none — candidate to port', note: 'Hamilton scenario is fixed (Avdiivka).' },
  { uncwork: 'DataSourceToggle', path: 'src/features/data-source/components/data-source-toggle.tsx', hamilton: 'none — candidate to port', note: 'Live vs mock feed; Storybook MQTT mock is the Hamilton analogue.' },
  { uncwork: 'EventTerminal', path: 'src/features/terminal/components/event-terminal.tsx', hamilton: 'EventTerminal', note: 'Same role; uncwork derives log client-side, Hamilton polls /api/events.' },
  { uncwork: 'attribution layer + fingerprintTone', path: 'src/features/attribution/lib/*', hamilton: 'CandidateCards + CesiumSpine jammer overlay', note: 'uncwork tones attribution on the map; Hamilton shows FR-04a cards in the panel.' },
  { uncwork: 'link icons (iconFor / previewSvg)', path: 'src/features/links/lib/icons.ts', hamilton: 'track-symbol.ts symbolGeometry', note: 'uncwork has an SVG icon set; Hamilton geometry is unused by renderers (A02).' },
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
    <Table head={['ID', 'Sev', 'Area', 'Where (file:line)', 'Finding', 'Spec']}>
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
