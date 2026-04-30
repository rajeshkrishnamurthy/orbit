package orbit

import (
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"time"
)

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func backupDB(path string) error {
	backupDir := filepath.Join(filepath.Dir(path), "backups")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return fmt.Errorf("create backup directory %q: %w", backupDir, err)
	}
	base := filepath.Base(path)
	timestamp := time.Now().UTC().Format("20060102-150405")
	versionedBackup := filepath.Join(backupDir, fmt.Sprintf("%s.%s.bak", base, timestamp))
	if err := copyFile(path, versionedBackup); err != nil {
		return err
	}
	// Keep a stable "latest" backup pointer.
	latestBackup := filepath.Join(backupDir, base+".bak")
	if err := copyFile(path, latestBackup); err != nil {
		return err
	}
	return pruneBackups(filepath.Join(backupDir, base), 10)
}

func backupFirstTimeCleanupDB(path string) error {
	backupPath := filepath.Join(filepath.Dir(path), "orbit-first-time-cleanup.db.bak")
	return copyFile(path, backupPath)
}

func withFirstTimeCleanupBackup(path string, mutate func() error) error {
	if err := backupFirstTimeCleanupDB(path); err != nil {
		return err
	}
	if mutate == nil {
		return nil
	}
	return mutate()
}

func pruneBackups(path string, keep int) error {
	if keep <= 0 {
		return nil
	}
	entries, err := filepath.Glob(path + ".*.bak")
	if err != nil {
		return fmt.Errorf("glob backup files for %q: %w", path, err)
	}
	if len(entries) <= keep {
		return nil
	}
	sort.Strings(entries)
	for _, stale := range entries[:len(entries)-keep] {
		if rmErr := os.Remove(stale); rmErr != nil && !errors.Is(rmErr, os.ErrNotExist) {
			return fmt.Errorf("remove stale backup %q: %w", stale, rmErr)
		}
	}
	return nil
}

func migrateLegacyData(dataDir string) error {
	legacyDir := filepath.Join("data")
	if !fileExists(legacyDir) || legacyDir == dataDir {
		return nil
	}
	if fileExists(filepath.Join(dataDir, "orbit.db")) || fileExists(filepath.Join(dataDir, ".orbit_initialized")) {
		return nil
	}
	entries := []string{"orbit.db", "orbit.db.bak", ".orbit_initialized", "items.legacy.json"}
	copiedAny := false
	for _, name := range entries {
		src := filepath.Join(legacyDir, name)
		if !fileExists(src) {
			continue
		}
		if err := copyFile(src, filepath.Join(dataDir, name)); err != nil {
			return err
		}
		copiedAny = true
	}
	if copiedAny {
		log.Printf("migrated legacy runtime data from %s to %s", legacyDir, dataDir)
	}
	return nil
}

func copyFile(srcPath, dstPath string) error {
	src, err := os.Open(srcPath)
	if err != nil {
		return fmt.Errorf("open source file %q: %w", srcPath, err)
	}
	defer func() { _ = src.Close() }()
	err = os.MkdirAll(filepath.Dir(dstPath), 0o755)
	if err != nil {
		return fmt.Errorf("create destination directory for %q: %w", dstPath, err)
	}
	dst, err := os.Create(dstPath)
	if err != nil {
		return fmt.Errorf("create destination file %q: %w", dstPath, err)
	}
	defer func() { _ = dst.Close() }()
	if _, err := io.Copy(dst, src); err != nil {
		return fmt.Errorf("copy %q to %q: %w", srcPath, dstPath, err)
	}
	if err := dst.Close(); err != nil {
		return fmt.Errorf("close destination file %q: %w", dstPath, err)
	}
	return nil
}
