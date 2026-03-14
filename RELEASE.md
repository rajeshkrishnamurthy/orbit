# Orbit Release Runbook

## Baseline

- Baseline tag: `v1.0.0-baseline`
- Baseline branch: `codex/baseline`

## Build

### macOS Universal + DMG

```bash
cd desktop
wails build -platform darwin/universal -clean
```

Output:

- `desktop/build/bin/Orbit.app`
- `desktop/build/bin/The-Orbit-<version>.dmg`

### Windows AMD64 + ARM64 (+ installers)

```bash
cd desktop
wails build -platform windows/amd64,windows/arm64 -nsis -clean
```

Output:

- `desktop/build/bin/Orbit-amd64.exe`
- `desktop/build/bin/Orbit-arm64.exe`
- `desktop/build/bin/Orbit-amd64-installer.exe`
- `desktop/build/bin/Orbit-arm64-installer.exe`

## Data locations

- macOS DB: `~/Library/Application Support/Orbit/orbit.db`
- Windows DB: `%AppData%\\Orbit\\orbit.db`
- Backups: `<data-dir>/backups/`

## Rollback (data)

1. Close Orbit.
2. Replace `orbit.db` with latest backup from `backups/orbit.db.bak` or timestamped `orbit.db.<timestamp>.bak`.
3. Relaunch Orbit.

## Rollback (code)

```bash
git checkout v1.0.0-baseline
```

Or for new fixes from baseline:

```bash
git checkout codex/baseline
```
