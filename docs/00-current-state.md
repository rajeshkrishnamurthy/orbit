# Orbit — 00 Current State (Canonical Baseline)

Last reviewed: 2026-04-20  
Review mode: canonical refresh after card-people-map initiative intake  
Confidence: **high** on confirmed sections, **medium** where implementation verification is still pending

---

## 1) Canonical boundary for this document

- This file is the **canonical current-state baseline** for Orbit documentation.
- It supersedes implicit/ambiguous truth spread across legacy planning/patch chains.
- Legacy sources remain historical evidence and traceability references.

Primary evidence roots:
- `docs/_history/orbit-spec-legacy/PRODUCT.md`
- `docs/_history/orbit-spec-legacy/feature-touch-active-stale-foundation-2026-03-18.md`
- `docs/_history/orbit-spec-legacy/feature-new-card-default-active-patch-2026-03-20.md`
- `docs/_history/orbit-spec-legacy/feature-in-card-hover-action-drawer-2026-03-17.md`
- `docs/_history/orbit-spec-legacy/one-line-log.md`
- `docs/_history/orbit-spec-legacy/planning-hide-snooze-resurface-2026-03-20.md`
- `docs/_history/orbit-spec-legacy/planning-resurface-shelf-handoff-2026-03-28.md`
- `docs/foreground-trigger/02-feature-spec.md`
- `docs/touch-log/02-feature-spec.md`
- `docs/resurface-count/02-feature-spec.md`
- `docs/chrome-context/02-feature-spec.md`
- `docs/chrome-context/03-feature-spec-patch-tooltip.md`
- `docs/card-people-map/01-discovery-handoff.md`
- `docs/card-people-map/02-feature-spec.md`
- `docs/card-people-map/03-spec-readiness-signoff.json`

---

## 2) Currently true (locked)

### 2.1 Product philosophy and territory law (confidence: high)
1. Orbit is an attention surface where **spatial placement carries meaning**.
2. **Canvas is user territory**; system must not mutate canvas state/placement.
3. **Chrome is system territory**; user does not directly mutate chrome-owned contents.
4. Hide, Complete, Cancel, and Slipping remain semantically distinct.

### 2.2 Platform scope (confidence: high)
1. End-user product surface is **desktop**.
2. Web surface is used for **internal behavior verification/testing**, not primary end-user use.

### 2.3 Card model and card actions (confidence: high)
Card capabilities currently include:
- title
- short visible sub-note
- color
- position on canvas (drag/drop)
- touch action
- slipping marker
- hide/cancel/complete actions
- activity log (tweet-sized per-entry)

Card action UI:
- Top-right hover drawer includes: minimize, cancel, complete, activity log.
- Slipping remains separate from the drawer.
- Touch remains separate from the drawer.

### 2.4 Context model (confidence: high)
1. A Context is a named focus container with its own associated canvas.
2. Entering a context moves the user into that context’s canvas.
3. Context title is editable in focus view.
4. From any context canvas, a center-top chrome context strip shows per-context compact counts in `visible/stale` format and supports one-click switching.
5. Context strip ordering is deterministic: active context first, remaining contexts alphabetical by title (stable tie-break by context id).
6. Capacity rule is deterministic:
   - if total contexts <= 8, show all in strip
   - if total contexts > 8, show 7 context entries plus `+N` overflow
7. Overflow list entries preserve the same `visible/stale` count format and one-click switching behavior.
8. Count semantics are fixed:
   - `visible_count` excludes hidden cards
   - `stale_count` counts stale cards among visible (non-hidden) cards only
9. Context pills show hover tooltip with mapped counts:
   - `Total: <visible_count>; Stale : <stale_count>`

### 2.5 Hidden + snooze + resurface behavior (confidence: high)
1. Hidden tray + snooze/resurface behavior is current.
2. System never auto-places resurfaced cards on canvas.
3. Resurfaced cards are represented in the Hidden tray (same card representation, badge changes only):
   - hidden+snoozed, not yet due: days-left badge
   - due/resurfaced: `Resurfaced` badge
