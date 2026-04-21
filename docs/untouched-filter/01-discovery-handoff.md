# Untouched Filter — Discovery Handoff

## 1) Initiative Summary
Add an **Untouched** pill/filter next to **Stale** so users can instantly view cards that were **not effectively touched today** (local day) in the current context.

This is a filter-discovery improvement to remove full-canvas manual scanning.

## 2) Problem / Opportunity Statement
Users currently need to visually scan all visible cards to identify which cards have not been touched today. This is tedious and error-prone at higher card counts.

Orbit already supports a stale-focused lens, but users also need a broader operational view of cards that are untouched today (which includes non-stale cards).

Desired outcome: one-click visibility of untouched-today cards in the current context, without manual scan.

## 3) Goals and Non-Goals
### Goals
- Provide an **Untouched** filter/pill adjacent to existing stale filtering controls.
- Define untouched semantics as: **no effective touch on current local day**.
- Limit filtered results to **visible (non-hidden)** cards in the **active context**.
- Keep behavior deterministic and consistent with existing touch semantics.

### Non-Goals
- Redefining stale logic or stale thresholds.
- Cross-context untouched aggregation.
- Meeting workflow orchestration/prep flows.
- Changes to touch logging or activity log authoring UX.

## 4) Constraints and Assumptions
### Constraints
- Must align with canonical touch semantics in `docs/00-current-state.md`:
  - touch is explicit user action only
  - one effective touch per card per local day
- Hidden cards are excluded from active/stale classification while hidden; untouched filter should follow visible-card view behavior.
- Must coexist with current context model and existing stale lens/filter patterns.

### Assumptions
- Desktop is the end-user product surface.
- Users need at-a-glance operational filtering, not analytics/history views.

## 5) Options Considered
### Option A — Untouched pill as standalone filter (recommended baseline)
A simple Untouched pill that, when selected, shows cards not effectively touched today.

### Option B — Merge into stale control as a mode dropdown
Single control with mode switching (Stale / Untouched / All).

### Option C — No pill; only sort or visual marker
Use ordering/badges to hint untouched cards, without dedicated filter.

## 6) Tradeoff Analysis
- **User/customer impact**
  - A: High; fastest “find untouched now” behavior.
  - B: Medium; saves chrome space but adds interaction steps.
  - C: Low-Medium; still requires scanning, weaker than direct filtering.
- **Strategic alignment**
  - A: Strong alignment with Orbit’s explicit lens/filter interaction model.
  - B: Partial alignment; hidden state in mode switch is less glanceable.
  - C: Weak for stated problem.
- **Dependency risk / uncertainty**
  - A: Low.
  - B: Medium (mode-state complexity, discoverability risk).
  - C: Low engineering risk but high product miss risk.
- **Reversibility**
  - A: High.
  - B: Medium.
  - C: High.
- **Effort band (rough)**
  - A: S
  - B: S-M
  - C: S
- **Learning value**
  - A: High; validates core demand quickly.
  - B: Medium.
  - C: Low for true filter demand.

## 7) Chosen Direction (with rationale)
Choose **Option A**: a dedicated **Untouched** pill next to **Stale**.

Rationale:
- Maximizes direct user impact for the stated pain (manual scan removal).
- Lowest ambiguity and interaction overhead.
- Strongly reversible and compatible with existing filter mental model.

## 8) Initiative Breakdown (modules/features or candidate slices)
1. **Untouched Semantics Slice**
   - Lock untouched-today definition against local-day effective-touch rules.
2. **Filter Control Slice**
   - Add Untouched pill in chrome near Stale.
3. **Filtering Engine Slice**
   - Apply untouched predicate to visible cards in active context.
4. **Composition Rules Slice**
   - Define deterministic interaction with existing filters/lenses.
5. **Verification Slice**
   - Validate correctness at day boundaries and touch updates.

## 9) Success Signals and Risks
### Success Signals
- Users can identify untouched-today cards with one click.
- Time spent manual scanning for untouched cards materially drops.
- Filter results remain correct after touch actions and foreground resume.

### Risks
- Local-day boundary confusion (timezone/day rollover expectations).
- Potential ambiguity if multiple filters are active simultaneously.
- UI density pressure in chrome if more pills are added over time.

## 10) Sequencing Recommendation (now/next/later)
### Now
- Deliver dedicated Untouched pill with locked semantics and deterministic composition rules.

### Next
- Assess whether count badge/tooltip is needed for faster glanceability.

### Later
- Evaluate broader filter architecture only if additional filter families accumulate.

## 11) Open Questions / Unknowns
1. **Filter composition contract (Medium):** exact logical composition when Untouched is combined with other non-stale filters/lenses.
2. **Glance affordance (Low):** whether Untouched pill should include count and tooltip format.
3. **Naming token (Low):** confirm final label text is `Untouched` versus alternatives.

## 12) Handoff Notes for Specification Phase
Specification should lock:
- Exact untouched predicate tied to effective-touch/day semantics.
- Composition matrix with existing filters/lenses and context boundaries.
- UX states: default, active, empty-result state, and transitions after touch events.
- Acceptance criteria around day rollover and foreground-resume refresh behavior.

Do not expand this initiative into stale-rule changes, meeting flows, or cross-context analytics.
