# Feature Spec — New Card Default Active on Creation (Patch)

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Patch spec
- **Date:** 2026-03-20
- **Status:** Approved draft
- **Amends:**
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-touch-active-stale-foundation-2026-03-18.md`
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-stale-normal-view-emphasis-patch-2026-03-18.md`

## Intent
Unify active/stale derivation so newly created visible cards are handled correctly **without special-case bootstrap logic**.

## Why this patch
The prior Slice 1/2 phrasing derived stale only from touch recency + touch frequency, which incorrectly made new untouched cards stale immediately. Product intent is to treat fresh creation as recent activity.

## In scope
- Amend stale derivation to include creation recency as part of activity recency.
- Keep center/periphery thresholds (`n`, `m`) unchanged.
- Keep Slice 3 stale emphasis aligned with amended derivation truth.

## Out of scope
- Any change to Touch meaning or one-touch-per-day semantics.
- Any change to threshold values for center/periphery.
- Any change to Hidden exclusion semantics.
- Stale lens behavior (Slice 4).

## User-visible behavior

### New-card default outcome
- A newly created visible card (center/periphery) appears **active** immediately by derivation.
- It does not appear stale on creation.

### Touch state on creation
- New card creation still creates **no touch fact**.
- Touched-today icon remains touch-fact-driven (new card starts not-touched-today).

## Derivation rule amendment
For non-hidden cards, derive **stale** using placement-specific thresholds and an activity anchor:

- `activity_anchor_day = max(created_local_day, last_touched_day)`
  - If no touch exists, `activity_anchor_day = created_local_day`.
- `activity_age_days = days_since(activity_anchor_day)` in runtime-local timezone.

A card is **stale** iff BOTH are true:
1. `activity_age_days > n`
2. `touch_count_7d < m`

Where:
- Center: `n = 2`, `m = 3`
- Periphery: `n = 4`, `m = 2`

Else card is active.

Hidden cards remain excluded from active/stale semantics.

## Edge cases
- Card created then immediately hidden: no active/stale assignment while hidden.
- Card created then moved center↔periphery same day with no touch: remains active because `activity_age_days = 0`.
- Card created just before local midnight with no touch: after rollover, classification follows same formula from `created_local_day` anchor.
- Card created and touched same day: anchor remains same-day; touch count updates as usual.

## Acceptance criteria
1. A newly created visible card is active immediately on creation.
2. New card creation does not create a touch fact.
3. Touched-today icon for a new untouched card shows not-touched-today.
4. Center/periphery stale decisions use the same `(activity_age_days > n) AND (touch_count_7d < m)` formula with their respective `n,m`.
5. If either stale condition is false, card is active.
6. Hidden cards remain excluded from active/stale while hidden.
7. Slice 3 stale emphasis appears only when this amended derivation returns stale.

## Implementation constraints
- Do not introduce a separate UI stale-truth path.
- Implement `activity_anchor_day` in derivation engine (not in view layer).
- Keep all day math in runtime-local timezone, consistent with existing Touch semantics.
