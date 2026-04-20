# Orbit Activity Log — Planning Handoff

## Governance metadata
- state: superseded
- superseded_by:
  - `docs/_history/orbit-spec-legacy/one-line-log.md`
  - `docs/00-current-state.md`
- supersession_reason: planning handoff converted into implementation-ready feature spec and consolidated baseline.

## Document purpose
Capture the planning conclusions for Orbit’s per-card activity log so Sophie can convert the feature into a downstream spec without needing to reconstruct product intent from chat history.

## Who this document is for
Primary: Sophie
Secondary: Rajesh, Nicole

## Planning stage / source
This document packages completed feature slicing and sequencing work for the Orbit project.

## Feature summary
Orbit cards gain a lightweight activity log that helps users quickly recover recent context when returning to a card.

The activity log is intentionally small, unstructured, and user-authored. Its role is to provide a memory bump, not to become a notes system, status tracker, or full history browser.

## Core product intent
Reduce re-orientation cost.

When a user looks at a card and cannot immediately remember what happened recently, Orbit should provide just enough recent context to help them decide how to move forward.

## Planning conclusions

### 1. Product role
The activity log should be treated as a memory-bump layer for a card.

It is:
- lightweight
- append-oriented
- user-authored
- unstructured
- recent-context focused

It is not:
- a notes system
- a structured status tracker
- an audit log presented to the user
- a document or journal layer

### 2. Entry shape
Each log entry is short and tweet-like in size.

Orbit does not impose content structure beyond the size constraint. The user decides what to log at that moment.

### 3. Timestamp behavior
Timestamp is automatic on save.

### 4. History retention vs product surfacing
Orbit should not delete old activity-log entries of its own accord.

The product may retain the full underlying activity-log history, but the user-facing product surface should always display only the most recent 5 entries.

This distinction is important:
- storage may be longer-lived
- surfacing remains intentionally capped

### 5. Access model
The card face should not gain new inline log controls.

Reasoning:
- the card is already full
- inline controls would burden the card surface
- adding persistent inline affordances risks confusion and visual clutter

The activity log must therefore be reached through a secondary interaction path associated with the card rather than through permanent inline card UI.

### 6. Recommended interaction shape
The strongest current planning recommendation is:
- the user reaches activity log through an existing secondary card interaction path
- once inside, the same lightweight surface supports both reading recent entries and adding a new short entry

This keeps the feature coherent and avoids splitting read/write behavior across separate obscure locations.

## Recommended first shippable increment
A user can access an activity log through a card’s secondary interaction path, add a short timestamped entry, and view the most recent 5 entries for that card in the same lightweight surface.

This is the strongest first increment because it already completes the full value loop:
- add breadcrumb
- later reopen breadcrumb trail
- recover enough context to continue

## Scope now
The planning recommendation for the initial feature includes:
- per-card activity log
- short user-authored entries
- automatic timestamps
- full underlying retention without product-driven deletion
- surfacing of latest 5 entries only
- access through secondary card interaction
- one lightweight surface for both viewing recent entries and adding a new entry

## Scope later / explicitly out for this stage
The following are out of scope for this planning slice and should not be quietly pulled into the first spec unless Rajesh explicitly reopens them:
- full history browsing
- searching log entries
- editing prior entries
- product-managed deletion flows as a primary feature
- structured templates such as blocker / next step / status
- tags, reactions, attachments, or mentions
- summaries generated from activity logs
- use of logs as workflow/state machinery

## Why this boundary matters
This feature is small but easy to over-expand.

Its value comes from being fast, light, and cognitively cheap. If it starts to resemble notes, journaling, or status maintenance, the feature will become heavier and less Orbit-native.

## Sequence recommendation
1. Preserve the product boundary: memory bump, not notes system.
2. Choose the secondary access path.
3. Implement the smallest complete read/write recent-log loop.
4. Polish interaction feel without expanding scope.

## Dependencies / gates

### Main product gate
Choose the right secondary interaction path for entering the activity log.

This is the main unresolved interaction decision because:
- the card face is off-limits for new inline controls
- the feature must still remain easy enough to reach to be useful

### Main discipline gate
Prevent scope drift into a richer text or workflow feature.

## Open questions for downstream spec work
These remain for Sophie-level resolution and should be answered in spec form rather than planning form:
- Which exact secondary interaction path should expose the log?
- What does the lightweight log surface look like in Orbit terms: panel, popover, detail section, or another existing pattern?
- How is the short-entry constraint best enforced in interaction terms?
- What empty-state wording or framing best reinforces the feature as a breadcrumb/memory aid rather than a mini-notes area?
- How should timestamps be displayed so they are informative but visually calm?

## Recommended downstream next step
Convert this planning handoff into a product/spec document that:
- preserves the strict product boundary
- resolves the access-path decision using Orbit’s existing interaction language
- defines the lightweight log surface in enough detail for implementation
- avoids expanding the feature into a general text/history system

## Notes for Sophie
The central product truth to protect is this:

Orbit activity log is a memory-bump feature for overloaded attention, not a note-taking feature.

If the spec keeps that truth intact, the feature should remain small, useful, and aligned with Orbit’s overall philosophy.