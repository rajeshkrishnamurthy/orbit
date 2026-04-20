# Orbit Documentation Index

Last reviewed: 2026-04-06  
Owner lane: docs-governance

## Source-of-truth map

### Current canonical docs (high confidence)
1. `docs/INDEX.md` (this registry)
2. `docs/00-current-state.md` (canonical current-state baseline)
3. `docs/version-history.md` (product change timeline)

### Supporting governance docs (historical structure + archive contract)
- `docs/_history/orbit-spec-legacy/README.md` (archive usage contract)
- `docs/_history/orbit-spec-legacy/index.md` (legacy archive inventory entrypoint; counts inside need refresh)

## Active initiative structure

### `docs/context-cards/`
- Structure check result: folder exists but has no canonical initiative docs yet.
- Missing expected bootstrap docs:
  - `docs/context-cards/00-current-state.md`
  - `docs/context-cards/01-discovery-handoff.md`
  - `docs/context-cards/02-*.md`
- Governance status: **needs initialization before any product-truth promotion**.

## Legacy archive map

Primary historical archive:
- `docs/_history/orbit-spec-legacy/`

Historical clusters:
- Planning docs: `planning-*.md`, `sequence-touch-2026-03-18.md`
- Feature specs/patches: `feature-*.md`
- Layout packet evidence: `layout-invariant-packet-*/`
- Prompt/operational artifact: `codex-prompt-planning-resurface-shelf-2026-03-28.md`

## Known supersession chains (explicit metadata added in legacy docs)

1. Completion interaction
- `feature-last-mile-completion-flow-2026-03-16.md`
  -> superseded by `feature-last-mile-completion-flow-patch-v2-2026-03-16.md`
  -> later interaction model hardened in `feature-in-card-hover-action-drawer-2026-03-17.md`

2. Touch / stale planning to spec
- `planning-touched-2026-03-18.md`
- `sequence-touch-2026-03-18.md`
  -> superseded by `feature-touch-active-stale-foundation-2026-03-18.md`
  -> amended by:
    - `feature-touch-control-right-edge-placement-patch-2026-03-18.md`
    - `feature-stale-normal-view-emphasis-patch-2026-03-18.md`
    - `feature-new-card-default-active-patch-2026-03-20.md`

3. Resurface direction pivot
- `planning-hide-snooze-resurface-2026-03-20.md` (resurface back to canvas)
  -> superseded by `planning-resurface-shelf-handoff-2026-03-28.md` (resurface shelf in chrome)
  -> hardened in `feature-planning-resurface-shelf-2026-03-28.md`

## Archive integrity notes

- Most legacy docs still reference old `spec/` paths that no longer exist in repo root.
- Legacy index counts are stale versus current archive contents.
- Packet specs (0–5) are marked draft while packet implementation notes indicate completion; status metadata is inconsistent.

## Staleness / revalidation queue

Priority P0
1. Initialize `docs/context-cards/` canonical scaffold (`00-current-state`, `01-discovery-handoff`, `02-*`).
2. Add cross-link notice in legacy archive entrypoints pointing to `docs/00-current-state.md` as primary current baseline.

Priority P1
3. Refresh legacy index inventory in `docs/_history/orbit-spec-legacy/index.md`.
4. Normalize broken `spec/` path references across legacy docs (or add archive-safe note that links are historical).
5. [Done] Explicit supersession metadata blocks added to high-conflict legacy chains; extend coverage to remaining packet docs.

Priority P2
6. Fold patch chains into minimal current-spec set outside `_history`.
7. Mark execution artifacts (`codex-prompt-*`, packet evidence assets) as archival-only in a machine-readable manifest.
