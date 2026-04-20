# Feature Spec — In-Card Hover Action Drawer (Desktop)

## Governance metadata
- state: superseded
- supersedes:
  - `docs/_history/orbit-spec-legacy/feature-last-mile-completion-flow-2026-03-16.md`
  - `docs/_history/orbit-spec-legacy/feature-last-mile-completion-flow-patch-v2-2026-03-16.md`
- superseded_by: `docs/00-current-state.md`
- supersession_reason: drawer action set and behavior now represented by consolidated baseline (including added activity-log action).

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Date:** 2026-03-17
- **Status:** Hardened for handoff

## Intent
Improve card action affordance polish and discoverability by introducing a top-right hover drawer for card actions, without changing existing card sizing or drag/drop behavior.

## In Scope
- Add a subtle top-right visual indication that the card is hover-actionable.
- On hover at the top-right action zone, reveal a drawer that slides in from the right-top **within current card bounds**.
- Replace the current top-right glyph set (minimize + close) with this drawer interaction.
- Drawer contains exactly three actions:
  1. Minimize
  2. Cancel
  3. Complete
- Remove the recently added bottom-right **Complete** glyph (next to slipping).
- Keep the existing **slipping** glyph unchanged.
- Drawer visual styling must keep glyphs clearly foregrounded and readable.
- While drawer is open, underlying content in drawer area is **slightly dimmed** to avoid visibility conflict.
- Desktop/web hover interaction only.

## Out of Scope
- Any changes to drag/drop behavior or overlap handling.
- Any changes to current card sizes or layout engine.
- Mobile/touch interaction behavior.
- Changes to existing action semantics (minimize/cancel/complete logic remains as-is).

## Core User Flow
1. User sees card with a subtle top-right hover affordance.
2. User hovers the top-right zone.
3. Drawer slides in from right-top, fully contained inside card boundaries.
4. Drawer shows minimize/cancel/complete actions.
5. Underlying text/content beneath drawer region is slightly dimmed while open.
6. User clicks an action; existing action behavior executes.
7. On hover-out from action zone/drawer, drawer retracts smoothly.

## Defaults and Assumptions
- Default card state: drawer hidden.
- Reveal mechanism: hover only (desktop).
- Dismiss mechanism: hover leave from the action region (with minimal stabilization to avoid flicker).
- Existing action handlers remain source of truth for action outcomes and error handling.

## Key Edge Cases / Exceptions
- **Dense text near top-right:** drawer remains readable through contrast-safe foreground styling plus slight dimming of underlying content.
- **Rapid pointer jitter:** use brief hover stabilization/debounce to prevent flicker.
- **Cards near viewport edges:** drawer still remains fully in-card; no overflow outside card.
- **Compact cards:** icon readability and clickable hit targets remain usable without changing card geometry.

## Acceptance Criteria
1. Every eligible card displays a subtle top-right hover affordance in default state.
2. Hovering the top-right zone reveals a drawer that is fully contained within card bounds.
3. Existing top-right minimize/close glyph pair is no longer rendered as standalone static controls.
4. Drawer shows exactly three controls: minimize, cancel, complete.
5. Recently added bottom-right Complete glyph (next to slipping) is removed.
6. Existing slipping glyph remains present and unchanged in behavior/placement.
7. Card dimensions remain unchanged from current behavior.
8. Drag/drop behavior remains unchanged from current behavior.
9. In dense-text cards, drawer icons remain clearly readable.
10. While drawer is open, underlying content in drawer region is slightly dimmed.
11. Drawer open/close behavior is stable and does not visibly flicker under normal pointer motion.
12. Feature is scoped to desktop/web hover interactions only; no mobile/touch behavior is required.

## Open Questions / Blockers
- None blocking for implementation handoff.
