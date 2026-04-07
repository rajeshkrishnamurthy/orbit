# Pi Workflow Migration Plan (v1)

## Context
Migrate Codex App orchestration workflow (work-routing-decider, dev-orchestration, work-router-runner, and specialist roles: tesla/govinda/fredo/cruise) into a Pi-native setup usable across multiple Go projects.

## Scope
- Design and create Pi-native workflow artifacts.
- Keep behavior equivalent to existing Codex workflow where practical.
- Prefer skills + prompts first; add extension only where automation requires it.

## Out of Scope (v1)
- Full autonomous sub-agent spawning framework.
- Repo-specific implementation changes unrelated to workflow migration.
- Deep optimization of each skill after initial rollout.

## Target Locations
- Global skills (cross-project): `~/.pi/agent/skills/`
- Optional global prompts: `~/.pi/agent/prompts/`
- Orbit-specific policy/context: `/Users/rajeshk/.openclaw/projects/orbit/AGENTS.md` and/or `.pi/*`

## Deliverables
1. `work-routing-decider` skill
2. `dev-orchestration` skill
3. Specialist skills:
   - `tesla-testing`
   - `govinda-backend`
   - `fredo-frontend`
   - `cruise-review`
4. Direct route skill:
   - `direct-executor`
5. `work-router-runner` definition as:
   - skill-level process contract (v1), and
   - extension blueprint for reliable auto-routing (v1.1)
6. Global routing entry prompt:
   - `/route-work`

## Codex -> Pi Mapping
- `~/.codex/agents/tesla.toml` -> `~/.pi/agent/skills/tesla-testing/SKILL.md`
- `~/.codex/agents/govinda.toml` -> `~/.pi/agent/skills/govinda-backend/SKILL.md`
- `~/.codex/agents/fredo.toml` -> `~/.pi/agent/skills/fredo-frontend/SKILL.md`
- `~/.codex/agents/cruise.toml` -> `~/.pi/agent/skills/cruise-review/SKILL.md`
- Direct execution contract -> `~/.pi/agent/skills/direct-executor/SKILL.md`
- Work Routing Decider spec -> `~/.pi/agent/skills/work-routing-decider/SKILL.md`
- Dev Orchestration spec -> `~/.pi/agent/skills/dev-orchestration/SKILL.md`
- Work Router Runner spec -> `~/.pi/agent/skills/work-router-runner/SKILL.md`

## Phase Plan

### Phase 1 — Normalize Source Definitions
- Consolidate finalized Codex definitions (including Tesla cleanup removing Devi references).
- Extract invariant rules vs project-specific rules.

Acceptance:
- No stale Devi references in active role definitions.
- Clear mapping table from Codex agent to Pi skill.

### Phase 2 — Create Pi Skills (Manual Orchestration First)
- Create `SKILL.md` for each role and orchestration component.
- Preserve:
  - scope guards
  - output contracts
  - evidence discipline
  - status enums
  - quality gates (including Go `gocyclo <= 14` gate where applicable)

Acceptance:
- Each skill loads in Pi and is invokable via `/skill:<name>`.
- Output contracts are explicit and machine-readable where required.

### Phase 3 — Add Routing Entry Point
- Add a reusable command path (prompt template or skill invocation pattern) to ensure first gate is always routing decider.
- Define stop conditions and escalation behavior.

Acceptance:
- Operator can run one standard entry command for new work.
- Route outcome clearly determines DIRECT vs DEV_ORCHESTRATION.

### Phase 4 — Define Runner Automation Boundary
- Document `work-router-runner` as process contract in v1.
- Specify minimal extension responsibilities for v1.1:
  - schema validation
  - auto-run policy
  - route dispatch
  - testing evidence enforcement
  - terminal-only output contract

Acceptance:
- Clear go/no-go decision on whether extension is required for enforcement.
- Extension blueprint is implementation-ready.

## Risk Controls
- **Ambiguity risk:** enforce BLOCKED on insufficient evidence.
- **Scope creep:** keep strict packet scope + no implicit expansion.
- **False PASS risk:** enforce test-command evidence gates.
- **Workflow drift across repos:** keep generic workflow global, repo policy local.

## Validation Checklist
- [ ] Skills discovered by Pi from global directory.
- [x] Work Routing Decider returns exact JSON contract.
- [x] Dev orchestration loop reflects RED → GREEN/VERIFY → REVIEW (+ iterate).
- [x] Tesla and Cruise signoff fields are explicit in terminal outputs.
- [x] Go scope gates (`golangci-lint`, `gocyclo`) are preserved.
- [x] Direct route cannot PASS when testing is REQUIRED and evidence is missing.
- [x] Global routing prompt created (`/route-work`).

## Naming and Versioning
- Plan file path: `/Users/rajeshk/.openclaw/projects/orbit/plans/pi-workflow-migration-v1.md`
- Next revision (if needed): `pi-workflow-migration-v1.1.md`

## Execution Notes
- Default thinking level for this task: `medium`.
- Temporarily use `high` only for edge-case policy decisions.
