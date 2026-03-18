package orbit

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func TestProductMemoryDefaultsPersistAndValidate(t *testing.T) {
	tmpHome := t.TempDir()
	oldRoot := defaultCanonRoot
	defaultCanonRoot = tmpHome
	defer func() { defaultCanonRoot = oldRoot }()

	s, err := newProductMemoryStore()
	if err != nil {
		t.Fatalf("newProductMemoryStore: %v", err)
	}
	defer func() { _ = s.Close() }()

	if err := s.UpsertProject(CanonProject{
		ID:       "orbit",
		Name:     "Orbit",
		RootPath: filepath.Join(tmpHome, "orbit"),
	}); err != nil {
		t.Fatalf("upsert project: %v", err)
	}
	if err := s.UpsertArtifact(ProductArtifact{
		ID:        "orbit:feature:defaults",
		ProjectID: "orbit",
		Kind:      artifactKindFeature,
		Title:     "Defaults",
		DocPath:   filepath.Join(tmpHome, "defaults.md"),
	}); err != nil {
		t.Fatalf("upsert artifact: %v", err)
	}
	if err := s.AddLink(ArtifactLink{
		FromArtifactID: "orbit:feature:defaults",
		LinkType:       linkTypeAffects,
		TargetDocPath:  filepath.Join(tmpHome, "targets.md"),
	}); err != nil {
		t.Fatalf("add link: %v", err)
	}

	var projectStatus string
	if err := s.db.QueryRow(`SELECT status FROM projects WHERE id=?`, "orbit").Scan(&projectStatus); err != nil {
		t.Fatalf("query project status: %v", err)
	}
	if projectStatus != artifactStatusActive {
		t.Fatalf("unexpected project status: %q", projectStatus)
	}

	var artifactStatus, changeType sql.NullString
	var updateNeeded int
	if err := s.db.QueryRow(`SELECT status, change_type, product_truth_update_needed FROM product_artifacts WHERE id=?`, "orbit:feature:defaults").Scan(&artifactStatus, &changeType, &updateNeeded); err != nil {
		t.Fatalf("query artifact row: %v", err)
	}
	if !artifactStatus.Valid || artifactStatus.String != artifactStatusActive {
		t.Fatalf("unexpected artifact status: %+v", artifactStatus)
	}
	if changeType.Valid {
		t.Fatalf("expected nullable change_type to stay empty, got %+v", changeType)
	}
	if updateNeeded != 0 {
		t.Fatalf("unexpected update-needed flag: %d", updateNeeded)
	}

	var linkTargetDocPath sql.NullString
	if err := s.db.QueryRow(`SELECT target_doc_path FROM artifact_links WHERE from_artifact_id=?`, "orbit:feature:defaults").Scan(&linkTargetDocPath); err != nil {
		t.Fatalf("query link row: %v", err)
	}
	if !linkTargetDocPath.Valid || linkTargetDocPath.String == "" {
		t.Fatalf("expected target doc path to persist, got %+v", linkTargetDocPath)
	}
}

