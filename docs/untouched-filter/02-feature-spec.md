# Untouched Filter — Feature Specification

## 1) Spec summary
Add an `Untouched` filter pill adjacent to `Stale` that shows cards in the active context that have **not** been effectively touched on the current local day.

This initiative improves filter discovery and removes manual canvas scanning for untouched-today cards.

## 2) Scope / non-scope
### In scope
- Add `Untouched` filter pill in chrome near `Stale`.
- Define deterministic untouched predicate using existing touch semantics.
- Apply filter only to visible (non-hidden) cards in active context.
- Define deterministic interaction rules with `Stale` and existing filter/lens controls.
- Define real-time behavior after effective touch with auto-open Log Activity flow.
- Define day rollover refresh behavior for this filter.

### Out of scope
- Any stale-threshold or stale-derivation changes.
- Touch logging UX redesign.
- Cross-context untouched aggregation.
- Hidden-tray behavior changes.
- Analytics/history views.

## 3) Inputs and invariants
Source invariants from `docs/00-current-state.md`:
1. Touch is explicit user action only.
2. One effective touch per card per local day.
3. Effective touch auto-opens Log Activity pop-up for that card.
4. Re-touch on same local day is idempotent and does not auto-open logging.
5. Touch commit is independent of log save/cancel.
6. Hidden cards are excluded from active/stale classification while hidden.
7. Active context and visible-card boundaries are deterministic.

Additional invariant for this spec:
- `Stale` is treated as a subset view under untouched-today semantics; to avoid control ambiguity, `Stale` and `Untouched` are mutually exclusive in UI state.

## 4) Functional requirements (deterministic)
### FR-1: Untouched predicate
For a card `c` in active context:
- `is_untouched_today(c) = visible(c) && effective_touch_local_day(c) != current_local_day`
- Where `effective_touch_local_day(c)` is null/absent if never effectively touched.
- Cards never effectively touched are included.

### FR-2: Filter result domain
`Untouched` evaluates only cards that are:
- In current active context.
- Visible (non-hidden).

No cross-context or hidden-card inclusion is allowed.

### FR-3: Control placement and token
- Add pill labeled `Untouched` adjacent to existing `Stale` control cluster.

### FR-4: Composition and exclusivity
- `Stale` and `Untouched` are mutually exclusive controls.
- Selecting one while the other is active deactivates the other in the same interaction step.
- Composition with other non-conflicting filters/lenses remains existing AND behavior unless already defined otherwise by canonical contracts.

### FR-5: Behavior on effective touch while Untouched is active
Given an untouched-filtered list and user performs an effective touch on card `c`:
1. Touch is committed immediately (existing behavior).
2. Log Activity pop-up auto-opens (existing behavior).
3. Card `c` remains visible while its log pop-up interaction is active.
4. On pop-up close/dismiss/save (any terminal close state), untouched filter is re-evaluated and `c` is removed from results.
5. If pop-up is retargeted from `c` to another card per existing single-pop-up behavior, `c` is treated as no longer in active logging interaction and is re-evaluated immediately.

### FR-6: Log cancel semantics
- Canceling/dismissing Log Activity does **not** roll back touch.
- Therefore, cancel still causes removal from Untouched results after pop-up close.

### FR-7: Day rollover refresh behavior
- Untouched membership is **not** auto-refreshed at local midnight.
- Untouched membership is re-evaluated only on explicit user refresh/navigation events.

Examples of explicit events for this spec:
- Manual refresh action (if available in current surface).
- Navigation that causes list recomputation (e.g., context switch away/back, filter toggle off/on, or app restart).

Foreground/focus resume alone does not imply untouched membership recomputation under this initiative unless paired with explicit refresh/navigation.

## 5) UX/API/data behavior contract
### UX states
- Default: `Untouched` inactive, existing list behavior unchanged.
- Active: only untouched-today cards in active visible set are shown.
- Empty result: show existing empty-state treatment for filters (no new copy mandated in this initiative).

### Interaction contract
- `Stale` and `Untouched` cannot be concurrently active.
- Touch action from Untouched view preserves immediate access to Log Activity UI before card exits view.

### Data/derivation contract
- Reuse existing touch/effective-day derivation; no schema or logging contract changes required by spec.

## 6) Edge cases and failure handling
1. Never-touched visible cards always match Untouched.
2. Re-touch same day (idempotent touch) does not reopen log; card already non-member, no transition expected.
3. Hidden transition while Untouched active removes card from result domain by visibility rule.
4. Context switch recomputes membership only for the newly active context.
5. If log pop-up fails to save content, touch remains committed and card removal still occurs after pop-up close.
6. Midnight passes while app remains open: membership remains as previously computed until explicit refresh/navigation event.

## 7) Acceptance criteria (testable and observable)
1. Activating `Untouched` shows only visible cards in active context with no effective touch on current local day.
2. Cards touched earlier today are excluded from Untouched results.
3. Cards never touched are included in Untouched results.
4. Selecting `Stale` while `Untouched` is active deactivates `Untouched` in same interaction; reverse also true.
5. In Untouched view, effective touch on a visible card opens Log Activity and card remains visible during pop-up interaction.
6. Closing/dismissing/saving log pop-up after effective touch removes the card from Untouched results.
7. Canceling log entry still removes card (touch persists).
8. Hidden cards are never returned by Untouched filter.
9. Crossing local midnight does not change Untouched results until explicit refresh/navigation event.
10. After explicit refresh/navigation post-midnight, previously touched-today cards can re-enter Untouched if they have no effective touch in the new local day.

## 8) Dependencies and sequencing notes
1. Depends on existing touch semantics and single-pop-up Log Activity behavior in canonical baseline.
2. Implement control exclusivity with existing filter-state architecture (same class of behavior as other mutually exclusive pills).
3. Ensure recomputation hooks for explicit refresh/navigation are wired for Untouched state.

## 9) Backward compatibility / migration notes
- No data migration required.
- No change to stored touch/log semantics.
- Existing stale behavior unchanged except UI-state exclusivity interaction with new Untouched pill.

## 10) Explicit out-of-scope follow-ups
1. Pill count badge and tooltip enhancement for Untouched.
2. Broader filter architecture unification across future filter families.
3. Auto midnight refresh optimization.

## 11) Open questions
None blocking for this spec revision.

## Assumptions register
1. Existing empty-state component/copy for filtered zero results is sufficient (`low-impact`).
2. Label token remains exactly `Untouched` (`low-impact`).
3. Explicit refresh/navigation events listed in FR-7 map to currently implemented recompute paths without introducing new platform-specific refresh affordances (`high-impact`, treated as implementation validation item).
