# Feature Spec — Planning Resurface Shelf Snooze-Expiry (Orbit)

- Project root: `/Users/rajeshk/.openclaw/projects/orbit`
- Spec path: `spec/feature-planning-resurface-shelf-2026-03-28.md`
- Source context: `spec/planning-resurface-shelf-handoff-2026-03-28.md` + Rajesh/Sophie clarification thread (2026-03-28)
- Status: Approved-for-implementation scope (Sprint slice)

## Intent / Goal

Ensure hidden+snoozed cards reliably reappear as **resurfaced cardlets** when snooze expires, with context-aware visibility and minimal scope complexity.

This sprint delivers a narrow, reliable resurfacing behavior that is easy to implement and verify, without adding broader canvas refresh mechanics.

## In Scope

1. **Eligibility trigger (single trigger):** snooze expiry.
2. **Global evaluation set:** all hidden+snoozed cards are evaluated by backend checks.
3. **Context-aware rendering:** resurfaced cardlets are shown only in the card’s own context tray.
4. **Fixed refresh triggers for evaluation:**
   - app launch,
   - context entry,
   - passive hourly background check while app/view is active.
5. **Uniqueness rule:** a resurfaced card appears at most once as a cardlet in the resurfacing tray.
6. **Manual unhide interaction rule:** if a card is manually brought back to canvas before snooze expiry handling completes, snooze is cleared/invalidated (no lingering snooze relevance).

## Out of Scope (explicit non-goals)

1. Manual refresh UX/control for canvas or resurfacing.
2. Broad/stale/smooth settings refresh orchestration beyond snooze-expiry evaluation.
3. Priority/ranking semantics within resurfaced cardlets.
4. Cross-context resurfacing display (showing cards outside owning context).
5. Additional cooldown logic after manual unhide.

## Canonical Behavior

### 1) Trigger and evaluation model

- Snooze expiry is the only business trigger for resurfacing eligibility.
- System may choose the most efficient implementation approach, but behavior must guarantee that eligible cards become visible as resurfaced cardlets once.
- Evaluation runs on each defined refresh trigger (app launch, context entry, hourly).

### 2) Global mark, local show

- Backend may mark cards globally as resurfacing-eligible.
- UI tray must remain context-aware:
  - In Context A, show only resurfaced cardlets belonging to Context A.
  - Cards belonging to Context B remain pending for display until Context B is active.

### 3) De-duplication

- A card can appear only once in resurfacing tray representation.
- No duplicate cardlets for the same underlying card in a context tray.

### 4) Ordering semantics

- Relative ordering inside resurfaced set is non-semantic for this sprint.
- Implementation may use stable/default ordering, but acceptance must not depend on rank.

### 5) Manual unhide + snooze interaction

- If user manually unhides (brings back to canvas) a previously hidden+snoozed card, snooze is no longer relevant and must be cleared/invalidated.
- No additional cooldown requirements are introduced.

### 6) Refresh timing

- Immediate real-time at exact expiry timestamp is **not required**.
- Visibility by next eligible refresh cycle is acceptable, bounded by defined triggers.

## Defaults / Operational Assumptions

1. Hourly interval is fixed at 60 minutes in this sprint (not user-configurable).
2. Hourly check in this scope evaluates only snooze-expiry resurfacing eligibility; it must not be treated as a general-purpose state refresh feature.
3. Deleted-while-hidden edge flow is treated as non-practical for this sprint and not explicitly productized as separate UI state.

## Edge Cases / Exceptions

1. **Expired in non-active context:**
   - Card expires while user is in different context.
   - Result: backend eligibility may be set, but tray display waits until owning context is opened.

2. **Multiple cards expiring between checks:**
   - All eligible cards should be represented once in their respective context trays by next relevant refresh cycle.

3. **Manual unhide before resurfacing display:**
   - Card reintroduced to canvas manually.
   - Result: snooze invalidated; card should not continue being treated as snoozed-hidden for resurfacing logic.

## Acceptance Criteria (testable)

1. **Single-trigger correctness**
   - Given a hidden+snoozed card, when snooze has not expired, it does not appear in resurfacing tray.
   - Given snooze has expired, it becomes resurfacing-eligible and appears by next trigger cycle.

2. **Trigger coverage**
   - Snooze-expiry evaluation runs on:
     - app launch,
     - context entry,
     - hourly background check.

3. **Global evaluation / local display**
   - System evaluates all hidden+snoozed cards globally.
   - Current context tray shows only cards belonging to that context.

4. **Uniqueness**
   - Any resurfaced card appears at most once as a cardlet in tray.

5. **Manual unhide invalidates snooze**
   - If user manually unhides card, snooze state is cleared/invalidated and does not continue to govern resurfacing for that card instance.

6. **No ordering dependency**
   - Behavior correctness does not depend on internal order of resurfaced cardlets.

7. **Scope guard**
   - No manual refresh control is added in this sprint.
   - No broader refresh side effects are required beyond snooze-expiry evaluation.

## Implementation Constraints / Notes for Codex

- Keep implementation minimal and constrained to this sprint slice.
- Prefer deterministic state transitions for hidden/snoozed/resurfaced visibility.
- Do not introduce adjacent feature work (manual refresh UX, broader stale/smooth refresh orchestration) in this change.

## Reliability Pass Summary

- Ambiguity removed for trigger set and refresh timing.
- Scope locked to snooze-expiry resurfacing only.
- Context-local visibility and global backend marking explicitly separated.
- Duplicate/ordering behavior clarified to avoid overengineering.
- Manual unhide/snooze conflict resolved with explicit precedence.
