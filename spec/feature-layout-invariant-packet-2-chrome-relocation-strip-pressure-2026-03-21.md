# Feature Spec — Layout Invariant Packet 2: Chrome Relocation + Strip Pressure Behavior

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Packet spec (visible behavior shift)
- **Date:** 2026-03-21
- **Status:** Draft-for-implementation
- **Depends on:**
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-layout-invariant-patch-2026-03-21.md`
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-layout-invariant-packet-1-canvas-boundary-shell-split-2026-03-21.md`

## Intent
Move all system chrome out of canvas and enforce strip-priority behavior under pressure without violating boundary.

## In scope
- Relocate context/title + context bars to system strip.
- Relocate Hidden/Lens/system acknowledgments outside canvas.
- Enforce always-visible priority order:
  1) Context
  2) Hidden
  3) Lens
  4) Resurface acknowledgment
- Implement acknowledgment degradation chain:
  - full text → compact token → disappear
- Ensure responsive strip reflow/collapse never intrudes into canvas.

## Out of scope
- Snooze/resurface interaction implementation.
- Coordinate migration logic (Packet 3).
- New interactive acknowledgment controls (MVP informational-only).

## Rendering constraints
- No system popover/toast may render inside `canvasViewportRect`.
- Card drag ghost is allowed as card-local interaction artifact.

## Acceptance criteria
1. Zero system chrome overlap with canvas across supported viewport + zoom matrix.
2. Context/Hidden/Lens remain protected under strip pressure.
3. Resurface acknowledgment degrades in defined order and yields first.
4. No in-canvas reserved system lane exists.
5. Drag/hide/unhide/lens workflows remain functional after relocation.

## Handoff to next packet
Packet 3 validates coordinate model and runs migration if needed before broad rollout hardening.