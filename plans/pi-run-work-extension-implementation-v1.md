# Pi `/run-work` Extension Implementation Plan (v1)

## Scope
Implement global Pi extension command `/run-work` as the enforced end-to-end execution path described in:
- `plans/pi-run-work-extension-spec-v1.md`

## Decisions (Approved)
- Extension scope: global (`~/.pi/agent/extensions/run-work/index.ts`)
- Command name: `/run-work`
- Default pass budget: `max_passes = 3`
- Reserve `/run-work` for extension command (no prompt template duplication)

## Implementation Steps
1. Create global extension scaffold and register commands:
   - `/run-work`
   - `/run-work-status`
2. Implement deterministic orchestration runtime:
   - route-first decider execution and schema validation
   - policy stop conditions
   - DIRECT path orchestration
   - DEV_ORCHESTRATION phased loop (RED/GREEN/VERIFY + checkpointed REVIEW)
3. Implement quality gate and evidence checks:
   - testing expectation gate
   - lint/gocyclo gate handling fields
   - Cruise approval / P0/P1 gate
4. Implement ledger persistence via `pi.appendEntry()`:
   - `run-work-state`
   - `run-work-ledger`
5. Implement terminal response emission and `/run-work-status` summary.

## Acceptance Checklist
- [ ] `/run-work` command is discoverable and invokable. (runtime validation pending `/reload` + smoke run)
- [x] Route decider contract validation and enforcement implemented.
- [x] Low-confidence / blocking-unknown stop policy implemented.
- [x] Orchestration loop with bounded passes implemented.
- [x] Terminal output contract emission implemented.
- [x] Ledger persistence and `/run-work-status` retrieval implemented.

## Notes
- v1 focuses on enforceable workflow and drift prevention, not parallel specialist swarms.
- v1.1 can add stricter packet validators and per-repo command profile ingestion.
