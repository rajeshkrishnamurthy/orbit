# Feature Spec — touch-log

## 1) Spec summary
Implement a deterministic post-touch assist flow: after a card receives a **successful effective Touch**, Orbit auto-opens the **existing Log Activity pop-up** for that same card.

This improves capture timing while preserving semantics:
- Touch remains explicit and independent.
- Touch does not imply required logging.
- No automatic log entry creation is introduced.

Traceability IDs in this spec:
- Functional requirements: `FR-*`
- Edge/failure requirements: `EC-*`
- Acceptance criteria: `AC-*`

---

## 2) Scope / non-scope

### In scope
1. Auto-open existing Log Activity pop-up immediately after successful effective Touch.
2. Keep touch commit independent from log authoring/submission.
3. Preserve existing pop-up dismissal and input behavior.
4. Define deterministic behavior for already-touched-today touches and open-state conflicts.

### Out of scope
1. Any change to Touch semantics (explicit-only, once effective per local day).
2. Mandatory logging or skip-reason gating.
3. New settings/preferences toggle in this baseline release.
4. Telemetry/analytics instrumentation requirements.
5. Editing/searching/full-history browsing for logs.
6. Changes to active/stale derivation, hidden/snooze/resurface behavior, or stale lens behavior.

---

## 3) Inputs and invariants

### Inputs
1. User-initiated Touch action on a card.
2. Existing touch-state evaluation for card + local day (effective vs already touched today).
3. Existing Log Activity pop-up component/behavior.

### Invariants (must remain true)
1. `docs/00-current-state.md` remains canonical for baseline behavior.
2. Touch is explicit user action only; never inferred.
3. One effective Touch per card per local day.
4. Log entries remain user-authored, max 140 chars per entry.
5. Touch and log remain semantically separate actions.

---

## 4) Functional requirements (deterministic)

- **FR-01 (trigger eligibility)**: Auto-open must trigger only when Touch action results in a **successful effective touch** for that card on that local day.
- **FR-02 (idempotent touch behavior)**: If user invokes Touch on a card already effectively touched for the same local day, Orbit must not auto-open Log Activity from that idempotent action.
- **FR-03 (touch-first sequencing)**: Effective touch state commit must complete independently before/while launching auto-open; log pop-up failure/dismissal must not roll back the touch commit.
- **FR-04 (pop-up reuse)**: Auto-open must use the existing Log Activity pop-up implementation and constraints (including entry length and existing submit behavior).
- **FR-05 (non-blocking contract)**: Auto-opened pop-up must remain dismissible through existing paths and must not block normal flow beyond current pop-up behavior.
- **FR-06 (no inferred logs)**: Orbit must never auto-create a log entry as a side effect of Touch or auto-open.
- **FR-07 (single-instance retarget rule)**: If Log Activity pop-up is already open at trigger time and a different card receives an effective Touch, Orbit must keep a single pop-up instance and switch it to the newly touched card (no duplicate/stacked pop-ups).
- **FR-08 (card targeting)**: When auto-open occurs, the pop-up must target the same card whose effective Touch triggered it.
- **FR-09 (discard semantics unchanged on switch)**: When FR-07 switch occurs, any unsaved/draft handling for the prior card must follow existing pop-up behavior exactly; this feature must not introduce new discard prompts, auto-save, or draft recovery behavior.
- **FR-10 (scope guard)**: No other card lifecycle semantics (active/stale, hidden/resurfaced, stale lens membership) may be modified by this feature.

---

## 5) UX / API / data behavior contract

### UX contract
1. User touches a card (effective touch) and is immediately presented with the existing Log Activity pop-up for quick optional entry.
2. User may dismiss instantly with existing dismissal paths (e.g., `Esc`, click-away, existing close behavior).
3. Dismissing the pop-up does not undo Touch and does not require user explanation.
4. Re-tapping Touch after already touching that card today does not repeatedly auto-open logging.
5. If log pop-up is open for card A and user effectively touches card B, the pop-up exits A per existing behavior and shows B (single-instance switch).

### API contract
1. No new public API surface required.
2. No external contract changes required.

### Data contract
1. No schema/model migration required.
2. Existing touch persistence and activity log persistence remain unchanged.

---

## 6) Edge cases and failure handling

