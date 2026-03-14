# The Orbit Desktop (Wails)

This folder contains the Wails desktop project for The Orbit.

## Run in Desktop Dev Mode

```bash
cd desktop
go run github.com/wailsapp/wails/v2/cmd/wails@v2.11.0 dev -s
```

## Build Packages

### macOS Universal App + DMG

```bash
cd desktop
go run github.com/wailsapp/wails/v2/cmd/wails@v2.11.0 build -platform darwin/universal
```

### Windows ARM64 EXE (+ NSIS installer when available)

```bash
cd desktop
go run github.com/wailsapp/wails/v2/cmd/wails@v2.11.0 build -platform windows/arm64 -nsis
```

Build outputs are written to `desktop/build/bin`.

## Notes

- Browser mode is still available via `go run ./cmd/web`.
- No splash screen is enabled.
- Replace `desktop/build/appicon.png` with your final icon before release builds.
- Signing and notarization are intentionally deferred.
