package orbit

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var defaultCanonRoot = "/Users/rajeshk/.openclaw/projects/canon"

const (
	defaultProductMemoryDB   = "canon.db"
	artifactKindProductTruth = "product_truth"
	artifactKindFeature      = "feature"
	artifactKindPatch        = "patch"
	artifactStatusDraft      = "draft"
	artifactStatusActive     = "active"
	artifactStatusSuperseded = "superseded"
	artifactStatusArchived   = "archived"
	changeTypeAdd            = "add"
	changeTypeAmend          = "amend"
	changeTypeReplace        = "replace"
	linkTypeAffects          = "affects"
	linkTypeSupersedes       = "supersedes"
	linkTypeCanonicalAfter   = "canonical_after"
)

type ProductMemoryStore struct {
	db *sql.DB
}

type CanonProject struct {
	ID       string
	Name     string
	RootPath string
	Status   string
}

type ProductArtifact struct {
	ID                       string
	ProjectID                string
	Kind                     string
	Title                    string
	DocPath                  string
	Status                   string
	ChangeType               string
	ProductTruthUpdateNeeded bool
	CreatedAt                time.Time
	UpdatedAt                time.Time
}

type ArtifactLink struct {
	FromArtifactID string
	LinkType       string
	TargetArtifact string
	TargetDocPath  string
	TargetSection  string
	Notes          string
}

func defaultProductMemoryDBPath() string {
	return filepath.Join(defaultCanonRoot, defaultProductMemoryDB)
}

