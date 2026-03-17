package orbit

import (
	"path/filepath"
	"testing"
)

func TestNewProductMemoryStoreCreatesSchema(t *testing.T) {
	tmpHome := t.TempDir()
	oldRoot := defaultCanonRoot
	defaultCanonRoot = tmpHome
	defer func() { defaultCanonRoot = oldRoot }()

	s, err := newProductMemoryStore()
	if err != nil {
		t.Fatalf("newProductMemoryStore: %v", err)
	}
	defer func() { _ = s.Close() }()

	for _, table := range []string{"projects", "product_artifacts", "artifact_links"} {
		var name string
		if err := s.db.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&name); err != nil {
			t.Fatalf("expected table %s to exist: %v", table, err)
		}
	}

	gotPath := defaultProductMemoryDBPath()
	if want := filepath.Join(tmpHome, defaultProductMemoryDB); gotPath != want {
		t.Fatalf("unexpected db path: got %q want %q", gotPath, want)
	}
}

func TestUpsertProjectArtifactAndLink(t *testing.T) {
	tmpHome := t.TempDir()
	oldRoot := defaultCanonRoot
	defaultCanonRoot = tmpHome
	defer func() { defaultCanonRoot = oldRoot }()

	s, err := newProductMemoryStore()
	if err != nil {
		t.Fatalf("newProductMemoryStore: %v", err)
	}
	defer func() { _ = s.Close() }()

	project := CanonProject{
		ID:       "orbit",
		Name:     "Orbit",
		RootPath: "/Users/rajeshk/.openclaw/projects/orbit",
	}
	if err := s.UpsertProject(project); err != nil {
		t.Fatalf("upsert project: %v", err)
	}

	product := ProductArtifact{
		ID:        "orbit:product:truth",
		ProjectID: project.ID,
		Kind:      artifactKindProductTruth,
		Title:     "Orbit Product Truth (Desktop/Web)",
		DocPath:   "/Users/rajeshk/.openclaw/projects/orbit/PRODUCT.md",
	}
	if err := s.UpsertArtifact(product); err != nil {
		t.Fatalf("upsert product artifact: %v", err)
	}

	feature := ProductArtifact{
		ID:                       "orbit:feature:hover-action-drawer:2026-03-17",
		ProjectID:                project.ID,
		Kind:                     artifactKindFeature,
		Title:                    "In-Card Hover Action Drawer",
		DocPath:                  "/Users/rajeshk/.openclaw/projects/orbit/spec/feature-in-card-hover-action-drawer-2026-03-17.md",
		ChangeType:               changeTypeReplace,
		ProductTruthUpdateNeeded: true,
	}
	if err := s.UpsertArtifact(feature); err != nil {
		t.Fatalf("upsert feature artifact: %v", err)
	}

	if err := s.AddLink(ArtifactLink{
		FromArtifactID: feature.ID,
		LinkType:       linkTypeCanonicalAfter,
		TargetArtifact: product.ID,
		TargetDocPath:  product.DocPath,
		TargetSection:  "Core Interaction Model",
		Notes:          "Current card actions now use a top-right hover drawer.",
	}); err != nil {
		t.Fatalf("add canonical_after link: %v", err)
	}

	var projectID, kind, changeType string
	var updateNeeded int
	if err := s.db.QueryRow(`SELECT project_id, kind, change_type, product_truth_update_needed FROM product_artifacts WHERE id=?`, feature.ID).Scan(&projectID, &kind, &changeType, &updateNeeded); err != nil {
		t.Fatalf("query feature artifact: %v", err)
	}
	if projectID != project.ID {
		t.Fatalf("unexpected project id: %q", projectID)
	}
	if kind != artifactKindFeature {
		t.Fatalf("unexpected artifact kind: %q", kind)
	}
	if changeType != changeTypeReplace {
		t.Fatalf("unexpected change type: %q", changeType)
	}
	if updateNeeded != 1 {
		t.Fatalf("expected product_truth_update_needed=1, got %d", updateNeeded)
	}

	var linkType, targetSection string
	if err := s.db.QueryRow(`SELECT link_type, target_section FROM artifact_links WHERE from_artifact_id=?`, feature.ID).Scan(&linkType, &targetSection); err != nil {
		t.Fatalf("query artifact link: %v", err)
	}
	if linkType != linkTypeCanonicalAfter {
		t.Fatalf("unexpected link type: %q", linkType)
	}
	if targetSection != "Core Interaction Model" {
		t.Fatalf("unexpected target section: %q", targetSection)
	}
}

func TestValidateArtifactRejectsBadInput(t *testing.T) {
	if err := validateArtifact(ProductArtifact{}); err == nil {
		t.Fatal("expected empty artifact to fail validation")
	}
	if err := validateArtifact(ProductArtifact{
		ID:         "x",
		ProjectID:  "orbit",
		Kind:       artifactKindProductTruth,
		Title:      "truth",
		DocPath:    "/tmp/PRODUCT.md",
		ChangeType: changeTypeAdd,
	}); err == nil {
		t.Fatal("expected product_truth artifact with change_type to fail validation")
	}
}

func TestValidateProjectRejectsBadInput(t *testing.T) {
	if err := validateProject(CanonProject{}); err == nil {
		t.Fatal("expected empty project to fail validation")
	}
}

func TestValidateLinkRejectsMissingTarget(t *testing.T) {
	if err := validateLink(ArtifactLink{FromArtifactID: "a1", LinkType: linkTypeSupersedes}); err == nil {
		t.Fatal("expected missing target to fail validation")
	}
}
