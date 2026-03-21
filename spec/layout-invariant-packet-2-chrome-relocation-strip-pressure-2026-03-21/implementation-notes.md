# Packet 2 Implementation Notes

This folder is the Packet 2 evidence and handoff package for the layout-invariant rollout.

## Packet 1 baseline inputs used

- [Implementation notes](../layout-invariant-packet-1-canvas-boundary-shell-split-2026-03-21/implementation-notes.md)

## Packet 2 contract

- Context/title and related chrome render in the system strip.
- Hidden/Lens/system acknowledgments render outside the canvas.
- The system strip preserves priority order under pressure.
- Resurface acknowledgment degrades from full text to compact token to hidden.
- Existing card interactions continue to work without coordinate migration.

## Changed files

- [`templates/index.html`](../../../templates/index.html)
- [`static/styles.css`](../../../static/styles.css)
- [`static/app.js`](../../../static/app.js)
- [`e2e/core-ui.spec.ts`](../../../e2e/core-ui.spec.ts)

## Verification

- `node --check static/app.js` - PASS
- `git diff --check` - PASS
- `npm run test:ui -- e2e/core-ui.spec.ts -g "chrome relocation keeps every system chrome outside canvasViewportRect across viewport/zoom matrix"` - FAIL (`locator.click` timed out while creating a card in the matrix helper)
- `npm run test:ui -- e2e/core-ui.spec.ts -g "strip pressure degrades the acknowledgment while Context/Hidden/Lens stay visible"` - PASS
- `npm run test:ui -- e2e/core-ui.spec.ts -g "drag/drop persists card position after reload|hide/unhide updates hidden tray count accurately|stale lens shows only entry-time stale cards and refreshes on reload"` - PASS

## Handoff note

Packet 3 can use this relocated chrome and strip-pressure behavior as the stable layout layer for coordinate validation and any later rollout hardening.
