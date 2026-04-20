# Chrome Context — 03 Feature Spec Patch (Tooltip)

Status: approved-patch-ready  
Initiative slug: `chrome-context`  
Patch scope: delta-only on top of `docs/chrome-context/02-feature-spec.md`

---

## 1) Patch summary

Add hover tooltip behavior for context pills in the center-top chrome strip.

Tooltip exact format:
- `Total: <count_total>; Stale : <count_stale>`

Value mapping:
- `count_total = visible_count` for the hovered context
- `count_stale = stale_count` for the hovered context

No other behavior changes are introduced by this patch.

---

## 2) Scope / non-scope

### In scope
1. Tooltip visibility on pointer hover over context pills.
2. Exact tooltip string format.
3. Tooltip value mapping to existing per-context counts.

### Out of scope
1. Any changes to ordering, capacity, overflow behavior.
2. Any changes to context switching semantics.
3. Any layout/token/truncation adjustments.
4. Any backend/data model changes.
5. Keyboard interaction changes.

---

## 3) Deterministic requirements

1. On pointer hover over a context pill, tooltip is shown.
2. Tooltip text uses exact format:
   - `Total: <count_total>; Stale : <count_stale>`
3. `count_total` equals that pill’s `visible_count`.
4. `count_stale` equals that pill’s `stale_count`.
5. Tooltip must not mutate navigation, card state, placement, or counts.

---

## 4) Acceptance criteria

1. Hovering any context pill displays tooltip.
2. Tooltip text matches exact token pattern including punctuation/spaces:
   - `Total: <count_total>; Stale : <count_stale>`
3. Displayed numbers match the hovered context’s rendered `visible/stale` values.
4. Moving hover across pills updates tooltip values to the newly hovered context.
5. No click/navigation side effects occur from hover alone.

---

## 5) Dependencies and compatibility

1. Reuses existing context-strip rendering and count derivation from `02-feature-spec`.
2. No migration required.
3. Backward compatible additive UI enhancement.

---

## 6) Open questions

None for this patch scope.
