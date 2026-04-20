# Card People Map — Feature Specification

## 1) Spec summary
Deliver a baseline people-to-card mapping and filtering capability for Orbit.

Users can:
- associate 0..N people with a card,
- view/edit associated people on each card,
- apply a single-select people filter that narrows the active context canvas to cards linked to the selected person.

This spec is strictly scoped to mapping + filtering.

---

## 2) Scope / non-scope

### In scope
1. Workspace-level person entities with stable IDs.
2. Card-to-people association (0..N).
3. Card-level people UI for add/remove/view.
4. Single-select people filter.
5. Deterministic composition with existing context and stale lens behavior.

### Out of scope
1. CRM/contact sync or external directory integration.
2. Ownership/assignee semantics.
3. Meeting orchestration/prep workflows.
4. Dedicated people profile pages/panels.
5. Multi-select people filters (ANY/ALL).

---

## 3) Inputs and invariants

### Inputs
- Workspace people collection.
- Card metadata for active context.
- Existing hidden-state and stale-lens state.
- User actions:
  - create/select person,
  - add person to card,
  - remove person from card,
  - apply/clear people filter,
  - rename person.

### Invariants
1. Canvas territory rules remain unchanged: system must not auto-mutate card placement.
2. Hidden cards remain excluded from visible canvas semantics.
3. People filter is active-context scoped only.
4. Stale lens behavior remains stale-at-entry and session-scoped (no in-session stale membership refresh).
5. Card-person association supports 0..N people per card.
6. Person identity is canonicalized by stable ID; card links are ID-based, not display-name-based.

---

## 4) Functional requirements (deterministic)

### 4.1 Data contract
1. Introduce workspace person entity:
   - `person.id` (stable, unique in workspace)
   - `person.display_name` (user-facing)
   - `person.normalized_name` (internal uniqueness key)
2. `normalized_name` must be computed as:
   - trim leading/trailing whitespace,
   - collapse internal whitespace runs to single spaces,
   - case-fold to lowercase.
3. Person creation must enforce uniqueness on `normalized_name` within workspace.
   - Duplicate create attempt must be rejected with deterministic validation feedback.
4. Card metadata includes `person_ids: []` (0..N unique person IDs).
5. Card must not contain duplicate `person_ids` entries.

### 4.2 Card-level people behavior
1. Each card shows a compact people indicator at the bottom-left: `people_icon + mapped_count`.
2. Indicator is always visible as a low-noise signal; names are not always rendered on-card.
3. Clicking the indicator opens card-scoped people management using the same popup interaction pattern as Activity Log (existing Orbit popup model).
4. In people management UI, user can add existing people to card.
5. In people management UI, user can remove any attached person from card.
6. In people management UI, user can type to search existing people (autocomplete).
7. If typed input has no exact match, UI must offer `Create "<name>"`; selecting it creates person and immediately attaches to card (subject to uniqueness validation).
8. Removing person from card affects only that card link; person entity remains in workspace if used elsewhere.
9. Attached people list inside management UI must render deterministic ordering:
   - alphabetical by `display_name` (case-insensitive), tie-break by `person.id`.

### 4.3 Person rename behavior
1. User can rename person entity.
2. Rename must re-run uniqueness validation on resulting `normalized_name`.
3. On successful rename, all card associations remain intact (ID-linked).
4. Any active people filter bound to that person ID remains active after rename; visible label updates to new name.

### 4.4 People filter behavior
1. Filter is single-select at all times (0 or 1 selected person).
2. People filter control is a top-chrome pill; clicking it opens a searchable popover list of people.
3. Popover must include a deterministic `Clear filter` action at top.
4. People list ordering in popover must be deterministic:
   - alphabetical by `display_name` (case-insensitive), tie-break by `person.id`.
5. Selecting person `P` from popover applies filter immediately and shows only cards in active context where `P.id ∈ card.person_ids`.
6. While selected, People pill label must render as `People: <P.display_name>` (truncate label if needed).
7. Clearing filter resets pill label to `People` and returns to unfiltered active-context card set (subject to other active lenses/filters).
8. People filter selection is session-scoped and resets to unselected on app restart.
9. Filter never includes hidden cards.
10. If selected person has zero matching visible cards in active context, UI must show deterministic empty state.

