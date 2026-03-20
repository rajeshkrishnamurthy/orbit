# Feature Spec — Stale Lens Mode (Slice 4)

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Feature spec
- **Date:** 2026-03-20
- **Status:** Approved draft
- **Amends:**
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-touch-active-stale-foundation-2026-03-18.md`
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-stale-normal-view-emphasis-patch-2026-03-18.md`

## Intent
Provide a focused stale-review mode by showing only stale cards, so users can quickly act on stale priorities without canvas-wide distraction.

## In scope
- Stale lens toggle mode.
- Lens entry behavior: show stale cards only.
- Lens session behavior for stale→active flips.
- Lens exit behavior and session-scoped persistence.
- Preserve user-owned card positions.
- Allow normal card actions while lens is active.

## Out of scope
- Any change to Touch semantics or active/stale derivation thresholds.
- Any automatic re-layout/repositioning in lens mode.
- Auto-refresh behavior beyond explicit lens toggle off/on.
- Any persistence of lens mode across app restarts.

## User-visible behavior

### Entry (lens ON)
- Lens mode is entered via explicit user toggle.
- On entry, canvas displays only cards currently classified as stale.
- Non-stale cards are hidden from view while lens is active.

### During lens session
- Normal card interactions remain available (drag, touch, complete, hide, etc.).
- Card positions are preserved exactly; lens does not auto-rearrange visible cards.
- If a visible card transitions stale→active during lens session, it remains visible until lens is exited and re-entered.
- If a non-visible card transitions active→stale during lens session, it does not auto-appear until lens is exited and re-entered.

### Exit / refresh model
- Exiting lens returns normal canvas view behavior.
- Re-entering lens re-evaluates stale truth and applies stale-only filtering again.
- There is no separate in-lens manual refresh action in this slice.

## Persistence
- Lens ON/OFF state persists only for the current app session.
- On app restart, lens defaults to OFF.

## Defaults and assumptions
- Stale truth source remains the derivation engine from Slice 1/2 (as patched).
- Slice 3 normal-view stale emphasis remains unchanged outside lens mode.
- Hidden cards remain excluded from active/stale semantics while hidden.

## Edge cases
- Entering lens when zero stale cards exist shows an empty lens canvas state (no non-stale fallback injection).
- Card hidden while in lens disappears from visible set (hidden exclusion semantics).
- Card completed/cancelled while in lens exits canvas according to existing completion/cancel behavior.
- App restart while lens ON starts with lens OFF next launch.

## Acceptance criteria
1. Toggling lens ON shows only cards that are stale at lens-entry evaluation time.
2. Toggling lens OFF restores normal canvas view.
3. Lens mode does not auto-reposition cards.
4. Normal card actions remain usable while lens is ON.
5. A card that becomes active during lens session remains visible until lens OFF→ON refresh cycle.
6. A card that becomes stale during lens session does not auto-appear until lens OFF→ON refresh cycle.
7. Lens state is session-scoped and resets to OFF after app restart.
8. No dedicated in-lens refresh control is added in this slice.

## Implementation constraints
- Lens filtering must consume derivation truth from the existing active/stale engine; do not create a second stale classification path.
- Maintain a lens-entry snapshot/filter set for current lens session to enforce stable in-session visibility semantics.
- Preserve user-owned coordinates for all cards; filtering affects visibility only, not layout data.
