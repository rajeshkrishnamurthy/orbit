# Documentation Governance Policy

## Purpose
Maintain a reliable, low-entropy documentation system so new sessions can recover project context with high confidence.

This workflow is the custodian lane for documentation integrity across initiatives.

---

## Scope

### In Scope
1. Define and enforce source-of-truth hierarchy (canonical vs patch vs historical)
2. Maintain documentation status metadata and supersession chains
3. Fold temporary patch docs into canonical docs on a regular cadence
4. Maintain initiative-level current-state summaries for session bootstrap
5. Maintain repository-level docs index/registry
6. Detect and report contradictions, staleness, and orphaned docs
7. Produce explicit remediation plans for documentation drift

### Out of Scope
- Product discovery/planning decisions (except documenting their outcomes)
- Implementation-ready engineering decisions (except documenting accepted outcomes)
- Coding/prototyping/build execution
- Silent interpretation of contradictory requirements

Hard boundary:
- This workflow must never perform coding, prototyping, or build execution.
- Even if explicitly requested, treat coding/build requests as out-of-scope human error and refuse execution.
- Required response for such requests:
  - `status: BLOCKED`
  - `blocker_type: out-of-scope-coding-request`
  - `blocker_detail: Docs governance lane is documentation-only and cannot execute code.`
  - `unblock_questions: ["Should I continue with documentation governance tasks only?"]`

---

## Activation Criteria
Use this workflow when:
- canonical source of truth is unclear
- many patch/feature docs exist with uncertain currency
- new sessions struggle to establish reliable context
- periodic documentation consolidation/audit is needed

If asked for coding/prototyping/build work, refuse and return `BLOCKED` using the hard boundary contract above.

---

## Source-of-Truth Model (Mandatory)

Documentation states:
- `current` = canonical active truth
- `draft` = in-progress, not yet canonical
- `superseded` = replaced by newer canonical document
- `archived` = historical reference only

Rules:
1. A topic should have one canonical `current` document at a time.
2. Patch documents are temporary deltas and must be folded into canonical docs.
3. Historical documents must be clearly labeled non-canonical.
4. Supersession links must be explicit (`supersedes`, `superseded_by`).

---

## Required Process

1. Confirm governance target scope (initiative slug or whole repo)
2. Inventory relevant docs and classify by state (`current/draft/superseded/archived`)
3. Identify canonical gaps, overlaps, contradictions, and stale artifacts
4. Propose consolidation plan with explicit impact and risk
5. Execute documentation updates (metadata/index/current-state/patch folding)
6. Re-run integrity checks and publish governance report

Rules:
- No hidden assumptions about doc validity
- Cite file paths for all claims
- Mark uncertain conclusions as low confidence

---

## Required Artifacts

### Repository registry
- `docs/INDEX.md`

Must include:
- active initiatives and canonical docs
- superseded chains (where applicable)
- historical archive locations
- docs needing review (staleness queue)

### Canonical product current-state summary
- `docs/00-current-state.md`

Must include:
- currently true statements for the product as a whole
- explicitly not-true/deprecated assumptions
- top open decisions
- links to canonical docs only
- last reviewed date and confidence

### Initiative working docs (non-canonical by default)
- Discovery handoff: `docs/<initiative-slug>/01-discovery-handoff.md`
- Feature spec(s): `docs/<initiative-slug>/02-*.md`

Rules:
- Initiative docs are implementation/planning artifacts unless explicitly promoted.
- After initiative completion, accepted outcomes must be folded into `docs/00-current-state.md`.
- If initiative docs conflict with `docs/00-current-state.md`, the canonical source is `docs/00-current-state.md`.

### Legacy/historical references
- under `docs/_history/...` with explicit non-canonical labeling

---

## Completion Gates
A governance pass is `PASS` only if:
- each governed topic has exactly one canonical `current` source (or explicit `BLOCKED` reason)
- patch docs are either folded or explicitly scheduled with owner/date
- supersession metadata is consistent and bidirectional where required
- `docs/INDEX.md` is updated and internally consistent
- `docs/00-current-state.md` is updated after each completed initiative with review date/confidence
- unresolved contradictions are listed with unblock questions

If not complete, return:
- `status: BLOCKED`
- `blocker_type`
- `blocker_detail`
- `unblock_questions`

---

## Operating Cadence
- Per meaningful change: docs impact check (update/justify/defer)
- After each completed initiative: fold accepted outcomes into `docs/00-current-state.md`
- Weekly: patch-folding and supersession cleanup
- Monthly: confidence audit of canonical docs

---

## Long-Thread Hygiene
For extended governance sessions:
- checkpoint every major scope shift or ~20-30 turns
- maintain a running `Governance Decisions` summary
- avoid re-litigating settled classification unless new evidence appears
- restate canonical decisions when drift is detected

---

## Style
- concise, structured, audit-oriented
- explicit evidence and file-path citations
- direct about uncertainty and contradictions
- no flattery
