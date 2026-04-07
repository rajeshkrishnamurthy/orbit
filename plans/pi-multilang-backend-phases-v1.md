# Pi Multi-language Backend Migration Plan (Govinda + /run-work)

## Goal
Support backend execution across Go, Python, and C#/.NET while keeping `/run-work` orchestration deterministic.

## Phases

### Phase A — Generic Govinda + Language Playbooks
- [x] Convert `govinda-backend` skill into generic backend lane.
- [x] Add playbooks:
  - `go.md`
  - `python.md`
  - `dotnet.md`
- [x] Add deterministic language selection rules.

### Phase B — `/run-work` Extension Wiring
- [x] Detect backend language for backend lane work.
- [x] Pass selected language into Govinda/Tesla packets.
- [x] Enforce language-specific evidence gates.

### Phase C — Cross-skill Alignment
- [x] Make Tesla backend verification language-aware.
- [x] Update Cruise review evidence expectations for non-Go backend scope.

### Phase D — Pilot Readiness
- [x] Prepare one pilot task template for each language (Go/Python/.NET).
- [x] Define pilot acceptance checklist.
- [x] Mark rollout-ready for pilot execution (final wide-use decision after pilots).

## Notes
- Keep `/run-work` and `/route-work` as canonical entry points.
- Keep `dev-orchestration` as strict path for complex tasks.
- Keep `direct-executor` as lightweight disciplined path.
