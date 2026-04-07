# Feature Spec — Layout Invariant Packet 3: Coordinate Semantics Gate + Migration (Conditional)

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Packet spec (data/continuity gate)
- **Date:** 2026-03-21
- **Status:** Draft-for-implementation
- **Depends on:**
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-layout-invariant-packet-0-baseline-audit-2026-03-21.md`
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-layout-invariant-packet-1-canvas-boundary-shell-split-2026-03-21.md`
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-layout-invariant-packet-2-chrome-relocation-strip-pressure-2026-03-21.md`

## Intent
Close coordinate continuity risk before broader rollout by proving coordinate semantics and running migration only if required.

## In scope
- Determine persisted coordinate model conclusively:
  - canvas-relative, or
  - absolute-display.
- If absolute-display, implement one-time normalization migration to canvas-space.
- Validate visual continuity across app open/restart after migration.
- Keep migration idempotent and auditable.

## Out of scope
- New card layout algorithms.
- Any change to card semantics (hide/complete/lens/touch).
- Feature-layer snooze/resurface behavior.

## Decision gate
- If data proves coordinates are already canvas-relative, migration path is skipped and gate closes with evidence.
- If data proves absolute-display coordinates exist, migration path is mandatory.

## Migration requirements (if triggered)
1. One-time transform absolute-display `x,y` into canvas-space `x,y`.
2. Preserve on-screen continuity (no visible card jumps beyond tolerance).
3. Log migration run status and counts.
4. Keep migration safe to re-run (idempotent behavior).

## Acceptance criteria
1. Coordinate model verdict is documented with data evidence.
2. If migration needed, migration executes successfully on representative existing data.
3. No user-observable card position drift after migration + restart.
4. Post-migration persistence uses canvas-space coordinates only.
5. Packet 4 can rely on stable coordinate semantics without assumptions.

## Handoff to next packet
Packet 4 hardens non-destructive behavior and verifies system events never mutate existing user card coordinates.