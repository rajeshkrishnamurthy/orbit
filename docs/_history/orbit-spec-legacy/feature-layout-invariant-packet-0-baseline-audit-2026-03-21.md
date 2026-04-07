# Feature Spec — Layout Invariant Packet 0: Baseline Audit + Observability Gate

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Packet spec (pre-change gate)
- **Date:** 2026-03-21
- **Status:** Draft-for-implementation
- **Depends on:** `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-layout-invariant-patch-2026-03-21.md`

## Intent
Create a measurable pre-change baseline so layout-invariant work can be validated and rolled back safely.

## In scope
- Capture overlap snapshots across representative viewport sizes and zoom levels.
- Record current placement of system chrome relative to current canvas bounds.
- Add observability for card coordinate read/write paths.
- Produce an evidence bundle consumed by Packets 1–3.

## Out of scope
- Any layout refactor.
- Any UI relocation.
- Any coordinate migration.

## Required outputs (gate artifacts)
1. **Overlap matrix** with pass/fail + screenshots per viewport/zoom profile.
2. **Current boundary map** describing where system elements render against canvas.
3. **Coordinate trace sample** proving where `x,y` are read/written in runtime flow.
4. **Known-risk register** for migration-sensitive paths.

## Acceptance criteria
1. Baseline matrix exists and is reproducible from documented viewport/zoom profiles.
2. At least one trace path for card create, drag/move, load, and persist is captured.
3. Evidence package is stored in-repo and linked from implementation notes.
4. Packet 1 can consume artifacts without additional product clarifications.

## Handoff to next packet
Packet 1 consumes boundary-map and trace outputs to establish `canvasViewportRect` contract and shell split.

## Packet 0 evidence package
- Implementation notes: [`./layout-invariant-packet-0-baseline-audit-2026-03-21/implementation-notes.md`](./layout-invariant-packet-0-baseline-audit-2026-03-21/implementation-notes.md)
- Artifact directory: [`./layout-invariant-packet-0-baseline-audit-2026-03-21/`](./layout-invariant-packet-0-baseline-audit-2026-03-21/)
