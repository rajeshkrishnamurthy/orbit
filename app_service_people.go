package orbit

import (
	"context"
	"time"
)

type ListPeopleResponse struct {
	People []Person
}

func (s *AppService) ListPeople(ctx context.Context) (ListPeopleResponse, error) {
	people, err := s.store.listPeopleWithContext(ctx)
	if err != nil {
		return ListPeopleResponse{}, err
	}
	return ListPeopleResponse{People: people}, nil
}

type CreatePersonRequest struct {
	DisplayName string
}

type CreatePersonResponse struct {
	Person Person
}

func (s *AppService) CreatePerson(ctx context.Context, req CreatePersonRequest) (CreatePersonResponse, error) {
	person, err := s.store.createPersonWithContext(ctx, req.DisplayName, time.Now())
	if err != nil {
		return CreatePersonResponse{}, err
	}
	return CreatePersonResponse{Person: person}, nil
}

type RenamePersonRequest struct {
	ID          string
	DisplayName string
}

type RenamePersonResponse struct {
	Person Person
}

func (s *AppService) RenamePerson(ctx context.Context, req RenamePersonRequest) (RenamePersonResponse, error) {
	person, err := s.store.renamePersonWithContext(ctx, req.ID, req.DisplayName, time.Now())
	if err != nil {
		return RenamePersonResponse{}, err
	}
	return RenamePersonResponse{Person: person}, nil
}
