# Feature Spec — Stale Visibility in Normal View (Patch / Slice 3)

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Patch spec
- **Date:** 2026-03-18
- **Status:** Approved draft
- **Amends:**
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-touch-active-stale-foundation-2026-03-18.md`
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-touch-control-right-edge-placement-patch-2026-03-18.md`

## Intent
Add ambient stale visibility in the normal Orbit canvas so stale cards are easy to notice and act on, without requiring lens mode.

## In scope
- Always-on stale emphasis in normal view.
- Stale emphasis driven only by existing derivation truth (active/stale from Slice 2).
- Uniform stale emphasis treatment across stale center and stale periphery cards.
- Interaction persistence rules (hover/selection/drag do not suppress stale emphasis).

## Out of scope
- Stale lens mode/filter behavior (Slice 4).
- Keyboard shortcuts.
- Precise visual token prescription (e.g., exact border/tint/badge implementation).

## User-visible behavior

### Normal-view stale emphasis
- Any card classified as **stale** is visually emphasized in normal canvas view.
- Emphasis is strong enough to draw attention, while remaining Orbit-calm (not noisy/alarming).
- Emphasis is **always on** in this slice (no user toggle).
- Emphasis is static (no pulsing, flashing, or animated attention effects).
- Emphasis must be visibly distinguishable from active cards at a glance on a mixed canvas.

### Uniformity
- Stale center and stale periphery cards use the same stale emphasis treatment level.
- Active cards remain in normal Orbit appearance.

### Interaction persistence
- Stale emphasis remains visible during hover, selection, and drag.
- Stale emphasis changes only when card stale/active state changes.

## Defaults and assumptions
- Stale/active classification source remains the Slice 2 derivation engine.
- Hidden cards remain excluded from stale/active semantics and therefore have no stale emphasis while hidden.
- This slice does not alter touch semantics, thresholds, or control placement.

## Edge cases
- If a card flips stale→active after touch/recompute, stale emphasis is removed immediately.
- If a card flips active→stale after recompute trigger, stale emphasis appears immediately.
- Center↔periphery moves that keep card stale preserve stale emphasis continuously.
- Drawer open/close and other card-local UI states do not suppress stale emphasis.

## Acceptance criteria
1. In normal view, every stale card is visually emphasized.
2. In normal view, no active card receives stale emphasis.
3. Stale emphasis is always-on with no user toggle in this slice.
4. Stale emphasis treatment level is the same for stale center and stale periphery cards.
5. Hover/selection/drag do not hide stale emphasis.
6. When stale/active state changes, stale emphasis updates immediately to match new state.
7. Hidden cards do not show stale emphasis while hidden.

## Implementation constraints (minimal)
- Bind stale emphasis rendering to stale boolean produced by derivation engine.
- Do not create a second stale-truth path in UI.
- Preserve Orbit-calm visual style while ensuring stale remains attention-visible.e a second stale-truth path in UI.
- Preserve Orbit-calm visual style while ensuring stale remains attention-visible.