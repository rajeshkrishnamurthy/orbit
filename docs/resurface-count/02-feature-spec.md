# Feature Spec — Resurface Count

## 1) Spec summary
Expose dual counts in the existing Chrome Hidden control so users can see both:
- `hidden_total` (all hidden cards, including resurfaced)
- `resurfaced_count` (hidden subset currently resurfaced/ready)

This spec preserves canonical behavior from `docs/00-current-state.md`:
- resurfaced cards remain represented in Hidden tray
- no system auto-placement onto canvas

## 2) Scope / non-scope

### In scope
1. Hidden control token format with both counts always visible.
2. Hover tooltip content for count semantics.
3. Deterministic count derivation and invariants.
4. Recompute trigger list for foreground and state transitions.
5. Acceptance criteria and transition-focused verification requirements.

### Out of scope
1. Any change to resurfacing semantics or tray-first model.
2. New resurfaced tab/shelf/chrome destination.
3. Hidden tray redesign.
4. Background timer-based due-time recomputation while app remains continuously foregrounded.

## 3) Inputs and invariants

### Inputs
- Hidden card set state (including hidden+snoozed, hidden+resurfaced-ready).
- Foreground refresh trigger.
- Card transitions that change hidden/resurfaced membership.

### Derived fields
- `hidden_total`: count of all hidden cards (includes resurfaced-ready hidden cards).
- `resurfaced_count`: count of hidden cards that are resurfaced-ready.

### Invariants
1. `0 <= resurfaced_count <= hidden_total`
2. `hidden_total` includes resurfaced cards by definition.
3. Count derivation is deterministic from persisted card state.

## 4) Functional requirements (deterministic)

### FR-1: Hidden control token
Render Hidden control label as:
- `Hidden {hidden_total} · {resurfaced_count}↑`

Examples:
- `Hidden 12 · 3↑`
- `Hidden 12 · 0↑`
- `Hidden 0 · 0↑`

Rule: both numbers are always visible, including zero states.

### FR-2: Tooltip semantics
On hover of the Hidden control, render exact tooltip string:
- `Hidden {hidden_total}, resurfaced {resurfaced_count}`

### FR-3: Recompute triggers
Orbit must recompute and re-render both counts on each of the following events:
1. App foreground-resume refresh cycle.
2. Card becomes hidden (action that moves card into Hidden).
3. Hidden card is restored/unhidden back to canvas.
4. Hidden/resurfaced card is dragged/moved to canvas.
5. Hidden card state changes causing resurfaced membership change during an executed refresh path (e.g., snooze due evaluation during foreground refresh).

### FR-4: Due-time transition timing
If a snoozed hidden card becomes due while app remains continuously foregrounded, immediate background-timer update is not required.
Counts must update on the next qualifying recompute trigger from FR-3.

### FR-5: No behavior drift vs canonical baseline
Implementation must not:
1. Change tray-first resurfacing representation.
2. Auto-place resurfaced cards on canvas.
3. Redefine hidden vs resurfaced set semantics.

## 5) UX / API / data behavior contract

### UX contract
- Hidden control remains a single control; no additional resurfaced chrome control is introduced.
- Token format is fixed per FR-1.
- Tooltip appears on hover only.
- Non-hover fallback UI is intentionally not added for this initiative.

### Data/contract notes
- Existing card state is source of truth; no new domain semantic is introduced.
- The chrome view-model may add/consume explicit `hidden_total` and `resurfaced_count` fields.

## 6) Edge cases and failure handling
1. **Empty state:** no hidden cards => `Hidden 0 · 0↑`; tooltip `Hidden 0, resurfaced 0`.
2. **All hidden are resurfaced:** token `Hidden N · N↑` must render and satisfy invariants.
3. **Resurfaced zero, hidden non-zero:** `Hidden N · 0↑` must still render (no conditional suppression).
4. **Rapid transitions:** sequential hide/unhide/move events must not violate invariants at any observed render.
5. **Refresh lag tolerance:** when due-time changes occur without a qualifying trigger, displayed counts may remain stale until next FR-3 recompute; once recompute runs, values must converge exactly.

## 7) Acceptance criteria (testable and observable)

### AC-1 Token rendering
Given any application state, Hidden control displays `Hidden {hidden_total} · {resurfaced_count}↑` with both values present.

### AC-2 Zero-state stability
Given `hidden_total=0` and `resurfaced_count=0`, token renders `Hidden 0 · 0↑`.

### AC-3 Invariant enforcement
Across all tested transitions, `0 <= resurfaced_count <= hidden_total` always holds.

### AC-4 Tooltip exactness
On hover, tooltip text equals exactly: `Hidden {hidden_total}, resurfaced {resurfaced_count}`.

### AC-5 Foreground recompute
After a foreground-resume event, displayed counts match freshly recomputed hidden/resurfaced sets.

### AC-6 Membership transition recompute
After hide, unhide/restore, and hidden-to-canvas move transitions, displayed counts update to correct post-transition values without requiring app restart.

### AC-7 Due transition policy
If due-time passes while app stays foregrounded, no immediate timer-driven count update is required; next qualifying recompute trigger updates counts correctly.

### AC-8 Canonical behavior preservation
No acceptance test may pass if resurfaced cards auto-appear on canvas or if tray-first behavior is altered.

## 8) Dependencies and sequencing notes
1. Reuse existing hidden/resurfaced derivation logic and refresh infrastructure where possible.
2. Wire chrome Hidden control rendering to unified count view-model fields.
3. Add/adjust tests in this order:
   - count derivation + invariants
   - transition recompute paths
   - UI token + tooltip assertions

## 9) Backward compatibility / migration notes
1. Existing Hidden count behavior remains semantically compatible because `hidden_total` continues to include resurfaced cards.
2. Change is additive in presentation (new resurfaced subset visibility).
3. No data migration required.

## 10) Explicit out-of-scope follow-ups
1. Revisit alternate token grammar if chrome density/readability issues arise.
2. Consider keyboard-focus tooltip parity and accessibility enhancements in a future initiative.
3. Consider real-time timer-based due transition recompute if product requires instant due visibility while continuously foregrounded.

## 11) Open questions
None.

## Assumptions register
1. `↑` glyph is acceptable in current UI font stack and does not require localization override. *(low-impact)*
2. Existing Hidden control layout can fit the token in supported desktop widths without clipping in default chrome density. *(low-impact)*
3. Tooltip framework supports exact single-line string rendering without forced punctuation/case transforms. *(low-impact)*
