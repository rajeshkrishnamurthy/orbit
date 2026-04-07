# Orbit Product Version History

Purpose: track **product improvements and patches over time** (not documentation edit history).

Last updated: 2026-04-06

---

## Entry format
- **Date**
- **Change**
- **Product impact**
- **Scope**
- **Source(s)**
- **Confidence**

---

## 2026-04-06
### Foreground resume trigger for touched-indicator correctness
- **Change:** Added deterministic refresh on foreground-resume to recompute touched-indicator visibility for active view.
- **Product impact:** Users no longer need restart/canvas-switch hacks to correct stale touched indicator visibility after returning to Orbit.
- **Scope:** Desktop runtime behavior.
- **Source(s):**
  - `docs/foreground-trigger/01-discovery-handoff.md`
  - `docs/foreground-trigger/02-feature-spec.md`
  - reflected in canonical: `docs/00-current-state.md` (section 2.6)
- **Confidence:** High

---

## 2026-03-28
### Per-card activity log (memory-bump) added
- **Change:** Added card-level activity log accessible from card action flow, with short entry constraints and recent-history surfacing.
- **Product impact:** Users can leave lightweight breadcrumb updates on a card and quickly recover context later.
- **Scope:** Card interaction and card-local memory support.
- **Source(s):**
  - `docs/_history/orbit-spec-legacy/planning-orbit-activity-log-2026-03-29.md`
  - `docs/_history/orbit-spec-legacy/one-line-log.md`
  - reflected in canonical: `docs/00-current-state.md` (sections 2.3 and 2.8)
- **Confidence:** High (date may be ±1 day; feature truth is confirmed)

---

## 2026-03-21
### Layout invariant foundation and chrome/canvas separation hardening
- **Change:** Enforced boundary model separating system chrome from user canvas; packetized rollout documented with baseline/evidence notes.
- **Product impact:** Preserves canvas ownership model and reduces risk of system UI intrusions into card territory.
- **Scope:** Desktop/web layout architecture and interaction stability.
- **Source(s):**
  - `docs/_history/orbit-spec-legacy/feature-layout-invariant-patch-2026-03-21.md`
  - `docs/_history/orbit-spec-legacy/feature-layout-invariant-packet-0-baseline-audit-2026-03-21.md`
  - `docs/_history/orbit-spec-legacy/layout-invariant-packet-*/implementation-notes.md`
- **Confidence:** Medium (legacy evidence is strong; final production-state validation should be rechecked in active docs)

---

## 2026-03-20
### New-card stale classification correction
- **Change:** Patched derivation so newly created cards are active by default via activity-anchor logic (without auto-touch).
- **Product impact:** Prevents immediate stale misclassification for newly created visible cards.
- **Scope:** Touch/active/stale derivation behavior.
- **Source(s):**
  - `docs/_history/orbit-spec-legacy/feature-new-card-default-active-patch-2026-03-20.md`
  - reflected in canonical: `docs/00-current-state.md` (section 2.6)
- **Confidence:** High

### Stale lens mode (slice 4)
- **Change:** Added stale-only lens mode with session-scoped behavior and lens-entry membership semantics.
- **Product impact:** Enables focused stale review without changing base touch semantics.
- **Scope:** View mode/filter behavior.
- **Source(s):**
  - `docs/_history/orbit-spec-legacy/feature-stale-lens-mode-slice-4-2026-03-20.md`
  - reflected in canonical: `docs/00-current-state.md` (section 2.7)
- **Confidence:** High

---

## 2026-03-18
### Touch + active/stale semantic foundation
- **Change:** Introduced explicit touch primitive and deterministic active/stale derivation model with center/periphery thresholds.
- **Product impact:** Improves attention-truth signaling by tying recency semantics to explicit touch facts + placement.
- **Scope:** Card semantics and state derivation.
- **Source(s):**
  - `docs/_history/orbit-spec-legacy/feature-touch-active-stale-foundation-2026-03-18.md`
  - `docs/_history/orbit-spec-legacy/feature-touch-control-right-edge-placement-patch-2026-03-18.md`
  - `docs/_history/orbit-spec-legacy/feature-stale-normal-view-emphasis-patch-2026-03-18.md`
  - reflected in canonical: `docs/00-current-state.md` (section 2.6)
- **Confidence:** High

---

## 2026-03-17
### In-card hover action drawer
- **Change:** Shifted to top-right in-card hover drawer action model.
- **Product impact:** Consolidated action discoverability while preserving card bounds and drag behavior expectations.
- **Scope:** Card interaction UI.
- **Source(s):**
  - `docs/_history/orbit-spec-legacy/feature-in-card-hover-action-drawer-2026-03-17.md`
  - reflected in canonical: `docs/00-current-state.md` (section 2.3)
- **Confidence:** High

### Hidden-tray unhide UX hardening patches
- **Change:** Added optimistic unhide tray sync and tray drag-preview/dismissal behavior refinements.
- **Product impact:** Faster/more legible hidden recovery interactions with deterministic rollback behavior on failure.
- **Scope:** Hidden tray interaction quality.
- **Source(s):**
  - `docs/_history/orbit-spec-legacy/feature-hidden-popdown-immediate-unhide-sync-patch-2026-03-17.md`
  - `docs/_history/orbit-spec-legacy/feature-hidden-recovery-tray-drag-preview-and-dismissal-patch-2026-03-17.md`
  - `docs/_history/orbit-spec-legacy/feature-hide-and-unhide-cards-retro-2026-03-17.md`
- **Confidence:** High

---

## 2026-03-16
### Last-mile completion flow and interaction polish
- **Change:** Established completion as distinct semantic flow, then refined completion affordance/feedback via patch.
- **Product impact:** Clearer completion behavior and reduced ambiguity with delete/cancel semantics.
- **Scope:** Card lifecycle actions.
- **Source(s):**
  - `docs/_history/orbit-spec-legacy/feature-last-mile-completion-flow-2026-03-16.md`
  - `docs/_history/orbit-spec-legacy/feature-last-mile-completion-flow-patch-v2-2026-03-16.md`
- **Confidence:** Medium (subsequent action model evolved via hover drawer; current truth captured in `docs/00-current-state.md`)
