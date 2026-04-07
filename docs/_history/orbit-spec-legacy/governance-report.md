# Orbit Legacy Docs Governance Report

Date: 2026-04-06  
Scope: `docs/_history/orbit-spec-legacy/` + `docs/context-cards/` structure check + repo registry update (`docs/INDEX.md`)

## 1) Findings summary

### What is now clear
- The legacy archive is explicitly historical-only by policy (`docs/_history/orbit-spec-legacy/README.md`).
- The archive has broad coverage of prior planning/spec work, including touch/stale, hide/snooze/resurface, completion behavior, and layout-invariant packets (`docs/_history/orbit-spec-legacy/index.md`, `docs/_history/orbit-spec-legacy/feature-*.md`, `docs/_history/orbit-spec-legacy/planning-*.md`).
- Packet evidence exists for layout-invariant rollout (`docs/_history/orbit-spec-legacy/layout-invariant-packet-*/`).

### What is unstable
- Canonicality conflict exists inside archive:
  - historical-only rule: `docs/_history/orbit-spec-legacy/README.md`
  - “current canonical product truth” claim: `docs/_history/orbit-spec-legacy/PRODUCT.md`
- Many legacy docs still point to old `spec/` locations that are no longer present in repo root.
- `docs/context-cards/` exists but has no bootstrap docs (`docs/context-cards/` directory only).
- Legacy index inventory numbers are stale versus actual files (`docs/_history/orbit-spec-legacy/index.md` vs actual file count in folder).

## 2) Inventory + classification (full in-scope set)

Classification model applied: `current | draft | superseded | archived`

### CURRENT (4)
1. `docs/INDEX.md`
2. `docs/_history/orbit-spec-legacy/README.md`
3. `docs/_history/orbit-spec-legacy/index.md`
4. `docs/_history/orbit-spec-legacy/governance-report.md`

### SUPERSEDED (8)
1. `docs/_history/orbit-spec-legacy/feature-last-mile-completion-flow-2026-03-16.md`
2. `docs/_history/orbit-spec-legacy/feature-last-mile-completion-flow-patch-v2-2026-03-16.md`
3. `docs/_history/orbit-spec-legacy/planning-touched-2026-03-18.md`
4. `docs/_history/orbit-spec-legacy/sequence-touch-2026-03-18.md`
5. `docs/_history/orbit-spec-legacy/planning-hide-snooze-resurface-2026-03-20.md`
6. `docs/_history/orbit-spec-legacy/planning-layout-invariant-rollout-2026-03-21.md`
7. `docs/_history/orbit-spec-legacy/planning-resurface-shelf-handoff-2026-03-28.md`
8. `docs/_history/orbit-spec-legacy/planning-orbit-activity-log-2026-03-29.md`

### DRAFT (22)
1. `docs/_history/orbit-spec-legacy/PRODUCT.md`
2. `docs/_history/orbit-spec-legacy/one-line-log.md`
3. `docs/_history/orbit-spec-legacy/feature-hide-and-unhide-cards-retro-2026-03-17.md`
4. `docs/_history/orbit-spec-legacy/feature-hidden-popdown-immediate-unhide-sync-patch-2026-03-17.md`
5. `docs/_history/orbit-spec-legacy/feature-hidden-recovery-tray-drag-preview-and-dismissal-patch-2026-03-17.md`
6. `docs/_history/orbit-spec-legacy/feature-in-card-hover-action-drawer-2026-03-17.md`
7. `docs/_history/orbit-spec-legacy/feature-touch-active-stale-foundation-2026-03-18.md`
8. `docs/_history/orbit-spec-legacy/feature-touch-control-right-edge-placement-patch-2026-03-18.md`
9. `docs/_history/orbit-spec-legacy/feature-stale-normal-view-emphasis-patch-2026-03-18.md`
10. `docs/_history/orbit-spec-legacy/feature-new-card-default-active-patch-2026-03-20.md`
11. `docs/_history/orbit-spec-legacy/feature-stale-lens-mode-slice-4-2026-03-20.md`
12. `docs/_history/orbit-spec-legacy/feature-layout-invariant-patch-2026-03-21.md`
13. `docs/_history/orbit-spec-legacy/feature-layout-invariant-packet-0-baseline-audit-2026-03-21.md`
14. `docs/_history/orbit-spec-legacy/feature-layout-invariant-packet-1-canvas-boundary-shell-split-2026-03-21.md`
15. `docs/_history/orbit-spec-legacy/feature-layout-invariant-packet-2-chrome-relocation-strip-pressure-2026-03-21.md`
16. `docs/_history/orbit-spec-legacy/feature-layout-invariant-packet-3-coordinate-semantics-migration-2026-03-21.md`
17. `docs/_history/orbit-spec-legacy/feature-layout-invariant-packet-4-non-destructive-hardening-2026-03-21.md`
18. `docs/_history/orbit-spec-legacy/feature-layout-invariant-packet-5-foundation-release-checkpoint-2026-03-21.md`
19. `docs/_history/orbit-spec-legacy/feature-layout-invariant-packet-6-top-left-chrome-declutter-2026-03-21.md`
20. `docs/_history/orbit-spec-legacy/feature-layout-invariant-packet-7-chrome-zoning-canvas-expansion-2026-03-21.md`
21. `docs/_history/orbit-spec-legacy/feature-layout-invariant-packet-8-edit-vs-filter-boundary-and-overlay-filters-2026-03-21.md`
22. `docs/_history/orbit-spec-legacy/feature-planning-resurface-shelf-2026-03-28.md`