func newProductMemoryStore() (*ProductMemoryStore, error) {
	dbPath := defaultProductMemoryDBPath()
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}
	db, err := openConfiguredDB(dbPath)
	if err != nil {
		return nil, err
	}
	s := &ProductMemoryStore{db: db}
	if err := s.ensureSchema(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *ProductMemoryStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *ProductMemoryStore) ensureSchema() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS product_artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('product_truth','feature','patch')),
  title TEXT NOT NULL,
  doc_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','superseded','archived')),
  change_type TEXT CHECK(change_type IS NULL OR change_type IN ('add','amend','replace')),
  product_truth_update_needed INTEGER NOT NULL DEFAULT 0 CHECK(product_truth_update_needed IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, doc_path)
);
CREATE TABLE IF NOT EXISTS artifact_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_artifact_id TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK(link_type IN ('affects','supersedes','canonical_after')),
  target_artifact_id TEXT,
  target_doc_path TEXT,
  target_section TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  CHECK(target_artifact_id IS NOT NULL OR target_doc_path IS NOT NULL),
  FOREIGN KEY(from_artifact_id) REFERENCES product_artifacts(id) ON DELETE CASCADE,
  FOREIGN KEY(target_artifact_id) REFERENCES product_artifacts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_product_artifacts_project_kind_status ON product_artifacts(project_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_artifact_links_from ON artifact_links(from_artifact_id, link_type);
CREATE INDEX IF NOT EXISTS idx_artifact_links_target_artifact ON artifact_links(target_artifact_id, link_type);
`)
	return err
}

func (s *ProductMemoryStore) UpsertProject(p CanonProject) error {
	if err := validateProject(p); err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`
INSERT INTO projects(id, name, root_path, status, created_at, updated_at)
VALUES(?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name,
  root_path=excluded.root_path,
  status=excluded.status,
  updated_at=excluded.updated_at
`, p.ID, p.Name, p.RootPath, defaultProjectStatus(p.Status), now, now)
	return err
}

func (s *ProductMemoryStore) UpsertArtifact(a ProductArtifact) error {
	if err := validateArtifact(a); err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`
INSERT INTO product_artifacts(id, project_id, kind, title, doc_path, status, change_type, product_truth_update_needed, created_at, updated_at)
VALUES(?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  project_id=excluded.project_id,
  kind=excluded.kind,
  title=excluded.title,
  doc_path=excluded.doc_path,
  status=excluded.status,
  change_type=excluded.change_type,
  product_truth_update_needed=excluded.product_truth_update_needed,
  updated_at=excluded.updated_at
`, a.ID, a.ProjectID, a.Kind, a.Title, a.DocPath, defaultArtifactStatus(a.Status), nullableChangeType(a.ChangeType), boolInt(a.ProductTruthUpdateNeeded), now, now)
	return err
}

func (s *ProductMemoryStore) AddLink(link ArtifactLink) error {
	if err := validateLink(link); err != nil {
		return err
	}
	_, err := s.db.Exec(`
INSERT INTO artifact_links(from_artifact_id, link_type, target_artifact_id, target_doc_path, target_section, notes, created_at)
VALUES(?,?,?,?,?,?,?)
`, link.FromArtifactID, link.LinkType, nullableString(link.TargetArtifact), nullableString(link.TargetDocPath), nullableString(link.TargetSection), link.Notes, time.Now().UTC().Format(time.RFC3339))
	return err
}

func validateProject(p CanonProject) error {
	if strings.TrimSpace(p.ID) == "" {
		return fmt.Errorf("project id is required")
	}
	if strings.TrimSpace(p.Name) == "" {
		return fmt.Errorf("project name is required")
	}
	if strings.TrimSpace(p.RootPath) == "" {
		return fmt.Errorf("project root_path is required")
	}
	switch defaultProjectStatus(p.Status) {
	case "active", "archived":
	default:
		return fmt.Errorf("invalid project status: %q", p.Status)
	}
	return nil
}

func validateArtifact(a ProductArtifact) error {
	if strings.TrimSpace(a.ID) == "" {
		return fmt.Errorf("artifact id is required")
	}
	if strings.TrimSpace(a.ProjectID) == "" {
		return fmt.Errorf("artifact project_id is required")
	}
	switch a.Kind {
	case artifactKindProductTruth, artifactKindFeature, artifactKindPatch:
	default:
		return fmt.Errorf("invalid artifact kind: %q", a.Kind)
	}
	if strings.TrimSpace(a.Title) == "" {
		return fmt.Errorf("artifact title is required")
	}
	if strings.TrimSpace(a.DocPath) == "" {
		return fmt.Errorf("artifact doc_path is required")
	}
	switch defaultArtifactStatus(a.Status) {
	case artifactStatusDraft, artifactStatusActive, artifactStatusSuperseded, artifactStatusArchived:
	default:
		return fmt.Errorf("invalid artifact status: %q", a.Status)
	}
	ct := strings.TrimSpace(a.ChangeType)
	if a.Kind == artifactKindProductTruth && ct != "" {
		return fmt.Errorf("product_truth artifacts cannot have change_type")
	}
	if ct != "" {
		switch ct {
		case changeTypeAdd, changeTypeAmend, changeTypeReplace:
		default:
			return fmt.Errorf("invalid change_type: %q", a.ChangeType)
		}
	}
	return nil
}

func validateLink(link ArtifactLink) error {
	if strings.TrimSpace(link.FromArtifactID) == "" {
		return fmt.Errorf("from_artifact_id is required")
	}
	switch link.LinkType {
	case linkTypeAffects, linkTypeSupersedes, linkTypeCanonicalAfter:
	default:
		return fmt.Errorf("invalid link_type: %q", link.LinkType)
	}
	if strings.TrimSpace(link.TargetArtifact) == "" && strings.TrimSpace(link.TargetDocPath) == "" {
		return fmt.Errorf("target artifact or target doc path is required")
	}
	return nil
}

func defaultProjectStatus(v string) string {
	if strings.TrimSpace(v) == "" {
		return "active"
	}
	return v
}

func defaultArtifactStatus(v string) string {
	if strings.TrimSpace(v) == "" {
		return artifactStatusActive
	}
	return v
}

func nullableChangeType(v string) any {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	return v
}

func nullableString(v string) any {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	return v
}

func boolInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
