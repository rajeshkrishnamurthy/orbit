# Pi `/run-work` Extension Spec (v1)

## Purpose
Provide Codex-like orchestration reliability in Pi for complex work by enforcing deterministic multi-pass iteration between specialist lanes.

This extension is the enforcement layer behind current skill contracts:
- `work-routing-decider`
- `work-router-runner`
- `dev-orchestration`
- `direct-executor`
- `tesla-testing`
- `govinda-backend`
- `fredo-frontend`
- `cruise-review`

---

## Goals
1. Enforce route-first execution (`DIRECT` vs `DEV_ORCHESTRATION`).
2. Enforce orchestration loop with explicit phase transitions.
3. Enforce evidence gates before terminal `PASS`.
4. Enforce pass/correction limits and deterministic stop conditions.
5. Emit concise terminal output contract for operator.
6. Minimize workflow drift across repos.

## Non-Goals (v1)
- True parallel sub-agent swarms.
- Autonomous planning beyond provided task scope.
- Replacing existing skills; extension orchestrates them.

---

## Entry Points
- Slash command: `/run-work <task text>`
- Optional tool trigger (later): `run_work` tool queues `/run-work` as follow-up.

`/route-work` (prompt template) remains optional route-only helper.
`/run-work` is the single end-to-end execution path.

---

## High-Level Flow
1. Intake work item.
2. Run routing decider.
3. Validate decider schema.
4. Apply stop policy (`confidence`, `blocking_unknowns`).
5. Route:
   - `DIRECT` -> `direct-executor` path (single-lane RED->GREEN->REFACTOR->VERIFY)
   - `DEV_ORCHESTRATION` -> enforced phased loop with checkpointed review
6. Enforce testing/lint/gocyclo/review gates.
7. Return terminal contract only.

---

## Deterministic State Machine

### States
- `INIT`
- `ROUTING`
- `ROUTE_BLOCKED`
- `DIRECT_EXECUTION`
- `ORCH_RED`
- `ORCH_GREEN`
- `ORCH_VERIFY`
- `ORCH_REVIEW`
- `ORCH_REFACTOR` (optional pass)
- `PASS`
- `BLOCKED`
- `PENDING_IMPLEMENTATION`

### Transition Rules
- `INIT -> ROUTING`
- `ROUTING -> ROUTE_BLOCKED` if schema invalid or policy stop condition
- `ROUTING -> DIRECT_EXECUTION` if `next_action=run_direct_executor`
- `ROUTING -> ORCH_RED` if `next_action=run_dev_orchestration`

Orchestration loop:
- `ORCH_RED -> ORCH_GREEN` on `RED_READY`
- `ORCH_GREEN -> ORCH_VERIFY` when implementation evidence present
- `ORCH_VERIFY -> ORCH_GREEN` for next behavior slice when verify is green and review checkpoint is not due
- `ORCH_VERIFY -> ORCH_REVIEW` on `VERIFY_GREEN` when review checkpoint is due (or finalization is requested)
- `ORCH_VERIFY -> ORCH_GREEN` if verification fails with actionable fixes
- `ORCH_REVIEW -> PASS` when review approved, feature milestone/finalization criteria met, and all quality gates pass
- `ORCH_REVIEW -> ORCH_GREEN` on review change requests
- `ORCH_REVIEW -> BLOCKED` on insufficient evidence/blocking issue
- Optional `ORCH_REFACTOR` inserted after review-approved, then returns to `ORCH_VERIFY`

Termination:
- any hard policy breach -> `BLOCKED`
- no meaningful delta across 2 consecutive passes -> `PENDING_IMPLEMENTATION`
- pass limit exceeded -> `PENDING_IMPLEMENTATION`

---

## Phase Semantics (Enforced)

### RED (Tesla)
Required output status: `RED_READY`.
Must include failing test evidence for in-scope behavior.
Compile/setup failures are invalid RED evidence.

### GREEN (Govinda/Fredo)
Implement only in-scope behavior.
Must include required command evidence and numeric fields.

### VERIFY (Tesla)
Required output status: `VERIFY_GREEN` for progression.
If backend scope changed: language verification evidence must be PASS.
If backend language is `go` and Go files changed: `golangci-lint` evidence must be PASS.

