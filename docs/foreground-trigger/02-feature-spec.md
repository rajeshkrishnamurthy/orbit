# Feature Spec — foreground-trigger

## 1) Spec summary
Implement a deterministic **foreground-resume refresh** that recomputes and syncs **touched-indicator visibility** for the currently visible canvas so UI truth is corrected when Orbit returns to foreground.

This spec addresses stale touched-visible indicators that currently self-correct only after restart or canvas switch.

Traceability IDs in this spec:
- Functional requirements: `FR-*`
- Edge/failure requirements: `EC-*`
- Acceptance criteria: `AC-*`

---

## 2) Scope / non-scope

### In scope
1. Detect app foreground resume and trigger a refresh pass.
2. Recompute touched-indicator visibility from canonical touch/date semantics (no semantic changes).
3. Propagate recomputed touched state to currently visible cards without requiring navigation/restart.
4. Emit lightweight structured logs for trigger execution and change counts.

### Out of scope
1. Any change to touch semantics, thresholds, or derivation rules.
2. Hourly/background/midnight schedulers.
3. UI redesign or unrelated card state behavior changes.
4. Changes to hidden/lens semantics.
5. Recompute of non-touched time-driven states in this v1.
6. Debounce/coalescing/rate-limit optimization for rapid focus flapping in v1.

---

## 3) Inputs and invariants

### Inputs
1. App lifecycle foreground-resume signal.
2. Current visible canvas/card set.
3. Existing canonical card facts (created day, touch history, hidden state) already used by current touch/stale derivation.

### Invariants (must remain true)
1. `docs/00-current-state.md` is canonical for behavior semantics.
2. Touch remains explicit user action only.
3. One effective touch per card per local day remains unchanged.
4. Hidden cards remain excluded from active/stale classification while hidden.
5. Stale lens and hidden/snooze/resurface semantics remain unchanged.
6. No system canvas placement mutation is introduced.

---

## 4) Functional requirements (deterministic)

- **FR-01 (trigger condition)**: On each transition where Orbit regains foreground/focus from a background/non-focused state, Orbit must run one foreground refresh pass.
- **FR-02 (refresh scope v1)**: The pass must recompute **touched-indicator visibility only**.
- **FR-03 (scope guard)**: The pass must not expand to other time-driven states in this version.
- **FR-04 (source of truth)**: Recompute must use existing canonical touch/date rules and current persisted card facts.
- **FR-05 (no heuristics)**: No alternative heuristics or inferred touch behavior are allowed.
- **FR-06 (UI sync)**: After recompute, visible canvas card indicators must update in-place in the active view.
- **FR-07 (no navigation hacks required)**: User must not need restart, canvas switch, or manual refresh to see corrected touched indicators.
- **FR-08 (idempotence/safety)**: Multiple resume events may trigger multiple passes; each pass must be safe and deterministic.
- **FR-09 (no-op pass)**: If no card state changes are required, UI state remains unchanged and pass still completes successfully.
- **FR-10 (observability fields)**: Each pass must emit structured start/end logging containing at least: `trigger_type=foreground-resume`, `outcome=success|failure`, and `changed_card_count`.

---

## 5) UX / API / data behavior contract

### UX contract
1. Returning to Orbit from app switch/minimize/background should show touched indicators corrected in the current canvas without navigation hacks.
2. No new user-visible controls or settings are introduced.

### API contract
1. No public API surface additions/changes required by this spec.

### Data contract
1. No schema or persisted model shape changes required.
2. Existing touch/date facts remain the only computation inputs.

---

## 6) Edge cases and failure handling

