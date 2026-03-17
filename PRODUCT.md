# Orbit Product Truth (Desktop/Web)

**Status:** Current canonical product truth for Orbit desktop/web behavior  
**Last updated:** 2026-03-17

## Product Identity

Orbit is an **executive attention surface**, not a conventional task manager.

Its job is to help a user maintain a live spatial picture of what matters right now. Orbit should feel lightweight, direct, and calm: users place cards on a freeform canvas, organize them through position and context, and interact with them without dashboard heaviness or workflow bureaucracy.

## Core Product Principles

1. **Spatial placement is truth.** Where a card is placed on the canvas is a meaningful part of the product model, not a cosmetic layout choice.
2. **Freeform over workflow mechanics.** Orbit must not drift into lanes, snapping, rigid columns, or dashboard/task-manager framing.
3. **Lightweight card model.** Cards stay intentionally minimal and quick to manipulate.
4. **Calm interaction language.** Visual feedback should be clear and satisfying without becoming loud, gamified, or operationally heavy.
5. **Contexts shape focus.** Contexts are how the user narrows attention to a sub-space without losing the broader spatial model.
6. **Hide, complete, delete, and at-risk are distinct states/actions.** These must never collapse into each other semantically.

## Scope

- Platforms: macOS and Windows desktop
- Web + desktop dual mode is supported
- Mobile behavior is explicitly deferred

## Core Product Objects

### Card
A card is the primary unit of attention on the canvas.

Current card model includes:
- title/content
- short visible sub-note
- position on canvas
- color
- slipping (`!`) state

Cards are draggable, editable, can be hidden, can be completed, and can be deleted. New empty cards should not persist if focus leaves before meaningful content is entered.

### Context
A context is a named focus container associated with its own canvas. Entering a context moves the user into that context’s canvas while preserving the product’s broader spatial model.

### Focus Canvas
A focus canvas is the active surface in which cards are viewed and manipulated, either at the main level or inside a context.

### Hidden Tray
The hidden tray is the recoverable holding area for cards hidden from the current focus canvas. Hidden is a reversible visibility state, not completion and not deletion.

## Core Interaction Model

- The canvas is freeform.
- Drag-and-drop placement must feel smooth and stable.
- Center and periphery are a visual/focus lens, not a rigid workflow structure.
- Card size and font treatment may respond subtly to center/periphery placement.
- Card actions should remain lightweight and Orbit-style rather than heavy button-driven UI.
- Desktop/web card actions currently use a **top-right hover action drawer** within card bounds for minimize, cancel, and complete.
- The slipping glyph remains a separate persistent control.

## Core Workflows (Must Work)

1. Add new card
2. Drag-and-drop card movement is smooth and stable
3. Center and Periphery lens views, including slider behavior
4. Change card color
5. Hide card and recover hidden card
6. Add new context
7. Enter a context and move to its associated canvas
8. Complete a card through the in-card hover action drawer
9. Cancel a card through the in-card hover action drawer

## Current Functional Behaviors (Must Work)

1. Canceling a card removes it from the live system state, with Undo support where currently implemented
2. Completing a card is a distinct end-state flow from cancelation
3. Completing a card gives subtle acknowledgment, a brief Undo window, and then removes the card from the live canvas if not undone
4. Deleting a context (after confirmation) removes the context and all associated focus cards
5. Hidden tray count reflects the actual number of hidden cards in the current focus canvas
6. Context title is editable in focus view
7. Card height adjusts subtly based on sub-note length (single-line vs two-line)
8. Card and font sizes update correctly based on center/periphery placement
9. Deleting a card in focus view supports Undo restoration from the toast action
10. Slipping (`!`) toggle can be set/unset and persists for the card
11. New empty cards are discarded when focus leaves without content
12. Top-right card action drawer reveals minimize, cancel, and complete actions without changing card dimensions or drag/drop behavior
13. While the action drawer is open, underlying content in the drawer region is slightly dimmed for readability
14. Recently added bottom-right complete glyph is no longer part of the current card model

## State / Action Semantics

### Hide
Temporarily remove a card from the current focus canvas while keeping it recoverable via the hidden tray.

### Complete
Mark a card as meaningfully finished. Completion is recognized distinctly, allows brief Undo, and then removes the card from the live canvas. Completion is not hide and not cancel.

### Cancel
Remove a card from active system relevance. Cancel must remain distinct from completion.

### At-risk / Slipping
A live card can be flagged as slipping (`!`) without changing its existence or terminal state.

## Non-Negotiable Behaviors

1. Deleting a context must always require explicit confirmation
2. Application updates must never reset existing user data
3. Hidden cards must always be recoverable
4. Card positions must persist across restart and updates
5. Startup must prevent split-brain state when legacy `items.json` exists
6. Legacy runtime data migration must preserve existing user data during path transitions
7. Completion, hide, cancel, and slipping must remain semantically distinct
8. Orbit must not drift into lane-based, snapped, or dashboard-style workflow mechanics

## Out of Scope (Current Phase)

- Mobile UX behavior, UX parity, and mobile-only features
- Recently completed panel/tray/history
- Bulk completion behavior
- Rich multi-step last-mile workflow systems
- People modeling
- Rich note systems beyond the current lightweight card model
- Alternate/non-spatial primary views that displace the canvas as the core truth surface

## Release Acceptance (Desktop/Web)

A release is acceptable only if:
1. all core workflows above pass manual smoke testing,
2. all non-negotiable behaviors are preserved, and
3. the product still reads and feels like a lightweight spatial attention surface rather than a conventional task manager.
