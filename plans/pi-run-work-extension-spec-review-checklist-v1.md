# `/run-work` Extension Spec Review Checklist (v1)

Use this checklist to quickly review and approve the spec without diving into implementation details.

Reference spec:
- `/Users/rajeshk/.openclaw/projects/orbit/plans/pi-run-work-extension-spec-v1.md`

---

## 1) Outcome Fit (Business/Workflow)
- [ ] Does this preserve your intended Codex-style loop (Tesla ↔ Govinda/Fredo ↔ Tesla ↔ Cruise)?
- [ ] Does this preserve the RED-first testing posture?
- [ ] Does this preserve independent review before final PASS?
- [ ] Does this avoid unnecessary orchestration for simple tasks?

Notes:

---

## 2) Routing Correctness
- [ ] Is route-first behavior mandatory (`work-routing-decider` always first)?
- [ ] Are stop conditions acceptable (`confidence=low`, `blocking_unknowns`)?
- [ ] Is direct vs orchestration branch behavior clear enough?

Notes:

---

## 3) Quality Gates
- [ ] PASS requires explicit test command evidence when testing is REQUIRED.
- [ ] For Go changes, lint PASS evidence is mandatory.
- [ ] For Go changes, `gocyclo <= 14` is enforced.
- [ ] Cruise approval gate is required by default.
- [ ] P0/P1 unresolved findings block PASS.

Notes:

---

## 4) Determinism & Drift Control
- [ ] State machine phases and transitions are explicit.
- [ ] Max pass budget (default 3) matches your intent.
- [ ] No-delta plateau stop behavior is acceptable.
- [ ] Terminal status enum (`PASS | BLOCKED | PENDING_IMPLEMENTATION`) is sufficient.

Notes:

---

## 5) Reporting Contract
- [ ] Terminal response fields are sufficient for your decision-making.
- [ ] Blocked response includes actionable unblock information.
- [ ] Summary is concise enough for practical use.

Notes:

---

## 6) Pi Integration Practicality
- [ ] Slash command naming (`/run-work`) is acceptable.
- [ ] Ledger persistence model in session entries is acceptable.
- [ ] This should be implemented as an extension (not just a skill).

Notes:

---

## 7) Safety / Scope Controls
- [ ] Scope expansion is explicitly disallowed unless user re-scopes.
- [ ] Test/review gates are not silently auto-waived.
- [ ] User waiver behavior is explicit and intentional.

Notes:

---

## 8) Anything to Change Before Build
- [ ] Rename commands/fields/status labels
- [ ] Change pass/retry budget
- [ ] Adjust gocyclo threshold
- [ ] Modify stop conditions
- [ ] Modify required evidence fields

Requested changes:

---

## Review Decision
- [ ] APPROVE spec as-is
- [ ] APPROVE with minor edits
- [ ] NEEDS REVISION before implementation

Reviewer:
Date:
