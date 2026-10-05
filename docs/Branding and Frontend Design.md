---
tags: [strategy, branding, design, frontend, retrospective, one-shot, v5.1.2-postmortem]
status: retrospective-draft
authored-on: 2026-05-03
framing: post-event one-shot what-if; not live event-day work; xTech 2026-05-02..03 already happened
build-state: hypothetical (seed-doc → one-shot AI build pipeline)
parent: [[00 - Index]]
related:
  - [[Capability Selection]]
  - [[Specs/URS]]
  - [[Specs/FRS]]
  - [[Specs/System Design]]
  - [[Tech Stack]]
  - [[Risk Register]]
  - [[../05 - Build Plan/Demo and Pitch]]
---

# Branding and Frontend Design — Hamilton

> **Framing.** xTech happened on 2026-05-02..03 and the team did not win. This document is the retrospective *"what if I had built this my way as a one-shot from seed docs?"* — feeding [[Specs/URS|URS]], [[Specs/FRS|FRS]], [[Specs/System Design|System Design]], [[Tech Stack]], and [[../05 - Build Plan/Demo and Pitch|Demo and Pitch]] into a single AI build pipeline rather than racing 17 hours as a team. Time-budget unconstrained. R13/R18 *team-coordination* clauses dropped (they were team-shape constraints, not product constraints). **R14 / R15 / R16 / NFR-01..07 preserved** — those are product invariants. Hardware bound preserved (laptops + Androids, offline single-laptop demo).
>
> **Read this as a brief to a one-shot code generator,** not as a list of suggestions to a team. Section 11 is the actual prompt seed.

---

## 1. Brand rationale — "Hamilton"

> One-line claim: **Hamilton is the commander's aide-de-camp for the comms channel — the trusted intermediary that tells him how much he can rely on what's coming back from his combat assets.**

The name is grounded in the **historical role of Alexander Hamilton as George Washington's aide-de-camp during the Revolutionary War** (1777–1781). Hamilton sat at Washington's right hand at Morristown, Valley Forge, and Yorktown. His job was to be the **trusted conduit between the commander and the rest of the army** — drafting and decoding correspondence, verifying the reliability of incoming reports, and translating raw field intelligence into commander-actionable judgment. He was not a sensor. He was not a weapon. He was the **layer of judged trust** between the seat of decision and everything beyond it.

That is exactly what this product is. The FDC officer at the COP screen is Washington at headquarters. The combat assets feeding him tracks — sensors, drones, network-attached units — are the field. The thing the commander has historically lacked is **a continuously updated, machine-legible read on how much he can trust the channel between him and the field at the moment of decision.** Hamilton, as a product, is that aide-de-camp: the quiet figure beside the commander whose entire job is to know how reliable the information is *right now*, and to interrupt the commander before he commits an action grounded in degraded intelligence.

| Reading | Substance | Strength | Use |
|---|---|---|---|
| **Alexander Hamilton, aide-de-camp to Washington** (Revolutionary War, 1777–1781) | Historically the role of judging the trustworthiness of comms between commander and combat assets. Direct, almost literal mapping to the product's job. | **Load-bearing.** This is the brand. | Primary pitch language and brand anchor. |
| **Hamiltonian mechanics** (variational principle; *stationary action*; total-energy framing) | The product **gates action** below the ROE floor. Hamilton's principle is *"physical systems take the path of stationary action."* The trust score behaves as a conserved-energy quantity per source — when total integrity drops below a threshold, action is forbidden. | High — internal-engineering metaphor that's mathematically clean. | Internal naming (`hamiltonian` for the trust-energy aggregator); about-page footer. Never leads pitch. |
| **Sir William Rowan Hamilton** (quaternions → rigid-body 3D rotation) | Quaternions are how every COP/map/AR product internally represents orientation. | Low — wordplay. | Reject. |

### The decision

- **Primary:** **Alexander Hamilton, aide-de-camp.** The trusted conduit between the commander and his combat assets. The product is the modern instantiation of the role.
- **Secondary (engineering layer):** Hamiltonian mechanics. Internal model name only.
- **Reject:** Sir William Rowan Hamilton.

### The wordmark tagline

> **Hamilton — The commander's aide-de-camp for the comms channel.**

Concrete, period-grounded, and immediately legible to a defense audience. *Aide-de-camp* is the operative phrase: it tells the judge in three words what the product *is* relationally — not a sensor, not a weapon, not a dashboard, but the **trusted figure beside the commander whose job is judging the reliability of the channel.**

The phrase *kill chain* still appears in supporting language (e.g., "gates the kill chain when the channel can't be trusted") but is **no longer the lede of the tagline** — the aide-de-camp framing is more historically grounded, more humane, and harder to misread as SaaS vocabulary.

### Pitch-line variants (all consistent with the aide-de-camp anchor)

- *"Hamilton is the aide-de-camp for the comms channel — it tells the commander how much he can trust what's coming back from the field, in real time."*
- *"Washington had Hamilton at his side. Every commander since has had to decide without one. Hamilton, the platform, restores that role."*
- *"The product sits where Alexander Hamilton sat — beside the commander, judging the reliability of the channel before action is taken."*

### Names rejected (and why)

- `TrustLayer`, `Integrity`, `KillSwitch`, `GroundTruth` — SaaS-shaped, descriptive of feature not stance.
- `Sentinel`, `Praetorian`, `Aegis` — overused defense-startup vocabulary; collision risk with AEGIS Combat System (P2 persona).
- `Cassandra`, `Oracle` — predict-the-future framing violates **R14** (deterministic boundary; we are a *measurement instrument*, not a predictive model).
- `Argus`, `Hawkeye` — sensing/seeing framing; we don't *see* — we *judge what's coming through*.
- `Aide`, `ADC` — too generic; *Hamilton* carries the historical specificity that makes the metaphor land.

### Names rejected (and why)

- `TrustLayer`, `Integrity`, `KillSwitch`, `GroundTruth` — SaaS-shaped, descriptive of feature not stance.
- `Sentinel`, `Praetorian`, `Aegis` — overused defense-startup vocabulary; collision risk with AEGIS Combat System (P2 persona).
- `Cassandra`, `Oracle` — predict-the-future framing violates **R14** (deterministic boundary; we are a *measurement instrument*, not a predictive model).
- `Argus`, `Hawkeye` — sensing/seeing framing; we don't *see* — we *score what's coming through*.

---

## 2. Visual direction

> **The decision: Editorial dark with phosphor accent.** A *Foreign Affairs*-disciplined typographic spine in a low-light operator-grade dark surface, with phosphor-green used **semantically only** on the trust-trace and the kill-chain modal. Phosphor is never decoration; it appears when the score is being stated or the decision is being gated.

### The candidates I weighed

| Direction | What it gets right | Why it loses on its own |
|---|---|---|
| Editorial / defense-publication | Treats every panel like a typographic document — *Foreign Affairs* meets a fire-control panel. Anti-template by default. | Risks reading as static. No motion language unless we layer one in. |
| Phosphor / CRT terminal | Insanely demoable. Reads as "operator tool" instantly. Evan's spec already has a CRT toggle. | Gimmicky if it's the **whole** aesthetic. Reads as "retro skin," not "this is the actual instrument." Lattice and ATAK have already done it; we look like a homage. |
| Dark luxury operator-grade | Disciplined contrast, FDC-seat-appropriate, readable under stage glare. | Easily slides toward Palantir-adjacent or *Severance*-adjacent. Looks expensive but anonymous. |
| Swiss / International operator-grade | Rigid grid, generous negative space, single accent. Closest to fielded ops aesthetic. Anti-template-compliant. | Risks reading as cold. No ceremony at the 1:20 modal. |
| **Editorial dark + phosphor accent (chosen)** | Typographic seriousness gives the system gravitas. Phosphor used **only** on the gradient and the gating modal directly reinforces the **R16 wedge** — the load-bearing visuals are also the load-bearing brand cues. | Discipline-heavy. If the model breaks the rule and uses phosphor decoratively, the whole thing collapses into nostalgia. |

### What it is NOT

- Not Lattice. Lattice is glass-and-blue corporate-defense-tech; we are paper-and-amber-and-instrument.
- Not Palantir. Palantir is dense data-mosaic; we are restrained, single-decision-at-a-time.
- Not ATAK. ATAK is utilitarian green-on-tan field tablet; we are the seat *behind* the operator.
- Not *Foreign Affairs*. Foreign Affairs is light-mode broadsheet; we are dark-mode and instrumented.
- Not Severance / Apple-design-scifi. Severance is sterile and unhumored; we are weighted and operator-grade.

### One-line direction

**A serious typographic instrument in low light, with phosphor reserved for the moments that matter.**

---

## 3. Color system

> **Discipline:** every token serves the **R16 wedge**. The gradient and the gating accent are load-bearing; everything else recedes.

OKLCH is non-negotiable — it is the only color space that gives the trust-score gradient *perceptually uniform* steps from 1.0 → 0.0. RGB ramps look smooth at the endpoints and clump at the inflection.

### 3.1 Surface tiers (three depth levels, dark)

| Token | OKLCH | Role |
|---|---|---|
| `--surface-base` | `oklch(14% 0.01 250)` | Page / map dead-space; near-black with a 1% blue undertone so it doesn't look like flat `#000` |
| `--surface-panel` | `oklch(18% 0.012 250)` | Side panel, event terminal background |
| `--surface-elevated` | `oklch(22% 0.014 250)` | Modal, hover cards, citation surfaces |
| `--surface-popover-shadow` | `oklch(8% 0.005 250 / 0.72)` | Shadow tint under tooltips and popovers (rating tooltip, stack list, Admin panel). Was `--surface-modal-scrim`, the Beat 1:20 modal scrim, retired with the modal |

Three depth tiers minimum. Layering is how the *gating* moment reads as gravity rather than as a toast.

### 3.2 Text emphasis

| Token | OKLCH | Role |
|---|---|---|
| `--text-primary` | `oklch(96% 0.005 90)` | Headers, the on-screen subtitle "Kill-chain gated below ROE floor" |
| `--text-secondary` | `oklch(78% 0.008 90)` | Body, trust-trace bullets |
| `--text-tertiary` | `oklch(58% 0.01 90)` | Timestamps, source IDs, unit names in dead-state |
| `--text-citation` | `oklch(70% 0.04 50)` | Per-candidate hover citation (Bronk RUSI 2024 etc.) — slightly warm, signals *evidentiary*, not decorative |

### 3.3 Trust-score gradient (load-bearing — the R16 gradient edge)

Continuous over `[0.0, 1.0]`. The inflection at `0.6` is the **ROE floor visualization** — anything below it must read as *gated territory*.

| Score range | Token | OKLCH | Reads as |
|---|---|---|---|
| `1.00..0.85` | `--trust-nominal` | `oklch(85% 0.18 145)` | Phosphor-green at full saturation. The track is healthy. |
| `0.85..0.60` | `--trust-watching` | gradient `oklch(85% 0.18 145)` → `oklch(75% 0.16 90)` | Green → desaturated yellow-green. *"Watch this."* |
| `0.60..0.30` | `--trust-degraded` | gradient `oklch(75% 0.16 90)` → `oklch(62% 0.18 60)` | Below ROE floor. Yellow-green → amber. **Pulsing halo activates here.** |
| `0.30..0.00` | `--trust-failed` | gradient `oklch(62% 0.18 60)` → `oklch(45% 0.14 35)` | Amber → muted ember. Track icon at 30% opacity per `FR-06`. |
| ROE-floor inflection | `--trust-roe-line` | `oklch(72% 0.20 75)` | A thin 1px horizontal line on any score readout. *This is the floor.* |

**Why this gradient and not red-yellow-green:** red-on-black on a stage projector reads as *system error*, not as *trust gradient*. We need the operator to read this as *measurement*, not *alert*. Amber is the FDC vocabulary for *attention required*; ember is the vocabulary for *gone*. Phosphor at the top end signals *instrument*, not *brand color*.

**Why phosphor on the high end:** at 1.0 trust the system is doing its job and the operator can ignore it. Phosphor-green at high saturation reads as *the instrument is alive and reporting*, the same way a CRT phosphor at full brightness reads. It also doubles as the **gating accent** in §3.4 — the brand color for *"the system is the system"* moments.

### 3.4 TSS gating accent (load-bearing — the R16 gating edge; formerly "kill-chain gating accent")

> **SUPERSEDED (TSS mission row — `docs/plans/tss-mission-row.md`).** The kill-chain modal is retired. A call for fire that depends on a source failing the target selection standards (TSS) shows TSS FAIL inline in its fire-mission row: 2px `--gating-primary` left rule, text chips ("FAIL", "E5"), "Rec. method of control: DO NOT LOAD", branches `[1]`–`[4]`. No modal, scrim, blur, z-100 layer or focus steal; no motion. The text below is kept as the historical spec.


| Token | OKLCH | Role |
|---|---|---|
| `--gating-primary` | `oklch(72% 0.20 75)` | Modal border, modal headline glow, the on-screen subtitle "Kill-chain gated below ROE floor" |
| `--gating-secondary` | `oklch(85% 0.18 145)` | Phosphor for the option-button focus state and the trust-trace bullet leaders |

**Not red.** Red-alert chrome trains the eye to dismiss. We want gravity, not alarm-fatigue. Amber-going-phosphor reads as *"the system is taking responsibility for stopping you"* — Hamiltonian *stationary-action* visual. The modal is **not** a notification. It is **the moment the system takes the floor.**

### 3.5 Track affiliation (mil-std-2525-adjacent without literal copy)

| Affiliation | Hue | OKLCH | Symbol shape (see §5) |
|---|---|---|---|
| Friendly | Cool blue-cyan | `oklch(70% 0.13 230)` | Filled regular polygon, even side count |
| Enemy | Crimson-warm | `oklch(58% 0.18 25)` | Filled regular polygon, rotated 45°, even side count |
| Neutral | Warm gray | `oklch(72% 0.02 80)` | Outlined polygon |
| Unknown | Phosphor at 50% | `oklch(65% 0.10 145)` | Dashed outline polygon |

These are **affiliation hues**, not status hues. Status (healthy / degraded / critical / offline) is the **opacity + halo** layer on top, driven by the trust score. **Affiliation is fixed; trust is the variable.** That separation is what makes the wedge legible.

### 3.6 Status states (per Evan's contract — `Link.status`)

These map to *infrastructure* states (the link is up / down), distinct from trust score. Most of the demo lives in trust-score-land; status is the binary fallback Lattice already does.

| State | Token | OKLCH |
|---|---|---|
| healthy | `--status-healthy` | `oklch(72% 0.05 145)` (desaturated phosphor — present but not commanding) |
| degraded | `--status-degraded` | `oklch(70% 0.10 90)` |
| critical | `--status-critical` | `oklch(60% 0.16 50)` |
| offline | `--status-offline` | `oklch(38% 0.005 250)` |

### 3.7 Citation / provenance tier

Per-candidate hover citations from `FR-04a` (Bronk RUSI 2024, JAPCC 2023, *WaPo* 2024) must read as *evidentiary*, not decorative.

| Token | OKLCH | Role |
|---|---|---|
| `--citation-text` | `oklch(70% 0.04 50)` | Citation text proper |
| `--citation-rule` | `oklch(45% 0.02 50)` | The thin underline beneath the citation |
| `--citation-bg-hover` | `oklch(20% 0.015 50)` | Hover background — warmer than the panel surface, subtly distinguishing citation as *paper, not screen* |

The citation tier is intentionally warm (low-chroma orange-brown) — it should read as *quoted from a document*, the way pull-quotes look in *Foreign Affairs*. This is the editorial side of the visual direction earning its keep.

---

## 4. Typography

> **Constraint:** self-hosted (NFR-01), readable on a stage projector, and supports tabular numerics for the score readout.

### 4.1 The pairing

