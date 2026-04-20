# Chrome Context — 02 Feature Spec

Status: draft-for-approval  
Initiative slug: `chrome-context`  
Mode: `initiative-wide`  
Source: `docs/chrome-context/01-discovery-handoff.md` + `docs/00-current-state.md`

---

## 1) Spec summary

Deliver a center-top chrome context strip that is visible from any context canvas and shows per-context count-only status in compact `visible/stale` format. Users can switch context in one click from strip entries.

V1 includes deterministic overflow handling:
- show up to 8 entries total in strip
- if total contexts > 8: show 7 context pills + 1 overflow entry (`+N`)
- overflow entry opens a compact pointer-driven list of remaining contexts with same count format and one-click switching

V1 excludes keyboard interaction for overflow list.

---

## 2) Scope / non-scope

### In scope
1. Center-top chrome strip rendering on context canvases.
2. Per-context count pair display: `visible_count/stale_count`.
3. Deterministic ordering: active context first, remaining contexts alphabetical by context title.
4. One-click context switching from pills and overflow list entries.
5. Overflow behavior for >8 contexts using `+N` entry and compact list.
6. Single-line label truncation with ellipsis and stable width behavior under compression.

### Out of scope (V1)
1. Context creation/edit/delete flows.
2. Any changes to context/canvas semantics.
3. Any changes to card semantics, touch model, hidden behavior, stale derivation.
4. Severity tiers, ratios, heat states, analytics-driven prioritization.
5. Automatic re-ordering beyond active-first + alphabetical.
6. Keyboard support for overflow list interaction.

---

## 3) Inputs and invariants

### Inputs
1. Context set visible to the current user session.
2. For each context, card state needed to derive:
   - visible count (context canvas members not hidden)
   - stale count (cards currently stale under canonical stale rules)
3. Current active context id/title.

### Invariants
1. Canonical territory law remains unchanged (system does not mutate canvas placement).
2. Hidden cards are excluded from active/stale classification while hidden.
3. Stale derivation formula and thresholds remain unchanged.
4. `stale_count` is computed from currently visible (non-hidden) cards only.
5. Count display is always count-only `visible/stale`.
6. Strip capacity invariant:
   - if total contexts <= 8: show all as pills
   - if total contexts > 8: show exactly 7 pills + `+N` entry where `N = total_contexts - 7`

---

## 4) Functional requirements (deterministic)

### FR-1: Strip visibility and placement
1. System renders context strip in center-top chrome region on context canvas views.
2. Strip remains visible while user is within context canvas views.

### FR-2: Entry content
1. Each pill shows:
   - context label (single line, truncation with ellipsis)
   - compact count text `visible/stale` (example `12/3`)
2. Counts are non-negative integers.

### FR-3: Count definitions
1. `visible_count(context)` = number of cards in the context canvas that are not hidden.
2. `stale_count(context)` = number of cards in that context where card is stale under canonical stale derivation and card is not hidden.
3. Because hidden cards are excluded from stale classification, hidden cards do not contribute to stale_count.

### FR-4: Ordering
1. Active context pill appears first.
2. Remaining contexts are ordered by ascending context title (case-insensitive alphabetical compare).
3. Ties resolve by stable secondary key `context_id` ascending to avoid reorder jitter.

### FR-5: Capacity and overflow
1. If total contexts <= 8, render one pill per context.
2. If total contexts > 8:
   - render first 7 contexts per FR-4 as pills
   - render final entry as overflow `+N` where `N = total_contexts - 7`
3. Overflow list contains all non-rendered contexts in same order as FR-4 remainder.
4. Each overflow list item shows label + `visible/stale` and supports one-click switch.

### FR-6: Switching behavior
1. Clicking any context pill switches to that context using existing context-entry semantics.
2. Clicking any overflow list item switches to that context using same semantics.
3. If clicked context is already active, behavior is a no-op navigation-wise (stay in place) and must not mutate canvas/card state.

### FR-7: Overflow interaction model (V1)
1. Overflow list is pointer-driven only.
2. No keyboard navigation/selection behavior is required in V1.
3. Closing behavior (outside click or selecting an item) must be deterministic and must not alter counts/state beyond navigation side effects.

### FR-8: Refresh consistency
1. Displayed counts must update when underlying context membership/hidden/stale state changes through existing app refresh/update paths.
2. Count updates must preserve invariants in Section 3.

---

## 5) UX/API/data behavior contract

### UX contract
1. Strip entries maintain stable visual structure under compression:
   - single-line label
   - ellipsis truncation
   - count remains visible in compact form
2. Active context is visually distinguishable from inactive contexts using existing chrome active-state styling conventions.
3. Overflow entry text format is `+N` only.

### Data contract
For each context entry, renderer consumes:
- `context_id: string`
- `context_title: string`
- `is_active: boolean`
- `visible_count: integer >= 0`
- `stale_count: integer >= 0`

For overflow state:
- `overflow_count: integer >= 1` when present
- `overflow_entries: ContextEntry[]` (same schema)

No changes to persisted card/context schema are required by this initiative.

---

## 6) Edge cases and failure handling

1. **0 contexts**: no strip entries rendered; chrome layout remains stable.
2. **1 context**: single pill shown with valid `visible/stale`.
3. **Long context names**: ellipsis truncation; no multi-line wrap.
4. **Exactly 8 contexts**: no overflow entry.
5. **9+ contexts**: `+N` entry rendered; overflow list contains all omitted contexts.
6. **Counts unavailable transiently** (e.g., async load): entry renders deterministic loading-safe placeholder policy defined by implementation, but must not display negative/invalid values and must settle to true counts once data resolves.
7. **Rapid context switches**: active-first ordering recomputes deterministically after each completed switch.
8. **Hidden/unhidden changes**: counts reflect canonical hidden exclusion semantics after refresh path completion.

---

## 7) Acceptance criteria (testable and observable)

1. From any context canvas view, center-top chrome shows context strip with per-entry `visible/stale` counts.
2. For a context with hidden cards, hidden cards are excluded from both `visible_count` and `stale_count`.
3. For >8 contexts, strip shows exactly 7 pills + `+N` where `N = total_contexts - 7`.
4. Clicking `+N` opens overflow list showing omitted contexts with same `visible/stale` format.
5. Clicking any pill or overflow item switches to that context in one click.
6. Active context appears first; remaining contexts appear alphabetical by title with stable tie-break.
7. With long labels, pill label truncates to single-line ellipsis and layout does not wrap entries to second line.
8. With exactly 8 contexts, no `+N` appears.
9. V1 provides no keyboard interaction requirement for overflow list (pointer interaction succeeds).
10. No action in strip/overflow mutates card placement or card semantics beyond context navigation.

---

## 8) Dependencies and sequencing notes

1. Depends on existing reliable derivation of per-context visible and stale counts under canonical rules.
2. Depends on existing context switch action semantics/router flow.
3. Sequencing recommendation:
   - A) count aggregation contract validation
   - B) strip rendering with ordering/capacity logic
   - C) overflow interaction and switch wiring
   - D) acceptance verification for count trust and overflow determinism

---

## 9) Backward compatibility / migration notes

1. No data migration required.
2. No contract changes to card model or stale/touch/hidden semantics.
3. Existing context navigation semantics are reused; this adds an additional entry point only.

---

## 10) Explicit out-of-scope follow-ups

1. Keyboard accessibility model for overflow list (deferred to next iteration).
2. Exact tokenized width/truncation breakpoint tuning across all window sizes.
3. Alternative overflow paradigms (hybrid ranking, dropdown-only, priority models).
4. Context management affordances in chrome (create/edit/delete/reorder).
5. Telemetry specification for visibility/switch behavior learning (if needed, separate spec).

---

## 11) Open questions

1. What exact width token values and truncation breakpoints should be standardized for supported window-size bands to preserve legibility while keeping count visibility?

---

## Assumptions Register

1. `low-impact` — Case-insensitive alphabetical sort is acceptable for context title ordering implementation detail.
2. `low-impact` — Stable tie-break by `context_id` is acceptable to prevent reorder jitter for identical titles.
3. `low-impact` — Loading-safe placeholder rendering is implementation-defined as long as invalid counts are not shown and final counts converge correctly.