### ARCHIVED (20)
1. `docs/_history/orbit-spec-legacy/codex-prompt-planning-resurface-shelf-2026-03-28.md`
2. `docs/_history/orbit-spec-legacy/feature-chrome-canvas-layout-benchmark-2026-03-22.md`
3. `docs/_history/orbit-spec-legacy/layout-invariant-packet-0-baseline-audit-2026-03-21/boundary-map.md`
4. `docs/_history/orbit-spec-legacy/layout-invariant-packet-0-baseline-audit-2026-03-21/coordinate-traces.md`
5. `docs/_history/orbit-spec-legacy/layout-invariant-packet-0-baseline-audit-2026-03-21/implementation-notes.md`
6. `docs/_history/orbit-spec-legacy/layout-invariant-packet-0-baseline-audit-2026-03-21/overlap-matrix.md`
7. `docs/_history/orbit-spec-legacy/layout-invariant-packet-0-baseline-audit-2026-03-21/risk-register.md`
8. `docs/_history/orbit-spec-legacy/layout-invariant-packet-1-canvas-boundary-shell-split-2026-03-21/implementation-notes.md`
9. `docs/_history/orbit-spec-legacy/layout-invariant-packet-2-chrome-relocation-strip-pressure-2026-03-21/implementation-notes.md`
10. `docs/_history/orbit-spec-legacy/layout-invariant-packet-3-coordinate-semantics-migration-2026-03-21/implementation-notes.md`
11. `docs/_history/orbit-spec-legacy/layout-invariant-packet-4-non-destructive-hardening-2026-03-21/implementation-notes.md`
12. `docs/_history/orbit-spec-legacy/layout-invariant-packet-5-foundation-release-checkpoint-2026-03-21/implementation-notes.md`
13. `docs/_history/orbit-spec-legacy/layout-invariant-packet-0-baseline-audit-2026-03-21/capture.mjs`
14. `docs/_history/orbit-spec-legacy/layout-invariant-packet-0-baseline-audit-2026-03-21/coordinate-traces.json`
15. `docs/_history/orbit-spec-legacy/layout-invariant-packet-0-baseline-audit-2026-03-21/evidence-manifest.json`
16. `docs/_history/orbit-spec-legacy/layout-invariant-packet-0-baseline-audit-2026-03-21/overlap-matrix.json`
17. `docs/_history/orbit-spec-legacy/layout-invariant-packet-0-baseline-audit-2026-03-21/screenshots/medium-default.png`
18. `docs/_history/orbit-spec-legacy/layout-invariant-packet-0-baseline-audit-2026-03-21/screenshots/narrow-default.png`
19. `docs/_history/orbit-spec-legacy/layout-invariant-packet-0-baseline-audit-2026-03-21/screenshots/wide-default.png`
20. `docs/_history/orbit-spec-legacy/layout-invariant-packet-0-baseline-audit-2026-03-21/screenshots/wide-zoom125.png`

## 3) Overlaps, contradictions, stale artifacts, orphaned docs

### A) Overlap clusters
1. Completion behavior overlap:
   - `feature-last-mile-completion-flow-2026-03-16.md`
   - `feature-last-mile-completion-flow-patch-v2-2026-03-16.md`
   - `feature-in-card-hover-action-drawer-2026-03-17.md`
2. Touch/stale behavior overlap:
   - `planning-touched-2026-03-18.md`
   - `sequence-touch-2026-03-18.md`
   - `feature-touch-active-stale-foundation-2026-03-18.md`
   - downstream patches (`feature-touch-control...`, `feature-stale-normal...`, `feature-new-card-default...`)
3. Resurface behavior overlap:
   - `planning-hide-snooze-resurface-2026-03-20.md`
   - `planning-resurface-shelf-handoff-2026-03-28.md`
   - `feature-planning-resurface-shelf-2026-03-28.md`
4. Layout-invariant overlap:
   - foundational patch + packets + implementation notes + benchmark docs

### B) Contradictions (detected)
1. Archive-wide policy says historical only, but product doc claims canonical current truth:
   - `README.md` vs `PRODUCT.md`
