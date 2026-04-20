# Feature Spec — Hidden Recovery Tray: Drag Preview + Dismissal Behavior (Patch)

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Patch spec
- **Date:** 2026-03-17
- **Status:** Approved draft

## Intent
Fix two UX gaps in hidden-card recovery so the drag-back flow is legible and the tray behaves like a standard dismissible popover.

## In scope
- Show a **custom Orbit-styled drag preview** while a hidden card is being dragged from recovery tray.
- Close recovery tray on:
  - `Escape`
  - click/tap anywhere outside the tray.
- Keep tray open after successful restore if more hidden cards remain.

## Out of scope
- Any change to core hidden/unhide persistence model.
- Any change to drag-back-only restore rule.
- Cross-session live synchronization while tray is already open.

## User-visible behavior

### Default path
1. User opens `Hidden (N)` recovery tray.
2. User starts dragging a hidden card.
3. User sees a custom Orbit-styled floating drag preview immediately.
4. User drops card into canvas.
5. Card is restored/unhidden and placed at drop position.
6. Tray remains open for additional restores (if hidden cards remain).

### Dismissal path
- Pressing `Escape` closes the tray.
- Clicking/tapping outside tray closes the tray.
- Clicking inside tray does not close it.

## Defaults and assumptions
- Outside-click behavior is tray-relative (popover semantics), not canvas-boundary semantics.
- Tray should not require Hidden button retoggle for dismissal.
- Drag preview is a custom visual, not plain native browser ghost only.

## Edge cases
- If user starts drag then cancels/drop-fails, tray remains open and card remains in tray.
- Escape closes tray whether focus is in tray or on surface, unless prevented by active text input behavior that explicitly consumes Escape.
- Outside click during tray-open must not create unintended new cards.

## Acceptance criteria
1. When dragging a hidden card from tray, a custom Orbit-styled preview is visible before drop.
2. On successful drop to canvas, item restores and appears at dropped position.
3. If tray still has hidden cards after restore, tray remains open.
4. Pressing `Escape` closes tray without needing Hidden button click.
5. Clicking/tapping outside tray closes tray.
6. Clicking/tapping inside tray does not close tray.
7. Existing drag-back-only restore model remains unchanged.

## Implementation constraints (minimal)
- Keep existing hidden APIs and persistence contract unchanged.
- Add event handling for `Escape` and outside-click dismissal with clear containment checks.
- Ensure drag-preview teardown is deterministic on drop/end/cancel.

## Non-blocking note
- Optional later enhancement: tray auto-refresh if hidden state changes in another tab/session while tray is open.
