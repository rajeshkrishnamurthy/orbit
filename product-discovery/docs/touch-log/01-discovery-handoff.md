# Discovery Handoff: Touch → Log Capture Flow

## 1. Initiative Summary
Improve same-day activity capture quality by reducing drop-off between `Touch` and `Log activity` actions on a card.

- **initiative_slug:** `touch-log`
- **Planning horizon:** 1 release cycle for baseline behavior, 1 follow-up cycle for tuning
- **Decision status:** Proposed and ready for specification with noted open questions

## 2. Problem / Opportunity Statement
Orbit currently requires two separate user actions to record work context on a card:
1) tap `Touch` (once per card per local day), then 2) open and submit `Log activity`.

In practice, users frequently complete step 1 and skip step 2. This creates an avoidable loss of useful card history for activity that did occur today.

Opportunity: preserve Orbit’s explicit semantics while introducing a low-friction post-touch capture flow that increases log completion when intent is strongest (immediately after touch).

## 3. Goals and Non-Goals
### Goals
1. Increase same-session log capture rate after a user touches a card.
2. Reduce loss of meaningful daily activity notes caused by second-action drop-off.
3. Preserve Orbit semantics: `Touch` remains explicit and independent (not inferred, not auto-writing log entries).
4. Keep interruption cost low (fast dismiss path).

### Non-Goals
1. Not redefining `Touch` to imply or require log existence.
2. Not adding edit/search/full-history browsing UI for logs in this initiative.
3. Not changing active/stale derivation rules.
4. Not introducing system-inferred touches.

## 4. Constraints and Assumptions
### Constraints (known)
- From canonical current state:
  - `Touch` is explicit user action only; never inferred by system.
  - One effective touch per card per local day.
  - Log entries are short (max 140 chars).
  - Touch and log are currently separate actions.
- Orbit philosophy must be preserved (no silent semantic drift).
- Any prompt must be easily dismissible and not block normal flow.

### Assumptions (to confirm)
- Users are more likely to log activity immediately after touch than later in-session.
- A lightweight prompt/composer will improve completion without unacceptable annoyance.
- Missed logs are materially harmful for recall and decision quality.

## 5. Options Considered
### Option A — Keep current separation (no post-touch assist)
No UX change. Users continue to manually invoke log after touch.

### Option B — Auto-open existing Log Activity pop-up after touch (recommended)
After successful touch, auto-open the **existing** Log Activity pop-up with current behavior unchanged (same dismissal via `Esc` / click-away, same entry constraints). Touch still commits independently.

### Option C — Mandatory log-on-touch gate
After touch, require either log submission or explicit “skip reason” before continuing.

### Option D — User preference mode switch
Default stays as-is, but add optional setting: “Auto-open log after touch.”

## 6. Tradeoff Analysis
| Dimension | Option A | Option B | Option C | Option D |
|---|---|---|---|---|
| User/customer impact | Low | High | Medium-High | Medium |
| Strategic alignment | Medium | High | Medium | Medium-High |
| Dependency risk | Low | Medium | Medium | Medium |
| Uncertainty | Low | Medium | Medium-High | Medium |
| Reversibility | High | High | Medium | High |
| Effort band | S | M | M | M |
| Learning value | Low | High | Medium | Medium |

Key tradeoffs:
- **A** preserves simplicity but does not address known capture loss.
- **B** targets the exact drop-off moment with low friction and keeps semantics intact.
- **C** may improve capture more aggressively but risks frustration and over-enforcement.
- **D** respects personalization but may underperform due to discoverability/default inertia.

## 7. Chosen Direction (with rationale)
### Recommended: Option B — Auto-open existing Log Activity pop-up after touch

Rationale:
- Best fit to problem mechanism (second-action drop-off right after touch).
- Aligns with Orbit rules: touch remains explicit, no automatic log creation.
- Low-friction dismissal path makes interruption cost acceptable.
- Strong learning value: provides measurable signal on conversion and annoyance before any stronger enforcement.

Rubric drivers: **user impact**, **strategic alignment**, **reversibility**, and **learning value**.

## 8. Initiative Breakdown (modules/features or candidate slices)
### Slice 1 — Baseline post-touch auto-open behavior
- Trigger the existing Log Activity pop-up after successful touch.
- Preserve independent touch commit.
- Keep current pop-up behavior unchanged, including immediate dismiss (`Esc` / click-away).

### Slice 2 — Interaction safeguards
- Prevent duplicate/open-state conflicts when touch triggers auto-open.
- Define behavior when touch action is idempotent (already touched today).
- Preserve existing keyboard/mouse behavior of the current pop-up.

### Slice 3 — Outcome instrumentation
- Track touch→log same-session conversion.
- Track prompt dismissal rate.
- Track median time-to-log after touch.

### Slice 4 — Optional preference exploration (if needed)
- Evaluate need for per-user toggle if annoyance or mixed preference appears.

## 9. Success Signals and Risks
### Success signals
1. Relative increase in same-session log completion after touch (target threshold to be set in spec).
2. Reduction in touched-without-log cases for cards with meaningful daily activity.
3. Prompt dismissal rate remains within acceptable threshold.
4. No semantic regressions: touch behavior remains explicit and once/day.

### Risks
1. Prompt fatigue for users who touch for triage-only workflows.
2. False coupling perception (“touch means log required”) if UX copy is unclear.
3. Potential friction from unexpected modal behavior in fast workflows.
4. Measurement blind spots if instrumentation is incomplete.

## 10. Sequencing Recommendation (now/next/later)
### Now
- Specify and implement Option B baseline flow (auto-open current pop-up only).
- Add instrumentation for conversion/dismissal outcomes.

### Next
- Tune prompt presentation/copy and trigger conditions using observed data.
- Decide whether preference toggle is needed.

### Later
- Consider more advanced capture aids (templates, suggested snippets) only if baseline benefit is proven.

## 11. Open Questions / Unknowns
1. Should auto-open trigger only on first successful daily touch (likely), and what is expected behavior on repeated taps when already touched?
2. What dismissal/annoyance thresholds define unacceptable interruption?
3. What minimum success threshold justifies keeping this as default behavior?
4. Should there be a user-level setting at initial release or only after baseline measurement?

## 12. Handoff Notes for Specification Phase
Specification phase should produce:
1. Exact interaction contract for touch success vs already-touched states.
2. UI behavior contract for reusing the existing Log Activity pop-up, including unchanged dismissal and keyboard handling.
3. Copy guidelines that avoid semantic conflation between touch and log.
4. Telemetry contract: events, properties, and success metrics.
5. Acceptance criteria covering conversion gains, friction bounds, and semantic invariants.

---

## Fact / Assumption / Recommendation Traceability
### Facts
- Touch and log are separate actions in current Orbit behavior.
- Touch is explicit and once per card per local day.
- Log entries are short and user-authored (140-char max).

### Assumptions
- Two-step interaction is causing meaningful logging drop-off.
- Immediate post-touch context is the highest-likelihood capture moment.

### Recommendations
- Implement post-touch auto-open of the existing Log Activity pop-up as default baseline.
- Keep touch semantics unchanged and make dismissal trivial.
- Measure outcomes before considering stronger enforcement or expanded scope.
