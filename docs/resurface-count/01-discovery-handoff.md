# Discovery Handoff — resurface-count

## 1. Initiative Summary
Improve Chrome-level discoverability of resurfaced hidden cards by exposing both:
- total hidden count, and
- resurfaced-ready count (subset)
inside the existing Hidden control, without requiring opening Hidden tray.

## 2. Problem / Opportunity Statement
Today, the Hidden button communicates only total hidden count. Users cannot see resurfaced-ready workload until they open Hidden.

Decision-grade framing:
- Actor: Orbit desktop user
- Context: Chrome Hidden control
- Failure mode: actionable resurfaced cards are not visible-at-a-glance
- Impact: delayed pickup of resurfaced cards, reduced intuitiveness
- Desired outcome: immediate awareness of resurfaced-ready cards while preserving total hidden visibility

## 3. Goals and Non-Goals
### Goals
1. Show both counts in the same Hidden control:
   - `hidden_total` (includes resurfaced)
   - `resurfaced_count` (subset)
2. Keep presentation concise and quickly scannable.
3. Maintain consistent interpretation across states (including zero states).
4. Ensure counts refresh on foreground and on state transitions (e.g., drag hidden/resurfaced card to canvas).

### Non-Goals
1. No separate resurfaced tab/shelf in Chrome.
2. No change to resurfacing semantics (tray-first, no system canvas placement).
3. No deep redesign of Hidden tray contents/interaction model.

## 4. Constraints and Assumptions
### Constraints (confirmed)
1. Both counts must be represented in the same Hidden control.
2. `hidden_total` must continue to include resurfaced cards.
3. Desktop-first surface.

### Assumptions
1. Chrome has room for one compact dual-count token but not verbose copy.
2. Hover is available (desktop) for explanatory details.
3. Foreground-trigger refresh path can be extended/reused for these count updates.

## 5. Options Considered
### Option A — Always-visible dual numeric token + hover detail (recommended)
- Example label patterns:
  - `Hidden 12 · 3↑`
  - `H 12 | R 3`
  - `12 (R3)`
- Hover tooltip clarifies semantics:
  - `Resurfaced: 3`
  - `Total hidden: 12`
- Always render both metrics (including zeros).

### Option B — Primary total only; resurfaced badge shown only when `resurfaced_count > 0`
- Example: `Hidden 12` and conditional badge `Resurfaced 3`.
- Reduces noise in zero-state.

### Option C — Single compressed composite count without labels
- Example: `12/3` (interpreted as hidden/resurfaced).
- Minimal space, but relies on learned semantics; tooltip needed for comprehension.

## 6. Tradeoff Analysis
| Dimension | Option A | Option B | Option C |
|---|---|---|---|
| Immediate awareness of resurfaced | Strong (always) | Medium (absent when 0; state shifts) | Medium-strong (always but cryptic) |
| Consistency | Strong (stable shape) | Medium (UI shape changes with state) | Strong (stable shape) |
| Cognitive clarity | Strong with labels/tooltip | Strong when visible, weaker when absent | Weak-medium; encoding ambiguity |
| Visual noise | Medium | Low-medium | Low |
| Implementation risk | Low-medium | Low | Low-medium |
| Learning/education | Strong (tooltip + constant exposure) | Medium | Weak-medium |

Key tradeoff:
- Option A sacrifices some compactness for best discoverability and consistency.
- Option B is cleaner but less explicit and less educative.
- Option C is compact but risks interpretation errors.

## 7. Chosen Direction (with rationale)
Choose **Option A: always-visible dual counts with hover detail**.

Rationale driven by rubric:
- User impact: highest immediate awareness of actionable resurfaced cards.
- Strategic alignment: fits current tray-first resurfacing model and Chrome ownership.
- Dependency risk: low; count derivation uses existing hidden + resurfaced states.
- Reversibility: high; token format/copy can be iterated without behavior model changes.
- Effort: S-M (UI token + tooltip + count refresh wiring).
- Learning value: high; telemetry/usability can evaluate comprehension quickly.

## 8. Initiative Breakdown (candidate slices)
### Slice 1 — Count model contract
- Define count fields for Chrome Hidden control:
  - `hidden_total`
  - `resurfaced_count`
- Enforce invariant: `0 <= resurfaced_count <= hidden_total`

### Slice 2 — Chrome rendering
- Render dual-count token in Hidden control.
- Render hover tooltip with explicit wording.
- Define zero-state display rules (default: always show both counts).

### Slice 3 — Refresh semantics
- Update counts on foreground trigger refresh.
- Update counts after card transitions that change hidden/resurfaced membership:
  - hidden/resurfaced card moved to canvas
  - hide/unhide actions
  - snooze due-state transitions when surfaced in Hidden tray model

### Slice 4 — Verification
- Unit/state tests for count invariants and transitions.
- UI tests for token display and tooltip content across key states.

## 9. Success Signals and Risks
### Success signals
1. Users can state resurfaced-ready count without opening Hidden tray.
2. Reduced lag between resurfacing and user re-engagement (behavioral metric if available).
3. Fewer “missed resurfaced” reports in qualitative feedback.

### Risks
1. Token may feel crowded in Chrome.
2. Encodings could be misread if too terse.
3. Refresh drift could cause stale counts if not wired to all transitions.

## 10. Sequencing Recommendation (now/next/later)
### Now
- Finalize dual-count token format and tooltip copy.
- Implement always-visible dual counts and refresh wiring.

### Next
- Add/expand UI tests for edge states and transitions.
- Validate comprehension through quick dogfooding.

### Later
- Iterate token style if readability issues emerge.
- Consider adaptive compaction only if Chrome space proves constrained.

## 11. Open Questions / Unknowns
1. Final token syntax choice among concise variants (e.g., `12 · 3↑` vs `H12 R3`).
2. Exact tooltip copy tone and wording consistency with existing Chrome vocabulary.
3. Whether to keep always-visible zeros long-term after user habituation.

## 12. Handoff Notes for Specification Phase
1. Preserve canonical behavior from `docs/00-current-state.md`:
   - resurfaced remains represented in Hidden tray
   - no auto-placement on canvas
2. Specify authoritative event list that must trigger count recompute.
3. Include invariant checks and transition-table tests to prevent count drift.
4. Include desktop hover behavior and non-hover fallback behavior definition.
5. Ensure updates are deterministic on foreground resume, consistent with recent touched-visibility refresh pattern.
