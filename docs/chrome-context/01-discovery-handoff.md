# Chrome Context — Discovery Handoff

## 1) Initiative Summary
Create a chrome-level context visibility strip in the center-top area so users can, from any canvas, see per-context count-only status and jump to another context in one click.

This iteration is strictly visibility + one-click switching. Context canvas remains in place and unchanged as a destination surface.

---

## 2) Problem / Opportunity Statement
### Actor
Multi-context Orbit users (expected majority of users).

### Context
Daily review and in-session context switching.

### Current failure mode
- Users must navigate back to context canvas before switching.
- Users cannot see cross-context workload/staleness at a glance.
- Result: missed cards, extra navigation, and reduced trust in Orbit’s core promise of instant visibility.

### Desired outcome (problem terms)
From any canvas, users can immediately understand where attention is needed across contexts and move to the needed context in one click.

---

## 3) Goals and Non-Goals
### Goals
1. Cross-context at-a-glance visibility from any canvas.
2. Per-context count-only indicators:
   - visible canvas card count
   - stale card count
3. One-click jump to target context.
4. Fit within center-top chrome area with practical capacity (~8 contexts visible).

### Non-Goals (this iteration)
1. No change to context canvas semantics.
2. No context creation/edit/delete flows in this version.
3. No stale severity tiers, ratios, or advanced analytics.
4. No changes to card semantics, stale derivation rules, hidden behavior, or touch model.
5. No automatic context prioritization/re-ordering logic beyond basic display rules.

---

## 4) Constraints and Assumptions
## Constraints (confirmed)
1. UI surface: center-top chrome.
2. Space is bounded; context pills/buttons must compress to fit.
3. Target display budget: approximately 8 contexts within current layout boundaries.
4. Visibility and switching are equally important success dimensions.

## Decisions frozen for specification intake
1. Count model is count-only (no percentages, severity tiers, or heat states).
2. Per-context value pair is: `visible_count / stale_count`.
3. `visible_count` excludes hidden cards and follows existing context-canvas membership behavior.
4. One-click switch behavior reuses existing context-entry semantics (no new navigation model).
5. Capacity rule: show up to 8 context entries in the strip; when exceeded, use deterministic overflow behavior.

---

## 5) Options Considered
### Option A — Compact Pill Strip (recommended)
A horizontal row of context pills in chrome center-top. Each pill shows context label + two counts (visible, stale). Clicking pill switches context.

### Option B — Summary Trigger + Dropdown List
A compact chrome trigger opens a dropdown listing all contexts with counts and switch actions.

### Option C — Hybrid: Top N Pills + Overflow Entry
Show highest-priority/fixed-order contexts as pills (up to layout capacity) plus an overflow entry for remaining contexts.

---

## 6) Tradeoff Analysis
### Option A — Compact Pill Strip
- **Impact:** High immediate scanability; best “always visible” behavior.
- **Strategic alignment:** Strongly matches Orbit’s instant visibility promise.
- **Dependency risk:** Medium (tight layout/fit constraints).
- **Uncertainty:** Medium (readability with long names and many contexts).
- **Reversibility:** High (presentation-layer choice can evolve).
- **Effort (rough):** M.
- **Learning value:** High (reveals true usage patterns for count visibility and switching).

### Option B — Summary Trigger + Dropdown
- **Impact:** Medium; visibility becomes one interaction away.
- **Strategic alignment:** Weaker against “at a glance.”
- **Dependency risk:** Low-medium.
- **Uncertainty:** Low.
- **Reversibility:** High.
- **Effort (rough):** S-M.
- **Learning value:** Medium.

### Option C — Hybrid
- **Impact:** High for frequent contexts, medium for tail contexts.
- **Strategic alignment:** Strong, with graceful scaling.
- **Dependency risk:** Medium-high (needs ordering/overflow rules).
- **Uncertainty:** Medium-high.
- **Reversibility:** Medium.
- **Effort (rough):** M-L.
- **Learning value:** High.

