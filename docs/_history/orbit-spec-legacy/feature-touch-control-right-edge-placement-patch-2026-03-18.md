# Feature Spec — Touch Control Right-Edge Placement (Patch)

## Governance metadata
- state: superseded
- supersedes: `docs/_history/orbit-spec-legacy/feature-touch-active-stale-foundation-2026-03-18.md` (control placement section)
- superseded_by: `docs/00-current-state.md`
- supersession_reason: patch outcomes folded into consolidated baseline.

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Patch spec
- **Date:** 2026-03-18
- **Status:** Approved draft
- **Amends:** `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-touch-active-stale-foundation-2026-03-18.md`

## Intent
Fix control-placement ambiguity so Touch is implemented as a direct card-edge action, not a drawer-menu action.

## In scope
- Define exact Touch control location on card right edge.
- Prohibit Touch action from appearing inside the three-dots drawer menu.
- Preserve existing control stack order and interaction model.

## Out of scope
- Redesign of action drawer behavior beyond Touch exclusion.
- New icon designs beyond existing touched-today on/off states.
- Any keyboard shortcut additions.

## User-visible behavior

### Control placement
- Touch appears as a **standalone icon control on the right edge of each card**.
- Vertical order on right edge is fixed:
  1. Three-dots drawer trigger (top)
  2. Touch control (middle)
  3. Slipping icon/control (bottom)

### Drawer behavior
- Opening the three-dots drawer does **not** show Touch as a menu item.
- Touch interaction remains a direct tap/click on its edge control.

## Defaults and assumptions
- Touch icon still uses two states only:
  - touched today = ON
  - not touched today = OFF
- Touch placement must not overlap card text and must not increase card height.
- Existing drag affordance remains unchanged by this patch.

## Edge cases
- Hover/focus states must preserve stack order; Touch remains between drawer and slipping.
- Responsive density changes must keep relative vertical ordering intact.
- Drawer open/close state must not hide or relocate Touch into the menu.

## Acceptance criteria
1. On every card, Touch is rendered on right edge between three-dots (top) and slipping (bottom).
2. Three-dots drawer never contains a Touch action item.
3. Touch is actionable directly from card edge without opening drawer.
4. Touch icon state (ON/OFF) continues to reflect touched-today fact correctly.
5. Card height does not increase due to Touch control placement.
6. Touch control does not overlap title/body text in normal card layouts.

## Implementation constraints (minimal)
- Treat Touch as peer action control in right-edge action column.
- Do not wire Touch via drawer-menu action dispatch path.
- Preserve existing stale/active semantics and data model; this patch is placement-only.