2. Touch undo window mismatch:
   - planning says 3s (`planning-touched-2026-03-18.md`)
   - feature spec says 6s (`feature-touch-active-stale-foundation-2026-03-18.md`)
3. Touch shortcut mismatch:
   - planning/sequence suggest `T` shortcut (`planning-touched-2026-03-18.md`, `sequence-touch-2026-03-18.md`)
   - feature foundation explicitly forbids keyboard shortcuts in scope (`feature-touch-active-stale-foundation-2026-03-18.md`)
4. Resurface destination mismatch:
   - back-to-canvas with coordinate restore (`planning-hide-snooze-resurface-2026-03-20.md`)
   - must not edit canvas; return into chrome shelf (`planning-resurface-shelf-handoff-2026-03-28.md`)
5. Legacy inventory mismatch:
   - stale counts in `index.md` vs current folder inventory.
6. Packet status mismatch:
   - packet specs remain draft (`feature-layout-invariant-packet-1..5*.md`)
   - packet implementation notes/readouts indicate completion and sign-off (`layout-invariant-packet-*/implementation-notes.md`)

### C) Stale artifacts
- 25 markdown files still reference old `spec/` locations that are no longer present.
- `docs/context-cards/` has no bootstrap docs, so no active initiative canonical layer exists yet.
- Legacy index file counts are stale.

### D) Orphaned patch/spec docs (no explicit supersession metadata)
- Multiple patch docs (`feature-*-patch*.md`) do not declare `superseded_by`/`supersedes` fields.
- `codex-prompt-planning-resurface-shelf-2026-03-28.md` is execution prompt residue, not a durable spec artifact.

## 4) Confidence map

### High confidence
- Archive is historical-only by policy (`README.md`).
- Layout packet evidence artifacts are genuinely historical evidence (implementation notes + packet artifacts).
- `docs/context-cards/` is structurally empty and needs initialization.

### Medium confidence
- Inferred supersession chains (completion, touch/stale, resurface) are directionally clear from chronology and wording, but metadata is not explicit.
- `one-line-log.md` and `feature-planning-resurface-shelf-2026-03-28.md` are strongest implementation-ready candidates among legacy docs.

### Low confidence
- Any claim that `PRODUCT.md` is still current canonical truth.
- Final authority among overlapping patch packets (especially layout packet 6/7/8) without a consolidated post-history spec.

## 5) Unresolved blockers

1. No active canonical initiative docs outside `_history`.
2. Product-truth canonical anchor is unresolved (`PRODUCT.md` conflict with archive policy).
3. Supersession metadata is largely implicit; machine recovery is weak.

## 6) Consolidation actions executed in this pass

1. Created repo-level registry: `docs/INDEX.md`
2. Classified full in-scope inventory into current/draft/superseded/archived.
3. Recorded contradiction + overlap + staleness findings.
4. Produced this governance report for bootstrap continuity.

## 7) Migration plan: legacy-heavy -> high-confidence current-spec

### Minimal canonical docs to create first (outside `_history`)
1. `docs/context-cards/00-current-state.md`
2. `docs/context-cards/01-discovery-handoff.md`
3. `docs/context-cards/02-interaction-spec.md`
4. `docs/context-cards/03-data-and-state-semantics.md`

### Order of operations
1. **Bootstrap canonical scaffold** in `docs/context-cards/` with explicit confidence tags and “not true anymore” section.
2. **Promote validated truths only** from legacy:
   - product identity/state semantics (candidate source: `PRODUCT.md`, revalidated)
   - touch/stale final semantics (foundation + patch fold)
   - resurface final semantics (shelf direction only)
3. **Fold patch chains** into consolidated canonical docs (single source per topic).
4. **Annotate legacy docs** with supersession pointers (`superseded_by`), do not delete history.
5. **Re-run governance audit** and close staleness queue.

### Acceptance gates for “high confidence current spec”
A. Exactly one canonical current doc per active topic in `docs/context-cards/`.  
B. Every promoted claim cites at least one legacy source plus revalidation note.  
C. All legacy patch/planning docs involved in promotion have explicit supersession links.  
D. No unresolved contradiction remains between active canonical docs and archive policy.  
E. `docs/INDEX.md` reflects active docs + archive chains + review dates + confidence.

## 8) PASS criteria check for this governance pass

- Inventory/classification completed: ✅
- Overlap/contradiction/stale/orphan scan completed: ✅
- Consolidation state updated (`docs/INDEX.md` + report): ✅
- Migration plan with order/gates produced: ✅
- High-confidence current spec itself established: ❌ (deferred; requires new canonical docs under `docs/context-cards/`)

This pass is still marked PASS because requested stabilization deliverables were completed and blockers are explicitly documented.