---

## 7) Chosen Direction (with rationale)
Choose **Option A (Compact Pill Strip)** for v1.

### Why
Decision driven primarily by:
1. **User impact:** maximizes immediate cross-context visibility without extra interaction.
2. **Strategic alignment:** directly supports Orbit’s core promise of instant visibility.
3. **Learning value:** fastest way to test whether visible stale/total counts influence review/switch behavior.
4. **Reversibility:** low lock-in; can evolve to Hybrid (Option C) if overflow pressure is high.

### Explicit tradeoff accepted
Higher layout pressure and tighter label space are accepted in exchange for maximum glanceability.

---

## 8) Initiative Breakdown (candidate slices)
1. **Count Data Surface**
   - Define per-context count contract: visible total + stale total.
   - Ensure counts respect canonical hidden/stale semantics.

2. **Chrome Context Strip UI**
   - Render center-top context pills with count pairs.
   - Handle compact spacing and truncation rules.

3. **One-Click Context Switching**
   - Pill click navigates to target context canvas with current semantics.

4. **Overflow/Capacity Guardrails (minimum)**
   - Establish fallback when contexts exceed visible capacity (exact mechanism to finalize in spec).

5. **Validation Instrumentation/Signals**
   - Capture switching friction and visibility usage metrics for post-release learning.

---

## 9) Success Signals and Risks
### Success signals
1. Users can identify per-context visible + stale counts without leaving current canvas.
2. Context switch path is one click from current canvas.
3. Increased cross-context switching during daily review sessions.
4. Reduced reports of “missed cards due to low visibility.”

### Key risks
1. **Space/readability risk:** long context names reduce scanability.
2. **Overflow risk:** >8 contexts may degrade utility if fallback is weak.
3. **Count trust risk:** any mismatch with expected hidden/stale semantics undermines confidence.
4. **Visual noise risk:** dense chrome may distract from canvas.

---

## 10) Sequencing Recommendation (now/next/later)
### Now (this initiative)
- Deliver Option A baseline:
  - center-top context strip
  - count-only visibility (visible + stale)
  - one-click switching
  - practical fit for ~8 contexts

### Next
- Improve overflow handling and ordering strategy based on observed usage.
- Add lightweight context management entry points in chrome (if validated).

### Later
- Consider richer context controls (creation/editing/organization) once visibility baseline proves value.

---

## 11) Open Questions / Unknowns
## Resolved defaults (to remove ambiguity before spec)
1. **Overflow behavior (resolved):**
   - Show max 8 entries in strip space.
   - If total contexts > 8, render 7 context pills + 1 overflow entry (`+N`).
   - Overflow entry opens a compact list containing remaining contexts with the same `visible/stale` counts and one-click switch.
2. **Count pair display (resolved):** Use compact `visible/stale` format in each entry (example: `12/3`).
3. **Ordering (resolved):** active context first; remaining contexts alphabetical by context title.
4. **Label truncation (resolved):** single-line labels with ellipsis; preserve stable pill width behavior under compression.

## Remaining unknowns (spec-level)
1. **Medium:** Exact width tokens and truncation breakpoint values that preserve legibility across supported window sizes.
2. **Medium:** Keyboard interaction details for overflow list focus/selection behavior.

---

## 12) Handoff Notes for Specification Phase
1. Preserve canonical current-state semantics:
   - no system mutation of canvas placement
   - hidden cards excluded from active/stale classification while hidden
   - stale derivation unchanged
2. Specify exact count definitions with examples to avoid trust gaps.
3. Implement the frozen overflow/order/count-format defaults from Section 11 unless a stronger usability conflict is discovered.
4. Include accessibility and keyboard navigation expectations for chrome strip and overflow switching.
5. Include acceptance criteria that verify:
   - from any canvas, counts are visible
   - one-click switch works
   - counts stay consistent with canonical hidden/stale rules.
