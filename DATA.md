# Orbit Data Baseline

## Storage Model

- Primary store: SQLite (`orbit.db`)
- Main entities:
  - `contexts`
  - `items` (FK to `contexts.id`, `ON DELETE CASCADE`)

## Runtime Data Locations

- macOS: `~/Library/Application Support/Orbit/`
- Windows: `%AppData%\\Orbit\\`
- Main DB file: `orbit.db`
- Backup folder: `backups/`

## Persistence Guarantees

1. Existing runtime DB is reused; app startup must not reseed over existing data
2. Missing DB in an already initialized environment is treated as an error (no silent reset)
3. Backup snapshots are taken on startup and retained (latest + timestamped history)
4. Card and context positions are persisted in DB (`x`, `y`) and restored on load
5. Hidden state is persisted and can be reversed through unhide/reveal flows

## Update Safety Rules

1. Schema changes must be additive-first; destructive migration requires explicit migration path and rollback
2. Partial updates must not overwrite unspecified fields (e.g., title update must not zero coordinates)
3. Default seed values apply only for new installs/bootstrap state, never as overwrite for existing user records
4. `main-orbit` context cannot be deleted

## Backup / Restore Contract

- Backup filenames:
  - `orbit.db.bak` (latest)
  - `orbit.db.<timestamp>.bak` (history)
- Restore procedure:
  1. Close app
  2. Replace `orbit.db` with chosen backup
  3. Relaunch app

## Deferred

- Cross-device sync / cloud backup
- Mobile-specific persistence behavior