func TestProductMemoryValidationBranches(t *testing.T) {
	t.Run("project validation", func(t *testing.T) {
		if err := validateProject(CanonProject{}); err == nil {
			t.Fatal("expected empty project to fail")
		}
		if err := validateProject(CanonProject{
			ID:       "orbit",
			Name:     "Orbit",
			RootPath: "/tmp/orbit",
		}); err != nil {
			t.Fatalf("expected valid project to pass: %v", err)
		}
		if err := validateProject(CanonProject{
			ID:       "orbit",
			Name:     "Orbit",
			RootPath: "/tmp/orbit",
			Status:   "paused",
		}); err == nil {
			t.Fatal("expected invalid project status to fail")
		}
	})

	t.Run("artifact validation", func(t *testing.T) {
		valid := ProductArtifact{
			ID:        "artifact-1",
			ProjectID: "orbit",
			Kind:      artifactKindFeature,
			Title:     "Feature",
			DocPath:   "/tmp/feature.md",
		}
		if err := validateArtifact(valid); err != nil {
			t.Fatalf("expected valid artifact to pass: %v", err)
		}
		if err := validateArtifact(ProductArtifact{
			ID:        "artifact-2",
			ProjectID: "orbit",
			Kind:      "invalid",
			Title:     "Feature",
			DocPath:   "/tmp/feature.md",
		}); err == nil {
			t.Fatal("expected invalid kind to fail")
		}
		if err := validateArtifact(ProductArtifact{
			ID:        "artifact-3",
			ProjectID: "orbit",
			Kind:      artifactKindFeature,
			Title:     "Feature",
			DocPath:   "/tmp/feature.md",
			Status:    "paused",
		}); err == nil {
			t.Fatal("expected invalid status to fail")
		}
		if err := validateArtifact(ProductArtifact{
			ID:         "artifact-4",
			ProjectID:  "orbit",
			Kind:       artifactKindFeature,
			Title:      "Feature",
			DocPath:    "/tmp/feature.md",
			ChangeType: "bogus",
		}); err == nil {
			t.Fatal("expected invalid change_type to fail")
		}
		if err := validateArtifact(ProductArtifact{
			ID:         "artifact-5",
			ProjectID:  "orbit",
			Kind:       artifactKindProductTruth,
			Title:      "Truth",
			DocPath:    "/tmp/truth.md",
			ChangeType: changeTypeAdd,
		}); err == nil {
			t.Fatal("expected product_truth change_type to fail")
		}
	})

	t.Run("link validation", func(t *testing.T) {
		if err := validateLink(ArtifactLink{}); err == nil {
			t.Fatal("expected empty link to fail")
		}
		if err := validateLink(ArtifactLink{
			FromArtifactID: "artifact-1",
			LinkType:       linkTypeAffects,
			TargetDocPath:  "/tmp/target.md",
		}); err != nil {
			t.Fatalf("expected doc-path-only link to pass: %v", err)
		}
	})
}

func TestImportJSONHandlesEmptyAndPopulatesItems(t *testing.T) {
	s, _ := newTestStore(t)

	missingPath := filepath.Join(t.TempDir(), "missing.json")
	if err := s.importJSON(missingPath); err == nil {
		t.Fatal("expected missing import file to fail")
	}

	emptyPath := filepath.Join(t.TempDir(), "empty.json")
	if err := os.WriteFile(emptyPath, []byte{}, 0o644); err != nil {
		t.Fatalf("write empty import file: %v", err)
	}
	if err := s.importJSON(emptyPath); err != nil {
		t.Fatalf("import empty file: %v", err)
	}

	importPath := filepath.Join(t.TempDir(), "items.json")
	if err := os.WriteFile(importPath, []byte(`[
		{"id":"imported-1","contextId":"main-orbit","title":"Imported","subNote":"from json","x":12,"y":34,"color":"var(--c2)"}
	]`), 0o644); err != nil {
		t.Fatalf("write import file: %v", err)
	}
	if err := s.importJSON(importPath); err != nil {
		t.Fatalf("import populated file: %v", err)
	}

	var contextID, title, subNote, color, updatedAt string
	var x, y float64
	if err := s.db.QueryRow(`SELECT context_id,title,sub_note,x,y,color,updated_at FROM items WHERE id=?`, "imported-1").Scan(&contextID, &title, &subNote, &x, &y, &color, &updatedAt); err != nil {
		t.Fatalf("query imported item: %v", err)
	}
	if contextID != "main-orbit" || title != "Imported" || subNote != "from json" || x != 12 || y != 34 || color != "var(--c2)" {
		t.Fatalf("unexpected imported row: context=%q title=%q sub=%q x=%v y=%v color=%q", contextID, title, subNote, x, y, color)
	}
	if updatedAt == "" {
		t.Fatal("expected imported row to receive updated_at")
	}
}
