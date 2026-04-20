# Feature Spec — Hidden Item Unhide: Immediate Popdown Sync (Patch)

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Patch spec
- **Date:** 2026-03-17
- **Status:** Approved draft

## Intent
When a user drags a hidden item from the Hidden popdown and drops it on a valid target, the Hidden popdown must update immediately so the dropped item is removed without waiting for backend acknowledgement.

## In scope
- Keep Hidden popdown open during multi-item unhide interactions.
- Remove item from Hidden popdown immediately on valid drop (optimistic UI).
- Persist unhide action after drop.
- On persistence failure, rollback the failed item into Hidden popdown and show an error toast.

## Out of scope
- Redesign of hidden-control UI or popdown layout.
- New bulk unhide controls or alternate unhide workflows.
- Any broad rework of hidden-item ordering/filtering beyond rollback consistency.

## User-visible behavior

### Success path
1. User opens Hidden popdown.
2. User drags hidden item to a valid drop target.
3. On drop completion, item is removed from Hidden popdown immediately (optimistic update).
4. Hidden popdown remains open.
5. Persistence succeeds; item remains unhidden.

### Failure path
1. User drops hidden item on a valid target and item is optimistically removed.
2. Persisting the unhide action fails.
3. The failed item is restored to Hidden popdown (rollback, exactly once).
4. Show error toast: `Couldn’t unhide item. Please try again.`

## Defaults and assumptions
- Immediate removal is triggered by valid drop completion, not by backend ack.
- Invalid drop targets do not trigger optimistic removal.
- Rollback applies only to the failed item and is idempotent by item identity.
- Hidden popdown does not auto-close after success or failure.

## Edge cases
- Rapid sequential unhides: each item resolves independently.
- Mixed outcomes: one failed unhide does not affect successful unhides.
- Late failure responses: rollback still restores the correct item and list consistency.
- Duplicate interaction attempts on same item: no duplicate hidden entries on rollback.

## Acceptance criteria
1. Given Hidden popdown is open, when a hidden item is dropped on a valid target, then it disappears from the popdown immediately before persistence ack.
2. Hidden popdown remains open after unhide attempts unless user closes it manually.
3. On persistence success, the dropped item does not reappear in Hidden popdown.
4. On persistence failure, the item reappears in Hidden popdown and error toast is shown.
5. On invalid drop, item remains in Hidden popdown and no unhide persistence is committed.
6. Rollback never creates duplicate hidden-item entries.
7. During multi-item operations, each item’s success/failure is handled independently and reflected correctly.

## Implementation constraints (minimal)
- Use optimistic state transition on valid drop.
- Track per-item pending unhide operation (or equivalent) to support deterministic rollback.
- Keep rollback idempotent and identity-based.

## Non-blocking open detail
- On rollback, restore at original index if cheaply available; otherwise use deterministic append + existing sort behavior.
