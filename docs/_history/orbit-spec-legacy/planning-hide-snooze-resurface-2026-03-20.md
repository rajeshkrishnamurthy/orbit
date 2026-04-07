# Planning Brief — Hide + Snooze + Resurface (Attention Return)

## Governance metadata
- state: superseded
- superseded_by:
  - `docs/_history/orbit-spec-legacy/planning-resurface-shelf-handoff-2026-03-28.md`
  - `docs/00-current-state.md`
- supersession_reason: this planning version assumes resurfacing back to canvas; consolidated current-state baseline locks no system canvas placement.

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Planning handoff (pre-spec)
- **Date:** 2026-03-20
- **For:** Sophie (spec hardening)
- **From:** Pam (planning)
- **Planning source:** Rajesh + Pam discussion (Orbit control UI)

---

## Document Purpose

Define the planning-level shape for adding optional snooze behavior to hidden cards so priorities can leave attention and later return gently, while preserving Orbit’s identity as an attention surface (not a reminder or scheduling product).

This document freezes language, core semantics, and near-term scope boundaries for downstream spec writing.

---

## Ubiquitous Language (Frozen)

### Allowed terms
- **Hide** — remove a card from live attention surface while keeping it recoverable.
- **Snooze** — optional deferment of a hidden card’s return to attention.
- **Wake Time** — the time a snoozed hidden card becomes eligible to return.
- **Resurface** — automatic return of a snoozed hidden card into attention.
- **Unhide** — manual return of a hidden card from Hidden tray.

### State terms
- **Hidden** (no wake time)
- **Hidden + Snoozed** (has wake time)
- **Due to Resurface** (wake time reached)
- **Resurfaced** (back on canvas)

### Preferred user-facing phrasing
- “Returns to attention”
- “Resurfaces into attention”
- (Optional softer variant in select copy: “Drifts back into attention”)

### Banned language (non-Orbit)
- Reminder / reminders
- Due date
- Schedule / scheduling
- Recurring
- Archive

---

## Planning Conclusions (Locked)

1. **Feature shape:** Keep this as a lightweight extension of Hide, not a scheduler feature.
2. **Primary interaction model:** Hide-time optional snooze using quick durations.
3. **Resurface acknowledgment:** Use gentle acknowledgment (chosen), not silent return.
4. **Product tone:** Calm and attention-native; no reminder semantics and no alert-heavy behavior.

---

## Scope Now vs Later

## Scope now (MVP planning target)
- Add optional **Hide + Snooze** path at hide-time.
- Support quick snooze presets (planning recommendation: `Tomorrow`, `3 days`, `7 days`; plus plain `Hide` without snooze).
- In Hidden tray, show a minimal day-to-resurface label for **Hidden + Snoozed** cards only (e.g., `3d`); show no numeric label for plain **Hidden** cards.
- On wake time, auto-**Resurface** card into the same context.
- Restore to prior position when feasible; deterministic nearby fallback when not.
- Show subtle “Resurfaced” acknowledgment when return occurs.

## Out of scope
- Full custom date/time picker as primary interaction.
- Cross-device notification-like experiences.
- Recurring resurfacing.
- Advanced resurfacing policy controls (batch windows, smart ranking, etc.).

---

## Semantic Guardrails

- **Hide** and **Hide + Snooze** are distinct but related paths.
- **Resurface** is system return behavior, not a notification/reminder system.
- **Unhide** remains the manual recovery action and stays distinct from Resurface.
- Hidden cards remain excluded from active/stale semantics while hidden.
- Once resurfaced to visible state, cards re-enter existing active/stale derivation rules.

---

## Behavior Frame (Planning-level)

### A) Hide without snooze
- Card transitions to **Hidden**.
- No wake time exists.
- Card remains in Hidden tray until manual unhide/reveal flows.

### B) Hide with snooze
- Card transitions to **Hidden + Snoozed** with a wake time.
- Card stays out of live canvas until due.

### C) Resurface
- At/after wake time, card **Resurfaces** to its originating context.
- Position restoration preference:
  1) prior coordinates,
  2) deterministic nearby placement if conflict.
- Show gentle acknowledgment on return (“Resurfaced”).

---

## Decision Rationale (Why this path)

This path preserves Orbit’s lightweight attention model:
- avoids heavy scheduler UI and task-manager drift,
- keeps user intent explicit at hide-time,
- provides trust/legibility when cards return,
- remains compatible with existing hidden-tray and active/stale semantics.

---

## Dependencies / Alignment Notes

- Must align with current active hidden behavior baseline:
  - `spec/feature-hide-and-unhide-cards-retro-2026-03-17.md`
  - `spec/feature-hidden-popdown-immediate-unhide-sync-patch-2026-03-17.md`
  - `spec/feature-hidden-recovery-tray-drag-preview-and-dismissal-patch-2026-03-17.md`
- Must preserve current product state distinctions in `PRODUCT.md`:
  hide vs complete vs cancel/delete vs slipping.
- Canon check confirms these related artifacts are currently active; no supersession conflict identified for introducing this new planning slice.

---

## Open Questions for Spec Hardening

1. Exact wake-time resolution rule for presets (calendar day boundary vs fixed-hour offset).
2. Precise conflict-resolution placement algorithm on resurface.
3. Whether resurfaced acknowledgment includes a direct action (e.g., quick re-hide) or remains informational only.
4. Whether resurface evaluation runs only on app open + periodic checks, or also on specific user interactions.

---

## Recommended Downstream Next Step

Sophie should produce implementation-ready feature spec for **Hide + Snooze + Resurface (MVP)** using this language and semantic framing, then stage any precision scheduling extensions as explicit later patches.