| Slot | Family | Weights | Why |
|---|---|---|---|
| **Editorial spine** | **GT America Mono** for tabular readouts; **Söhne Buch** (or **Inter Tight** as license-clean substitute) for headers and body | 400 / 500 / 600 | Söhne is the *Foreign Affairs* / *NYT Magazine* spine. It carries seriousness without being a serif. Inter Tight is the open-source-licensable substitute that ships in the bundle. |
| **Numeric readout** | **Berkeley Mono** (paid, but tiny weight) — fallback **JetBrains Mono** | 400 / 500 | Berkeley Mono has the best `0` / `O` / `1` / `l` distinction at 11px on a projector. JetBrains Mono is the open-source fallback. |

Two families. **No third font.** No serif "for headlines." The serif impulse is what makes editorial directions slide into pastiche.

### 4.2 The fluid scale

```css
:root {
  --text-micro:  clamp(0.6875rem, 0.65rem + 0.15vw, 0.75rem);   /* citation, timestamp */
  --text-body:   clamp(0.8125rem, 0.78rem + 0.2vw, 0.9375rem);  /* trust-trace bullets */
  --text-panel:  clamp(0.9375rem, 0.88rem + 0.3vw, 1.0625rem);  /* side panel headers */
  /* --text-modal ("Kill-chain gated below ROE floor") removed: the modal is retired (TSS mission row). */
  --text-hero:   clamp(2.5rem, 1.8rem + 3vw, 4.5rem);           /* deck slide titles */
  --text-readout: clamp(2rem, 1.6rem + 2vw, 3.25rem);           /* the trust score numeral itself */
}
```

### 4.3 Tabular numerics (load-bearing)

The trust-score numeral is the **most-looked-at glyph cluster in the demo.** It must not jitter as digits change.

```css
.trust-readout {
  font-family: 'Berkeley Mono', 'JetBrains Mono', ui-monospace;
  font-feature-settings: 'tnum' 1, 'zero' 1;
  font-variant-numeric: tabular-nums slashed-zero;
  letter-spacing: -0.01em;
}
```

`tnum` locks digit width; `zero` distinguishes `0` from `O` at small sizes. Without both, the score visibly flickers as it ticks down, which reads as *animation glitch* instead of *measurement instrument.*

### 4.4 Self-hosting strategy (NFR-01 compliance)

- All `.woff2` files committed to `/public/fonts/`. No `<link rel="preconnect" href="https://fonts.googleapis.com">`. Ever.
- `font-display: swap` on all `@font-face` rules.
- Subset to Latin Basic + Latin-1 Supplement + the specific punctuation we use (em-dash, en-dash, prime, double-prime). No CJK, no full Latin Extended. Saves ~40KB per face.
- Preload only `Söhne-Buch.woff2`, `BerkeleyMono-Regular.woff2`, and `BerkeleyMono-Medium.woff2`. Everything else loads on demand.

---

## 5. Iconography & track symbology

> **Decision: bespoke geometric primitives**, not mil-std-2525 silhouettes, not Lucide.

### 5.1 Why bespoke

- Mil-std-2525 silhouettes are **what every C2 product already uses.** Adopting them ties the visual identity to the same vendor-neutral baseline that Lattice / ATAK / Maven all use. Anti-template policy violated.
- Lucide-derived custom set drifts toward *consumer-app icon system* (the Lattice-tablet aesthetic). Wrong register.
- Bespoke geometric primitives — filled/outlined regular polygons — read as *abstract instrument symbology*, like a fire-control panel or a sonar display. **Editorial-instrument, on-brand.**

### 5.2 The rendering rule (binds `FR-06`)

```
For each track t with affiliation a, sensor type s, trust score c ∈ [0,1]:

  shape:    regular polygon, side_count = sensor_type_to_sides(s)
              recon_static  → 6 sides
              recon_mobile  → 7 sides
              detection     → 5 sides
              defense       → 4 sides (square, axis-aligned)
              offense       → 3 sides (triangle, point-up if friendly, point-down if enemy)
  fill:     affiliation_hue(a)              // §3.5
  rotation: 45° if a == enemy else 0°
  opacity:  c                                // FR-06: opacity proportional to trust score
  halo:     if c < 0.6 → pulsing halo,
              halo_radius = (1 - c) * 24px,
              halo_color  = trust_gradient(c),
              halo_period = 1200ms - (1-c) * 600ms      // pulses faster as trust falls
  label:    monospace numeric trust score, rendered tabular,
              shown on hover OR persistently if c < 0.6
```

