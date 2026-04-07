# Discovery Handoff — foreground-trigger

## 1) Initiative Summary
Introduce a foreground-resume driven refresh so time-sensitive card state (especially touched indicator correctness) updates when Orbit regains focus, without requiring app restart or canvas switch.

## 2) Problem / Opportunity Statement
Observed issue: cards can continue showing a touched-visible state even when the last touch was days ago, until either:
1. app restart, or
2. canvas switch away/back.

This creates stale UI truth and weakens trust in attention signals.

## 3) Goals and Non-Goals
### Goals
- Ensure touched visibility truth refreshes when app returns to foreground.
- Remove dependence on restart/canvas-switch for date/time-driven correctness.
- Keep behavior predictable and low-latency on resume.

### Non-Goals
- No broad redesign of touch semantics.
- No change to touch thresholds/derivation rules.
- No mandatory hourly always-on background scheduler in this first step.

## 4) Constraints and Assumptions
### Constraints (facts)
- Canonical product baseline is `docs/00-current-state.md`.
- Touch semantics are date-based and explicit user action only (`docs/00-current-state.md`, section 2.6).
- Lens and hidden semantics must remain unchanged (`docs/00-current-state.md`, sections 2.5, 2.7).

### Assumptions
- App lifecycle events are available to detect foreground resume across desktop targets.
- Resume-trigger refresh can run quickly enough to avoid visible lag for typical card counts.

## 5) Options Considered
### Option A — Foreground-resume trigger only (recommended now)
Run time-driven state recompute when app regains focus.

### Option B — Hourly background refresh only
Run a periodic hourly timer while app is active.

### Option C — Hybrid: foreground-resume + hourly timer + midnight trigger
Central scheduler runs multiple triggers for stronger eventual consistency.

## 6) Tradeoff Analysis
- **Option A (resume-only)**
  - Pros: directly solves reported problem; low complexity; minimal background churn.
  - Cons: if app remains continuously foregrounded across date changes, state may stay stale until another trigger.
- **Option B (hourly-only)**
  - Pros: eventual correction without user refocus.
  - Cons: can still be stale for up to ~59 minutes; unnecessary periodic work; does not align as tightly to user interaction moments.
- **Option C (hybrid)**
  - Pros: strongest correctness envelope.
  - Cons: higher complexity and verification surface than needed for immediate user pain.

## 7) Chosen Direction (with rationale)
Choose **Option A: foreground-resume trigger** for first pass.

Rationale:
- Highest alignment with current user pain (“wrong until reopen/switch canvas”).
- Best effort/risk ratio for immediate trust recovery.
- Keeps scope tight and reversible; hybrid scheduling can be added if evidence shows remaining drift.

## 8) Module/Feature Breakdown
1. **Lifecycle Trigger Module**
   - Detect app foreground resume reliably.
2. **Time-Driven Recompute Module**
   - Re-evaluate touched-visible truth from canonical touch/date facts.
3. **UI Sync Module**
   - Apply refreshed state to visible cards without requiring navigation hacks.
4. **Observability Module (lightweight)**
   - Log trigger start/end and changed-card counts for verification.

## 9) Sub-feature Definitions
### 9.1 Lifecycle trigger hookup
- Objective: fire a deterministic refresh on foreground resume.
- User/business outcome: user sees correct state when returning to Orbit.
- Success metric(s): refresh fired on each resume event in test matrix.
- In-scope: foreground resume event wiring.
- Out-of-scope: additional periodic schedulers.
- Key dependencies: desktop lifecycle event availability.
- Major risks: missed resume events on specific platform/window states.

### 9.2 Touched indicator recompute
- Objective: recompute touched-visible state from date-aware truth.
- User/business outcome: stale touched badges are corrected promptly.
- Success metric(s): zero reproduced stale-badge cases after resume in regression scenarios.
- In-scope: touched indicator refresh.
- Out-of-scope: semantics changes.
- Key dependencies: existing touch fact storage and derivation logic.
- Major risks: timezone/day-boundary edge handling regressions.

### 9.3 UI state propagation
- Objective: update current canvas card visuals after recompute.
- User/business outcome: no need to switch canvas/restart for UI truth.
- Success metric(s): visual state updates in-place post-resume.
- In-scope: visible-card UI sync.
- Out-of-scope: unrelated UI redesign.
- Key dependencies: state management/update pipeline.
- Major risks: partial refresh causing inconsistent indicators.

### 9.4 Minimal observability
- Objective: provide evidence that trigger ran and what changed.
- User/business outcome: faster confidence/triage in QA.
- Success metric(s): structured logs present for trigger and diff counts.
- In-scope: basic instrumentation.
- Out-of-scope: full analytics framework.
- Key dependencies: existing logging path.
- Major risks: noisy logs if not bounded.

## 10) Sequencing Recommendation (now/next/later)
- **Now**
  1. Implement foreground resume trigger.
  2. Recompute touched indicator truth on resume.
  3. Propagate UI update for current canvas.
- **Next**
  4. Add focused verification for sleep/wake, app-switch, long-idle scenarios.
- **Later (conditional)**
  5. Add hourly and/or midnight triggers only if resume-only leaves observed gaps.

## 11) Open Questions / Unknowns
1. Platform-specific resume signal parity: any known gaps across macOS vs Windows desktop runtime?
2. Should resume-trigger in v1 recompute only touched indicator, or all time-driven states (e.g., resurfacing eligibility) in one pass?
3. What is acceptable max refresh latency after resume before UI should reflect corrected state?

## 12) Handoff Notes for Specification Phase
- Keep scope constrained to solving stale touched indicator on app return.
- Preserve existing touch semantics from `docs/00-current-state.md`.
- Define deterministic trigger contract: “on foreground resume, recompute and sync touched-visible state for current view.”
- Add explicit verification scenarios for:
  - app switch away/back,
  - sleep/wake resume,
  - multi-day idle without restart,
  - no-canvas-switch path.
- Treat periodic scheduler additions as explicit follow-up patch, not implicit scope creep.
