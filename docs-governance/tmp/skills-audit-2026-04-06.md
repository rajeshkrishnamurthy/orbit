# Skills Audit Findings (Temporary)

Date: 2026-04-06  
Auditor: pi coding assistant  
Checklist used: `/Users/rajeshk/.pi/agent/skills/SKILL_AUDIT_CHECKLIST.md`

## Scope Audited
- `/Users/rajeshk/.pi/agent/skills/SKILL_AUDIT_CHECKLIST.md`
- `/Users/rajeshk/.pi/agent/skills/cruise-review/SKILL.md`
- `/Users/rajeshk/.pi/agent/skills/dev-orchestration/SKILL.md`
- `/Users/rajeshk/.pi/agent/skills/direct-executor/SKILL.md`
- `/Users/rajeshk/.pi/agent/skills/fredo-frontend/SKILL.md`
- `/Users/rajeshk/.pi/agent/skills/govinda-backend/SKILL.md`
- `/Users/rajeshk/.pi/agent/skills/govinda-backend/playbooks/go.md`
- `/Users/rajeshk/.pi/agent/skills/govinda-backend/playbooks/python.md`
- `/Users/rajeshk/.pi/agent/skills/govinda-backend/playbooks/dotnet.md`
- `/Users/rajeshk/.pi/agent/skills/tesla-testing/SKILL.md`
- `/Users/rajeshk/.pi/agent/skills/work-router-runner/SKILL.md`
- `/Users/rajeshk/.pi/agent/skills/work-routing-decider/SKILL.md`

---

## Executive Summary

Overall quality is good: scope guards, evidence-gate intent, and metadata/versioning are consistently present.

Primary gaps are **automation-contract consistency** and a few **policy completeness holes**:
1. Several skills use human-readable sectioned output instead of strict JSON, reducing orchestration safety.
2. `blocker_type/blocker_detail/unblock_request` is not consistently required for blocked outcomes.
3. A few skills miss explicit out-of-scope/spec-deferred phrasing.
4. `work-router-runner` has an internal contract inconsistency (`run_direct_executor` path exists, but `direct-executor` is not listed in Required Skills).
5. `cruise-review` does not explicitly state that open P0/P1 cannot yield `APPROVED`.

---

## Per-Skill Findings

### 1) `cruise-review` — **APPROVE with edits**
**Strengths**
- Clear mission and strict review scope guard.
- Strong backend language-aware evidence gate.
- Deterministic review statuses and numeric counts.

**Gaps**
- Output is structured text, not strict JSON (automation fragility).
- No explicit blocker payload schema (`blocker_type`, `blocker_detail`, `unblock_request`).
- No explicit rule: `APPROVED` forbidden when any P0/P1 remains open.
- Does not explicitly call out spec-deferred items as out-of-scope.

---

### 2) `dev-orchestration` — **APPROVE with edits**
**Strengths**
- Excellent scope guard and deterministic status enum.
- Strong RED→GREEN→VERIFY→REVIEW→REFACTOR loop.
- Explicit blocked behavior for missing/ambiguous evidence.

**Gaps**
- Terminal output is not strict JSON (despite orchestrator role).
- Could tighten explicit requirement to include exact verification command outcomes in terminal output (currently implied through specialist evidence).

---

### 3) `direct-executor` — **APPROVE with edits**
**Strengths**
- Strong JSON-only contract and blocker payload.
- Mandatory RGR discipline is explicit.
- Clear review-trigger logic in DIRECT mode.

**Gaps**
- No explicit spec-deferred out-of-scope clause.
- Maintainability guidance is thin (simplicity/abstraction-restraint/error-context quality are not explicit).
- Language-specific verification expectations only explicitly mention Go evidence; Python/.NET expectations are not explicit.

---

### 4) `fredo-frontend` — **APPROVE with edits**
**Strengths**
- Strong lane boundaries and anti-orchestration rules.
- Good entry-module thin-shell guardrails.
- Explicit non-test evidence requirements for boundary-sensitive changes.

