# Blink — V0 Handoff

## 1) Initiative Summary
Build **Blink** as an ultra-low-friction capture utility focused only on fast thought capture and trusted storage.

Core interaction: **hotkey → capture → hotkey**.

---

## 2) Problem Statement
During normal work, many useful thoughts and learnings appear and disappear quickly. Existing capture approaches feel too structured and create friction, so important information is often not captured.

V0 solves only this: make capture instantaneous and reliable.

---

## 3) V0 Goal
**Can I capture thoughts instantly and trust they are stored?**

---

## 4) Scope (V0)
1. Global trigger hotkey opens a minimal capture box.
2. User dictates (e.g., via Wispr Flow) or types raw text.
3. Submit on `Enter` (including Wispr Flow voice phrase that emits Enter, e.g., "PRESS ENTER").
4. Also support an explicit keyboard submit shortcut.
5. `Shift+Enter` inserts newline without submitting (rare path, but supported).
6. On successful submit, save capture and close the box immediately.
7. Persist exactly these fields:
   - `id`
   - `raw_text`
   - `captured_at`

---

## 5) Non-Goals (V0)
1. No tags/categories.
2. No parsing/classification/summarization.
3. No relationship mapping.
4. No Orbit integration.
5. No extra metadata fields.
6. No advanced retrieval or organization UX.

---

## 6) Product Constraints
1. Keep interaction friction near-zero.
2. Save-first architecture: storage must not depend on any downstream processing.
3. Never block capture on interpretation logic (none exists in V0).
4. `Enter` must be a reliable submit path to align with Wispr Flow behavior.
5. `Shift+Enter` must not submit.
6. UI must vanish immediately after save confirmation.

---

## 7) Data Contract (V0)
Record schema:
- `id`: unique identifier
- `raw_text`: captured text (as-is)
- `captured_at`: timestamp of successful save

No other persisted fields in V0.

---

## 8) Success Signals (3-day validation)
1. Frequent real usage without resistance.
2. Zero known lost captures.
3. High trust that captures are saved.
4. `Enter`-based submit (including Wispr voice command) works reliably.
5. Capture flow feels instant in normal workflow.
6. No pressure to add structure at capture time.

---

## 9) Risks
1. Hotkey conflicts with OS/apps.
2. Save latency may reduce trust.
3. Popup behavior may interrupt active flow if not minimal.

---

## 10) Post-V0 Decision Gate
If V0 success signals are met, proceed to V1 exploration: retrieval and meaning layer (still separate from Orbit core), with optional future bridge to Orbit.

If V0 fails, fix capture trust/speed before adding any features.

---

## 11) Repo Boundary Recommendation
Implement Blink in a **separate repository** from Orbit to protect Orbit scope and allow independent iteration cadence.
