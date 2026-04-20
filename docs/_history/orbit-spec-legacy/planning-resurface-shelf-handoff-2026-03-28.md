# Orbit — Resurface Shelf Planning Handoff

## Governance metadata
- state: superseded
- supersedes: `docs/_history/orbit-spec-legacy/planning-hide-snooze-resurface-2026-03-20.md`
- superseded_by: `docs/00-current-state.md`
- supersession_reason: consolidated current-state baseline keeps resurfacing in hidden tray badge semantics rather than separate shelf object.

## Document purpose

Package the completed planning conclusions for Orbit’s resurfacing behavior so Sophie can turn them into a spec-level artifact.

This document is planning-level only. It captures the agreed product shape, constraints, and remaining downstream hardening needs. It does **not** define implementation detail, acceptance criteria, or engineering task breakdown.

## Who this document is for

- Primary: Sophie
- Secondary: Rajesh, Nicole

## Planning stage / source

This document reflects completed planning work on Orbit’s resurfacing behavior after the chrome/canvas separation was clarified.

Primary planning inputs:
- Rajesh’s clarification that the **system chrome is fully system-controlled**
- Rajesh’s clarification that the **canvas is fully user-controlled**
- Orbit hidden / unhide / resurface planning already established in prior Orbit planning artifacts
- Further Rajesh ↔ Pam planning decisions on how resurfaced cards should return without violating canvas ownership

## Current product context

Orbit’s current UI architecture now makes a strong product distinction:
- **system chrome** is system-owned
- **canvas** is user-owned

This changes resurfacing behavior materially.

The system should no longer behave as if it can place, rearrange, or otherwise edit the canvas on the user’s behalf. Any resurfacing model that reintroduces system-driven placement into the canvas is now a poor fit for Orbit.

## Core planning conclusion

The correct near-term product direction for Orbit is:

# Resurface Shelf

Resurfaced cards should return into a **chrome-owned Resurface Shelf**, not directly back into the canvas.

Resurfacing therefore means:
- the system returns a snoozed hidden card back into the user’s attention
- but it returns it into **system-owned chrome**, not into the user’s spatial canvas
- the user may then explicitly drag the resurfaced card back into the canvas if it matters again

This preserves the chrome/canvas boundary while still allowing hidden priorities to return meaningfully.

## Product judgment

### 1) System must never edit the canvas
This is the governing rule.

Implications:
- resurfaced cards must **not** auto-enter the canvas
- the system must **not** auto-place cards at original coordinates, edge zones, fallback positions, or any other in-canvas location
- the system must **not** move existing user-positioned cards to make room
- earlier ideas such as edge-drop re-entry should now be treated as ruled out

### 2) Resurface is return to attention, not return to canvas
A resurfaced card should come back into the user’s attention through system chrome.

The canvas remains the user’s authored map. Re-entry into that map should happen only through explicit user action.

### 3) Resurface remains distinct from Unhide
The semantic distinction remains important:
- **Unhide** = manual recovery from Hidden tray
- **Resurface** = system-driven return of a snoozed hidden card back into attention

### 4) Context boundaries remain strict
Resurfacing is context-scoped.

A resurfaced card should appear only in relation to its own context, never as a mixed-context global shelf.

## Recommended shelf model

## Shelf presence
- If there are **no resurfaced cards** for the current context, the Resurface Shelf should **not be visible**.
- If there is **at least one resurfaced card** for the current context, the shelf should appear.
- When the resurfaced set returns to zero, the shelf should disappear again.

This keeps chrome quiet and prevents idle system UI from lingering without purpose.

## Shelf location / ownership
- The shelf lives in **system chrome**, not in canvas.
- It is part of the chrome layer even if its temporary expansion overlaps canvas bounds visually.
- Any temporary overflow surface opened by the user is still system UI, not canvas content.

## Shelf contents
- The shelf shows **compact cardlets**.
- Cardlets should be directly visible in the shelf itself; no extra click should be required just to reveal resurfaced items.
- Card identity matters, so resurfaced items should not begin life as hidden counts only.

## Cardlet capabilities
Visible resurfaced cardlets should support:
- **drag back into canvas**
- **rehide**

They should **not** gain extra dismiss/close semantics in MVP, to avoid muddying state meaning.

## Rehide semantics
If a resurfaced card is hidden again from the shelf, that action should:
- reopen the **snooze choices** again
- not silently default to plain hide

The product meaning is: hiding from resurfaced state should behave like a fresh hide-time decision.

## Shelf capacity and pressure behavior
The shelf should be designed to remain bounded and non-jamming.

