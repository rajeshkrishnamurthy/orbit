# Discovery Handoff: Release Versioning

## 1. Initiative Summary
Introduce a first-class, authoritative product release identity in Orbit so every runtime instance can report exactly which version users are running. This enables faster troubleshooting, safer incident response, and better support workflows.

- **initiative_slug:** `release-versioning`
- **Planning horizon:** 1–2 release cycles for baseline rollout, 1 additional cycle for hardening
- **Decision status:** Proposed and ready for specification with noted open questions

## 2. Problem / Opportunity Statement
Orbit currently has no explicit, consistent product version concept visible to users or support. This creates ambiguity during incident triage and bug investigation (e.g., unknown build lineage, unclear release recency, difficult log-to-release correlation).

Opportunity: establish release identity as a platform capability used across UI, logs, diagnostics, and support artifacts.

## 3. Goals and Non-Goals
### Goals
1. Every Orbit build has an authoritative version string and build identity.
2. End users and support can quickly locate version information.
3. Logs/diagnostics include release identity by default.
4. Release identity is generated consistently by the build/release pipeline.
5. Troubleshooting workflows can correlate issues to release notes and known fixes.

### Non-Goals
1. Not redesigning full release management process.
2. Not implementing full feature-flag governance.
3. Not solving all telemetry analytics gaps in this initiative.
4. Not introducing deep backward-compatibility automation beyond baseline checks.

## 4. Constraints and Assumptions
### Constraints (known)
- Must work for Orbit delivery modes (browser mode and desktop distribution).
- Should add minimal user-facing complexity.
- Must avoid manual version edits that can drift from shipped artifacts.

### Assumptions (to confirm)
- CI/CD can inject build metadata (commit SHA, build timestamp).
- Team prefers SemVer-based release naming.
- Support/QA workflows can consume version + commit identifiers.

## 5. Options Considered
### Option A — Minimal UI-only version label
Add a version label in About/Settings sourced from an app constant.

### Option B — Build-injected release identity baseline (recommended)
Generate version identity in CI/CD and expose it in:
- UI (About/Settings)
- startup/runtime logs
- diagnostics export / support payload
- optional health/debug endpoint

Identity includes: semantic version, commit SHA, build timestamp, platform/arch, and optional schema/protocol version.

### Option C — Full release intelligence layer
Option B plus strict compatibility gates, migration policies, release-channel intelligence, automated upgrade advisories, and deep analytics integration.

## 6. Tradeoff Analysis
| Dimension | Option A | Option B | Option C |
|---|---|---|---|
| User/support impact | Low-Medium | High | Very High |
| Strategic alignment | Medium | High | High |
| Dependency risk | Low | Medium | High |
| Uncertainty | Low | Medium | High |
| Reversibility | High | High | Medium |
| Effort band | S | M | L |
| Learning value | Low | High | Medium |

Key tradeoffs:
- **A** is quick but weak for real troubleshooting due to poor traceability.
- **B** provides strong practical value with manageable complexity.
- **C** is likely over-scoped for initial rollout and increases delivery risk.

## 7. Chosen Direction (with rationale)
### Recommended: Option B — Build-injected release identity baseline
This is the best balance of impact vs delivery risk.

Rubric drivers:
- **User/customer impact:** materially reduces support cycle time.
- **Dependency risk:** acceptable and mostly concentrated in release pipeline integration.
- **Reversibility:** high; additive metadata can evolve without major product rework.
- **Learning value:** provides operational data needed before investing in advanced compatibility automation.

## 8. Initiative Breakdown (modules/features or candidate slices)
### Slice 1 — Release identity source of truth
- Define canonical version schema and required fields.
- Inject identity at build/release time.
- Ensure production artifacts cannot ship with unknown/empty version.

### Slice 2 — Product surface exposure
- Show version/build metadata in UI (About/Settings).
- Emit identity in startup logs.

### Slice 3 — Diagnostics and support workflows
- Include identity in diagnostics bundle and/or support payloads.
- Add copy-friendly format for issue templates.

### Slice 4 — Validation and governance hardening
- Add release checks in CI.
- Define versioning policy and ownership.
- Document support triage steps using new identity fields.

## 9. Success Signals and Risks
### Success signals
1. >90% of support tickets include usable release identity fields.
2. Time-to-triage for incident/bug reports decreases (target threshold to be set by team).
3. No production artifact ships with missing/placeholder version metadata.
4. Support can map version -> commit -> release notes deterministically.

### Risks
1. Desktop and web/backend version mismatch confusion.
2. Inconsistent field naming across logs/UI/diagnostics.
3. CI pipeline drift causing stale metadata.
4. Over-collection concerns if diagnostics include too much environment detail.

## 10. Sequencing Recommendation (now/next/later)
### Now
- Decide canonical release identity schema.
- Implement build-time injection and UI/log display baseline.

### Next
- Add diagnostics/support payload integration.
- Add CI guardrails for metadata presence/quality.

### Later
- Add compatibility policies (e.g., schema/protocol gating).
- Add advanced release intelligence/analytics if needed.

## 11. Open Questions / Unknowns
1. Should versioning track one unified product version or separate desktop/backend versions with compatibility matrix?
2. Which SemVer policy will be enforced (strict API-driven or release-train driven)?
3. Should commit SHA always be user-visible, or only in advanced diagnostics?
4. Do we need a public debug endpoint in all deployments?
5. What is the minimum required metadata for privacy-safe diagnostics?
6. What concrete triage KPI baseline and target should define success?

## 12. Handoff Notes for Specification Phase
Specification phase should produce:
1. Canonical release identity schema (field definitions, formats, examples).
2. Build/release injection design by runtime target (web, desktop).
3. Product-surface contract (UI location, log keys, diagnostics schema).
4. CI validation rules and failure conditions.
5. Acceptance criteria tied to support workflow outcomes.
6. Migration plan for existing issue templates and troubleshooting playbooks.

---

## Fact / Assumption / Recommendation Traceability
### Facts
- Orbit currently lacks an explicit product version concept (as raised in discovery).

### Assumptions
- CI can provide build metadata reliably.
- Support teams can operationalize new identity fields quickly.

### Recommendations
- Start with Option B baseline before any advanced compatibility layer.
- Treat release identity as mandatory operational metadata, not optional UI detail.
