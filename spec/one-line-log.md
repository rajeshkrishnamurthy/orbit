Orbit Spec — Card Activity Log (v1)
1) Feature identity
Feature name: Per-card Activity Log (v1)
Project: Orbit
Owner: Product spec handoff for Codex implementation
Status: Implementation-ready
Source planning doc: spec/planning-orbit-activity-log-2026-03-29.md

---

2) Product intent
The card activity log is a memory-bump layer for a card.

When a user returns to a card and cannot immediately remember recent progress/context, Orbit should provide a short recent breadcrumb trail so the user can quickly continue work.

This feature is intentionally lightweight and must not drift into a notes/journal/workflow system.

---

3) Goals and non-goals
Goals (v1)
Allow user to add short, unstructured activity entries per card.
Automatically timestamp entries on save.
Show only the most recent 5 entries in product UI.
Keep full underlying history retained (no product-driven auto-deletion).
Keep interaction lightweight, card-local, and fast.
Non-goals (v1)
Full history browsing UI
Search
Edit prior entries
Rich formatting/templates
Attachments, tags, mentions, reactions
AI summaries
Use as status/workflow engine
New card-detail mode

---

4) Scope boundaries (strict)
In scope
Entry point via existing three-dot overflow on card.
Overflow action: “Activity log”.
Opens a compact popover anchored to the card/action context.
Same popover supports:
viewing latest 5 entries
adding a new entry
Hard max length: 140 characters.
Save blocked when >140.
Auto timestamp assigned at successful save.
Empty-state copy that frames feature as memory breadcrumb aid.

Out of scope
Anything that turns this into a general notes/history management surface.

---

5) User-visible behavior
5.1 Entry path
User hovers card (desktop behavior as currently supported).
User opens three-dot overflow.
User selects Activity log.
Orbit opens compact popover.

5.2 Popover contents
Popover shows:
Header label: “Activity log” (or equivalent Orbit style)
Recent entries list (max surfaced: 5, newest first)
Composer/input for new short entry
Character counter / length affordance
Save action

5.3 Add entry behavior
User enters text.
If length <= 140, save is enabled.
On save:
Entry is persisted under current card
Timestamp is generated automatically (system time)
Entry appears in recent list in newest position
Input clears after successful save.

5.4 Length validation
Hard limit is 140 chars.
If input exceeds 140:
Save is blocked/disabled
Inline validation communicates limit
User must reduce text to 140 or less to save

5.5 Empty state
If no entries exist for card:
show empty-state message oriented around breadcrumb memory usage, not note-taking.

Suggested copy direction:
“Add a short update so future-you can quickly resume this card.”

5.6 Timestamp display
Show timestamp for each surfaced entry.
Keep formatting visually calm and compact.
Relative or concise absolute format acceptable as long as consistent.
Exact display format is implementation choice; must remain low-noise.

---

6) Data/retention behavior
Activity log is stored per card.
Product UI surfaces latest 5 entries only.
Underlying older entries are retained (not auto-deleted by product behavior).
v1 does not provide user-facing controls for browsing older retained entries.
---

7) Interaction and UX constraints
Do not add new permanent inline controls on card face.
Do not overload existing right-side touch/slide controls with this feature.
Keep popover interaction lightweight and fast; avoid introducing a new heavy canvas mode.
Maintain clear separation from note/status systems through wording and constraints.

---

8) Edge cases and exception paths
Over-limit input (>140): block save with inline feedback.
Empty or whitespace-only input: do not save.
Rapid consecutive saves: each valid save creates distinct timestamped entry.
Very long historical log in storage: UI still surfaces only latest 5.
Popover reopen: reflects latest persisted state.
Save failure (transient backend/client):
user sees non-destructive error feedback
typed text should remain available for retry when feasible.

---

9) Acceptance criteria (testable)
From a card’s three-dot overflow, user can open Activity log popover.
Popover allows both reading recent entries and adding a new one.
Entry with 140 chars saves successfully.
Entry with 141+ chars cannot be saved.
Saved entry receives automatic timestamp (no manual timestamp input required).
UI never displays more than 5 entries in activity log popover.
Older entries are not auto-deleted by product behavior.
Card face gains no persistent new inline activity-log control.
Empty-state messaging appears when card has no entries and reinforces memory-bump purpose.
Feature does not expose edit/search/full-history-browse controls in v1.

---

10) Implementation notes for Codex
Preserve strict product boundary: memory bump, not notes.
Keep all v1 decisions reversible for future expansion (history browser, edit, etc.) without implementing them now.
Use existing Orbit interaction language/styles for overflow + popover.
Ensure validation and save behavior are deterministic and easy to test.
Prioritize functional completeness and clean UX over speculative extensibility.

---

11) Explicitly deferred (future consideration)
Full history browser
History pagination
Search/filter
Edit/delete entry flows
Structured entry templates
Metadata enrichment (tags/mentions/reactions)
AI summarization/compression of long logs

---

12) Canonical decision summary
Access path: three-dot overflow action
Surface: compact popover
Entry length cap: 140 chars
Surfacing cap: latest 5
Retention: full underlying history retained
Positioning: memory bump, not notes
