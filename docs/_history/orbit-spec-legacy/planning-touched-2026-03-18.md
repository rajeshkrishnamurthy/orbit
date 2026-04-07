# Planning: Touch / Active / Stale for Orbit

## Governance metadata
- state: superseded
- superseded_by:
  - `docs/_history/orbit-spec-legacy/feature-touch-active-stale-foundation-2026-03-18.md`
  - `docs/00-current-state.md`
- supersession_reason: planning-level guidance replaced by feature-level semantics and consolidated baseline.

**Document date:** 2026-03-18  
**For:** Sophie (spec hardening)  
**From:** Pam (planning)  
**Upstream:** Orbit PRODUCT.md, Rajesh planning session

---

## Document Purpose

This planning document defines the feature semantics and interaction framing for **"Touch"** — a new Orbit primitive that lets users indicate meaningful real-world attention on a priority. Touch enables Orbit to distinguish between spatial placement (where a card lives) and temporal aliveness (whether it has been part of lived attention recently).

This is **planning-level guidance**, not implementation spec. Sophie should resolve detailed interaction, visual, and data specifications from this foundation.

---

## Core Semantic Decisions

### What "Touch" Means

**Touch = "This priority received meaningful real-world attention today."**

- It is a **pulse**, not a state change
- It does not alter hide, complete, cancel, or slipping semantics
- It captures contact that happened **outside Orbit** (the call, the meeting, the decision, the progress)

### One Touch Per Day

- Only **one meaningful touch per day per card**
- Additional touches same day have **no cumulative effect**
- Stored as **"last touched day"** (calendar day, not timestamp)

### 7-Day Touch Count

- Tracked internally as **continuity signal**
- Captures sustained engagement vs one-off contact
- Used in active/stale evaluation, but **not a prominent visible score**

---

## Active vs Stale Semantics

### Active Thresholds

Active is **derived, not manual**. A live card is active when its recent touch pattern supports the attention claim implied by its placement.

| Location | Active If | Else |
|----------|-----------|------|
| **Center** | Touched in last 2 days, **OR** touched 3+ times in past 7 days | Stale |
| **Periphery** | Touched in last 4 days, **OR** touched 2+ times in past 7 days | Stale |
| **Hidden** | **Excluded** from active/stale semantics | — |

### Stale Meaning

**Stale = "This priority remains live on the canvas but lacks recent real-world attention."**

- Stale cards are **not** unimportant, dead, or canceled
- Stale cards are **attention-dishonest** — they claim importance their touch history doesn't support
- Hidden cards do not participate in stale semantics (use "long-hidden" separately if needed)

### Why Different Thresholds

- Center makes a **stronger attention claim** → stricter freshness bar
- Periphery makes a **softer claim** → looser threshold
- Both eventually go stale if untouched; the only difference is timing

---

## Interaction Framing

### Touch Control Location

- **Right edge of card**, vertically aligned with three-dot drawer (top) and slipping glyph (bottom)
- Three action icons stacked: drawer → touch → slipping
- Grab indicator removed from right edge (hand cursor indicates drag)

### Visual Treatment (Sophie Domain)

**Touch indicator:**
- Single-tap activation
- Distinct visual state for "touched today" vs not
- Must not overlap with card text
- Must not increase card height

**Stale treatment:**
- Stale cards identified by **distinction in visual appearance** (border or other treatment)
- Applies uniformly to center and periphery stale cards
- Not "quieter" — stale demands action, so visible but not yelling

**Active treatment:**
- Normal Orbit presence
- No special chrome

### Lens / Filter Mode

- Dedicated **"view stale cards"** lens/filter
- Activation: toggle or keyboard shortcut
- Mode emphasizes stale cards (maintained/enhanced treatment) and de-emphasizes or backgrounds non-stale
- Provides focused review capability beyond ambient awareness

---

## Data Model Notes

- Store **last touched day** per card (local calendar day, timezone-resolved)
- Store **7-day touch count** (rolling or recalculated daily)
- Touch events are **facts**, not mutable state
- Undoing a touch: probably supported with brief toast (UX detail for Sophie)

---

## Areas of Ambiguity — Resolved

The following have been decided at planning level. Sophie to implement accordingly.

### 1. Touch Undo
- **Decision:** Yes, undoable.
- **Window:** 3-second toast with "Undo" action (standard Orbit pattern).
- **Rationale:** Touch is low-stakes; brief window keeps it lightweight.

### 2. Edge Cases
| Scenario | Decision |
|----------|----------|
| **New card creation** | **No auto-touch.** Touch reflects real-world contact, not creation. |
| **Center ↔ Periphery move** | **Recompute active/stale immediately.** Placement is truth. |
| **Hidden card recovery** | **Retain prior touch history** unchanged. |

### 3. Keyboard Shortcut
- **Key:** `T` (mnemonic for Touch).
- **Requires:** Card selection (not hover). Avoids accidental activation.

### 4. Lens Activation
- **Toggle:** Menu/Filters + keyboard shortcut.
- **Persistence:** **Per-session only.** Don't surprise users by changing default canvas view.

### 5. Visual Design Direction (Sophie Domain)
- **Touched today indicator:** Small dot/pill on right edge; card color but brighter (or white). Fades when not touched.
- **Stale treatment:** Thin 1-2px amber/warm border — visible but not alarming.
- **Lens mode:** Stale cards at full contrast; non-stale cards slightly dimmed (~80%).

---

## Dependencies

- Requires PRODUCT.md alignment (spatial placement philosophy)
- May interact with center/periphery lens implementation
- Should not conflict with existing card action drawer behavior

---

## Open Questions

1. Should there be a "never touched" distinct state for brand new cards?
2. Should context-level stale/active summaries exist, or purely card-level?
3. Should touch history persist across Orbit versions/data migrations?

---

## Recommended Downstream Next Step

**Sophie produces spec-ready interaction and visual design document**, resolving:
- Exact touch indicator appearance and behavior
- Exact stale/accent treatment
- Lens mode interaction design
- Data schema and persistence details
- Edge case behavior specification

---

## Planning Conclusion

Touch is a lightweight pulse that keeps Orbit's attention surface honest. It bridges spatial placement (canvas position) with temporal aliveness (real-world engagement). The semantic model is intentionally thin: one action, one day, derived active/stale states.

This preserves Orbit's philosophy while adding meaningful attention integrity.