### Locked planning direction
- Use a **fixed shelf lane** in chrome
- Give each visible cardlet a **maximum width**
- Show as many resurfaced cardlets as fit within shelf capacity
- Once capacity is exceeded, convert the remainder into an overflow count token such as `+5`

This avoids chrome crowding while preserving visibility of specific resurfaced cards.

### Why this direction is preferred
This was chosen over scrolling or open/close shelf-only interaction because:
- resurfaced card identity should remain visible without extra interaction
- chrome must never become unstable or overlap destructively
- bounded visible cardlets + overflow token is more legible than hidden horizontal scrolling

## Overflow behavior
- The overflow token (for example `+5`) should be **clickable**.
- Clicking it should reveal the hidden remainder in a **temporary user-invoked overflow surface**.
- That overflow surface may visually overlap the canvas region, but it remains **system chrome**, not canvas.
- After use, it should fold back into its chrome-owned state.

### Overflow content shape
For MVP planning direction, the overflow surface should show:
- the **same compact cardlets**, not a denser text-list form

This keeps interaction language consistent between visible shelf and overflow state.

## Ordering judgment
Ordering inside the shelf is not a meaningful product concern at this stage.

Planning direction:
- no strong semantic importance should be attached to first/last ordering
- if needed for deterministic rendering, showing the **oldest waiting** items visibly is acceptable
- do not spend downstream design energy over-optimizing order unless later product use proves it matters

## Context-scope rules (locked)
These rules should be treated as first-order and explicit:

- The Resurface Shelf is **strictly context-scoped**.
- It shows **only resurfaced cards for the currently open context**.
- Switching context switches the shelf contents.
- No global mixed-context resurfacing surface exists in MVP.
- If a card resurfaces while its context is not currently open, it becomes available in that context’s shelf and does **not** appear in the currently open context.

## Scope now
Recommend including now:
- chrome-owned Resurface Shelf
- shelf hidden when empty
- direct visible compact cardlets in shelf
- drag-back to canvas from shelf
- rehide from shelf with snooze-choice reopening
- max-width cardlet strategy
- overflow count token (`+N`) after visible capacity is reached
- clickable overflow token that opens temporary overflow chrome
- strict current-context-only resurfacing behavior

## Scope later
Recommend deferring for now:
- global resurfacing surfaces across contexts
- richer priority ordering / ranking of resurfaced cards
- alternate resurfacing inbox/history systems
- extra cardlet actions beyond drag-back and rehide
- any system-driven in-canvas placement behavior
- more complex scheduling/reminder semantics beyond the already-established hide+snooze+resurface model

## Key assumptions
This document assumes:
- Orbit’s chrome/canvas separation is now a durable architectural and product rule
- the user should remain the only party that edits the canvas
- resurfacing must return meaningfully into attention without behaving like a reminder app or notification center
- compact cardlets are enough to preserve card identity in chrome
- temporary chrome expansion over the canvas area is acceptable **only when user-invoked** and **only as chrome**, not as canvas mutation

## Main risks

### Risk 1 — accidental canvas-rule violation
If downstream spec/build work quietly reintroduces automatic in-canvas placement, Orbit will violate the newly clarified ownership model.

### Risk 2 — chrome crowding
If shelf pressure behavior is not bounded clearly, many resurfaced items may jam or destabilize chrome.

### Risk 3 — semantic drift
If rehide, unhide, and resurface are not kept conceptually distinct, the product may become confusing.

### Risk 4 — overflow UX heaviness
If the overflow experience becomes too modal, too heavy, or too much like a second inbox, the resurfacing flow may become overbuilt relative to Orbit’s philosophy.

## Open questions for Sophie
These are downstream hardening questions, not unresolved planning direction:

1. Exact chrome placement of the shelf within the current header/rail structure.
2. Exact visual design of compact cardlets.
3. Exact shelf capacity calculation before `+N` appears.
4. Exact design of the temporary overflow surface opened from `+N`.
5. Exact drag semantics from visible shelf vs overflow surface.
6. Exact snooze-choice reopening interaction when rehide is triggered from a resurfaced cardlet.
7. Whether any subtle resurfaced acknowledgment still accompanies shelf entry, or whether shelf presence alone is sufficient.

## Recommended downstream next step

Sophie should produce a spec-level proposal for **Orbit Resurface Shelf (MVP)** using this planning direction.

That spec should harden:
- shelf behavior
- chrome pressure/degradation behavior
- overflow interaction shape
- cardlet interaction details
- visual/interaction consistency with Orbit’s current chrome system

The spec should preserve the non-negotiable rule that the system does **not** edit the canvas.