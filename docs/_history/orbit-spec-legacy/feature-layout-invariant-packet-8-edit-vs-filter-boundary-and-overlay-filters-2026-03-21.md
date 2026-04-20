# Feature Spec — Layout Invariant Packet 8: Edit-vs-Filter Boundary + Overlay Filters

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Patch packet spec (chrome interaction polish)
- **Date:** 2026-03-21
- **Status:** Draft-for-implementation
- **Depends on:**
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-layout-invariant-packet-7-chrome-zoning-canvas-expansion-2026-03-21.md`

## Intent
Fix two usability regressions in the current chrome implementation:
1) card-color edit controls and Filters are visually grouped into one boundary,
2) opening Filters expands into a new row, causing clumsy layout shift.

Packet 8 enforces strict boundary separation and changes Filters from row-expanding inline controls to anchored overlay behavior.

## In scope
- Separate **Edit control boundary** (card-color palette) from **Global view control boundary** (Filters).
- Keep both controls discoverable in the canvas header rail composition.
- Replace inline row-expansion filter reveal with anchored overlay/popover panel.
- Preserve layout invariant and no canvas-origin drift guarantees.

## Out of scope
- Any change to filter logic semantics or filter result behavior.
- Any change to card data/state semantics.
- Any coordinate/migration behavior.
- Any new filter categories.

## Chosen interaction model
Adopt debra Option 2: **Primary rail + floating filter trigger**.

### Structure
1. **Edit boundary (persistent):** card-color palette in its own bounded container.
2. **Global control trigger (persistent):** Filters button as separate container/anchor (not fused with edit boundary).
3. **Filter panel (ephemeral):** opens as anchored overlay/popover from the Filters trigger.

### Open behavior
- Opening Filters must not create a new chrome row.
- Overlay panel appears above canvas/chrome layer stack without shifting rail layout.
- Overlay placement prefers below trigger; if constrained, flip above with same anchor alignment.

## User-visible behavior
1. Card-color palette and Filters trigger appear as clearly separate boundaries.
2. Clicking Filters opens an overlay panel containing filter chips/toggles (Hidden, All, Center, Periphery, Stale, etc.).
3. Opening/closing overlay causes no rail reflow, no canvas-origin drift, and no card-jitter.
4. Active filter state remains visible when panel is closed (via trigger state/badge conventions already used or defined in implementation).
5. Card-color editing remains always available and unaffected by filter panel state.

## Defaults and flows
- Default load: filter panel closed.
- Filter state persists per existing contracts.
- Closing overlay preserves active filter state.
- Clicking outside overlay or pressing Escape closes overlay.

## Future-friendliness constraints
- Maintain hard semantic boundary: edit controls must never be subsumed into global filter boundary.
- Overlay stack must coexist with future ephemeral status/ack slot rules from Packet 7.
- Persistent state indicators and ephemeral acknowledgements must remain visually distinct.
- Overflow handling must preserve trigger discoverability (Filters trigger cannot disappear at normal desktop widths).

## Edge cases
- Narrow widths: overlay width may compact, but no fallback to row-expansion behavior.
- If overlay cannot fully fit below trigger, placement flips without changing rail geometry.
- Rapid open/close interactions must not produce flicker or stale positioning.

## Acceptance criteria
1. Edit boundary and global filter boundary are visually and structurally separate in default state.
2. Opening Filters does not introduce a new row or push existing controls vertically.
3. No canvas-origin drift across filter panel open/close and active-state transitions.
4. Filter behavior and outcomes remain equivalent to pre-packet logic.
5. Card-color control remains always visible and operational while filter panel is open/closed.
6. Overlay open/close supports click-outside and Escape close behavior.
7. No overlap regression with card hit regions in supported viewport/zoom profiles.
8. Coordinate model remains untouched; no migration path triggered.

## Verification checklist
- Screenshot compare before/after for boundary separation.
- Interaction test: open/close filter overlay repeatedly; verify no row creation and no canvas movement.
- Functional test: active filter combinations produce same card sets as pre-packet baseline.
- Keyboard test: Escape closes overlay without side effects.
- Resize test: overlay positioning remains anchored and stable.

## Rollback
Revert to Packet 7 control placement while preserving Packet 7 zoning and invariant guarantees.

## Downstream handoff
After Packet 8 passes, proceed to hidden-card resurfacing on top of stabilized chrome behavior with clear edit/global boundaries and non-jarring filter interactions.
