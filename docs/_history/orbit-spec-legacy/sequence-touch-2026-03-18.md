# Feature Sequencing: Touch / Active / Stale (Orbit)

## Governance metadata
- state: superseded
- superseded_by:
  - `docs/_history/orbit-spec-legacy/feature-touch-active-stale-foundation-2026-03-18.md`
  - `docs/00-current-state.md`
- supersession_reason: sequencing guidance consumed by subsequent feature specs and consolidated baseline.

**Document date:** 2026-03-18  
**For:** Sophie (spec hardening)  
**From:** Pam (planning)  
**Source:** planning-touched-2026-03-18.md, Orbit PRODUCT.md

---

## Feature area being sliced

Add explicit **Touch** behavior to Orbit cards, derive **active/stale** from touch history + spatial placement, and provide stale visibility in normal view plus stale-only lens.

---

## Assumed planning starting point

Already agreed:
- Touch is explicit user intent (no implicit freshness)
- One touch/day/card max effect
- 7-day touch count used in evaluation
- Active/stale thresholds differ by center vs periphery
- Hidden excluded from stale/active semantics
- Touch control on right edge aligned with drawer + slipping
- Recompute triggers for MVP:
  1) app launch
  2) stale view requested
  3) any card touched
  4) card moved center ↔ periphery

---

## Recommended slices / increments

## Slice 1 — Touch primitive + storage (first shippable increment)

Scope:
- Add touch control interaction (single tap)
- Persist `lastTouchedDay`
- Enforce one-touch-per-day semantics
- Support touch undo (brief toast window)
- Optional keyboard touch shortcut (`T` on selected card)

Boundary rationale:
- Establishes the core product behavior with minimal coupling
- Immediately usable even before stale visuals/lens are added

Value delivered:
- User can mark real-world attention without editing cards

---

## Slice 2 — Active/stale derivation engine (logic-only)

Scope:
- Implement active/stale calculation rules:
  - Center active if touched in last 2 days OR touched 3+ times in 7 days
  - Periphery active if touched in last 4 days OR touched 2+ times in 7 days
  - Else stale
  - Hidden excluded
- Wire calculation to agreed triggers

Boundary rationale:
- Separates semantic correctness from visual design
- Lets team validate logic independently before UI treatment tuning

Value delivered:
- Deterministic active/stale truth available to UI/lens features

---

## Slice 3 — Normal-view stale visibility

Scope:
- Distinct visual appearance for stale cards in normal canvas view
- Apply uniformly to stale center + stale periphery
- Keep active cards at normal Orbit appearance

Boundary rationale:
- Makes stale actionable in everyday workflow
- Keeps separation of control (touch) and observation (stale state)

Value delivered:
- Ambient awareness of stale priorities without entering a special mode

---

## Slice 4 — Stale lens mode

Scope:
- Add stale-only lens/filter mode
- Emphasize stale cards and de-emphasize non-stale
- Lens persistence behavior: per-session

Boundary rationale:
- Adds focused review workflow after baseline stale visibility exists
- Avoids building lens before stale semantics are trusted in normal view

Value delivered:
- Rapid stale review/cleanup pass across canvas

---

## Recommended order

1. Slice 1 (Touch primitive)
2. Slice 2 (Derivation engine)
3. Slice 3 (Normal-view stale visibility)
4. Slice 4 (Stale lens)

Why this order:
- Build semantic primitives first, then visibility layers
- Avoid UI-first implementation where stale visuals exist without stable logic

---

## What can run in parallel

After Slice 1 starts:
- UI exploration for Slice 3 visuals can run in parallel with Slice 2 logic implementation
- Lens UX framing can be drafted in parallel, but should not finalize before Slice 2 outputs are verified

---

## What must wait

- Slice 3 and Slice 4 must wait for Slice 2 semantics to be settled (or at least stable enough) to avoid rework

---

## Key dependencies / gates

- Gate A: Touch data persistence and day-boundary handling behaves correctly
- Gate B: Active/stale derivation passes test scenarios (center/periphery transitions, hidden exclusion)
- Gate C: Visual stale treatment remains Orbit-calm (visible but not noisy)

---

## Strongest first shippable increment

**Slice 1** is first shippable increment.

It gives immediate user value and validates whether explicit touch behavior is adopted in daily use before investing in stale surface/lens complexity.

---

## Main sequencing risks

1. Over-coupling visual stale treatment with unfinished derivation rules
2. UI clutter on right edge if touch indicator competes with existing controls
3. Edge-case drift if recompute triggers are not implemented consistently

---

## Recommended downstream next step

Sophie should now produce a spec-ready document for **Slice 1 + Slice 2 together** as the immediate build target, with Slice 3/4 specified but staged.
