# Orbit Test Contract (Desktop)

This document defines concrete test cases derived from current code behavior.

## Backend/API Cases

### B1 - Create card persists
- Given: an existing context id (for example `main-orbit`) and no item with id `t_item_1`
- When: `POST /api/items` is called with `id`, `contextId`, `title`, `subNote`, `x`, `y`, `color`
- Then: response is `200` with `{"ok":true}`
- Assertions:
  - `items` table contains `id=t_item_1`
  - persisted `context_id`, `title`, `sub_note`, `x`, `y`, `color` match payload

### B2 - Card delete removes from system
- Given: a persisted item `t_item_2`
- When: `POST /api/items/delete` with `{"id":"t_item_2"}`
- Then: response is `200` with `{"ok":true}`
- Assertions:
  - `items` table has zero rows for `id=t_item_2`

### B3 - Context delete cascades associated cards
- Given: a context `t_ctx_1` and two items with `context_id=t_ctx_1`
- When: `POST /api/contexts/delete` with `{"id":"t_ctx_1"}`
- Then: response is `200` with `{"ok":true}`
- Assertions:
  - `contexts` table has zero rows for `id=t_ctx_1`
  - `items` table has zero rows with `context_id=t_ctx_1`

### B4 - Main context cannot be deleted
- Given: `main-orbit` exists
- When: `POST /api/contexts/delete` with `{"id":"main-orbit"}`
- Then: response is `400`
- Assertions:
  - response body contains `cannot delete Main Orbit`
  - `contexts` still contains `main-orbit`

### B5 - Partial context update preserves coordinates
- Given: `main-orbit` with known `x=560,y=320`
- When: `POST /api/contexts` with only `{"id":"main-orbit","title":"Renamed"}` (no `x`,`y`)
- Then: response is `200`
- Assertions:
  - `contexts.title` becomes `Renamed`
  - `contexts.x` and `contexts.y` remain unchanged

### B6 - Hide marks hidden and hidden count increments
- Given: visible item `t_item_3` in `main-orbit`
- When: `POST /api/items/hide` with `{"id":"t_item_3","contextId":"main-orbit"}`
- Then: response is `200`
- Assertions:
  - response JSON `hiddenCount` reflects DB count of `hidden=1` in `main-orbit`
  - item row has `hidden=1`

### B7 - Unhide-at restores visibility at drop position
- Given: hidden item `t_item_4` in `main-orbit`
- When: `POST /api/items/unhide-at` with `id/contextId/x/y`
- Then: response is `200`
- Assertions:
  - item row has `hidden=0`
  - item `x`,`y` equal payload values

### B8 - Reveal-all returns and clears hidden set
- Given: at least two hidden items in `main-orbit`
- When: `POST /api/items/reveal-all` with `{"contextId":"main-orbit"}`
- Then: response is `200` with JSON list of revealed items
- Assertions:
  - response `hiddenCount=0`
  - DB count of `hidden=1` for that context is `0`

### B9 - Data survives restart without reseed overwrite
- Given: DB has edited card title and non-seed card id
- When: app/store is restarted against same DB path
- Then: existing values remain
- Assertions:
  - edited title unchanged after restart
  - non-seed card still exists

### B10 - Missing DB with initialized marker does not reset
- Given: `.orbit_initialized` exists and `orbit.db` is missing
- When: store initialization runs
- Then: initialization fails
- Assertions:
  - error contains `orbit.db missing after initialization`
  - no implicit reseed is performed

## Frontend/UI Cases

### F1 - Add new card on empty canvas click
- Given: focus canvas loaded
- When: user clicks empty surface
- Then: one new unsaved card appears with focus in title input
- Assertions:
  - card element count increases by 1
  - new card has non-empty generated `data-id`

### F2 - Drag/drop persists bounded position
- Given: existing saved card near center
- When: user drags card beyond surface edges and releases
- Then: card snaps within min/max bounds and is persisted
- Assertions:
  - rendered `left/top` are within clamp range
  - subsequent reload shows same persisted position

### F3 - Lens and slider behavior
- Given: cards in both center and periphery areas
- When: user switches `Center` and `Periphery` lens and adjusts slider
- Then: card visibility set changes according to cutoff radius
- Assertions:
  - in `Center`, at least one peripheral card is hidden
  - in `Periphery`, at least one center card is hidden
  - changing slider alters boundary and visible set

### F4 - Card color change
- Given: a selected card
- When: user clicks a swatch in toolbar
- Then: card background and readable text/icon colors update
- Assertions:
  - `data-color` changes to selected swatch
  - save request is issued for that card

### F5 - Hidden tray count correctness
- Given: focus canvas with N visible cards and hidden tray closed
- When: user hides one card, then unhides it by drop
- Then: count increments and decrements accurately
- Assertions:
  - button label `Hidden (k)` equals backend hidden count after each action
  - tray list length equals hidden count when opened

### F6 - Context delete requires confirmation
- Given: contexts canvas with deletable context card
- When: user clicks delete
- Then: in-canvas confirmation appears
- Assertions:
  - cancel keeps context card present
  - confirm removes context card and reloads contexts canvas

### F7 - Enter context navigates to associated canvas
- Given: contexts canvas with context card `ctxA`
- When: user clicks enter (`→`)
- Then: browser location changes to `/?ctx=ctxA`
- Assertions:
  - focus canvas header shows `ctxA` title
  - items shown belong to `ctxA`

### F8 - Context title editable in focus view
- Given: focus canvas open and context name visible
- When: user edits context name and blurs field
- Then: title update request is sent and persisted
- Assertions:
  - `POST /api/contexts` contains `id` and new `title`
  - reload shows updated title

### F9 - Card height adjusts with note length
- Given: selected card with one-line sub-note
- When: user extends note to two lines
- Then: textarea height increases within clamp
- Assertions:
  - single-line computed height is lower than two-line height
  - height stays in configured range (18px to 36px)

### F10 - Center/periphery style scaling
- Given: one card in center band and one in periphery band
- When: `applyDistanceStyle` runs
- Then: center card has larger scale and font sizes
- Assertions:
  - center transform scale > periphery scale
  - center title/body font sizes > periphery sizes

## Suggested Execution Order

1. B5, B3, B9, B10 (data safety first)
2. B6, B7, B8, F5 (hidden-card reliability)
3. B1, B2, F1, F2, F4 (core edit workflows)
4. F6, F7, F8, F3, F9, F10 (interaction and visual behavior)

## Mutation Testing

- Run `npm run test:mutation` for a full mutation pass on the Go package.
- Run `npm run test:mutation:html` to generate `go-mutesting-report.html`.
- Use targeted runs while adding tests:
  - `go run github.com/avito-tech/go-mutesting/cmd/go-mutesting@latest --exec-timeout 20 --match '<regex>' .`
