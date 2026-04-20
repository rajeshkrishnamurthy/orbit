package orbit

import (
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"
)

type Person struct {
	ID             string    `json:"id"`
	DisplayName    string    `json:"display_name"`
	NormalizedName string    `json:"normalized_name"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

var (
	errPersonNameBlank     = errors.New("person name is blank after normalization")
	errPersonNameDuplicate = errors.New("person normalized name already exists")
	errPersonNotFound      = errors.New("person not found")
)

var personSequence uint64

func newPersonID(now time.Time) string {
	seq := atomic.AddUint64(&personSequence, 1)
	return fmt.Sprintf("p_%019d_%012d", now.UTC().UnixNano(), seq)
}

func normalizePersonName(input string) string {
	parts := strings.Fields(input)
	return strings.ToLower(strings.Join(parts, " "))
}

func personDisplayName(input string) string {
	return strings.TrimSpace(input)
}
