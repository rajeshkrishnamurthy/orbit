---
name: wails-release-troubleshoot
description: Diagnose and resolve Wails release/install/run failures with minimal evidence-based fixes.
---

# Skill: Wails Release Troubleshoot (Orbit)

## Purpose
Diagnose and resolve Wails release/install/run failures in development or on user machines with minimal, evidence-based fixes.

## When to use
Use this skill when release friction appears, such as:

- Build succeeds but expected artifacts are missing.
- Windows installer is missing (`makensis` not found, or only `.exe` output exists).
- App runs locally but fails on other Macs with Gatekeeper/verifier errors.
- Confusion about target architectures (`darwin/universal` vs single-arch) or installer expectations.

## Do not use for
- Routine planned release packaging when no failure is present (use **Wails Release Build** skill).

## Troubleshooting workflow
1. Capture the exact build/run command and full output.
2. Capture environment facts (OS, architecture, Wails version, Orbit commit).
3. Match to known failure signatures.
4. Apply the minimal fix only.
5. Rebuild/retest with `-clean` where relevant.
6. Verify artifacts/behavior and summarize root cause + fix.

## Common failure signatures and minimal fixes

### 1) Missing Windows installer
**Symptoms**
- Build log shows `Cannot create installer: makensis not found`.
- Output contains app `.exe` but no installer output.

**Root cause**
- NSIS missing, or `-nsis` flag not used.

**Fix**
```bash
brew install makensis
cd desktop && wails build -platform windows/amd64,windows/arm64 -nsis -clean
```

**Verify**
```bash
ls -la desktop/build/bin
```
Expect both app binaries and installer artifacts.

---

### 2) No installer by design (expectation mismatch)
**Symptoms**
- Build command omitted `-nsis`.

**Root cause**
- Wails creates installer artifacts only when `-nsis` is requested.

**Fix**
- Add `-nsis` for installer builds.
- Omit `-nsis` intentionally when only raw binaries are desired.

---

### 3) macOS architecture mismatch
**Symptoms**
- App fails only on Intel or only on Apple Silicon machines.

**Root cause**
- Single-architecture build used (`darwin/amd64` or `darwin/arm64`) instead of universal.

**Fix**
```bash
cd desktop && wails build -platform darwin/universal -clean
```

**Verify**
```bash
file desktop/build/bin/*.app/Contents/MacOS/*
```
Universal output should include both `x86_64` and `arm64`.

---

### 4) App blocked on other Macs (Gatekeeper/quarantine)
**Symptoms**
- “Can’t be opened” or “developer cannot be verified.”

**Root cause**
- Unsigned/unnotarized app blocked by Gatekeeper/quarantine.

**Internal testing workaround**
```bash
xattr -dr com.apple.quarantine "/Applications/<YourApp>.app"
open "/Applications/<YourApp>.app"
```

**Distribution-grade fix**
- Sign with Developer ID.
- Notarize app/DMG.
- Staple notarization ticket.

## Useful command templates

### Desktop dev run
```bash
cd desktop && go run github.com/wailsapp/wails/v2/cmd/wails@v2.11.0 dev -s
```

### Cross-platform release rebuild for validation
```bash
cd desktop && wails build -platform darwin/universal,windows/amd64,windows/arm64 -nsis -clean
```

### Artifact check
```bash
ls -la desktop/build/bin
```

## Reporting template
- **Root cause:** one sentence.
- **Fix applied:** one sentence + exact command.
- **Rebuild/retest command:** exact command.
- **Verification:** concrete artifact path(s) or runtime checks.
- **Residual risk:** any unresolved uncertainty.

## Guardrails
- Keep guidance constrained to observed symptoms and evidence.
- Do not hand-edit generated Wails installer files.
- If Go cache permissions block Wails/Go execution, apply go-sandbox-safe first.
