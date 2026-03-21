# Packet 4 Implementation Notes

## Purpose
Packet 4 hardens the layout invariant without changing card placement behavior. It proves that system-only UI changes do not move user-positioned cards, and that the insertion path remains deterministic across repeated hide/unhide cycles.

## Foundation
- Packet 3 coordinate verdict: `canvas-relative`
- Coordinate migration was skipped in Packet 3 because persisted `x/y` values already matched canvas-space storage.

## Hardening Behavior Covered
- Existing card coordinates remain unchanged during system-only events.
- Drag, hide, unhide, and lens interactions continue to work while strip state changes occur.
- The insertion path is exercised as a deterministic scaffold for future resurface behavior.
- No snooze/resurface controls were added.

## Evidence Added In This Packet
- Updated Playwright coverage in `e2e/core-ui.spec.ts` with:
  - `system events do not move existing user-positioned cards`
  - `insertion policy is deterministic and never displaces existing cards`

## Verification Summary
- Non-test sanity check: `git diff --check`
- Packet 4 UI evidence is scoped to the existing core UI spec and the Packet 3 coordinate foundation.

## Notes
- No Packet 5 work was started.
- No new acknowledgment controls were added.
- No coordinate semantics were changed.