### REVIEW (Cruise)
Must return `APPROVED | CHANGES_REQUIRED | BLOCKED`.
`CHANGES_REQUIRED` routes back to GREEN.
`APPROVED` can terminate only if all quality gates pass.
Review is checkpoint-based by default (not per-test).

### Review Cadence Policy (Checkpointed)
Default behavior is batched review, not per-test review.
A review checkpoint is due when any condition is true:
1. A coherent feature slice milestone is completed.
2. Final pre-pass review is reached.
3. Risk trigger is hit (architecture drift, boundary violation risk, or repeated verification churn).

If no checkpoint is due, Tesla/Govinda/Fredo continue RED->GREEN->VERIFY iteration without invoking Cruise.

### Refactor Policy (Orchestrator-Controlled)
Refactor is an explicit orchestration phase, not an always-on behavior.

Entry criteria for `ORCH_REFACTOR` (all required):
1. Current scope has passed VERIFY for the targeted slice/milestone.
2. A review checkpoint is approved, or orchestrator reaches final stabilization stage.
3. Refactor objective is in-scope (readability/structure/complexity reduction), with no behavior expansion.

Execution rules:
- Refactor implementation is executed by Govinda/Fredo lanes.
- No net behavior change is allowed.
- No scope expansion is allowed.
- Keep refactor bounded to affected files/modules.

Exit criteria:
1. Tesla VERIFY rerun is green with explicit evidence.
2. If risk triggers or final checkpoint applies, route back to Cruise review.
3. Otherwise continue next slice or terminate if all gates are satisfied.

---

## Required Quality Gates
All must be true for terminal `PASS`:
1. Required tests are GREEN with explicit command evidence.
2. If backend scope changed: selected backend language verification status is PASS.
3. If backend language is `go` and Go files changed:
   - `golangci-lint` PASS evidence present
   - `gocyclo_max_affected_scope <= 14`
4. If backend language is not `go`: Go-only fields remain `N/A`.
5. Cruise final status is approved (unless explicit user waiver policy exists).
6. No unresolved P0/P1 findings.
7. No unauthorized scope expansion.
8. Tesla signoff + Cruise signoff explicitly present.

---

## Data Contracts

### A) Decider Contract (Strict)
```json
{
  "route": "DIRECT | DEV_ORCHESTRATION",
  "confidence": "high | medium | low",
  "reasons": ["..."],
  "blocking_unknowns": ["..."],
  "testing_expectation": "REQUIRED | NOT_REQUIRED_WITH_REASON",
  "testing_expectation_reason": "...",
  "next_action": "run_direct_executor | run_dev_orchestration"
}
```

### B) Internal Run Ledger
Each pass appends immutable entry:
```json
{
  "run_id": "uuid",
  "pass": 1,
  "phase": "RED|GREEN|VERIFY|REVIEW|REFACTOR",
  "role": "tesla|govinda|fredo|cruise",
  "status": "...",
  "backend_language": "go|python|dotnet|N/A",
  "backend_language_verification_status": "PASS|FAIL|N/A",
  "files_changed_count": 0,
  "tests_passing_count": 0,
  "tests_failing_count": 0,
  "tests_added_or_improved_count": 0,
  "golangci_lint_status": "PASS|FAIL|N/A",
  "golangci_lint_issues_count": 0,
  "gocyclo_max_affected_scope": "number|N/A",
  "evidence_commands": ["..."],
  "timestamp": 0
}
```

### C) Terminal Response Contract
```json
{
  "route_chosen": "DIRECT | DEV_ORCHESTRATION",
  "terminal_status": "PASS | BLOCKED | PENDING_IMPLEMENTATION",
  "one_line_summary": "...",
  "tesla_signoff_status": "...",
  "cruise_signoff_status": "...",
  "tests_passing_count": 0,
  "tests_failing_count": 0,
  "tests_added_or_updated_count": 0,
  "files_changed_count": 0,
  "gocyclo_max": "number | N/A (no-go-scope-change)",
  "cruise_findings_total": 0,
  "cruise_open_p0": 0,
  "cruise_open_p1": 0,
  "passes_used": 0,
  "max_passes": 3,
  "evidence_commands": ["..."],
  "blocker": {
    "blocker_type": "...",
    "blocker_detail": "...",
    "unblock_request": "..."
  }
}
```

