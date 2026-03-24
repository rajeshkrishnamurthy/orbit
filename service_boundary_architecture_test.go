package orbit

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestServiceBoundaryArchitectureRED(t *testing.T) {
	pkg := parseOrbitPackage(t)

	t.Run("app struct owns explicit service dependency", func(t *testing.T) {
		if !structHasField(pkg, "App", "service") {
			t.Fatalf("App must own an explicit service dependency field (expected field name: service)")
		}
	})

	t.Run("service type exists with non-http methods", func(t *testing.T) {
		if !typeExists(pkg, "AppService") {
			t.Fatalf("expected AppService type for handler-to-service orchestration boundary")
		}
		methodCount, httpBoundMethods := appServiceMethodStats(pkg)
		if methodCount == 0 {
			t.Fatalf("AppService must define methods that can be unit-tested without HTTP harness")
		}
		if len(httpBoundMethods) > 0 {
			t.Fatalf("AppService methods must not depend on net/http types: %s", strings.Join(httpBoundMethods, ", "))
		}
	})

	t.Run("handlers are thin and do not orchestrate through store directly", func(t *testing.T) {
		handlerNames := []string{
			"itemsAPI",
			"deleteItemAPI",
			"completeItemAPI",
			"touchItemAPI",
			"undoTouchItemAPI",
			"hideItemAPI",
			"revealAllAPI",
			"hiddenItemsAPI",
			"unhideAtAPI",
			"contextsAPI",
			"deleteContextAPI",
		}

		for _, name := range handlerNames {
			fn := findMethod(pkg, "App", name)
			if fn == nil {
				t.Fatalf("handler method not found: %s", name)
			}
			if usesDirectStoreSelector(fn.Body) {
				t.Fatalf("handler %s directly accesses a.store; orchestration must move to AppService", name)
			}
		}
	})

	t.Run("handlers do not map errors inline", func(t *testing.T) {
		handlerNames := []string{
			"itemsAPI",
			"deleteItemAPI",
			"completeItemAPI",
			"touchItemAPI",
			"undoTouchItemAPI",
			"hideItemAPI",
			"revealAllAPI",
			"hiddenItemsAPI",
			"unhideAtAPI",
			"contextsAPI",
			"deleteContextAPI",
		}
		for _, name := range handlerNames {
			fn := findMethod(pkg, "App", name)
			if fn == nil {
				t.Fatalf("handler method not found: %s", name)
			}
			if usesHTTPError(fn.Body) {
				t.Fatalf("handler %s maps errors inline via http.Error; error mapping must be centralized", name)
			}
		}
	})
}

type parsedPackage struct {
	files []*ast.File
}

func parseOrbitPackage(t *testing.T) parsedPackage {
	t.Helper()
	set := token.NewFileSet()
	pkgs, err := parser.ParseDir(set, ".", func(info os.FileInfo) bool {
		name := info.Name()
		if strings.HasSuffix(name, "_test.go") {
			return name == filepath.Base("service_boundary_architecture_test.go")
		}
		return strings.HasSuffix(name, ".go")
	}, 0)
	if err != nil {
		t.Fatalf("parse package: %v", err)
	}
	p, ok := pkgs["orbit"]
	if !ok {
		t.Fatalf("package orbit not found")
	}
	out := parsedPackage{files: make([]*ast.File, 0, len(p.Files))}
	for _, f := range p.Files {
		out.files = append(out.files, f)
	}
	return out
}

func typeExists(pkg parsedPackage, typeName string) bool {
	for _, f := range pkg.files {
		for _, d := range f.Decls {
			gd, ok := d.(*ast.GenDecl)
			if !ok || gd.Tok != token.TYPE {
				continue
			}
			for _, s := range gd.Specs {
				ts, ok := s.(*ast.TypeSpec)
				if ok && ts.Name.Name == typeName {
					return true
				}
			}
		}
	}
	return false
}

func structHasField(pkg parsedPackage, typeName, fieldName string) bool {
	for _, f := range pkg.files {
		for _, d := range f.Decls {
			gd, ok := d.(*ast.GenDecl)
			if !ok || gd.Tok != token.TYPE {
				continue
			}
			for _, s := range gd.Specs {
				ts, ok := s.(*ast.TypeSpec)
				if !ok || ts.Name.Name != typeName {
					continue
				}
				st, ok := ts.Type.(*ast.StructType)
				if !ok {
					continue
				}
				for _, fld := range st.Fields.List {
					for _, n := range fld.Names {
						if n.Name == fieldName {
							return true
						}
					}
				}
			}
		}
	}
	return false
}

func appServiceMethodStats(pkg parsedPackage) (int, []string) {
	count := 0
	httpBound := []string{}
	for _, f := range pkg.files {
		for _, d := range f.Decls {
			fd, ok := d.(*ast.FuncDecl)
			if !ok || fd.Recv == nil || len(fd.Recv.List) == 0 {
				continue
			}
			recvName := recvTypeName(fd.Recv.List[0].Type)
			if recvName != "AppService" {
				continue
			}
			count++
			if signatureUsesHTTP(fd.Type) {
				httpBound = append(httpBound, fd.Name.Name)
			}
		}
	}
	return count, httpBound
}

func findMethod(pkg parsedPackage, recvType, method string) *ast.FuncDecl {
	for _, f := range pkg.files {
		for _, d := range f.Decls {
			fd, ok := d.(*ast.FuncDecl)
			if !ok || fd.Recv == nil || len(fd.Recv.List) == 0 || fd.Name.Name != method {
				continue
			}
			if recvTypeName(fd.Recv.List[0].Type) == recvType {
				return fd
			}
		}
	}
	return nil
}

func recvTypeName(expr ast.Expr) string {
	switch t := expr.(type) {
	case *ast.Ident:
		return t.Name
	case *ast.StarExpr:
		if id, ok := t.X.(*ast.Ident); ok {
			return id.Name
		}
	}
	return ""
}

func usesDirectStoreSelector(body *ast.BlockStmt) bool {
	found := false
	ast.Inspect(body, func(n ast.Node) bool {
		sel, ok := n.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		inner, ok := sel.X.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		id, ok := inner.X.(*ast.Ident)
		if ok && id.Name == "a" && inner.Sel.Name == "store" {
			found = true
			return false
		}
		return true
	})
	return found
}

func usesHTTPError(body *ast.BlockStmt) bool {
	found := false
	ast.Inspect(body, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		id, ok := sel.X.(*ast.Ident)
		if ok && id.Name == "http" && sel.Sel.Name == "Error" {
			found = true
			return false
		}
		return true
	})
	return found
}

func signatureUsesHTTP(fn *ast.FuncType) bool {
	hasHTTP := false
	check := func(fl *ast.FieldList) {
		if fl == nil {
			return
		}
		for _, f := range fl.List {
			ast.Inspect(f.Type, func(n ast.Node) bool {
				sel, ok := n.(*ast.SelectorExpr)
				if !ok {
					return true
				}
				id, ok := sel.X.(*ast.Ident)
				if ok && id.Name == "http" {
					hasHTTP = true
					return false
				}
				return true
			})
		}
	}
	check(fn.Params)
	check(fn.Results)
	return hasHTTP
}
