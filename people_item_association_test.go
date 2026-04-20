package orbit

import (
	"context"
	"testing"
)

func TestUpsertItemPersonIDsSanitizedAndPersisted(t *testing.T) {
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

	item := Item{ID: "p_assoc_1", ContextID: "main-orbit", Title: "Person IDs", SubNote: "", X: 200, Y: 200, Color: "var(--c1)", PersonIDs: []string{first.Person.ID, "", first.Person.ID, second.Person.ID}}
	if _, err := service.UpsertItem(context.Background(), UpsertItemRequest{Item: item}); err != nil {
		t.Fatalf("upsert item: %v", err)
	}

	state, err := s.touchItemStateWithContext(context.Background(), item.ID)
	if err != nil {
		t.Fatalf("load item state: %v", err)
	}
	if len(state.PersonIDs) != 2 {
		t.Fatalf("expected 2 unique person ids, got %#v", state.PersonIDs)
	}
	if state.PersonIDs[0] != first.Person.ID || state.PersonIDs[1] != second.Person.ID {
		t.Fatalf("unexpected person ids order/content: %#v", state.PersonIDs)
	}
}

func TestRenamePersonKeepsItemIDLinksIntact(t *testing.T) {
	s, _ := newTestStore(t)
	service := newAppService(s)

	person, err := service.CreatePerson(context.Background(), CreatePersonRequest{DisplayName: "Sam Lee"})
	if err != nil {
		t.Fatalf("create person: %v", err)
	}

	item := Item{ID: "p_assoc_2", ContextID: "main-orbit", Title: "Linked", SubNote: "", X: 220, Y: 220, Color: "var(--c2)", PersonIDs: []string{person.Person.ID}}
	if _, err := service.UpsertItem(context.Background(), UpsertItemRequest{Item: item}); err != nil {
		t.Fatalf("upsert item: %v", err)
	}

	if _, err := service.RenamePerson(context.Background(), RenamePersonRequest{ID: person.Person.ID, DisplayName: "Samuel Lee"}); err != nil {
		t.Fatalf("rename person: %v", err)
	}

	state, err := s.touchItemStateWithContext(context.Background(), item.ID)
	if err != nil {
		t.Fatalf("load item state: %v", err)
	}
	if len(state.PersonIDs) != 1 || state.PersonIDs[0] != person.Person.ID {
		t.Fatalf("expected stable person id link after rename, got %#v", state.PersonIDs)
	}
}