### 4.5 Composition rules with existing model
1. **Context scope rule:** filter only affects currently active context canvas.
2. **Global chrome-filter composition rule:** Stale, scope (All/Center/Periphery), and People filters are strict AND/intersection filters; no filter may silently reset or override another.
3. **Stale + scope rule:** when Stale is active, current scope selection (All/Center/Periphery) must be preserved and applied by intersection (no defaulting to All).
4. **Stale + people rule:** if stale lens and people filter are active, result set is intersection over active context:
   - `visible_cards ∩ stale_lens_snapshot_cards ∩ scope_subset_cards ∩ cards_linked_to_selected_person`.
5. Stale lens snapshot behavior remains unchanged:
   - people or scope filter changes do not refresh stale membership,
   - while stale is active, switching scope (All/Center/Periphery) recomputes results immediately against the existing stale snapshot,
   - stale membership refreshes only on stale-lens re-entry.
6. Switching active context with an active people filter:
   - selected person remains selected,
   - results recompute against new active context only.

### 4.6 Popup concurrency behavior
1. Card-level Activity Log popup and card-level People management popup are mutually exclusive.
2. If Activity Log popup is open and user clicks card People indicator, Activity Log popup closes and People popup opens.
3. If People popup is open and user triggers Activity Log popup, People popup closes and Activity Log popup opens.
4. People management uses a single-popup-instance model.
5. If People popup is open for card `A` and user clicks People indicator on card `B`, popup retargets to card `B` (no second popup instance).

### 4.7 Deletion/cleanup behavior
1. If person entity deletion exists in current product surface, deletion must detach that person ID from all cards deterministically.
2. If person deletion does not exist, no new deletion surface is required by this initiative.

---

## 5) UX/API/data behavior contract

### UX behavior contract
1. Card bottom-left always shows compact people indicator (`people_icon + count`).
2. Clicking that indicator opens people management UI for that card (add/remove/search/create) using the same popup interaction pattern as Activity Log.
3. People management is not placed under the three-dot card action drawer.
4. People filter control is a top chrome pill in the filter row, adjacent to other explicit filters.
5. Clicking People pill opens searchable popover list of people plus `Clear filter` action.
6. Selecting a person in popover applies filter immediately.
7. While active, People pill label is `People: <Selected Name>` (truncated if needed) with selected-state styling.
8. Active people filter state is always visibly indicated.
9. Empty-state copy appears when filter yields zero visible matches.

### Data behavior contract
1. Person references on cards must use stable IDs.
2. Display names are mutable labels; identity is ID.
3. Name uniqueness must be enforced via `normalized_name` rule.

### Error/validation contract
1. Duplicate person create/rename attempts are blocked with explicit message indicating duplicate normalized name conflict.
2. Invalid blank name after normalization is blocked.

---

## 6) Edge cases and failure handling
1. **Duplicate attempt by casing/spacing:** `" Sam  Lee "` vs `"sam lee"` must be treated as duplicate.
2. **Rename collision:** renaming an existing person to an already-used normalized name must fail and keep previous name.
3. **Filtered person has no cards in current context:** show empty state, not fallback results.
4. **Filtered person exists but all linked cards hidden in current context:** show empty state (hidden excluded).
5. **Context switch while filtered:** filter remains selected; results recompute deterministically for new context.
6. **Stale lens + scope filter:** scope is preserved; no default-to-All behavior.
7. **Stale lens + people filter:** intersection only; no override precedence.
8. **Concurrent add/remove on same card-person link:** final persisted state must represent last successful user action; no duplicate IDs.

---

