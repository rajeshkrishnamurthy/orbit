package orbit

import (
	"context"
	"errors"
	"net/http"
	"testing"
)

func TestNormalizePersonNameDeterministic(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "trims and lowercases", input: "  Sam Lee  ", want: "sam lee"},
		{name: "collapses internal whitespace", input: "Sam\t  Lee", want: "sam lee"},
		{name: "multiple words", input: "  Mary   Ann   Smith ", want: "mary ann smith"},
		{name: "blank", input: "   \n\t ", want: ""},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := normalizePersonName(tt.input); got != tt.want {
				t.Fatalf("normalizePersonName(%q)=%q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestCreatePersonRejectsBlankAfterNormalization(t *testing.T) {
	s, _ := newTestStore(t)
	service := newAppService(s)

	_, err := service.CreatePerson(context.Background(), CreatePersonRequest{DisplayName: " \t  "})
	if !errors.Is(err, errPersonNameBlank) {
		t.Fatalf("expected errPersonNameBlank, got %v", err)
	}
}

func TestCreatePersonRejectsDuplicateNormalizedName(t *testing.T) {
	s, _ := newTestStore(t)
	service := newAppService(s)

	if _, err := service.CreatePerson(context.Background(), CreatePersonRequest{DisplayName: "Sam Lee"}); err != nil {
		t.Fatalf("create first person: %v", err)
	}

	_, err := service.CreatePerson(context.Background(), CreatePersonRequest{DisplayName: " sam   lee "})
	if !errors.Is(err, errPersonNameDuplicate) {
		t.Fatalf("expected errPersonNameDuplicate, got %v", err)
	}
}

func TestRenamePersonRejectsDuplicateAndKeepsPreviousName(t *testing.T) {
	s, _ := newTestStore(t)
	service := newAppService(s)

	first, err := service.CreatePerson(context.Background(), CreatePersonRequest{DisplayName: "Sam Lee"})
	if err != nil {
		t.Fatalf("create first person: %v", err)
	}
	second, err := service.CreatePerson(context.Background(), CreatePersonRequest{DisplayName: "Alex Kim"})
	if err != nil {
		t.Fatalf("create second person: %v", err)
	}

	_, err = service.RenamePerson(context.Background(), RenamePersonRequest{ID: second.Person.ID, DisplayName: "  sam  lee  "})
	if !errors.Is(err, errPersonNameDuplicate) {
		t.Fatalf("expected errPersonNameDuplicate, got %v", err)
	}

	unchanged, err := s.personByIDWithContext(context.Background(), second.Person.ID)
	if err != nil {
		t.Fatalf("lookup second person: %v", err)
	}
	if unchanged.DisplayName != "Alex Kim" {
		t.Fatalf("expected unchanged display name Alex Kim, got %q", unchanged.DisplayName)
	}
	if unchanged.NormalizedName != "alex kim" {
		t.Fatalf("expected unchanged normalized name alex kim, got %q", unchanged.NormalizedName)
	}

	stillFirst, err := s.personByIDWithContext(context.Background(), first.Person.ID)
	if err != nil {
		t.Fatalf("lookup first person: %v", err)
	}
	if stillFirst.NormalizedName != "sam lee" {
		t.Fatalf("expected first person normalized name sam lee, got %q", stillFirst.NormalizedName)
	}
}

func TestPeopleAPICreateListAndRename(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	if rr := postJSON(t, app.createPersonAPI, map[string]any{"displayName": "Sam Lee"}); rr.Code != http.StatusOK {
		t.Fatalf("create Sam Lee status=%d body=%s", rr.Code, rr.Body.String())
	}
	if rr := postJSON(t, app.createPersonAPI, map[string]any{"displayName": "alex kim"}); rr.Code != http.StatusOK {
		t.Fatalf("create alex kim status=%d body=%s", rr.Code, rr.Body.String())
	}

	listRR := postJSON(t, app.listPeopleAPI, map[string]any{})
	if listRR.Code != http.StatusOK {
		t.Fatalf("list people status=%d body=%s", listRR.Code, listRR.Body.String())
	}
	type peopleListPayload struct {
		OK     bool     `json:"ok"`
		People []Person `json:"people"`
	}
	listPayload := mustDecodeJSON[peopleListPayload](t, listRR)
	if len(listPayload.People) != 2 {
		t.Fatalf("expected 2 people, got %d", len(listPayload.People))
	}
	if listPayload.People[0].DisplayName != "alex kim" || listPayload.People[1].DisplayName != "Sam Lee" {
		t.Fatalf("expected case-insensitive sorted people list, got %#v", listPayload.People)
	}

	renameRR := postJSON(t, app.renamePersonAPI, map[string]any{"id": listPayload.People[1].ID, "displayName": "Samuel Lee"})
	if renameRR.Code != http.StatusOK {
		t.Fatalf("rename status=%d body=%s", renameRR.Code, renameRR.Body.String())
	}
}

func TestRenamePersonKeepsIDAndUpdatesNames(t *testing.T) {
	s, _ := newTestStore(t)
	service := newAppService(s)

	created, err := service.CreatePerson(context.Background(), CreatePersonRequest{DisplayName: "  SAM   Lee  "})
	if err != nil {
		t.Fatalf("create person: %v", err)
	}

	renamed, err := service.RenamePerson(context.Background(), RenamePersonRequest{ID: created.Person.ID, DisplayName: "Samuel Lee"})
	if err != nil {
		t.Fatalf("rename person: %v", err)
	}

	if renamed.Person.ID != created.Person.ID {
		t.Fatalf("expected stable person id %q, got %q", created.Person.ID, renamed.Person.ID)
	}
	if renamed.Person.DisplayName != "Samuel Lee" {
		t.Fatalf("expected display name Samuel Lee, got %q", renamed.Person.DisplayName)
	}
	if renamed.Person.NormalizedName != "samuel lee" {
		t.Fatalf("expected normalized name samuel lee, got %q", renamed.Person.NormalizedName)
	}
}
