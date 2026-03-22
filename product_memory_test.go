package orbit

import (
	"database/sql"
	"path/filepath"
	"strings"
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

func TestUpsertProjectAndArtifactDefaultStatuses(t *testing.T) {
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

	var projectStatus string
	if err := s.db.QueryRow(`SELECT status FROM projects WHERE id=?`, project.ID).Scan(&projectStatus); err != nil {
		t.Fatalf("query project status: %v", err)
	}
	if projectStatus != "active" {
		t.Fatalf("expected default project status active, got %q", projectStatus)
	}

	artifact := ProductArtifact{
		ID:        "orbit:feature:default-status",
		ProjectID: project.ID,
		Kind:      artifactKindFeature,
		Title:     "Feature without explicit status",
		DocPath:   "/Users/rajeshk/.openclaw/projects/orbit/spec/feature-default-status.md",
	}
	if err := s.UpsertArtifact(artifact); err != nil {
		t.Fatalf("upsert artifact: %v", err)
	}

	var artifactStatus string
	if err := s.db.QueryRow(`SELECT status FROM product_artifacts WHERE id=?`, artifact.ID).Scan(&artifactStatus); err != nil {
		t.Fatalf("query artifact status: %v", err)
	}
	if artifactStatus != "active" {
		t.Fatalf("expected default artifact status active, got %q", artifactStatus)
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

func TestValidateProjectVariants(t *testing.T) {
	base := CanonProject{
		ID:       "orbit",
		Name:     "Orbit",
		RootPath: "/Users/rajeshk/.openclaw/projects/orbit",
	}
	if err := validateProject(base); err != nil {
		t.Fatalf("expected project with default status to validate: %v", err)
	}

	missingName := base
	missingName.Name = ""
	if err := validateProject(missingName); err == nil {
		t.Fatal("expected missing project name to fail validation")
	}

	missingRootPath := base
	missingRootPath.RootPath = ""
	if err := validateProject(missingRootPath); err == nil {
		t.Fatal("expected missing project root_path to fail validation")
	}

	archived := base
	archived.Status = "archived"
	if err := validateProject(archived); err != nil {
		t.Fatalf("expected archived project to validate: %v", err)
	}

	invalid := base
	invalid.Status = "paused"
	err := validateProject(invalid)
	if err == nil || !strings.Contains(err.Error(), "invalid project status") {
		t.Fatalf("expected invalid project status error, got %v", err)
	}
}

func TestValidateArtifactVariants(t *testing.T) {
	base := ProductArtifact{
		ID:        "orbit:feature:test",
		ProjectID: "orbit",
		Kind:      artifactKindFeature,
		Title:     "Feature",
		DocPath:   "/Users/rajeshk/.openclaw/projects/orbit/spec/feature.md",
	}
	if err := validateArtifact(base); err != nil {
		t.Fatalf("expected artifact with default status to validate: %v", err)
	}

	missingProjectID := base
	missingProjectID.ProjectID = ""
	if err := validateArtifact(missingProjectID); err == nil {
		t.Fatal("expected missing project_id to fail validation")
	}

	invalidKind := base
	invalidKind.Kind = "invalid"
	err := validateArtifact(invalidKind)
	if err == nil || !strings.Contains(err.Error(), "invalid artifact kind") {
		t.Fatalf("expected invalid artifact kind error, got %v", err)
	}

	invalidStatus := base
	invalidStatus.Status = "paused"
	err = validateArtifact(invalidStatus)
	if err == nil || !strings.Contains(err.Error(), "invalid artifact status") {
		t.Fatalf("expected invalid artifact status error, got %v", err)
	}

	invalidChangeType := base
	invalidChangeType.ChangeType = "merge"
	err = validateArtifact(invalidChangeType)
	if err == nil || !strings.Contains(err.Error(), "invalid change_type") {
		t.Fatalf("expected invalid change_type error, got %v", err)
	}
}

func TestValidateLinkVariants(t *testing.T) {
	if err := validateLink(ArtifactLink{
		FromArtifactID: "a1",
		LinkType:       linkTypeAffects,
		TargetDocPath:  "/tmp/doc.md",
	}); err != nil {
		t.Fatalf("expected doc-path-only target to validate: %v", err)
	}

	invalid := ArtifactLink{
		FromArtifactID: "a1",
		LinkType:       "invalid",
		TargetDocPath:  "/tmp/doc.md",
	}
	err := validateLink(invalid)
	if err == nil || !strings.Contains(err.Error(), "invalid link_type") {
		t.Fatalf("expected invalid link type error, got %v", err)
	}
}

func TestAddLinkTrimsOptionalTargets(t *testing.T) {
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

	artifact := ProductArtifact{
		ID:        "orbit:feature:link-test",
		ProjectID: project.ID,
		Kind:      artifactKindFeature,
		Title:     "Link Test",
		DocPath:   "/Users/rajeshk/.openclaw/projects/orbit/spec/link-test.md",
	}
	if err := s.UpsertArtifact(artifact); err != nil {
		t.Fatalf("upsert artifact: %v", err)
	}

	if err := s.AddLink(ArtifactLink{
		FromArtifactID: artifact.ID,
		LinkType:       linkTypeCanonicalAfter,
		TargetDocPath:  "  /tmp/target.md  ",
		Notes:          "  keep raw notes  ",
	}); err != nil {
		t.Fatalf("add link: %v", err)
	}

	var targetArtifact sql.NullString
	var targetDocPath sql.NullString
	var notes string
	if err := s.db.QueryRow(`SELECT target_artifact_id, target_doc_path, notes FROM artifact_links WHERE from_artifact_id=?`, artifact.ID).Scan(&targetArtifact, &targetDocPath, &notes); err != nil {
		t.Fatalf("query artifact link: %v", err)
	}
	if targetArtifact.Valid {
		t.Fatalf("expected target_artifact_id to be NULL, got %q", targetArtifact.String)
	}
	if !targetDocPath.Valid || targetDocPath.String != "/tmp/target.md" {
		t.Fatalf("unexpected target_doc_path: valid=%v value=%q", targetDocPath.Valid, targetDocPath.String)
	}
	if notes != "  keep raw notes  " {
		t.Fatalf("expected notes to remain unchanged, got %q", notes)
	}
}
