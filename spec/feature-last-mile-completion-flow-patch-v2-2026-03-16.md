# Orbit Feature Patch Document

**Project root:** `/Users/rajeshk/.openclaw/projects/orbit`  
**Patch spec path:** `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-last-mile-completion-flow-patch-v2-2026-03-16.md`  
**Base spec:** `/Users/rajeshk/.openclaw/projects/orbit/spec/feature-last-mile-completion-flow-2026-03-16.md`  
**Patch topic:** Completion Interaction Polish (Orbit-style)  
**Date:** 2026-03-16

## Patch intent
Refine the implemented completion UX to match Orbit’s visual style and interaction feel:
- lower card action visual weight
- keep completion fast and discoverable via hover
- add subtle but meaningful completion feedback
- avoid garish animation or heavy UI

## Override rule
Where this patch conflicts with base spec behavior/presentation, this patch overrides the base spec.

## In scope (patch)
- Replace persistent text+icon completion CTA with compact Orbit-style icon affordance.
- Completion affordance is primarily hover-revealed (small icon on card).
- Remove lingering completed-strikethrough resting state after completion.
- Add subtle micro-celebration on completion.
- Ensure card exits live canvas after completion sequence while preserving Undo window.

## Out of scope (patch)
- System-initiated completion behavior
- Bulk completion behavior
- Recently completed panel/tray/history
- New completion state taxonomy beyond existing base semantics

## Updated interaction behavior

### Completion control (replaces base CTA style)
- Complete is presented as a **small icon affordance** consistent with Orbit card language.
- Affordance is visible on mouse-over/hover (and equivalent focus state for keyboard).
- Persistent full text button (`✓ Complete`) is removed from default card presentation.

### Completion feedback sequence (updated)
On user-initiated completion:
1. Trigger subtle **tick pop** micro-animation.
2. Trigger subtle **single pulse/glow** card acknowledgment.
3. Show Undo toast/acknowledgment.
4. Card auto-fades/slides out of live canvas within a short duration window.

### Timing guidance (implementation target)
- Tick pop: ~140–220ms
- Pulse/glow: ~180–320ms (single pulse)
- Exit animation: ~500–900ms total from complete action to card removal

(Exact values may be tuned within these ranges for smoothness and performance.)

## Guardrails
- Animation must remain subtle and non-garish.
- No loud/confetti/gamified celebration effects.
- No persistent struck-through card state after successful completion path.
- Undo must remain available during the configured undo window.

## Acceptance criteria (patch)
1. Card no longer shows persistent text label/button for Complete in default state.
2. Complete affordance appears as compact icon and is hover/focus discoverable.
3. Completing a card triggers subtle micro-celebration (tick pop + single pulse).
4. Completing a card triggers smooth fade/slide exit from live canvas.
5. Card does not remain as a struck-through resting item after completion flow.
6. Undo toast remains present and functional during undo window.
7. Undo restores card to active state in original context (base behavior retained).
8. No system/bulk completion-specific behavior is introduced in this patch.

## Open questions / blockers
None blocking for this patch.
