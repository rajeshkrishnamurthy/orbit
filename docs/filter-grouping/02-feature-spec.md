# Filter Grouping — UI Regroup Patch Spec

## 1) Summary
Re-group the top chrome controls for clarity without changing filter behavior.

Target grouping:
- Utility: `Hidden <count> · <resurfaced>↑` (separate from filter groups)
- Scope group (mutually exclusive): `All | Center | Periphery`
- State group (mutually exclusive): `Stale | Untouched`
- People group: one control showing current selection, default label `People: All`

This patch is presentation and grouping only.

## 2) Scope / non-scope
### In scope
- Visual regrouping of existing controls in the top chrome filter tray.
- Group-level spacing and separators.
- Visual hierarchy adjustments for active vs inactive pills.
- People default label copy change to `People: All` when no person is selected.

### Out of scope
- Any change to filter semantics or predicate logic.
- Any change to stale/untouched/scope/people composition behavior.
- Any change to hidden-tray behavior or hidden count computation.
- Any new filters, badges, or analytics.

## 3) Behavioral invariants (must remain unchanged)
1. Scope remains mutually exclusive: only one of `All|Center|Periphery` active.
2. State remains mutually exclusive for `Stale|Untouched` as currently implemented.
3. People filter behavior remains unchanged except idle label text (`People: All`).
4. Existing AND/intersection composition rules remain unchanged.
5. Hidden utility control remains outside filter groups and behavior unchanged.

## 4) UI structure contract
Order left-to-right in filter tray:
1. Utility block: Hidden control.
2. Vertical separator.
3. Scope block: `All|Center|Periphery` (+ the existing scope slider when `Center` or `Periphery` is active).
4. Vertical separator.
5. State block: `Stale|Untouched`.
6. Vertical separator.
7. People block: single people control.

## 5) Visual styling contract
1. Inter-group gap is larger than intra-group pill gap.
2. Group separators are subtle, low-contrast vertical lines.
3. Inactive pills use lower-emphasis style (lighter contrast).
4. Active pill uses stronger emphasis (higher contrast/background).
5. No line wrapping between groups on standard desktop widths; horizontal overflow fallback is allowed on constrained widths.

## 6) Acceptance criteria
1. Hidden control appears visually separate from grouped filters.
2. Scope pills are visually grouped and mutually exclusive behavior unchanged.
3. When `Center` or `Periphery` is active, the existing scope slider appears inside the scope block (not in another group).
4. State pills are visually grouped and mutual exclusivity unchanged.
5. People control shows `People: All` when no person selected.
6. Existing tests for filter behavior continue to pass unchanged.
7. No regression in top chrome interaction (clicks, outside-click handling, layout stability).

## 7) Notes
- This is a UI regroup patch, not a behavior spec revision.
- If any behavior changes are discovered during implementation, stop and raise a follow-up spec change.