This rule is **derivable from the URS/FRS** without ambiguity. A one-shot model can implement it from the spec alone. **Side count = sensor type** is the seat-class encoding (R15 — FDC anchor — only the FDC's relevant sensor classes get distinct sides; everything else collapses to "unknown polygon").

### 5.3 The non-track icon set

For panel chrome — play / pause / scrub / acknowledge / escalate — use a minimal **custom 16-icon set** drawn at 16px and 24px on a 24-unit grid, stroke-only, 1.5px stroke, square caps. Drawn in-house as inline SVG. **No icon font.** No Lucide dependency at runtime.

This is a one-shot constraint: the model is told *"draw these 16 glyphs as SVG paths from this list of names"* and emits them inline. ~600 lines of SVG total.

---

## 6. Motion language

> **Constraint:** compositor-friendly only. `transform`, `opacity`, `clip-path`, `filter`. **Never** `width`, `height`, `top`, `left`, `margin`, `padding`, `border`, `font-size`. Reduced-motion fallback for every primitive.

### 6.1 Named motion primitives

| Primitive | Duration | Easing | Properties animated | Reduced-motion fallback |
|---|---|---|---|---|
| `gating-modal-arrival` | 420ms | `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo) | `transform: translateY(8px) → 0`; `opacity: 0 → 1`; `filter: blur(8px) → blur(0)` on the COP behind | `opacity: 0 → 1` over 120ms only |
| `trust-decay` | 1Hz tick, 800ms transition | `cubic-bezier(0.4, 0, 0.6, 1)` (smooth in-out) | `opacity` on icon, `filter: drop-shadow()` on halo | Snap to nearest 0.2 step instantly |
| `recovery-pulse` | 600ms once, then 200ms tail | `cubic-bezier(0.34, 1.56, 0.64, 1)` (ease-out-back, *barely* overshoot) | `opacity: 0.3 → 1.0`; `filter: drop-shadow()` flares then settles | Snap to 1.0 instantly |
| `fingerprint-candidate-reveal` | 280ms staggered (60ms per candidate) | `cubic-bezier(0.16, 1, 0.3, 1)` | `transform: translateX(-12px) → 0`; `opacity: 0 → 1`; `clip-path: inset(0 100% 0 0) → inset(0 0 0 0)` (left-to-right reveal — reads as *being typed by the system*) | All three appear simultaneously, no stagger |
| `playhead-scrub` | continuous, follows cursor | linear | `transform: translateX()` only | unchanged |
| `score-numeral-tick` | per-tick, 120ms | `cubic-bezier(0.4, 0, 0.6, 1)` | `transform: translateY()` micro-shift on the changed digit only (rest stays put — tabular nums) | `opacity: 0.6 → 1.0` flash, no translate |
| `roe-floor-cross` | 240ms | `cubic-bezier(0.16, 1, 0.3, 1)` | `transform: scaleX()` on the floor-line; `filter: drop-shadow()` flares orange | `filter: drop-shadow()` only, no scale |

Seven primitives. Every one is named after **what the operator perceives**, not what the CSS does.

### 6.2 The 1:20 modal — feels like gravity, not a toast

> **SUPERSEDED (TSS mission row — `docs/plans/tss-mission-row.md`).** The kill-chain modal is retired. A call for fire that depends on a source failing the target selection standards (TSS) shows TSS FAIL inline in its fire-mission row: 2px `--gating-primary` left rule, text chips ("FAIL", "E5"), "Rec. method of control: DO NOT LOAD", branches `[1]`–`[4]`. No modal, scrim, blur, z-100 layer or focus steal; no motion. The text below is kept as the historical spec.


The arrival is **deliberately slower than a notification toast** (420ms vs the typical 200ms). The blur on the COP behind the modal pushes the operator's attention forward; the modal itself rises 8px from below with no overshoot. Gravity, not bounce. The `--gating-primary` border glow (`filter: drop-shadow(0 0 24px var(--gating-primary))`) fades in over the same 420ms — the modal arrives with its own light.

The on-screen subtitle "**Kill-chain gated below ROE floor.**" appears on a 100ms delay after the modal frame, in `--text-modal` at `--text-primary` weight, with its own 200ms fade. **The subtitle is the last thing to arrive** — that's the R18 mitigation reading as a *deliberate stamp*, not as fast-flash chrome.

### 6.3 The trust-decay choreography

Trust score updates at ≥1Hz. The icon `opacity` interpolates **between ticks**, not at the tick — so the visual is continuous, not staircased. The halo pulse period **shortens as trust falls** — 1200ms at score 0.6, 600ms at score 0.0. The eye reads accelerating pulse as *escalating concern* without any color change. This is the R16 gradient edge expressed as motion, not as chrome.

### 6.4 GPU thrash discipline

- All score-driven animations bind to `transform` and `opacity`. Halo pulse uses `filter: drop-shadow()` — accept the cost (this is the load-bearing visual; we pay for it).
- `will-change: transform, opacity` on track icons; **removed** when the track recovers (`onTransitionEnd`). Don't leave `will-change` on forever — it's a hint, not a setting.
- The score numeral re-render uses `font-variant-numeric: tabular-nums` so the digit row doesn't reflow. No layout, just compositor.

---

## 7. Layout system

> **Decision: hybrid — single-screen primary on the demo laptop; `?layout=ops-center` URL flag activates multi-window split for the stage moment.**

### 7.1 Why hybrid

- **Stage projector reality:** judges see one screen. A multi-window ops-center view splits attention across windows the projector won't render correctly. **Single-screen wins for the live demo.**
- **Editorial push:** the multi-window mode is the visual *flex* — the moment the operator says *"and here's the same engine in a TOC three-window setup,"* and three browser windows snap into a synchronized layout. **Path-forward demo, not main demo.** Held in reserve for Q&A / for the path-forward slide. Evan's spec correctly identified this as a wow-feature.
- **The flag is a feature, not a fork.** Same components, same state store, different viewport composition.

### 7.2 The single-screen grid (primary demo)

12-column CSS Grid, 1440px / 1920px target, generous gutters (24px), no max-width on the map.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          BRAND BAR  (sticky, 56px)                   │
│  HAMILTON  ·  Trust gating for the kill chain        ·   FDC · Adam │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                                                  ┌─────────────────┐ │
│                                                  │  TRUST SIDE     │ │
│                                                  │  PANEL          │ │
│                                                  │                 │ │
│                                                  │  Selected unit: │ │
│         M A P   ( MapLibre + deck.gl )           │   Unit B        │ │
│         12-col grid, cols 1–8                    │  Score: 0.13    │ │
│         spans full height under brand bar         │  ▼ trust trace │ │
│                                                  │  ▼ candidates  │ │
│                                                  │   (FR-04a top-3)│ │
│                                                  │                 │ │
│                                                  │  cols 9–12      │ │
│                                                  └─────────────────┘ │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  EVENT TERMINAL  (cols 1–8, sticky bottom, 160px tall)               │
│  [18:42:14] unit_b · temporal_anomaly · cadence 1.0s → 1.17s         │
│  [18:42:24] unit_b · stability · CRC 0.2% → 6%                       │
│  ...                                                                 │
└──────────────────────────────────────────────────────────────────────┘
```

**Z-index discipline:**

| Layer | z-index | Notes |
|---|---|---|
| Map | 0 | base |
| Track halos & icons (deck.gl) | 1 | within MapLibre layer manager |
| Side panel | 10 | sticky right, slides in from right edge |
| Event terminal | 10 | sticky bottom |
| Brand bar | 20 | sticky top |
| Citation hover card | 50 | follows cursor near `FR-04a` candidates |
| ~~Modal scrim (Beat 1:20)~~ | ~~90~~ | superseded — no modal (TSS mission row) |
| ~~Modal frame (Beat 1:20)~~ | ~~100~~ | superseded — no modal (TSS mission row) |

~~Modal is the **only** thing that can be at z-100.~~ Superseded: there is no modal; the fire-mission row lives in the side column at the panel's z-level and never top-stacks.

### 7.3 The multi-window mode (`?layout=ops-center`)

Three windows: `Map`, `Trust + Recommender`, `Event Terminal`. Synchronized via a `BroadcastChannel('hamilton-ops-center')` — selection in one window updates the others. Same Zustand store; the `BroadcastChannel` is a thin sync layer.

This mode exists for **the path-forward slide visual** and for the *"and here's the same system across the three TOC seats"* Q&A moment. **Not the main demo.**

---

## 8. Logo / wordmark

> **Decision: a typographic-only wordmark.** No companion mark. The brand is the discipline of the type, not a glyph beside the type.

### 8.1 The wordmark

```
H A M I L T O N
```

- All-caps.
- `Söhne Buch` at 500 weight, **letter-spacing `0.32em`** (very wide). Reads as engraving, not as logo.
- Render as inline SVG with paths flattened (no font dependency for the mark itself — NFR-01).
- A 1px hairline rule, 12px below, color `--gating-primary` at 60% opacity, appears once any fire mission has failed TSS this session and stays on (formerly: when the kill-chain modal was active). The rule is the brand's stage cue: *"Hamilton was on its feet."*

### 8.2 The lockup

```
                     [hairline rule, conditional]
H A M I L T O N
link reliability for fires
```

(Tagline was "trust gating for the kill chain"; changed per the TSS terminology sweep — "kill chain" is not an FM 1-02 term.)

- Tagline is `Berkeley Mono` 400 weight, `--text-tertiary`, letter-spacing `0`, sized at 0.42× the wordmark cap-height.
- Tagline left-aligned to the wordmark's first stem.
- Vertical gap = 0.6× cap-height.

### 8.3 Stage projector legibility

At the back of the room, 30 feet from a 1080p projector, the wordmark must read. Söhne 500 with 0.32em letter-spacing reads at ~14pt-equivalent on a 200" screen — comfortably legible. No abstract gradient blob, no friendly mascot, no rounded sans-serif tech-bro wordmark. **The mark is restraint.**

### 8.4 Why typographic-only

Every defense-tech logo in the room is a glyph + wordmark lockup (Lattice's hexagons, Palantir's monolith, Anduril's sphere). **Hamilton breaks the pattern by refusing the glyph.** The system is the room. The room doesn't have a logo on the wall. It has a name, set in type, on the door.

---

## 9. Pitch-deck visual continuity

> **Principle: same product, two surfaces.** The 6-slide deck shares the live demo's design tokens, type system, and motion language. The handoff between deck and live demo is invisible.

### 9.1 Shared DNA

- **Tokens:** the deck uses the *exact* same CSS custom properties as the app. Slides are an HTML deck (Reveal.js or a hand-rolled deck), not a separate Figma/Keynote artifact.
- **Type system:** same Söhne / Berkeley Mono pairing, same fluid scale.
- **Surfaces:** slide background = `--surface-base`; panels on slides = `--surface-panel` so the deck looks like the app under a magnifying glass.
- **Citations:** any cited claim on a slide uses the `--citation-text` / `--citation-rule` styling — same as in-app `FR-04a` hover citations.

### 9.2 Slide-by-slide chrome

| Slide | Content | Chrome |
|---|---|---|
| 1. Title | `HAMILTON` wordmark + tagline + "xTech 2026 — submission" | Centered. Hairline rule below. No background imagery. |
| 2. The problem | "Today: Excalibur misses, after-action names the jammer." Number: **0 seconds of warning before commit.** | Single number rendered at `--text-hero` in `--gating-primary`. The rest of the slide is set in `--text-secondary`. |
| 3. The solution | One sentence + one screenshot (the COP with B fading) | Screenshot rendered at 80% width, panel chrome shown intact. The screenshot **is** the app — not a marketing rendering. |
| 4. Demo placeholder | "Live demo — Hamilton in the FDC seat" | Black card, wordmark only, hairline rule active. **The hairline rule cues the audience that the system is about to take the floor.** |
| 5. Why it's novel | 3 bullets: (a) continuous gradient, (b) kill-chain gating, (c) deterministic detection | Each bullet has a left-edge phosphor leader (`--gating-secondary`), 2px wide, 100% bullet height. |
| 6. Path forward + ask | The 5-item path-forward list from FRS §7 + the 6-month ask | Same chrome as slide 5. The closing line is the wordmark + tagline again. |

### 9.3 The handoff moment

Slide 4 → live demo. The transition is:

1. Slide 4 holds for ~1.5 seconds with just the wordmark and the hairline rule active.
2. The hairline rule extends — `transform: scaleX(0) → scaleX(1)` from the wordmark's first stem outward — over 600ms, `cubic-bezier(0.16, 1, 0.3, 1)`.
3. The deck container fades to `opacity: 0` over 240ms; the demo container fades in under it.
4. The demo loads with the brand bar already showing the same hairline rule, in its docked position.

**The audience never sees a "switching applications" moment.** The deck and the demo are the same artifact; one transitions into the other.

---

## 10. The 30-second crescendo (1:15 → 1:50) — beat-by-beat treatment

> This is the heart of the document. Every prior section serves these 35 seconds. Beat 1:20 is load-bearing per `FR-07` / `UR-05` / `R18`.

### 10.1 0:45 — the first signal (entry to the wedge)

- **Enters viewport:** Unit B icon begins fading. Trust trace bullet appears beside it: *"B-link cadence degraded 18s ago — investigating."*
- **Exits viewport:** nothing.
- **Active tokens:** `--trust-watching` gradient on B's icon (engine score ≈0.70: cadence 1.0s → 1.17s); `--text-secondary` on the trust trace.
- **Motion:** `trust-decay` primitive on B's icon. `fingerprint-candidate-reveal` is **not** firing yet.
- **Verbatim text:** *"B-link cadence degraded 18s ago — investigating."* (one bullet, no others.)
- **Composition:** the operator's eye should land on B's icon dimming — it is the only thing changing on the map. The side panel is empty.

### 10.2 0:55 — the network signal

- **Enters viewport:** second bullet in the trust trace: *"B-link: 6% corrupted frames, cadence 1.17s."* The first bullet stays visible.
- **Active tokens:** B's icon stays in the `--trust-watching` band (engine score ≈0.65: CRC 0.2% → 6%), above the 0.60 floor. The pulsing halo does **not** activate yet; it activates when B crosses 0.6 at 1:15.
- **Motion:** `trust-decay` continues; halo pulse begins at 1200ms period. Score numeral on hover transitions via `score-numeral-tick`.
- **Verbatim text:** *"B-link: 6% corrupted frames, cadence 1.17s."*
- **Composition:** still B-icon-dominant. Side panel updates with the cumulative trust trace (now 2 bullets).

### 10.3 1:05 — the spatial discrimination

> **Superseded in part by `HS-20` (AoE plan review 2026-10-04, `docs/plans/jammer-aoe.md` §0.3 a / e).** The directional vector "toward the suspected jammer location" presumes a location nobody measured and is removed with the AoE MVP; no map line is drawn at 1:05 (or 1:15, 10.4, 10.7). With the km-scale layout the verbatim line becomes *"Degradation localized at B — no degrading unit within 500 m. A, C healthy."* The 1:15 map graphic is the estimated civil-GNSS area of effect (`FR-06a`). The 10.4 "reposition out of the jammer lobe" becomes B's 1:50 move, which is simulator-driven, not a known lobe.

- **Enters viewport:** side panel reveals the spatial-classification line: *"Degradation localized at B — no degrading unit within 500 m. A, C healthy."* ~~A subtle directional vector renders on the map from B's heading toward the suspected jammer location (a thin `--gating-primary` line, dashed, 40% opacity).~~ Superseded (HS-20): no map line.
- **Active tokens:** A and C remain `--trust-nominal` (engine 1.00). B holds at ≈0.65 (WATCH). The vector line on the map is `--gating-primary` at 40%.
- **Motion:** the directional vector renders via `clip-path: inset()` (the line draws itself outward from B's icon over 400ms).
- **Verbatim text:** *"Degradation localized at B — no degrading unit within 500 m. A, C healthy."*
- **Composition:** the operator's eye is being walked from B's icon → the directional vector → the side panel. The first time the side panel pulls focus.

### 10.4 1:15 — the candidate reveal (FR-04a)

- **Enters viewport:** side panel reveals top-3 candidate jamming methods, **staggered**:
  - Candidate 1: `ground_based_gps_uhf_barrage (1.00)` → affected: `Excalibur, JDAM-ER, Switchblade 300, GMLRS-U` (60ms in)
  - Candidate 2: `pulsed_uhf_wide (0.67)` → affected: `FPV C2 link, Switchblade 300` (120ms in)
  - Candidate 3: `cellular_uhf_barrage (0.17)` → affected: `ATAK position-share, FPV C2 link` (180ms in)
- **Active tokens:** the score readout for each candidate uses the gradient — 1.00 reads in `--trust-nominal` (this is *fingerprint match strength*, repurposing the gradient to mean "deterministic overlap"; it is NOT the trust component, which is `1 − match strength`), 0.50 in `--trust-degraded`, 0.17 in `--trust-failed`. Per-candidate citations rendered in `--text-citation`.
- **Motion:** `fingerprint-candidate-reveal` primitive — left-to-right `clip-path: inset()` reveal, staggered 60ms.
- **Verbatim text:** the candidate strings above, exactly as they appear in `[[Specs/FRS|FRS]]` §2.4a acceptance.
- **Engine state:** the jammer reaches full power with the reveal. B's link shows a 6.1s gap and 14% CRC, fingerprint trust falls to 0.00, and B's score drops 0.65 → 0.13. This is its **first score below the 0.60 GPS-guided TSS minimum (C)**: AB1001, the M982 call for fire from OBS B received at 1:12, flips to TSS FAIL in its row (§10.5). Nothing else interrupts.
- **Composition:** **the side panel takes the floor.** The map B-icon continues fading silently in the periphery. The operator's eye goes to the fire-mission row, where AB1001 now reads TSS FAIL.

### 10.5 **1:20 — THE LOAD-BEARING BEAT** (now: call for fire at B fails TSS in-row)

> **SUPERSEDED (TSS mission row — `docs/plans/tss-mission-row.md`).** The kill-chain modal is retired. A call for fire that depends on a source failing the target selection standards (TSS) shows TSS FAIL inline in its fire-mission row: 2px `--gating-primary` left rule, text chips ("FAIL", "E5"), "Rec. method of control: DO NOT LOAD", branches `[1]`–`[4]`. No modal, scrim, blur, z-100 layer or focus steal; no motion. The text below is kept as the historical spec.

**Current treatment (TSS mission row):**

- **1:12 — enters the queue:** `FM AB1001 | OBS B (FO) | M982 (GPS)` with chip `PASS` and `TSS: PASS — RELIABILITY C3 (min C) · AGE 1s OK`. The queue sits above the trust panel and is absent until the first call for fire (AB1002, M795, at 0:30 — `NOT GATED`).
- **1:15 — the row, not the screen, changes:** chip `FAIL`; `TSS: FAIL — RELIABILITY E5 (min C) · AGE 1s OK`; `Rec. method of control: DO NOT LOAD (M982)`; 2px `--gating-primary` left rule; branches `[1] Shift → M795 HE, adjust fire` · `[2] Confirm via alt channel` · `[3] AT MY COMMAND — re-rate in 60 s` · `[4] Accept risk… (FSO)`. The brand-bar hairline turns on (any TSS FAIL this session) and stays on.
- **1:20 — Adam presses `1`:** M795 HE, `NOT GATED`, TSS PASS; the after-action log shows the branch with mission id, TSS result, J, report age, role and DTG.
- **Stage subtitle (R18):** *"Target selection standard not met — source E5."* Never "HOLD FIRE" / "CEASE FIRE"; CHECK FIRING / CEASE LOADING only as a recommendation on a mission already firing.

**Historical spec (superseded):**


- **Enters viewport:** the kill-chain modal.
  - **Frame 1 (0–100ms):** the COP behind blurs to `filter: blur(8px)`. The modal scrim fades in to `opacity: 0.72`.
  - **Frame 2 (100–420ms):** the modal frame rises 8px from below, `opacity: 0 → 1`, with a `--gating-primary` drop-shadow glow fading in alongside. The wordmark's hairline rule activates in the brand bar simultaneously (1px line, full bar width, `--gating-primary` 60%).
  - **Frame 3 (420–520ms):** the modal headline appears: *"Trust on B-position + B-GPS below ROE floor."* (in `--text-modal`, `--text-primary`)
  - **Frame 4 (520–620ms):** the **R18 subtitle** appears: *"Kill-chain gated below ROE floor."* in `--gating-primary` at the same `--text-modal` size, beneath the headline. **This is the last thing to arrive.** The audience reads it for ~3 seconds before any option is selected.
  - **Frame 5 (620–820ms):** three option buttons reveal, staggered 80ms apart:
    - **(a)** delay 60s for link recovery
    - **(b)** shift to non-GPS munition
    - **(c)** confirm B via alt channel before commit
- **Exits viewport:** nothing visible — the COP is still there, blurred, and the side panel still shows the candidates beneath the scrim.
- **Active tokens:** every load-bearing token in §3 is firing. `--gating-primary` on the modal border, headline, hairline rule, and option-button leaders. `--gating-secondary` (phosphor) on the focused option button. `--surface-elevated` on the modal body.
- **Motion:** `gating-modal-arrival` primitive. The modal does not bounce, does not shake, does not flash. **Gravity, not alarm.**
- **Verbatim text:**
  - Headline: *"Trust on B-position + B-GPS below ROE floor."*
  - Subtitle: ***"Kill-chain gated below ROE floor."***
  - Options: *"(a) delay 60s for link recovery / (b) shift to non-GPS munition / (c) confirm B via alt channel before commit."*
- **Composition:** the **subtitle is the visual stamp** of the entire demo. It is the largest, brightest, most-saturated single line on the projector. The judge's eye lands on it. **R18 is mitigated by visual hierarchy, not just by the words being on screen.**

### 10.6 1:50 — recovery initiation

> **SUPERSEDED (TSS mission row — `docs/plans/tss-mission-row.md`).** The kill-chain modal is retired. A call for fire that depends on a source failing the target selection standards (TSS) shows TSS FAIL inline in its fire-mission row: 2px `--gating-primary` left rule, text chips ("FAIL", "E5"), "Rec. method of control: DO NOT LOAD", branches `[1]`–`[4]`. No modal, scrim, blur, z-100 layer or focus steal; no motion. The text below is kept as the historical spec.


- **Enters viewport:** Officer Adam selects option (b). The modal's option-button (b) gets a `--gating-secondary` (phosphor) focus halo, then the modal exits — `transform: translateY(0 → 8px)`, `opacity: 1 → 0`, `filter: blur(0 → 4px)` over 320ms (faster exit than entry — the system steps back). The COP unblurs.
- **Exits viewport:** the modal. The hairline rule in the brand bar **stays on** through the rest of the demo (it stays on for any session in which a gating event has fired — *Hamilton was on its feet*).
- **Active tokens:** B's icon still in `--trust-failed`. The directional vector still rendered. The candidate panel still visible.
- **Motion:** modal exit (above). On the map, B begins to reposition out of the jammer lobe (this is scripted demo content — B's coordinates animate via `transform`).
- **Verbatim text:** none (the operator's voice carries the beat).
- **Composition:** the COP comes back into focus, and the system has receded. **Hamilton's job is done; the operator's job continues.**

### 10.7 2:15 — recovery + outcome

- **Enters viewport:** B's icon snaps back to `opacity: 1.0` via the `recovery-pulse` primitive. The trust readout numeral animates from `0.22 → 1.00` via rapid tabular ticks (~600ms total). The pulsing halo decelerates and dissolves.
- **Exits viewport:** the directional vector fades.
- **Active tokens:** `--trust-nominal` everywhere. The gating tokens stand down.
- **Motion:** `recovery-pulse` on B; `score-numeral-tick` running fast on the readout.
- **Verbatim text** (operator-said, not on-screen, but the slide chrome supports it): *"Without the layer: GPS-guided missile misses, casualties, withdrawal. With the layer: jammer surfaced 35 seconds before commit, weapon swap, objective taken."*
- **Composition:** the COP looks like 0:00 — three healthy units. The hairline rule in the brand bar is the only visible trace that anything happened. **That's the design's most quiet, most powerful moment.** The system gated an action and got out of the way.

---

## 11. One-shot build prompt seed

> **SUPERSEDED (TSS mission row — `docs/plans/tss-mission-row.md`).** The kill-chain modal is retired. A call for fire that depends on a source failing the target selection standards (TSS) shows TSS FAIL inline in its fire-mission row: 2px `--gating-primary` left rule, text chips ("FAIL", "E5"), "Rec. method of control: DO NOT LOAD", branches `[1]`–`[4]`. No modal, scrim, blur, z-100 layer or focus steal; no motion. The text below is kept as the historical spec.


> Drop this into a Claude/AI one-shot pipeline alongside the seed docs ([[Specs/URS|URS]], [[Specs/FRS|FRS]], [[Specs/System Design|System Design]], [[Tech Stack]], [[../05 - Build Plan/Demo and Pitch|Demo and Pitch]]). The prompt is self-contained.

```text
You are generating the complete frontend for HAMILTON — a comms-integrity
evaluation layer that drops onto any C2 surface and gates kill-chain decisions
on a continuous per-source trust score. The build is single-shot, single-laptop,
fully offline, and demoed at xTech (35% Technical Demo / 30% Military Impact /
25% Creativity / 10% Pitch). The seat is Officer Adam, Battalion Fires Cell,
Avdiivka counterfactual.

STACK (locked):
- React 18 + Vite + TypeScript
- Tailwind CSS with CSS custom properties for ALL design tokens
- shadcn/ui as a starting point but RESTYLED with Hamilton tokens — never ship
  default shadcn appearance
- Zustand for client state including Zustand BroadcastChannel sync for the
  ops-center mode
- MapLibre GL JS + deck.gl for the COP spine
- PMTiles offline tiles bundled in /public — no external tile service
- Self-hosted fonts in /public/fonts — NEVER fonts.googleapis.com

BRAND:
- Name: Hamilton — named for Alexander Hamilton in his role as aide-de-camp to
  General Washington (Revolutionary War, 1777–1781). The aide-de-camp was the
  trusted conduit between the commander and the field, judging the reliability
  of comms and intelligence before the commander acted. The product is the
  modern instantiation of that role: the FDC officer is Washington; combat
  assets in the field feed the COP; Hamilton is the layer that judges how
  much the commander can trust the channel right now. Hamiltonian-mechanics
  is a SECONDARY internal-engineering metaphor only (used for the trust-
  energy aggregator name); never leads pitch.
- Tagline: "The commander's aide-de-camp for the comms channel."
- Visual direction: editorial dark with phosphor accent. Foreign Affairs
  typographic seriousness on a low-light operator-grade dark surface, with
  phosphor-green used SEMANTICALLY ONLY on the trust gradient and the kill-
  chain gating modal. Never decoratively.
- NOT: Lattice glass-blue, Palantir mosaic, ATAK utilitarian green-on-tan.
- Logo: typographic-only wordmark, "H A M I L T O N" in Söhne Buch 500 with
  letter-spacing 0.32em. Inline SVG with flattened paths. NO companion glyph.
  Hairline rule appears below wordmark in the brand bar ONLY when a kill-chain
  gating event is active.

COLOR (OKLCH, no exceptions):
- Surfaces: --surface-base oklch(14% 0.01 250); --surface-panel oklch(18% .012
  250); --surface-elevated oklch(22% .014 250); --surface-modal-scrim
  oklch(8% .005 250 / 0.72)
- Text: --text-primary oklch(96% .005 90); --text-secondary oklch(78% .008 90);
  --text-tertiary oklch(58% .01 90); --text-citation oklch(70% .04 50)
- Trust gradient (load-bearing, R16): 1.00→0.85 phosphor oklch(85% .18 145);
  0.85→0.60 desaturated yellow-green; 0.60→0.30 amber oklch(62% .18 60);
  0.30→0.00 ember oklch(45% .14 35). ROE-floor inflection rendered as a 1px
  horizontal line in oklch(72% .20 75).
- Gating accent (load-bearing, R16): --gating-primary oklch(72% .20 75) on
  modal border + R18 subtitle; --gating-secondary oklch(85% .18 145) on focus
  states. NOT RED. Red trains alarm-fatigue dismissal; we want gravity.
- Affiliation: friendly oklch(70% .13 230); enemy oklch(58% .18 25); neutral
  oklch(72% .02 80); unknown oklch(65% .10 145). Affiliation is fixed; trust is
  the variable. SEPARATE these channels.

TYPOGRAPHY:
- Headers/body: Söhne Buch 400/500/600 (or Inter Tight as license-clean sub).
- Numerics: Berkeley Mono 400/500 (or JetBrains Mono fallback). MUST use
  font-feature-settings: 'tnum' 1, 'zero' 1 and font-variant-numeric:
  tabular-nums slashed-zero on every score readout. The score numeral cannot
  jitter as digits change.
- Two families. No third font. Self-hosted woff2, font-display: swap, subset to
  Latin Basic + Latin-1 + the specific punctuation only.

ICONOGRAPHY:
- Bespoke geometric primitives, NOT mil-std-2525, NOT Lucide.
- Track rule: regular polygon, side_count = sensor_type → recon_static 6,
  recon_mobile 7, detection 5, defense 4, offense 3. Fill = affiliation hue.
  Rotation 45° if enemy. Opacity = trust score. Halo at score < 0.6, radius
  (1-c)*24px, period 1200ms - (1-c)*600ms (faster pulse as trust falls).
- Panel chrome: custom 16-icon set drawn inline as SVG, 1.5px stroke, square
  caps, on a 24-unit grid. NO icon font. NO Lucide at runtime.

MOTION (compositor-friendly only — transform/opacity/clip-path/filter; never
width/height/top/left/margin/padding/border/font-size):
- gating-modal-arrival: 420ms ease-out-expo, translateY 8→0 + opacity 0→1 +
  filter blur(8px)→0 on COP behind. Subtitle "Kill-chain gated below ROE
  floor." arrives last with 100ms additional delay. NOT a toast — gravity.
- trust-decay: 1Hz tick, 800ms transition between ticks, smooth in-out,
  opacity + halo drop-shadow.
- recovery-pulse: 600ms ease-out-back (barely overshoots), opacity 0.3→1.0 +
  drop-shadow flare.
- fingerprint-candidate-reveal: 280ms staggered 60ms per candidate, left-to-
  right clip-path inset reveal — reads as system-typing.
- score-numeral-tick: 120ms per tick, transform translateY micro-shift on
  changed digit only (rest stays put because tabular-nums).
- roe-floor-cross: 240ms, scaleX on floor-line + drop-shadow flare.
- Reduced-motion fallback for ALL primitives — replace transforms with opacity
  fades, no overshoot, no stagger.

LAYOUT:
- Single-screen 12-col CSS Grid primary view. Map cols 1–8 full height under
  brand bar. Side panel cols 9–12. Event terminal sticky bottom cols 1–8.
- ?layout=ops-center URL flag triggers BroadcastChannel-synced 3-window split
  (Map / Trust + Recommender / Event Terminal). Same Zustand store across
  windows.
- Z-index discipline: map 0, deck.gl 1, side panel + terminal 10, brand bar
  20, citation hover 50, modal scrim 90, modal frame 100. Modal is the ONLY
  thing at z-100.

LOAD-BEARING BEAT (Beat 1:20 — 35 seconds that win the demo):
- Modal arrival: COP blurs filter blur(8px), scrim fades to 0.72 opacity, modal
  rises 8px from below over 420ms with --gating-primary drop-shadow glow.
  Brand-bar hairline rule activates simultaneously and STAYS ON for the rest
  of the session.
- Headline (in --text-modal, --text-primary): "Trust on B-position + B-GPS
  below ROE floor."
- Subtitle (in --text-modal, --gating-primary, arrives last after 100ms delay,
  is the largest brightest line on the projector): "Kill-chain gated below
  ROE floor." VERBATIM. Mandatory.
- Three option buttons stagger in 80ms apart: "(a) delay 60s for link
  recovery", "(b) shift to non-GPS munition", "(c) confirm B via alt channel
  before commit". Verbatim from [[Specs/URS|URS]] UR-07 and demo storyboard.

DISCIPLINES (MUST preserve):
- R14: nothing in the visual implies "AI is classifying." Trust scores read
  as DETERMINISTIC OVERLAP RATIOS, not predictions. UI is a measurement
  instrument. The word "likelihood" if used in candidate strings is operator-
  shorthand for the deterministic ratio — never call it "confidence" or
  "probability" in chrome.
- R15: ONE seat. FDC. Officer Adam. No "switch persona" toggle. No multi-
  tenant chrome. The brand bar shows "FDC · Adam" — fixed.
- R16: the trust gradient and the gating modal are the two load-bearing
  visuals. Anything competing for attention with them is wrong — cut it.
- NFR-01: nothing loads from the network at runtime. No CDNs. No external
  fonts. PMTiles bundled. LLM falls back to local Llama 3.2 3B if API
  unreachable.

DELIVERABLES:
- /src/styles/tokens.css — every token above as CSS custom properties
- /src/styles/typography.css — fluid scale + tabular-nums on .trust-readout
- /src/styles/global.css — anti-template baseline, motion primitives as
  named keyframes
- /src/components/brand/Wordmark.tsx — inline SVG, flattened paths, no font
  dependency
- /src/components/cop/Map.tsx — MapLibre + deck.gl IconLayer with the polygon
  rendering rule + halo pulse driven by trust score
- /src/components/panel/TrustPanel.tsx — selected unit, score readout (tabular
  nums), trust trace bullets, FR-04a candidate cards with citations
- /src/components/modal/KillChainGate.tsx — the load-bearing modal,
  gating-modal-arrival motion, R18 subtitle verbatim
- /src/components/terminal/EventTerminal.tsx — monospace tail-follow log
- /src/store/hamilton.ts — Zustand store + BroadcastChannel sync for ops-
  center mode
- /src/deck/index.html — the 6-slide HTML deck sharing tokens with the app
```

---

## 12. One-shot build vs. 17-hour team race — what each cuts

> The honest comparison. The retrospective is more useful if it shows what one-shot **loses** as well as what it gains.

| Axis | 17-hr team race ([[evan_dump/unc-work_frontend_requirement.md|Evan's spec]]) | Seed-doc one-shot (this plan) | Maps better to 35/30/25/10? |
|---|---|---|---|
| **Number of features** | 3 main features × ~5 mini-features each = ~18 surfaces (3D map, link icons + slide panel, AI recommender + heatmap + replay + terminal + Cmd+K + audio cues + CRT toggle + geofence + scrub-to-predict) | ~6 surfaces (COP map, trust side panel, FR-04a candidate cards, kill-chain modal, event terminal, brand chrome) | One-shot wins on **30% Military Impact** because every surface serves the FDC seat. Team build wins on **25% Creativity** (more wow-features). |
| **Map base** | 3D buildings, terrain extrusion, day/night toggle, MapTiler + deck.gl HexagonLayer | 2D MapLibre with PMTiles offline + deck.gl IconLayer for tracks. No 3D buildings. | Team build wins **wow factor**. One-shot wins **stage-projector legibility** and **Beat 1:20 visual clarity** (3D buildings would compete with the gating modal). |
| **Replay system** | Full scrub-to-predict, bookmarks, MP4 export, 1x/10x/100x speeds | Not built. The one-shot trusts the live demo plays through cleanly. | Team build wins on **35% Demo robustness** if the live demo glitches — replay is a fallback. One-shot has only the `~/demo-fallback.mp4` per `NFR-04`. **This is the one-shot's biggest exposure.** |
| **AI recommender chrome** | Streaming SSE token-by-token rationale, "why?" expansion, reject/override, command palette | LLM trace is 3 deterministic bullets per `FR-08`, no streaming UI, no override button. The trust trace is the recommendation. | One-shot wins **R14 discipline** by construction. Team build risks "AI is classifying" reading. |
| **Editorial design polish** | Mid — CRT toggle is the visual flex; otherwise shadcn defaults | High — every token, every motion primitive, every glyph is opinionated and hand-picked | One-shot wins **25% Creativity** on visual ambition. Team build wins on raw feature surface. |
| **Brand identity depth** | Implicit — name `UncWork`, no wordmark, no tagline, no editorial system | Explicit — Hamilton wordmark, tagline, editorial dark + phosphor accent, citation tier | One-shot **dominates 10% Pitch** — the deck and the demo share DNA. Team build hands the deck to whoever has time at H16. |
| **R16 wedge clarity** | Risk: trust gradient lives among 17 other surfaces and may not visually dominate | By design: trust gradient and gating modal are **the only two load-bearing visuals**; everything else recedes | One-shot wins **30% Military Impact** because the wedge is unmissable. |
| **R18 mitigation** | Modal subtitle is a ~10-min UI label change with R13 ownership constraint (NOT Kristian) | Subtitle is the **largest, brightest line on the projector** by design — section §10.5 | One-shot wins decisively on R18. |
| **Failure modes** | Replay system bug at H14 takes down the differentiator; CRT toggle on by accident makes it look gimmicky; Cmd+K without thinking through accessibility | Tokens-don't-load failure (all tokens defined in CSS custom props in one file); motion-too-aggressive failure (reduced-motion fallback covers); modal-z-index-fight (z-100 reserved exclusively) | Team build has **more surfaces, more failure modes**. One-shot has **fewer surfaces, deeper polish, lower variance**. |
| **What the team build does that one-shot can't** | Scrub-to-predict (path-forward narrative material the one-shot can't fake live); operator-on-phone PWA flex; multi-window ops-center mode (one-shot has the URL flag but no time to rehearse the multi-monitor) | — | Team build wins on **path-forward credibility**. |
| **What one-shot does that team build can't** | — | Editorial-grade visual identity that reads as *fielded product*, not *hackathon prototype*; uniformly disciplined motion language across every surface; brand DNA that bridges deck → demo without seam | One-shot wins on **judging signal**. |

### The honest verdict

A seed-doc one-shot **wins on visual identity, R16 wedge clarity, and R18 mitigation**. It **loses on feature breadth and replay-system robustness**. The retrospective question — *"would Kristian's one-shot build have changed the outcome?"* — depends entirely on **what the team that won had**. If they had a working drone or a real signal demo, no amount of editorial polish would have closed the gap. If they had a typical hackathon-grade COP demo with shadcn defaults, **Hamilton wins on 25% Creativity + 10% Pitch alone**, and is competitive on 30% Military Impact via the wedge clarity.

**The one-shot would not have changed an outcome decided on hardware. It would have changed an outcome decided on judging signal.**

---

## 13. Risks specific to this design direction

> Maps to [[Risk Register]] where applicable. Two new risks (R-Hamilton-musical, R-aesthetic-over-substance) are scoped to this design direction and would belong in the register if this plan were adopted.

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R18 (existing) | **Judge dismissal** — judge confuses Hamilton with Lattice's link-health indicator before seeing Beat 1:20 | Medium | High | The R18 subtitle "Kill-chain gated below ROE floor" is the largest, brightest line on the projector (§10.5). Brand-bar hairline rule activates at the modal and stays on, providing a persistent visual stamp of *Hamilton was on its feet.* The candidate-reveal staggered animation at 1:15 visually establishes determinism — the system *types out* the candidates, not predicts them. |
| R19 (existing) | **Vendor-neutral erosion** — Hamilton's editorial dark + phosphor reads as Palantir-adjacent or Anduril-adjacent | Low-Medium | Medium | The typographic-only wordmark (no glyph) breaks the defense-tech logo pattern (every other vendor has a glyph). Editorial register (Foreign-Affairs-document) is unmistakably *not* Palantir's data-mosaic register. The phosphor is on the gradient only — Lattice doesn't use phosphor anywhere. |
| **R-Hamilton-musical** | Judges hear "Hamilton" and the musical reference triggers — the brand reads as a wordplay rather than as a defense product | Low-Medium | Medium | The tagline ("The commander's aide-de-camp for the comms channel") immediately resolves the reference to the *Revolutionary War aide-de-camp role*, not the musical. The typographic register (zero whimsy, all engraving) reinforces it. If a judge raises the musical: "Same Hamilton — but the one who actually sat next to Washington at Morristown and Yorktown. The aide-de-camp's job was to judge how reliable the comms coming back from the field were before the commander acted. That's exactly what this layer does." Move on. |
| **R-aesthetic-over-substance** | Hamilton looks so polished it reads as *marketing demo*, not *working system* — judges suspect the engine isn't real | Low-Medium | Medium | The event terminal at the bottom of the COP shows raw event log lines with monospace timestamps and source IDs (`[18:42:14] unit_b · temporal_anomaly · cadence 1.0s → 6.1s`). The FR-04a citation hovers cite real outlets (Bronk RUSI 2024, JAPCC 2023, *WaPo* 2024). The trust score numeral updates ≥1Hz visibly — *measurement instrument behavior*, not marketing-render behavior. Judges who probe will see the engine. **The design is restrained enough that the chrome doesn't outrun the substance.** |
| **R-phosphor-overuse** | The model violates the discipline and uses phosphor decoratively (highlight states, hover affordances, button accents) — collapsing the whole system into CRT-nostalgia | Medium | High | Single source of truth for phosphor: only `--trust-nominal` (gradient endpoint) and `--gating-secondary` (focus state on modal options). **Any other use of `oklch(85% 0.18 145)` is a design bug.** A linter rule (or, in one-shot mode, an explicit `// PHOSPHOR USE — verify: gradient OR gating focus only` comment requirement) would enforce this. |
| **R-modal-feels-like-toast** | The 1:20 modal arrives too fast or with too much motion — reads as a notification, not as the system taking the floor | Low (with the spec) | Critical | `gating-modal-arrival` is **deliberately slower** than a notification (420ms vs ~200ms). The blur on the COP is **deliberately heavier** than a typical scrim (8px). The subtitle arrives **last**, not first. These are not stylistic preferences — they are R18 mitigations. |

### Where this plan strengthens existing risks

- **R14 (deterministic boundary):** the visual language reads as a measurement instrument by construction. The trust score is rendered in tabular monospace, the gradient is perceptually uniform (OKLCH), and the candidate reveal animates as *system-typing* (left-to-right clip-path), not *system-predicting*. A judge probing R14 will see deterministic chrome.
- **R15 (FDC anchor):** the brand bar shows "FDC · Adam" as fixed chrome. There is no persona switcher. There is no "demo for AEGIS / MSS / UAF" mode. The seat is the seat.
- **R16 (gradient + gating wedge):** the entire visual system is organized around these two edges. Any element that competes with them is, by spec, a design bug.

---

## 14. Cross-references

- [[Capability Selection]] — v5.1.2 thesis the brand is in service of
- [[Specs/URS]] — UR-01..09 the chrome must satisfy
- [[Specs/FRS]] — FR-01..08 + FR-04a the components implement
- [[Specs/System Design]] — three-discipline architecture the design respects
- [[Tech Stack]] — locked stack the one-shot generator targets
- [[Risk Register]] — R13..R20, plus R-Hamilton-musical / R-aesthetic-over-substance / R-phosphor-overuse / R-modal-feels-like-toast
- [[../05 - Build Plan/Demo and Pitch]] — Fire & Maneuver beat-by-beat that §10 expands into pixel-level treatment
- [[../evan_dump/unc-work_frontend_requirement.md]] — the team-race spec this one-shot retrospective compares against
- [[~/.claude/rules/web/design-quality.md]] — anti-template discipline this plan honors
- [[~/.claude/rules/web/coding-style.md]] — animation-only properties + CSS custom property conventions
- [[~/.claude/rules/web/performance.md]] — bundle and font-loading budgets