## 7) Acceptance criteria (testable and observable)
1. A card always shows bottom-left people indicator as `people_icon + count`.
2. Clicking card people indicator opens card-scoped people management UI using the same popup interaction pattern as Activity Log.
3. A user can attach multiple people to one card and detach one person without affecting other attached people.
4. People management UI supports autocomplete over existing people.
5. If no exact match exists, selecting `Create "<name>"` creates and attaches person in one action.
6. Creating `"Sam Lee"` then attempting `" sam   lee "` is rejected as duplicate.
7. Renaming person `A` to a normalized name already used by person `B` is rejected.
8. Clicking top-chrome People pill opens searchable popover list with a `Clear filter` action.
9. People list in filter popover is ordered alphabetically (case-insensitive) with person-ID tie-break.
10. Selecting person filter `P` in context `C1` applies immediately and shows only visible cards in `C1` linked to `P`.
11. While selected, People pill label renders `People: <Selected Name>`; after clear, label resets to `People`.
12. With stale lens active and scope set to Center or Periphery, result preserves selected scope and does not default to All.
13. With stale lens active, selecting person `P` yields only cards in the stale-at-entry set that also satisfy current scope and are linked to `P`.
14. Clearing people filter restores stale+scope view (if stale lens is still active) or normal active-context+scope view (if stale lens is inactive).
15. Switching from context `C1` to `C2` with person filter `P` active recomputes results for `C2` and keeps `P` selected.
16. Hidden cards linked to `P` do not appear in people-filtered canvas results.
17. If no visible cards match selected person in active context, deterministic empty state is shown.
18. After app restart, People filter is unselected and pill label is `People`.
19. Activity Log popup and People popup are mutually exclusive; opening one closes the other.
20. If People popup is open for card `A` and People is clicked on card `B`, the single People popup retargets to card `B`.

---

## 8) Dependencies and sequencing notes
1. Implement person entity persistence and normalization/uniqueness validation first.
2. Add card-person ID association read/write next.
3. Add card UI affordance for add/remove/view.
4. Add single-select people filter and composition logic with stale lens/context.
5. Validate with context switching, hidden cards, stale-lens intersection scenarios.

---

## 9) Backward compatibility / migration notes
1. Existing cards without people associations remain valid (`person_ids = []`).
2. No canvas position/state migration required.
3. Existing stale-lens and context behaviors remain unchanged except deterministic intersection when people filter is active.

---

## 10) Explicit out-of-scope follow-ups
1. Multi-select people filtering (ANY/ALL).
2. People-first panel/index and counts UI.
3. Person merge tooling for true same-name distinct individuals.
4. External contact syncing/import.

---

## 11) Open questions
None blocking for this baseline.

---

## Assumptions register
1. **Low-impact:** If person deletion UI is absent today, this initiative does not add it.

---

## Spec decisions (locked)
1. Identity model: workspace person entities with stable IDs.
2. Name uniqueness: case-insensitive exact uniqueness after trim + whitespace normalization.
3. Filter scope: active context only.
4. Filter composition with stale lens: intersection semantics.
5. Hidden card policy under people filter: exclude hidden cards.
6. People filter placement: top chrome filter-row pill.
7. Card mapping affordance: bottom-left `people icon + count` indicator.
8. Card indicator click opens people management UI (not the three-dot drawer).
9. People management supports autocomplete and inline create (`Create "<name>"`) with create+attach in one action.
10. Top-chrome People filter pill opens searchable popover list with immediate-apply selection and a `Clear filter` action.
11. People list in filter popover is ordered alphabetically (case-insensitive), tie-break by person ID.
12. Chrome filters are strict AND/intersection filters; Stale must preserve All/Center/Periphery selection and must not force All.
13. While Stale is active, scope changes (All/Center/Periphery) recompute results immediately against the existing stale snapshot and do not refresh stale membership.
14. Active people pill label is `People: <Selected Name>`; cleared state label is `People`.
15. People filter selection is session-scoped and resets on app restart.
16. Card people management uses the same popup interaction pattern as Activity Log.
17. Activity Log popup and People popup are mutually exclusive; opening one closes the other.
18. People management uses a single-popup-instance model; clicking People on a different card retargets the popup to that card.
