# Feature Spec — Layout Invariant Patch (System Chrome Outside Canvas)

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Patch spec (foundational layout invariant)
- **Date:** 2026-03-21
- **Status:** Approved draft
- **Amends (behavioral framing):**
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-hide-and-unhide-cards-retro-2026-03-17.md`
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-stale-lens-mode-slice-4-2026-03-20.md`
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/planning-hide-snooze-resurface-2026-03-20.md`

## Intent
Establish a hard layout invariant for Orbit:

- **Canvas is user territory** (cards + card-local interaction only).
- **System chrome is Orbit territory** (context/status controls/acknowledgments outside canvas).

This prevents system UI from intruding into card space, preserves Orbit sleekness, and removes layout ambiguity before deeper Hide+Snooze+Resurface work.

## In scope
- Introduce and enforce canonical canvas boundary contract (`canvasViewportRect`).
- Define what may and may not render within canvas pixels.
- Relocate intruding system UI to system strip regions outside canvas.
- Define responsive strip behavior under width/height pressure.
- Define resurfaced acknowledgment placement/degradation rules in system strip.
- Define migration/compatibility requirements for card coordinate semantics during rollout.

## Out of scope
- Hide+Snooze+Resurface behavior implementation details beyond layout contract dependencies.
- New interaction controls for resurfaced acknowledgment (MVP remains informational-only).
- Card semantic changes (hide/complete/cancel/touch/stale derivation logic).
- Any automatic card re-layout for aesthetic normalization.

## Core invariant

### Territory rule
1. Canvas region (`canvasViewportRect`) is reserved for user card content and card-local affordances only.
2. System chrome must render outside `canvasViewportRect` at all supported sizes/zoom levels.
3. No feature may introduce in-canvas system controls/popovers/toasts as a workaround.

### `canvasViewportRect` contract
- `canvasViewportRect` is a first-class layout artifact computed by layout shell.
- All system-layer components must consume this boundary for placement guards.
- Boundary must be stable and queryable by rendering and test layers.

## Rendering policy

### Allowed inside canvas
- Card bodies, card-local controls, selection/hover states.
- Card drag preview/ghost for direct card manipulation.

### Disallowed inside canvas
- Context title and context/state bars.
- Hidden tray toggles/system filter toggles.
- Lens/global mode controls.
- System toasts and resurfaced acknowledgments.
- System popovers anchored into canvas.

## System strip priority and pressure behavior

### Always-visible priority order
1. Context
2. Hidden
3. Lens
4. Resurface acknowledgment

### Pressure/degradation behavior
- Under strip pressure, Resurface acknowledgment degrades first:
  - full text → compact token → disappear.
- Context/Hidden/Lens remain protected before acknowledgment.
- Strip may reflow/collapse responsively but must not cross into canvas pixels.

## Resurface layout constraints (dependency for snooze work)
- This patch forbids reserving system lanes inside canvas.
- Resurfaced card insertion must never displace existing user-positioned cards.
- Placement rule:
  1) use prior coordinates if available and collision-safe,
  2) else deterministic collision-safe fallback placement,
  3) never push existing cards.

## Migration and coordinate safety
Because this patch changes canvas available area and shell layout, coordinate semantics must be validated.

### Required pre-migration check
- Determine whether persisted `x,y` are:
  - canvas-relative coordinates (preferred; likely no migration), or
  - display/viewport absolute coordinates (requires migration).

### Migration rule
- If coordinates are absolute-display, ship an explicit normalization migration to canvas-space before enforcing the invariant.
- Migration must preserve visual continuity and avoid card jumps across restart/open.

### Non-destructive guarantee
- System-driven layout updates must not mutate stored coordinates of existing cards except explicit user drag/move actions or deterministic insertion of a resurfacing card.

## Sequencing rule
This patch lands **before** Hide+Snooze+Resurface feature-layer implementation.

Recommended order:
1. Layout invariant patch (`canvasViewportRect`, chrome relocation, responsive strip).
2. Coordinate semantic audit + migration if required.
3. Snooze/resurface feature-layer behavior on top of invariant.

## Edge cases
- Narrow windows: strip collapses/reflows without intruding into canvas.
- High zoom/accessibility scaling: no pixel overlap between system chrome and canvas.
- Existing installs with cards near former intruding zones: no displacement unless caused by explicit user action.
- Dragging cards while system strip state changes: no jitter from cross-layer reflow.

## Acceptance criteria
1. At supported viewport sizes and zoom levels, no system chrome renders within `canvasViewportRect`.
2. Canvas children are limited to cards and card-local affordances only.
3. System toasts and resurfaced acknowledgment render outside canvas.
4. Resurfaced acknowledgment follows priority pressure degradation (full text → compact token → disappear).
5. Context/Hidden/Lens remain visible ahead of acknowledgment under strip pressure.
6. No in-canvas system-reserved lane exists after patch.
7. Resurface insertion never displaces existing cards.
8. Resurface placement uses prior coordinates when collision-safe; otherwise deterministic collision-safe fallback.
9. Existing card drag/hide/unhide/lens behaviors continue to function without in-canvas system intrusions.
10. Coordinate semantic audit is completed; if absolute-display storage is found, migration is implemented and validated before invariant enforcement.

## Implementation constraints (minimal)
- Treat boundary enforcement as layout-system contract, not component-by-component convention.
- Add regression checks for non-overlap at multiple viewport sizes and zoom levels.
- Keep MVP resurfaced acknowledgment informational-only.

## Open questions / blockers
- None at product-semantics level.
- Implementation blocker to resolve in execution planning: coordinate model confirmation (`canvas-relative` vs `absolute-display`).
