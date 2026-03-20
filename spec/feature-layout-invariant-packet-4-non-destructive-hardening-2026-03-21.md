# Feature Spec — Layout Invariant Packet 4: Non-Destructive Behavior Hardening

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Packet spec (behavior hardening)
- **Date:** 2026-03-21
- **Status:** Draft-for-implementation
- **Depends on:**
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-layout-invariant-packet-2-chrome-relocation-strip-pressure-2026-03-21.md`
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-layout-invariant-packet-3-coordinate-semantics-migration-2026-03-21.md`

## Intent
Prove that the layout invariant is behaviorally stable: system updates must not mutate user card placement unexpectedly.

## In scope
- Verify system events do not move existing user-positioned cards.
- Validate drag/hide/unhide/lens flows under strip state changes.
- Validate insertion-policy scaffolding for future resurface behavior:
  - prior coordinates if collision-safe,
  - deterministic fallback,
  - never displace existing cards.
- Expand regression matrix to include viewport/zoom and strip-pressure states.

## Out of scope
- Full snooze/resurface feature implementation.
- New interaction controls for acknowledgments.
- Re-tuning visual style unrelated to invariant behavior.

## Non-destructive guarantee
System-driven events (layout refresh, strip pressure, mode toggles, acknowledgments) must not mutate existing card coordinates except explicit user drag/move actions or insertion of the resurfacing card under deterministic rules.

## Acceptance criteria
1. Existing card coordinates remain unchanged during system-only events.
2. Drag/hide/unhide/lens behavior remains stable while strip transitions occur.
3. Deterministic insertion policy is test-validated for repeatable outcomes.
4. No overlap regressions reappear at supported viewport/zoom matrix.
5. Packet 5 release checkpoint can use this packet outputs as sign-off evidence.

## Handoff to next packet
Packet 5 performs foundation release checkpoint and formal sign-off before deeper Hide+Snooze+Resurface implementation.