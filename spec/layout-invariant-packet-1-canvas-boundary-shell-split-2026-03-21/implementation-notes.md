# Packet 1 Implementation Notes

This folder is the Packet 1 evidence and handoff package for the layout-invariant rollout.

## Packet 0 baseline inputs used

- [Implementation notes](../layout-invariant-packet-0-baseline-audit-2026-03-21/implementation-notes.md)
- [Overlap matrix](../layout-invariant-packet-0-baseline-audit-2026-03-21/overlap-matrix.md)
- [Boundary map](../layout-invariant-packet-0-baseline-audit-2026-03-21/boundary-map.md)
- [Coordinate traces](../layout-invariant-packet-0-baseline-audit-2026-03-21/coordinate-traces.md)
- [Risk register](../layout-invariant-packet-0-baseline-audit-2026-03-21/risk-register.md)

## Packet 1 contract

- `canvasViewportRect` is exposed as a runtime layout artifact.
- The shell is split into explicit `system strip` and `canvas` regions.
- Placement code can query the boundary guard through the runtime artifact.
- The test harness includes a boundary assertion that checks the shell split and the canvas guard.

## Changed files

- [`templates/index.html`](../../../templates/index.html)
- [`static/styles.css`](../../../static/styles.css)
- [`static/app.js`](../../../static/app.js)
- [`e2e/core-ui.spec.ts`](../../../e2e/core-ui.spec.ts)

## Verification

- `node --check static/app.js` -> PASS
- `npm run test:ui -- e2e/core-ui.spec.ts` -> PASS (`19` tests)

## Handoff note

Packet 2 can consume this shell split and boundary guard to relocate chrome and add strip pressure behavior without changing the Packet 1 contract.