`blocker` is required only when `terminal_status=BLOCKED`; otherwise omit it.

---

## Policy Enforcement Rules
1. If decider schema invalid -> `BLOCKED` (`blocker_type=schema-invalid`).
2. If `blocking_unknowns` non-empty -> `BLOCKED` (`insufficient-evidence`).
3. If `confidence=low` -> ask user clarification and stop.
4. If `testing_expectation=REQUIRED` and no test evidence -> cannot return `PASS`.
5. Pass budget:
   - `max_passes = 3` (default)
   - optional user override per invocation
6. Correction bounce rule:
   - for missing required evidence, allow one correction bounce in the same pass
   - if still missing after correction bounce -> `BLOCKED`
7. No-delta plateau:
   - if two consecutive GREEN/VERIFY cycles have no meaningful diff delta -> `PENDING_IMPLEMENTATION`.

## Deterministic Checkpoint Evaluator
To minimize drift, a REVIEW checkpoint is due when any is true:
1. `finalization_requested = true` (user requested completion or no remaining acceptance targets), or
2. `milestone_complete = true` (all acceptance targets in current milestone are VERIFY_GREEN), or
3. `risk_trigger = true`, where risk trigger means at least one of:
   - architecture/boundary guard warning is present,
   - repeated verification churn (`verify_failures_for_same_target >= 2`),
   - major scope touch detected (cross-module/core files flagged by project policy).

If none are true, continue RED->GREEN->VERIFY iteration without REVIEW.

---

## Extension Architecture (Pi)

### Resources
- extension file: `~/.pi/agent/extensions/run-work/index.ts`

### Registers
- command: `/run-work`
- optional command: `/run-work-status`

### Uses
- `ctx.waitForIdle()` before phase transitions
- `ctx.ui.notify()` for in-flight state notifications (interactive mode)
- `pi.sendUserMessage()` to trigger structured specialist phase prompts
- `pi.appendEntry()` for ledger persistence

### Persistence
- Persist run ledger entries as custom session entries:
  - `customType: run-work-ledger`
- Persist active run context:
  - `customType: run-work-state`

This preserves branch correctness and replayability in `/tree`.

---

## Specialist Prompting Strategy
The extension should generate strict phase packets internally using templates with required fields.
No free-form handoff prompts in enforced mode.

Packet includes:
- scope
- pass number
- acceptance target
- blockers
- exact question
- required output schema
- required commands
- required numeric fields

---

## Failure Modes & Handling
1. **Schema mismatch from specialist output**
   - classify as `BLOCKED` with explicit missing fields.
2. **Command evidence missing**
   - bounce phase once with correction prompt; then block if still missing.
3. **Contradictory evidence**
   - block as `insufficient-evidence`.
4. **Repeated no-op edits**
   - trigger no-delta plateau.
5. **User abort**
   - return partial ledger + `BLOCKED` (`user-aborted`).

---

## Observability
For each run store:
- route chosen
- phase transitions
- evidence commands
- pass counters
- final status + blocker

Add `/run-work-status` to print current/last run summary from ledger.

---

## Security / Scope Guardrails
- Never broaden scope beyond provided work item.
- Never auto-waive test requirements.
- Never auto-waive review gate unless user explicitly requests and acknowledges waiver.

---

## Rollout Plan

### v1 (this spec)
- Command + deterministic state machine
- Decider validation
- enforced orchestration loop
- terminal contract

### v1.1
- richer packet validators
- per-repo command profile ingestion
- additional drift/conformance checks

---

## Acceptance Criteria
1. `/run-work` always starts with routing decider.
2. `DEV_ORCHESTRATION` route enforces RED->GREEN->VERIFY iterations with checkpointed REVIEW (milestone/final/risk-trigger based).
3. PASS is impossible without required evidence gates.
4. Terminal output always matches response contract.
5. Run ledger persists across session restarts/branches.
6. No-delta and pass-limit stop conditions fire deterministically.
7. Field names are normalized (`passes_used`/`max_passes`) and used consistently by implementation and reporting.
