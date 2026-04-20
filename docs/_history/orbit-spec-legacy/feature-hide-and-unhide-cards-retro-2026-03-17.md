# Feature Spec — Hide and Unhide Cards (Retro)

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Feature type:** Existing behavior documentation (retro spec)
- **Date:** 2026-03-17
- **Status:** Baseline reference (post-patch)

## Intent
Allow users to temporarily remove cards from the active focus canvas without deleting or completing them, and recover them quickly from the Hidden tray.

Hidden is a reversible visibility state that preserves the card for later continuation.

## In scope
- Hide a visible card from the focus canvas.
- Track and display Hidden tray count for current context.
- Open Hidden tray and list hidden cards.
- Unhide by dragging hidden card onto canvas at a drop position.
- Keep hidden behavior context-scoped.
- Keep hide semantics distinct from complete and delete/cancel.
- Include optimistic unhide tray-sync behavior from latest patch.

## Out of scope
- Completion semantics/workflow.
- Delete/cancel semantics/workflow.
- Bulk hidden-item management redesign.
- Cross-context hidden migration behavior.

## State semantics
- `visible`: card is on active focus canvas.
- `hidden`: card is excluded from visible canvas and available in Hidden tray.
- `completed`: separate semantic state; must not be treated as hidden.
- `deleted/cancelled`: terminal removal behavior; not recoverable via Hidden tray.

## User-visible behavior

### A) Hide card
1. User activates Hide action on a visible card.
2. Card is removed from live canvas.
3. Hidden count increments for current context.
4. Hidden toggle label reflects updated count (`Hidden (k)`).

### B) Open Hidden tray
1. User clicks Hidden control.
2. Tray opens near control, showing hidden cards for current context.
3. If empty, show empty state text.

### C) Unhide card via drag/drop
1. User drags hidden tray item to valid canvas drop target.
2. On valid drop completion, item is removed from tray immediately (optimistic UI).
3. Card is restored to visible state at dropped coordinates.
4. Hidden count decrements.
5. Hidden tray remains open for subsequent unhide operations.

### D) Unhide failure handling
1. If persistence fails after optimistic tray removal:
   - restore item to hidden tray exactly once,
   - restore hidden count,
   - show error toast (`Couldn’t unhide item. Please try again.`).

### E) Reveal all hidden cards
1. User triggers reveal-all behavior.
2. All hidden cards in context become visible.
3. Hidden count becomes zero.

## Defaults and assumptions
- Hidden operations are scoped to the active context (`contextId`).
- Hidden tray ordering follows backend hidden list ordering (updated_at desc) unless explicitly overridden in UI behavior.
- Invalid unhide drop target must not commit unhide.
- Hidden toggle can be hidden when count is zero and tray closed.

## Edge cases
- Rapid sequential unhide actions: each item resolves independently.
- Mixed persistence outcomes in sequence: failure of one item does not affect others.
- Duplicate interaction on same hidden item while pending: no duplicate state transitions.
- Hidden list fetch failure: tray shows load-failure state, existing canvas remains stable.

## API-level behavior (current)
- `POST /api/items/hide` → sets `hidden=1`, returns `hiddenCount`.
- `POST /api/items/hidden` → returns hidden items for context.
- `POST /api/items/unhide-at` with `id/contextId/x/y` → sets `hidden=0`, updates coordinates, returns `hiddenCount`.
- `POST /api/items/reveal-all` → clears hidden state for context, returns visible items and `hiddenCount=0`.

## Acceptance criteria
1. Hiding a visible card removes it from canvas and increments Hidden count for that context.
2. Hidden tray shows only hidden, non-completed cards for active context.
3. Hidden count label and tray contents remain consistent after hide, unhide, and reveal-all operations.
4. Valid unhide drag/drop removes tray item immediately and restores card at target coordinates.
5. Hidden tray remains open after unhide attempts unless user closes it.
6. On unhide persistence failure, rollback restores hidden item and count, and error toast is shown.
7. Invalid drop does not remove hidden item or mutate persistence state.
8. Hidden state remains behaviorally distinct from completed and deleted/cancelled states.

## Traceability notes
- Product references: `PRODUCT.md` (hidden tray semantics, state distinction).
- Contract references: `TEST_CONTRACT.md` sections B6/B7/B8/F5.
- Patch detail: `spec/feature-hidden-popdown-immediate-unhide-sync-patch-2026-03-17.md`.
