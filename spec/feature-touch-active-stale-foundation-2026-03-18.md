# Orbit Feature Spec — Touch + Active/Stale Foundation (Slices 1 & 2)

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Date:** 2026-03-18
- **Status:** Approved-for-implementation (Slices 1 & 2)
- **Source inputs:**
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/planning-touched-2026-03-18.md`
  - `/Users/rajeshk/.openclaw/projects/orbit/spec/sequence-touch-2026-03-18.md`

## 1) Intent

Add an explicit Touch primitive so Orbit can separate:
- **spatial claim** (center/periphery placement), from
- **temporal aliveness** (recent real-world attention)

Then derive **active vs stale** deterministically from touch facts + placement.

## 2) Scope

### In scope (this feature)
- Touch interaction on card right-edge control stack.
- Daily touch fact persistence.
- One-touch-per-day-per-card effective semantics.
- Touch undo with toast.
- Active/stale derivation engine.
- Recompute triggers for derivation.
- Excluding hidden cards from active/stale classification.

### Out of scope (deferred)
- Stale visual treatment implementation details in normal canvas view (Slice 3).
- Stale lens/filter implementation (Slice 4).
- All keyboard shortcuts (Touch, lens, or app-wide shortcuts).

## 3) Touch semantics

### 3.1 Meaning
**Touch = “This priority received meaningful real-world attention today.”**

Touch is a pulse event/fact. It is not a manual sticky state and does not alter hide/complete/cancel semantics.

### 3.2 Effective frequency
- Max effective touch frequency is **one touch per card per local calendar day**.
- Additional touch attempts on the same card and same local day are semantic no-ops.

### 3.3 New card behavior
- Creating a new card does **not** auto-create a touch fact.

### 3.4 Timezone/day boundary
- “Day” is resolved in the **user local timezone at runtime**.
- Day rollover occurs at local midnight.

### 3.5 Undo behavior
- Successful touch creation displays an undo toast.
- Undo window duration is **6 seconds**.
- Undo within window reverts/removes the just-recorded touch fact.
- After window expiry, undo is unavailable.

## 4) Data model and source of truth

### 4.1 Canonical data model
Store **daily touch facts** as source of truth.

Minimum fact shape (conceptual):
- `card_id`
- `local_day` (YYYY-MM-DD in runtime-local timezone context)
- `created_at` (timestamp)

### 4.2 Derived data
`lastTouchedDay` and `touchCount7d` may exist as cache/derived fields for performance, but correctness must be reproducible from daily facts.

### 4.3 Hidden transitions
When card visibility changes (including hide/recover), prior touch facts remain intact.

## 5) Active/stale derivation

Derived (not manually set), for non-hidden cards only:

- **Center is Active if**:
  - touched within last **2 days**, OR
  - touched **3+ times** in last **7 days**

- **Periphery is Active if**:
  - touched within last **4 days**, OR
  - touched **2+ times** in last **7 days**

- Else: **Stale**.

Hidden cards are excluded from active/stale semantics.

## 6) Recompute triggers (required)

Recompute active/stale truth on:
1. App launch
2. Stale view request
3. Any touch creation or touch undo
4. Card moved between center and periphery

Additional requirement:
- Center↔periphery moves recompute immediately.

## 7) UI behavior constraints in this scope

- Touch control is on the right-edge action stack alignment used by drawer/slipping.
- Use **one icon** with two states:
  - **Touched today:** on/filled/high-contrast state
  - **Not touched today:** off/outline/lower-contrast state
- No separate “never touched” visual state.

## 8) Non-goals and prohibitions

- Do not infer touch implicitly from edits, moves, creation, or hover.
- Do not classify hidden cards as active or stale.
- Do not ship any keyboard shortcuts under this feature.
- Do not couple stale visual styling/lens behavior into Slice 1/2 implementation.

## 9) Acceptance criteria

1. Repeated same-day touches on one card do not change touch semantics after first effective touch.
2. First touch after local day rollover is effective and reflected in touched-today icon state.
3. Undo within 6 seconds removes/reverts the just-created touch fact; undo after 6 seconds fails cleanly/no-op.
4. New card creation produces no touch fact until explicit user touch action.
5. Center↔periphery move triggers immediate active/stale re-evaluation using destination thresholds.
6. Hidden cards are not assigned active/stale while hidden; touch history is preserved through hide/recover.
7. 7-day threshold boundaries evaluate correctly (center: 3+, periphery: 2+).
8. Derivation remains deterministic for same inputs (facts + placement + local date).
9. No touch/lens keyboard shortcut is enabled.

## 10) Sequencing and implementation gating

Immediate build target is **Slice 1 + Slice 2**.

- Slice 3 (normal-view stale treatment) and Slice 4 (stale lens) remain explicitly staged behind semantic correctness.
- UI exploration for stale treatment may proceed, but shipping depends on stable derivation behavior.

## 11) Follow-up patch note

Current feature uses 6-second undo window for Touch based on user feedback.
A later app-level patch may standardize undo durations globally via a shared UX token.