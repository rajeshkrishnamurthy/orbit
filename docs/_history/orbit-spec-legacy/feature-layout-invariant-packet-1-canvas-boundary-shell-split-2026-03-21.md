# Feature Spec — Layout Invariant Packet 1: `canvasViewportRect` Contract + Shell Split

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Packet spec (foundational shell)
- **Date:** 2026-03-21
- **Status:** Draft-for-implementation
- **Depends on:**
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-layout-invariant-patch-2026-03-21.md`
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-layout-invariant-packet-0-baseline-audit-2026-03-21.md` (artifacts)

## Intent
Introduce an enforceable layout boundary contract so future UI cannot intrude into user canvas.

## In scope
- Introduce first-class `canvasViewportRect` from layout shell.
- Split shell into explicit regions: system strip region + canvas region.
- Ensure placement APIs can query boundary guard.
- Add boundary assertions in test harness.

## Out of scope
- Chrome relocation itself (Packet 2).
- Strip pressure behavior.
- Coordinate migration.

## Behavior contract
- `canvasViewportRect` is authoritative for canvas bounds.
- System-layer components must use the boundary contract for placement checks.
- Boundary must be queryable by rendering layer and tests.

## Acceptance criteria
1. `canvasViewportRect` exists as a stable runtime artifact.
2. Shell regions are split and identifiable (`system strip`, `canvas`).
3. Automated assertions can detect boundary violation.
4. Existing card interactions continue to work with no visual regressions beyond shell partitioning.

## Handoff to next packet
Packet 2 uses the shell/boundary contract to relocate system chrome and implement strip pressure/degradation behavior.