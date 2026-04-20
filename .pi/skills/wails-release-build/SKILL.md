---
name: wails-release-build
description: Deterministic Wails release packaging flow for Orbit desktop artifacts (macOS/Windows) with artifact verification.
---

# Skill: Wails Release Build (Orbit)

## Purpose
Produce deterministic release artifacts for Orbit desktop builds on macOS and Windows from a known repo state.

## When to use
Use this skill when you need to:

- Build release artifacts for a specific commit/tag.
- Generate macOS universal app output.
- Generate Windows binaries and installer output.
- Run a reproducible build + verify sequence for release readiness.

## Do not use for
- Investigating user-machine install/open failures (use **Wails Release Troubleshoot** skill).
- Deep diagnosis of Gatekeeper/notarization incidents already happening in the field.

## Inputs to capture first
- Target git ref (commit/tag/branch)
- Target platforms
- Whether Windows installer is required
- Whether distribution-grade signing/notarization is in scope

## Build workflow
1. Confirm clean repo state and target ref.
2. Run deterministic build command from `desktop/`.
3. Capture full command and output.
4. Verify artifacts under `desktop/build/bin`.
5. Report outcomes using the reporting template.

## Orbit build commands

### macOS universal
```bash
cd desktop && wails build -platform darwin/universal -clean
```

### Windows binaries + installer
```bash
cd desktop && wails build -platform windows/amd64,windows/arm64 -nsis -clean
```

### Combined cross-platform release
```bash
cd desktop && wails build -platform darwin/universal,windows/amd64,windows/arm64 -nsis -clean
```

## Verification checklist
- List outputs:
```bash
ls -la desktop/build/bin
```
- If macOS build produced app bundle, verify architecture:
```bash
file desktop/build/bin/*.app/Contents/MacOS/*
```
  - Expect both `x86_64` and `arm64` for universal builds.
- If Windows installer requested, confirm installer artifacts exist in `desktop/build/bin`.

## Reporting template
- **Build target:** `<platform list>`
- **Command run:** `<exact command>`
- **Artifacts produced:** `<paths>`
- **Verification:** `<checks + result>`
- **Status:** `SUCCESS` | `FAILED`
- **If failed:** one-line root cause + minimal next action

## Guardrails
- Keep scope to build and artifact verification only.
- Do not hand-edit generated Wails installer files (e.g. `desktop/build/windows/installer/wails_tools.nsh`).
- If Go/Wails cache or permissions block build execution, apply go-sandbox-safe remediation before retry.
