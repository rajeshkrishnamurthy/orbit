# Pi Workflow Migration Backlog

Purpose: track Codex App workflow capabilities that are **not yet fully encapsulated** by current global Pi skills and prompt templates.

Current baseline implemented globally:
- Skills: `work-routing-decider`, `work-router-runner`, `dev-orchestration`, `direct-executor`, `tesla-testing`, `govinda-backend`, `fredo-frontend`, `cruise-review`
- Prompt: `/route-work`

---

## B1 — Enforced Auto-Runner (Extension)
**Status**
Implemented in v1 as global extension command `/run-work` at:
- `~/.pi/agent/extensions/run-work/index.ts`

**What it enforces now**
- decider JSON schema validation
- stop conditions (`confidence=low`, `blocking_unknowns`)
- route dispatch (`DIRECT` vs `DEV_ORCHESTRATION`)
- phased orchestration loop with checkpointed review
- terminal response emission and ledger persistence
- test-evidence gate before PASS

**Follow-up**
Keep this backlog item closed unless regressions appear during real-task usage.

**Priority**: P0 (closed)

---

## B2 — Session Ledger + Lifecycle Enforcement (Extension)
**Gap**
Codex workflow had explicit spawn/session lifecycle controls (ledger, reuse-before-spawn, close sweep, open-session reporting).

**Why missing**
Pi core intentionally does not provide built-in sub-agent orchestration/session swarm semantics.

**Target**
Add extension-level execution ledger for role/task/status/evidence and lifecycle hooks to enforce:
- role packet state tracking
- consistent handoff bookkeeping
- terminal-state close sweep equivalent

**Priority**: P0

---

## B3 — Retry Budget Enforcement (Extension)
**Gap**
Codex-specific retry budget semantics (initial + 2 retries with correction loop) are not hard-enforced.

**Why missing**
Currently documented in skills, but not guarded by runtime policy.

**Target**
Extension policy layer that enforces retry budget + structured blocked report:
- attempts used
- correction steps tried
- remaining/open execution contexts

**Priority**: P1

---

## B4 — Structured Packet Templates for Specialist Hand-off
**Gap**
Delegation packet requirements are written in orchestration skill but not auto-generated or validated.

**Why missing**
No standard packet emitter/checker exists yet.

**Target**
Add reusable prompt templates (or extension helper) for:
- `tesla packet`
- `govinda packet`
- `fredo packet`
- `cruise packet`
with required fields prefilled and validation checklist.

**Priority**: P1

---

## B5 — Consistent Terminal Report Schema Validation
**Gap**
Output formats are specified in skills, but no machine validator currently checks required numeric/status fields.

**Why missing**
Model-only adherence.

**Target**
Add extension-side response validator for terminal outputs across routes and specialists.

**Priority**: P1

---

## B6 — Cross-Repo Command Profile Injection
**Status**
Partially addressed.
- Global backend lane is now language-aware (Go/Python/.NET) via Govinda playbooks.
- `/run-work` passes backend language context and enforces language-specific evidence gates.

**Remaining gap**
Repo-specific command profiles (exact test/lint/type-check command sources) are still not centrally injected.

**Target (remaining)**
Define project-local command profile conventions (e.g., `.pi/workflow-profile.json` or AGENTS sections) and consume them via:
- optional extension, or
- prompt template expansion contract

**Priority**: P1

---

## B7 — Drift Detection + Conformance Checks
**Gap**
No periodic check that global skills still match intended workflow contract over time.

**Why missing**
No conformance harness yet.

**Target**
Create lightweight conformance checks:
- expected sections present in each SKILL.md
- required status enums and mandatory fields present
- no forbidden terms (legacy/deprecated terms)
- version metadata consistency

**Priority**: P2

---

## B8 — Versioned Change Log for Workflow Assets
**Gap**
Skills/prompts exist, but no dedicated changelog/versioning discipline for workflow governance.

**Why missing**
Initial migration focused on functionality.

**Target**
Add `~/.pi/agent/WORKFLOW_CHANGELOG.md` and semantic version tags in skill metadata.

**Priority**: P2

---

## B9 — Optional Project-Local Overrides Strategy
**Gap**
Override strategy is implied but not documented as policy.

**Why missing**
Not codified yet.

**Target**
Document precedence model:
1. global generic skills
2. project local skills with same intent
3. AGENTS.md policy overrides
and when each should be used.

**Priority**: P2

---

## B10 — Human-Operability Runbook
**Gap**
No concise operator runbook for day-to-day usage patterns and failure handling.

**Why missing**
Migration delivered artifacts first.

**Target**
Create short runbook with:
- normal entry points (`/route-work` for route-only, `/run-work` for enforced execution)
- when to choose direct route manually
- when to escalate to orchestration
- common BLOCKED reasons and recovery actions

**Priority**: P2

---

## Suggested Execution Order
1. B1, B2
2. B3, B4, B5
3. B6
4. B7, B8, B9, B10

## Ownership
- Workflow contract owner: Rajesh
- Implementation owner: Pi assistant + Rajesh review
