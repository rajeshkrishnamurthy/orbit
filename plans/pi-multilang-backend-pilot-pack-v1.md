# Multi-language Backend Pilot Pack (v1)

Use these tasks to validate `/run-work` behavior across Go, Python, and .NET backend scope.

## Pilot Task Templates

### 1) Go Pilot (bounded, low risk)
`/run-work Add a small backend behavior change in Go in one package, with explicit test evidence and no cross-lane scope expansion.`

Expected checks:
- route likely `DIRECT` or `DEV_ORCHESTRATION` depending on task detail
- Govinda selects `backend_language=go`
- Tesla verify includes golangci evidence
- gocyclo gate enforced when Go files change

### 2) Python Pilot (bounded ML/experiment scope)
`/run-work Update a small Python backend behavior in the experiment module, with explicit pytest evidence and no unrelated refactors.`

Expected checks:
- Govinda selects `backend_language=python`
- language verification status PASS required
- no Go-only gate leakage (`golangci/gocyclo` should remain N/A)

### 3) Dotnet Pilot (legacy bounded fix)
`/run-work Apply a small C#/.NET backend fix in scoped files with explicit dotnet verification evidence and no architectural expansion.`

Expected checks:
- Govinda selects `backend_language=dotnet`
- language verification status PASS required
- no Go-only gate leakage (`golangci/gocyclo` should remain N/A)

---

## Pilot Acceptance Checklist
- [ ] `/run-work` command executes without command-resolution ambiguity.
- [ ] Routing still behaves as expected (DIRECT vs DEV_ORCHESTRATION).
- [ ] Backend language is identified and reported correctly per task.
- [ ] Tesla VERIFY enforces language-aware backend verification fields.
- [ ] Cruise review consumes language-appropriate evidence without forcing Go-only criteria.
- [ ] Terminal result contract remains stable.
- [ ] `/run-work-status` shows persisted result.

## Rollout Readiness Decision
- [ ] READY FOR WIDE USE
- [ ] NEEDS ADJUSTMENT (note issues and update skills/extension)

Notes:
