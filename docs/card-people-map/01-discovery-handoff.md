# Card People Map — Discovery Handoff

## 1) Initiative Summary
Orbit needs a people-to-card mapping capability so users can associate one or more people to each card and quickly filter the canvas to cards linked to a selected person.

This is intentionally scoped as a mapping + filtering initiative only.

## 2) Problem / Opportunity Statement
Power users execute work through conversations with people. In Orbit, cards currently do not provide a clear people mapping surface, so users must manually scan and mentally reconstruct which people are linked to which cards.

This creates avoidable cognitive overhead and increases the chance of incomplete review when deciding what to discuss with a given person.

Desired outcome: from a selected person, Orbit can reliably and quickly surface all cards associated with that person; from a card, users can clearly see/manage associated people.

## 3) Goals and Non-Goals
### Goals
- Support associating **0..N people** to a card.
- Make associated people visible at card level.
- Provide a people filter that narrows current card view to cards associated with selected person(s).
- Keep interaction model consistent with existing explicit filters (e.g., stale lens pattern).

### Non-Goals
- Meeting workflow orchestration, prep flows, or recall coaching.
- CRM/contact sync or external directory integration.
- Ownership/assignee semantics enforcement.
- Designing full people profile pages or social graph features.

## 4) Constraints and Assumptions
### Constraints
- Must respect current Orbit territory rules from `docs/00-current-state.md` (no system-driven canvas mutation).
- Must coexist with current context model and stale lens behavior.
- Scope should remain lightweight and reversible.

### Assumptions
- All Orbit users are power users.
- Person linkage is user-authored metadata on cards.
- Initiative is desktop-first product surface (web used for verification).

## 5) Options Considered
### Option A — Single-select people filter + per-card multi-person tags (baseline)
- Add people field on card (multi-value).
- Add a people filter control; selecting one person shows only cards linked to that person.

### Option B — Multi-select intersection/union filter
- Same card-level mapping as Option A.
- Filter supports selecting multiple people with explicit mode (ANY/ALL).

### Option C — Dedicated people panel (people-first index)
- Side panel listing people; selecting person filters cards.
- May include counts per person for faster scanning.

## 6) Tradeoff Analysis
- **User impact:**
  - A: High immediate value, smallest behavior change.
  - B: Potentially higher power-user value, but adds mode complexity.
  - C: Strong discoverability, but introduces additional chrome and UI surface area.
- **Dependency risk:**
  - A: Low.
  - B: Medium (state model complexity for filter logic).
  - C: Medium-High (new panel interactions and density decisions).
- **Uncertainty:**
  - A: Low.
  - B: Medium (ANY/ALL mental model ambiguity).
  - C: Medium (panel ergonomics and context-strip coexistence).
- **Reversibility:**
  - A: High.
  - B: Medium.
  - C: Medium.
- **Effort band (rough):**
  - A: S-M
  - B: M
  - C: M-L
- **Learning value:**
  - A: High (validates core mapping demand quickly).
  - B: Medium-High.
  - C: Medium.

## 7) Chosen Direction (with rationale)
### Recommended: Option A now, with deliberate extension path toward B
Choose single-select people filter plus per-card multi-person association first.

Rationale (rubric-driven):
- Maximizes near-term user impact with minimal additional cognitive load.
- Lowest dependency risk and uncertainty for first release.
- Highly reversible and extensible if multi-select proves necessary.
- Preserves scope discipline around “mapping + filtering only.”

## 8) Initiative Breakdown (candidate slices)
1. **People Data Model Slice**
   - Define person entity reference and card-person association (0..N).
2. **Card Surface Slice**
   - Add clear card-level display/edit affordance for associated people.
3. **People Filter Slice**
   - Add filter control to show only cards linked to selected person.
4. **Filter Interaction Rules Slice**
   - Define deterministic behavior with existing filters/lenses and context switching.
5. **Validation Slice**
   - Verify mapping accuracy and filter correctness in representative workflows.

## 9) Success Signals and Risks
### Success signals
- User can associate people to a card with low friction.
- Selecting a person filters view to that person’s associated cards with high correctness.
- Manual scan/mental mapping burden is visibly reduced in normal usage.

### Risks
- Person identity ambiguity (duplicate names, renames).
- Filter interaction ambiguity with existing stale lens and context boundaries.
- Overloading chrome if filter discoverability and compactness are not balanced.

## 10) Sequencing Recommendation (now/next/later)
### Now
- Deliver Option A baseline: multi-person card mapping + single-select people filter.

### Next
- Evaluate need for multi-select filter (ANY/ALL) based on real usage.

### Later
- Optional people panel/index only if discoverability remains insufficient after baseline.

## 11) Open Questions / Unknowns
1. **Identity canonicalization (High):** How to prevent duplicate person entries representing the same individual?
2. **Filter composition rules (High):** How people filter composes with stale lens and context-specific views.
3. **Scope of filtering (Medium):** Should people filter operate within active context only or across contexts when applicable?
4. **Hidden cards policy (Medium):** Whether people-filtered results include/exclude hidden cards in visible canvas view (likely exclude, consistent with current visible-card semantics).
5. **Display density (Low):** Card-level person chips/tokens count before truncation.

## 12) Handoff Notes for Specification Phase
Specification should lock:
- Card-person data contract and identity rules.
- Filter state contract and composition matrix with existing lenses/contexts.
- UX behavior for create/select person, edit/remove person linkage, and empty states.
- Deterministic acceptance criteria for mapping correctness and filter correctness.

Do not expand scope into meeting orchestration or external contact-system integration in this phase.