- **EC-01 (already touched today)**: Touch action is idempotent; no auto-open is triggered.
- **EC-02 (auto-open launch failure)**: If pop-up fails to open due to UI/runtime issue, effective Touch remains committed; system must not corrupt touch or log data.
- **EC-03 (immediate dismiss)**: If user dismisses immediately, no log entry is created; Touch remains committed.
- **EC-04 (empty submit prevention)**: Existing pop-up validation behavior remains authoritative; this feature introduces no validation changes.
- **EC-05 (open conflict on different card)**: If pop-up is open for card A and user effectively touches card B, Orbit switches the single pop-up instance to card B (no duplicate/stacked instances).
- **EC-06 (switch discard behavior)**: During EC-05 switch, treatment of unsaved/draft text from card A follows existing pop-up behavior with no new feature additions.
- **EC-07 (local-day boundary semantics)**: Eligibility uses existing local-day touch semantics only; this feature introduces no alternate day-boundary logic.

---

## 7) Acceptance criteria (testable and observable)

- **AC-01 (effective touch opens log)**: Given a card not yet effectively touched today, when user invokes Touch, then Touch is committed and existing Log Activity pop-up opens for that same card.
- **AC-02 (already-touched does not open)**: Given a card already effectively touched today, when user invokes Touch again, then no auto-open is triggered.
- **AC-03 (dismiss preserves touch)**: Given auto-opened pop-up after effective Touch, when user dismisses via existing dismiss path, then no log is created and Touch remains committed.
- **AC-04 (submit creates optional log)**: Given auto-opened pop-up after effective Touch, when user submits valid entry, then one log entry is created under existing log rules and Touch remains committed.
- **AC-05 (length constraint unchanged)**: Given auto-opened pop-up, when user enters >140 chars, then existing max-length behavior is enforced exactly as before.
- **AC-06 (single-instance switch on different card)**: Given Log Activity pop-up is open for card A, when user performs effective Touch on card B, then Orbit does not create a duplicate pop-up and the visible pop-up targets card B.
- **AC-07 (switch uses existing discard semantics)**: Given AC-06 and card A had unsaved/draft text, when switch to B occurs, then A draft handling matches existing pop-up behavior exactly (no new prompt/auto-save behavior introduced by this feature).
- **AC-08 (semantic non-regression)**: Touch remains explicit-only and once-effective-per-day; no inferred touches or inferred logs are introduced.
- **AC-09 (scope non-regression)**: Active/stale, hidden/resurface, and stale lens behaviors remain unchanged by this feature.

---

## 8) Dependencies and sequencing notes

### Dependencies
1. Existing Touch action/state path.
2. Existing Log Activity pop-up component and handlers.
3. Existing UI event sequencing around card actions.

### Sequencing
1. Bind auto-open trigger to effective touch outcome.
2. Add single-instance switch behavior for open pop-up conflicts and enforce card-target binding.
3. Validate unchanged pop-up dismissal/input/unsaved-draft handling constraints.
4. Verify non-regression on touch semantics and unrelated card-state systems.

---

## 9) Backward compatibility / migration notes

1. No data migration required.
2. No backward compatibility contract changes expected.
3. Feature is an interaction-flow enhancement, not a semantic model rewrite.

---

## 10) Explicit out-of-scope follow-ups

1. User preference toggle for enabling/disabling auto-open (evaluate later if needed).
2. Prompt copy refinements specific to anti-conflation messaging (if future evidence suggests confusion).
3. Telemetry/analytics-based optimization loops.
4. Advanced capture aids (templates/suggestions).

---

## 11) Open questions

None blocking for baseline `touch-log` spec.

---

## Assumptions Register

1. **High-impact (resolved)**: Auto-open is triggered only on first successful effective Touch per card per local day.
2. **Low-impact**: Existing pop-up copy can remain unchanged in baseline without semantic confusion.
3. **High-impact (resolved)**: No user-facing settings toggle in baseline release.
4. **Low-impact**: Existing dismissal behavior (`Esc`, click-away, close) remains available and unchanged.
5. **High-impact (resolved)**: Baseline does not require telemetry instrumentation.

---

## Spec Decisions (locked in this pass)

1. Initiative slug: `touch-log`.
2. Mode: `initiative-wide`.
3. Baseline behavior: auto-open existing Log Activity pop-up on effective Touch only.
4. No telemetry requirement in baseline.
5. No user preference toggle in baseline.