- **EC-01 (no visible cards)**: Refresh pass still runs and completes; changed count may be zero.
- **EC-02 (no touched-state diffs)**: Pass completes with changed count `0`; no visual flicker/regression introduced.
- **EC-03 (rapid focus flapping)**: Repeated passes are allowed; behavior must remain deterministic and stable. Optimization for flapping (debounce/coalescing) is out-of-scope for v1.
- **EC-04 (date-boundary / multi-day idle)**: First foreground resume after boundary/idle must recompute from canonical date-aware facts and correct stale touched visibility.
- **EC-05 (compute-phase failure)**: Failure must be surfaced via structured end log (`failure`) and must not corrupt existing card facts.
- **EC-06 (UI sync failure behavior)**: If apply-to-UI fails (including partial apply failure), Orbit must preserve the last fully consistent rendered touched-indicator state in the active canvas (no mixed partial result committed).
- **EC-07 (retry behavior)**: After any failure, the system does not auto-loop in background; correctness recovery is attempted on the **next foreground-resume trigger**.

---

## 7) Acceptance criteria (testable and observable)

- **AC-01 (app switch away/back)**: Given a card whose touched visibility is stale while Orbit is backgrounded, when Orbit returns to foreground, then touched visibility in current canvas updates correctly without restart or canvas switch.
- **AC-02 (sleep/wake resume)**: Given Orbit running before system sleep and local-day conditions change, when system wakes and Orbit regains foreground, then touched visibility is recomputed and corrected in-place.
- **AC-03 (multi-day idle without restart)**: Given Orbit remains open across multiple days, when user returns Orbit to foreground, then touched visibility reflects canonical current truth in active canvas.
- **AC-04 (no-op stability)**: Given no touched-visibility changes are required, when foreground resume pass executes, then UI remains stable and logs report `changed_card_count=0`.
- **AC-05 (scope guard)**: During foreground-resume pass, only touched-indicator visibility may change; hidden semantics, stale lens semantics, touch derivation rules, and other unrelated states remain unchanged.
- **AC-06 (observability evidence)**: For each foreground resume pass, logs contain trigger type, outcome, and changed-card count.
- **AC-07 (failure UX contract)**: Given an injected UI-sync failure during pass execution, then active-canvas touched indicators remain at last fully consistent rendered state, failure is logged, and a subsequent foreground resume re-attempts correction.

---

## 8) Dependencies and sequencing notes

### Dependencies
1. Desktop runtime lifecycle/focus signal availability.
2. Existing touched-visibility derivation path.
3. Existing UI state update pathway for visible cards.
4. Existing structured logging path.

### Sequencing
1. Wire deterministic foreground-resume trigger.
2. Invoke touched-only recompute pass.
3. Apply in-place UI sync for active canvas.
4. Add/verify logs and scenario coverage.

---

## 9) Backward compatibility / migration notes

1. No data migration required.
2. No API compatibility impact expected.
3. Behavior change is corrective (stale indicator correction timing), not semantic redefinition.

---

## 10) Explicit out-of-scope follow-ups

1. Add hourly or midnight refresh triggers (if evidence later shows gaps).
2. Expand resume refresh to additional time-driven states (e.g., resurfacing eligibility) in a separate scoped initiative.
3. Performance SLO formalization if future datasets/runtime evidence justifies it.
4. Flapping-event optimization (debounce/coalescing/rate limiting) if evidence later shows material churn.

---

## 11) Open questions

None blocking for this v1 spec.

---

## Assumptions Register

1. **Low-impact**: Foreground/focus regain signal is available and sufficient across supported desktop targets to trigger this pass.
2. **Low-impact**: Typical solo-user dataset size allows prompt correction without introducing noticeable UX lag; no explicit numeric latency SLA is required for v1.
3. **Low-impact**: Existing touched-derivation logic is reusable as-is for recompute, without semantic drift.

---

## Spec Decisions (locked in this pass)

1. Initiative slug: `foreground-trigger`.
2. Mode: `initiative-wide`.
3. v1 recompute scope: **touched-indicator visibility only**.
4. Priority: **accuracy/correctness over explicit latency target** for this release.
5. Rapid focus flapping optimization is explicitly out-of-optimization-scope for v1.