4. Resurfaced cards are surfaced at the top of Hidden tray when viewing hidden items.
5. No separate “resurface shelf” is part of current behavior.
6. Hidden chrome control now shows dual counts at all times: `Hidden {hidden_total} · {resurfaced_count}↑`.
7. `hidden_total` includes resurfaced cards by definition, and `resurfaced_count` is a subset with invariant `0 <= resurfaced_count <= hidden_total`.
8. Hidden-control hover tooltip uses: `Hidden {hidden_total}, resurfaced {resurfaced_count}`.
9. Hidden/resurfaced counts recompute on foreground resume and on hidden-membership transitions (hide, unhide/restore, hidden-to-canvas moves, and due-membership changes processed in refresh paths).

### 2.6 Touch + active/stale semantics (confidence: high)
1. Touch is explicit user action only; never inferred by system activity.
2. One effective touch per card per local day.
3. On successful effective touch, Orbit auto-opens the existing Log Activity pop-up for that same card.
4. Re-touch on a card already touched that local day is idempotent and does not auto-open logging.
5. Touch commit is independent: pop-up dismiss/failure never rolls back touch.
6. If Log Activity is already open for card A and effective touch occurs on card B, Orbit keeps one pop-up instance and retargets it to card B.
7. Hidden cards are excluded from active/stale classification while hidden.
8. On each foreground-resume event, Orbit runs a deterministic refresh pass for touched-indicator visibility only, updating the active view without requiring restart or canvas switch.
9. Active/stale uses the amended derivation rule:
   - `activity_anchor_day = max(created_local_day, last_touched_day)`
   - stale iff both:
     - `activity_age_days > n`
     - `touch_count_7d < m`
   - thresholds:
     - center: `n=2`, `m=3`
     - periphery: `n=4`, `m=2`

### 2.7 Stale lens behavior (confidence: high)
1. Stale lens is explicit toggle to stale-only view.
2. Lens uses stale-at-entry set during active lens session.
3. No in-session auto-refresh of membership; refresh occurs on lens re-entry.
4. Lens state is session-scoped and resets on app restart.

### 2.8 Activity log behavior (confidence: high)
1. Per-card activity log entries are short and user-authored.
2. Hard max length per entry: 140 chars.
3. UI surfaces latest 5 entries.
4. Full underlying history is retained.
5. Current scope excludes edit/search/full-history browsing UI.
6. Touch-driven auto-open is an assist flow only; Orbit never auto-creates log entries.

---

## 3) Explicitly not true anymore / deprecated assumptions

1. **Deprecated:** “Resurfacing returns cards directly onto canvas.”  
   - Replaced by tray-first resurfacing representation and strict no-system-canvas-mutation rule.
2. **Deprecated:** “Separate chrome-owned resurface shelf is current behavior.”  
   - Current behavior is badge/state inside Hidden tray cards.
3. **Deprecated:** treating web as primary end-user surface.  
   - Web is internal verification surface.
4. **Not currently true:** card-people mapping/filtering is already shipped in product behavior.  
   - Current status is specification-complete and implementation-ready under `docs/card-people-map/`, but not yet promoted as shipped truth in this canonical baseline.

---

## 4) Open items (for follow-up validation)

1. Verify exact UI wording/token for days-left badge in Hidden tray (display format only; semantics already locked). (confidence: medium)
2. Verify whether any implementation drift exists from locked behavior in latest build artifacts/tests. (confidence: medium)
3. Implement and verify the `card-people-map` baseline (person-to-card mapping + single-select people filter); on completion, fold accepted behavior into Section 2 as currently true. (confidence: medium)

---

## 5) Supersession note for legacy chain interpretation

For consolidation work, prefer this file when legacy docs disagree.

Priority order for interpretation:
1. `docs/00-current-state.md` (this file)
2. user-confirmed consolidation decisions from 2026-04-06 session
3. latest patch/spec in legacy chain by topic
4. older planning artifacts
