# Feature Spec — Layout Invariant Packet 7: Chrome Zoning + Canvas Expansion

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Packet spec (non-destructive chrome re-layout)
- **Date:** 2026-03-21
- **Status:** Draft-for-implementation
- **Depends on:**
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-layout-invariant-packet-6-top-left-chrome-declutter-2026-03-21.md`

## Intent
Increase usable canvas area while preserving layout-invariant guarantees, by tightening top chrome copy and re-zoning controls into clear functional boundaries (identity/navigation vs edit vs filtering/global state).

## In scope
- Remove tagline copy: **"For live priorities, not task lists"**.
- Preserve explicit functional separation between:
  - **Card color** (edit control; not a filter)
  - **Filters** (global view state controls)
- Re-zone chrome so global context/filter controls move to top-right chrome.
- Keep canvas/chrome separation intact and recover additional canvas space.
- Define future-safe top-right chrome capacity constraints for upcoming controls.

## Out of scope
- Any change to card business semantics (hide/snooze/resurface logic).
- Any coordinate-model or migration behavior.
- Adding new filters or changing filter algorithm behavior.
- Accessibility/security deep pass beyond parity.

## Chrome zoning model
1. **Top-left (Anchor zone):** logo + workspace switcher only.
2. **Top-right (Global state zone):** context + filter entry point and tray.
3. **Edit boundary zone (separate from filters):** card-color edit palette remains always visible and never treated as filter state.

## User-visible behavior
1. Tagline is removed from chrome.
2. Context and filter controls are presented in top-right chrome.
3. Card-color control remains a distinct edit control and is not nested inside Filters.
4. Filters tray remains collapsible and controls only view-state/filter operations.
5. Canvas gains visible vertical room versus Packet 6 baseline.
6. No overlap between chrome controls and card hit regions across supported viewport/zoom profiles.

## Defaults and flows
- Default load: Filters tray closed.
- Card-color edit palette: always visible and directly usable independent of tray open/closed state.
- Opening Filters exposes global view controls (hidden/state/scope controls) with unchanged behavior.
- Closing Filters does not reset active filter state.
- On constrained widths, chrome preserves zone priority and avoids collapsing edit+filter controls into ambiguous mixed groups.

## Future-space allocation constraints
- Top-right global zone should reserve capacity for future strip-level controls (e.g., resurfacing acknowledgement/status surfaces) without forcing a third row in normal desktop widths.
- If overflow occurs, degrade in this order:
  1. compact spacing/icons,
  2. collapse secondary global controls into tray,
  3. never hide card-color edit palette behind Filters.

## Edge cases / exceptions
- If non-default filters are active while tray is closed, filtered state still applies correctly.
- If viewport shrinks, zones remain semantically distinct (edit vs filter) and interaction targets remain reachable.
- Workspace switch should preserve existing filter persistence contracts; no new persistence semantics introduced by this packet.

## Acceptance criteria
1. Tagline text is removed.
2. Top-right chrome contains context + filter entry/tray controls.
3. Card-color control is always visible, outside filter tray semantics, and behaviorally unchanged.
4. Filter behavior remains equivalent to pre-packet behavior.
5. Canvas area is measurably increased vs Packet 6 baseline (documented by before/after screenshots or metrics).
6. No chrome-card overlap or jitter regression introduced.
7. Coordinate model remains untouched; no migration path triggered.

## Verification checklist
- Compare before/after canvas dimensions (or effective visible card area) at representative desktop sizes.
- Verify edit/filter boundary semantics with tray open/closed.
- Run top-right stress test with constrained width and active filter states.
- Confirm Packet 6 G6 conditions remain satisfied after Packet 7 changes.

## Rollback
Revert Packet 7 chrome zoning changes to Packet 6 layout while keeping invariant foundation intact.

## Downstream handoff
After Packet 7 passes, proceed with hidden-card resurfacing on a more spacious canvas with clearer control boundaries and top-right global-state zoning.
