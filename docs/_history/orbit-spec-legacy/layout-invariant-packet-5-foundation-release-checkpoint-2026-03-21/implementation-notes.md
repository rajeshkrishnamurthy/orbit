# Packet 5 Implementation Notes

## Release Verdict

The layout-invariant foundation is complete and ready for Hide+Snooze+Resurface feature-layer work.

## Foundation Evidence

- Packet 0 baseline artifacts are complete and reviewable.
- Packet 1 established the `canvasViewportRect` boundary contract and shell split.
- Packet 2 relocated system chrome into the system strip and enforced strip pressure behavior.
- Packet 3 confirmed the coordinate model is canvas-relative and skipped migration.
- Packet 4 proved system-only events do not move user-positioned cards and validated deterministic insertion scaffolding.

## Final Regression Sweep

Packet 5 sign-off uses the invariant-only regression sweep below.

- `go test ./...` -> PASS
- `npm run test:ui -- e2e/core-ui.spec.ts -g "layout shell exposes canvasViewportRect and keeps system chrome outside the canvas|chrome relocation keeps every system chrome outside canvasViewportRect across viewport/zoom matrix|strip pressure degrades the acknowledgment while Context/Hidden/Lens stay visible|drag/drop persists card position after reload|hide/unhide updates hidden tray count accurately|hide/unhide preserves stale state|stale lens shows only entry-time stale cards and refreshes on reload|system events do not move existing user-positioned cards|insertion policy is deterministic and never displaces existing cards|center/periphery lens + slider updates visible card set|stale emphasis remains visible for stale cards and stays off active cards|card color change persists after reload|focus cards use top-right hover drawer with fixed action set|touch control stays explicit, toggles today state, and supports undo|complete shows acknowledgment, supports undo, and expires after 6s|delete in focus uses undo without confirmation modal|blank context cards are discarded when left empty|enter context navigates to associated focus canvas|context title is editable in focus view and persists after reload|card note height increases from one line to two lines|center cards render larger than periphery cards"` -> PASS (`20` tests)

Note: the repo also contains a downstream resurface-ack test used for later feature work. It is intentionally out of scope for this foundation checkpoint and was not used in the Packet 5 sign-off.

## Coordinate Continuity

No coordinate ambiguity remains.

- Packet 3 established that persisted coordinates are canvas-relative.
- No migration ran in Packet 3 because the evidence already matched canvas-space storage.
- Packet 4 kept the coordinate model stable and non-destructive.

## Rollback Path

Rollback target: return to the Packet 4 foundation state.

Rollback is documented as:

1. Preserve the Packet 4 invariant baseline artifacts.
2. Re-run the invariant regression sweep listed above.
3. If a downstream change regresses layout invariants, revert that downstream change and re-check the same sweep before release.

Rollback validation:

- The invariant regression sweep above passed after the Packet 4 foundation was in place.
- That sweep is the tested recovery check for the foundation state.

## Known Risks

Known risks from Packet 0 were either closed by the packet chain or explicitly accepted with mitigation in the packet notes.

## Sign-Off

Product sign-off for the layout-invariant foundation is granted.
Downstream Hide+Snooze+Resurface implementation work may start from this baseline without assuming any unresolved layout or coordinate ambiguity.