**Gaps**
- Output is sectioned prose, not strict JSON.
- No deterministic status enum in output contract.
- Blocked output not standardized with explicit blocker payload fields.

---

### 5) `govinda-backend` (+ playbooks) — **APPROVE as-is (minor optional edits)**
**Strengths**
- Strong deterministic language selection.
- Mandatory playbook loading is explicit.
- Strong JSON contract with blocker payload and numeric fields.
- Language-aware verification expectations are documented and supported by playbooks.

**Minor optional improvement**
- Add explicit expectation on error/context quality in implementation outputs/logging rationale.

---

### 6) `tesla-testing` — **APPROVE as-is (minor optional edits)**
**Strengths**
- Very strong RED/VERIFY discipline.
- Strong JSON contract and numeric evidence fields.
- Clear language-aware backend verification policy.

**Minor optional improvement**
- Add explicit line clarifying that contradictory evidence must return `BLOCKED` (implied today, but worth making explicit).

---

### 7) `work-router-runner` — **APPROVE with edits**
**Strengths**
- Good wrapper objective and stop conditions.
- Explicit enforcement that REQUIRED testing cannot be silently skipped.

**Gaps**
- Contract inconsistency: execution includes `run_direct_executor`, but Required Skills list omits `direct-executor`.
- Output format is fielded but not explicitly JSON-only.
- Blocked payload shape not explicitly normalized to `blocker_type/blocker_detail/unblock_request`.

---

### 8) `work-routing-decider` — **APPROVE with edits**
**Strengths**
- Strong strict JSON output.
- Deterministic route mapping and confidence model.
- Explicit testing expectation policy.

**Gaps**
- No explicit spec-deferred/out-of-scope language.
- Because it never emits `BLOCKED`, downstream wrapper must consistently map unknowns to blocked with structured blocker payload (currently handled in runner, but contract link could be tighter).

---

### 9) `skill-audit-checklist` — **APPROVE with edits**
**Strengths**
- Good audit structure across universal/coding/non-coding dimensions.
- Explicit release decision section.

**Gaps**
- No explicit BLOCKED/insufficient-evidence handling for the audit process itself.
- Output contract is checklist-style only (good for humans, weak for automation).

---

## Cross-Skill Priority Fixes (Recommended Order)

### P1 — Automation safety and determinism
1. Convert non-JSON output contracts to strict JSON for:
   - `cruise-review`
   - `dev-orchestration`
   - `fredo-frontend`
   - `work-router-runner`
2. Standardize blocked payload fields across all skills that can block:
   - `blocker_type`
   - `blocker_detail`
   - `unblock_request`

### P1 — Contract correctness
3. Fix `work-router-runner` Required Skills section to include `direct-executor`.
4. In `cruise-review`, add explicit decision rule: open P0/P1 => cannot be `APPROVED`.

### P2 — Scope clarity and maintainability completeness
5. Add explicit spec-deferred/out-of-scope clauses where missing (`direct-executor`, `work-routing-decider`, optional `cruise-review`).
6. Add lightweight maintainability directives to `direct-executor` (simplicity, abstraction restraint, error-context quality).

---

## Relative Reference Validation
- Govinda playbook references are valid:
  - `playbooks/go.md`
  - `playbooks/python.md`
  - `playbooks/dotnet.md`
- No broken relative references found in audited skills.

---

## Release Decision Snapshot
- **APPROVE as-is**: `govinda-backend`, `tesla-testing`
- **APPROVE with edits**: `cruise-review`, `dev-orchestration`, `direct-executor`, `fredo-frontend`, `work-router-runner`, `work-routing-decider`, `skill-audit-checklist`
- **REJECT**: none

---

## Notes
This file is intentionally placed as a temporary governance artifact and can be deleted after gaps are addressed.
