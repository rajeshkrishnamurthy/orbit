# Orbit Feature Document

**Project root:** `/Users/rajeshk/.openclaw/projects/orbit`  
**Spec path:** `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-last-mile-completion-flow-2026-03-16.md`  
**Feature:** Last-Mile Completion Flow (First Shippable Beta Packet)  
**Date:** 2026-03-16

## Feature intent
Make completion a meaningful, explicit end-state distinct from deletion, while preserving Orbit’s identity as a live priorities-in-context product (not a conventional task manager).

## In scope
- Explicit **Complete** action as the primary end-state action.
- Separate **Delete** action (secondary/destructive).
- Preserve existing **At-risk** action location/semantics.
- Quiet but clearly noticeable completion recognition.
- Brief completed-state visibility before removal from live canvas.
- Short **Undo** window for completion.
- Delete behavior remains soft-delete + brief undo (no confirm modal) for this packet.

## Out of scope
- Visible/persistent recently-completed area (deferred).
- Completed history/archive systems.
- Broad multi-context access redesign.
- Rich multi-step last-mile workflows.
- Mobile behavior.
- Gamified/loud completion celebrations.

## Core flow
1. User clicks **Complete** on a live priority card.
2. Card enters brief completed visual state.
3. Quiet acknowledgment appears with **Undo**.
4. If no undo action is taken in the window, card auto-removes from live canvas.

## Exception flow (Undo)
1. User clicks Undo within window.
2. Card is restored as active in its original context.

## Action placement (ambiguity reduction)
- **Top-right:** `x` Delete (secondary).
- **Bottom-right:** `!` At-risk (existing control unchanged).
- **Bottom-left / primary footer zone:** `✓ Complete` (labeled, primary).

### Placement rules
- Complete must not displace At-risk from bottom-right.
- Complete must be labeled (not icon-only).
- Delete must not be presented as the primary closure action.

## State semantics (must remain distinct)
- **Completed:** finished meaningful priority.
- **Deleted:** item removed from system relevance.
- **Hidden:** not active in view; not equivalent to completed/deleted.
- **At-risk:** live priority with risk signal.

### Prohibitions
- Completed must not be implemented as hidden.
- Completed must not be implemented as delete.
- Delete must not be framed as normal completion.

## Defaults and assumptions
- Recognition tone is quiet/clean, clearly noticeable.
- Completed item destination (this packet): remove from live canvas after brief recognition.
- No persistent completed panel/tray in first ship.

## Key edge cases
- Repeated rapid Complete actions are idempotent (no duplicate transitions/toasts).
- Undo at time-boundary behaves deterministically.
- Delete and Complete transitions cannot produce contradictory terminal states.
- Undo restores item to original context.
- Completing an At-risk item works normally.

## Acceptance criteria
1. Cards expose distinct Complete and Delete actions.
2. Complete is primary; Delete is secondary.
3. Action placement follows agreed zones (top-right delete, bottom-right at-risk, bottom-left/footer complete).
4. Completing shows brief completed state before auto-removal.
5. Completion acknowledgment includes Undo.
6. Undo within window restores card active in same context.
7. Undo after expiry does not restore card.
8. Delete uses soft-delete + brief undo; no confirm modal.
9. Completed/Deleted/Hidden/At-risk remain behaviorally distinct.
10. No visible recently-completed area exists in this first packet.

## Open questions / blockers
None blocking for first shippable packet.

## Deferred follow-up trigger
Introduce a lightweight recently-completed area only if beta evidence shows:
1. frequent mistaken completions + missed undo window, or
2. trust anxiety from perceived disappearance of completed items.
