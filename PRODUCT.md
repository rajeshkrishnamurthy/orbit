# Orbit Product Baseline (Desktop)

## Scope

- Platforms: macOS and Windows desktop
- Web + desktop dual mode is supported
- Mobile behavior is explicitly deferred

## Core Workflows (Must Work)

1. Add new card
2. Drag-and-drop card movement is smooth and stable
3. Center and Periphery lens views, including slider behavior
4. Change card color
5. Hide card and recover hidden card
6. Add new context
7. Enter a context and move to its associated canvas

## Additional Functional Behaviors (Must Work)

1. Deleting a card removes it from the system
2. Deleting a context (after confirmation) removes the context and all associated focus cards
3. Hidden tray count reflects the actual number of hidden cards in the current focus canvas
4. Context title is editable in focus view
5. Card height adjusts subtly based on sub-note length (single-line vs two-line)
6. Card and font sizes update correctly based on center/periphery placement

## Non-Negotiable Behaviors

1. Deleting a context must always require explicit confirmation
2. Application updates must never reset existing user data
3. Hidden cards must always be recoverable
4. Card positions must persist across restart and updates

## Out of Scope (Current Phase)

- Mobile UX behavior, UX parity, and mobile-only features

## Release Acceptance (Desktop)

A release is acceptable only if all core workflows above pass manual smoke testing and all non-negotiable behaviors are preserved.
