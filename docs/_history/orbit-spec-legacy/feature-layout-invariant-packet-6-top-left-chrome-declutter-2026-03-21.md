# Feature Spec — Layout Invariant Packet 6: Top-Left Chrome De-Clutter

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Packet spec (non-destructive chrome polish)
- **Date:** 2026-03-21
- **Status:** Draft-for-implementation
- **Depends on:**
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-layout-invariant-packet-5-foundation-release-checkpoint-2026-03-21.md`

## Intent
Reduce visual and interaction clutter in the top-left system-chrome region while preserving the layout-invariant foundation and all existing feature behavior.

## In scope
- Rebalance top-left chrome into two levels:
  1. **Primary row (always visible):** Orbit logo + workspace switcher + card-color edit palette.
  2. **Secondary controls (collapsed by default):** filter/state controls grouped in a single **Filters** tray.
- Keep canvas and chrome separation unchanged.
- Add extra top-left safe spacing between chrome and first canvas card entry region.
- Preserve existing filtering capabilities and state persistence behavior.

## Out of scope
- Any change to card data semantics, card state model, or hide/snooze/resurface business logic.
- Any change to coordinate model, drag/drop semantics, or viewport mapping.
- New filtering types or redesign of filter logic.
- Accessibility/security deep-pass work beyond maintaining current parity.

## User-visible behavior
1. The top-left region presents a calm default with always-visible edit essentials: logo + workspace selector + card-color edit palette.
2. Filter and state controls are moved into a single **Filters** tray in the same chrome region.
3. The Filters tray is closed on initial load by default.
4. Opening Filters reveals the current filter/state control set (hidden-state control, scope/state toggles such as All/Center/Periphery/Stale) without functional loss.
5. Card-color editing remains directly available even when Filters is closed.
6. Closing Filters does not reset or mutate active filter values.
7. Canvas cards start lower/right enough to avoid visual collision with top-left chrome (target additional clearance: ~16–24px over current baseline).

## Defaults and flows
- **Default on load:** Filters tray closed; card-color edit palette remains visible.
- **When user opens tray:** all filter/state controls are available exactly as before.
- **When user changes filter values:** behavior and data results are unchanged from pre-packet logic.
- **When user changes card color:** card edit behavior is unchanged from pre-packet logic.
- **When user closes tray:** currently selected filters remain active and reflected in results.
- **When viewport is constrained:** primary row remains visible; tray remains operable without overlapping card hit-targets.

## Edge cases / exceptions
- If a non-default filter is active while tray is closed, system must still apply it correctly.
- If window is resized while tray is open, chrome remains outside canvas and controls remain reachable.
- If workspace is switched while tray is open/closed, chosen open/closed UI state may reset to default unless existing global UI persistence contract already governs it; filter value persistence must follow existing behavior contracts.
- If no filters are active, closed tray state should not imply hidden behavior changes.

## Implementation constraints
- Non-destructive only: no schema/data migration, no backend contract changes.
- Must preserve Packet 5 layout-invariant guarantees:
  - no in-canvas system chrome reintroduction
  - no reserved lane coupling that changes canvas coordinate semantics
- Keep control identifiers/test hooks stable where possible to minimize regression risk.

## Acceptance criteria
1. Top-left primary row shows logo + workspace switcher + card-color edit palette in default state.
2. Card-color control remains always visible and behaves as an edit palette (not as a filter).
3. Filter/state controls are accessible via a single Filters tray and are not permanently visible by default.
4. Existing filter outcomes are behaviorally equivalent to pre-packet results for representative scenarios (including hidden and stale views).
5. Closing/opening tray does not clear active filters.
6. Canvas/chrome separation remains intact across supported viewport/zoom profiles; no overlap regression introduced.
7. Additional top-left clearance is visually present and measurable within target delta (~16–24px vs. Packet 5 baseline).
8. No coordinate model or migration work is triggered by this packet.

## Verification checklist
- Regression sweep includes:
  - default load state
  - filter-on/filter-off with tray open/closed
  - workspace switch with active filters
  - viewport resize stress checks
- Confirm Packet 5 sign-off assumptions remain true after Packet 6 changes.

## Rollback
- Revert Packet 6 UI composition changes to return to Packet 5 top-left chrome layout while preserving Packet 5 invariant foundation.

## Downstream handoff
After Packet 6 passes, proceed with feature-layer Hide+Snooze+Resurface work on top of a cleaner, lower-clutter chrome baseline.
