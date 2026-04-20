# Packet 3 Implementation Notes

## Verdict

The coordinate model is **canvas-relative**.

## Evidence

- Packet 0 create and drag traces show request payloads with `x/y` values written directly to card placement and persisted unchanged after reload.
- Packet 0 persist trace shows the same stored `x/y` values after app reload.
- `orbit.go` stores item `x/y` directly in `items.x` and `items.y` with no coordinate conversion in the save path.
- The targeted persistence check passes:
  - `npm run test:ui -- e2e/core-ui.spec.ts -g "drag/drop persists card position after reload"`

## Migration Decision

Migration was **skipped**.

Why:

- The available evidence already shows the persisted model is canvas-relative.
- There is no evidence of absolute-display coordinates in the existing data flow.
- The post-reload position check shows no user-observable drift for existing cards.

## Audit Trail

Used evidence from:

- Packet 0 coordinate traces
- Packet 1 boundary contract notes
- Packet 2 chrome relocation notes
- `orbit.go` item storage and reload paths

No migration ran for Packet 3.

## Verification

- `npm run test:ui -- e2e/core-ui.spec.ts -g "drag/drop persists card position after reload"` -> PASS

## Handoff

Packet 4 can rely on stable canvas-relative coordinate semantics without a migration assumption.
