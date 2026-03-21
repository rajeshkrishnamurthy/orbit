package main

import (
	"log"

	"orbit"
)

func main() {
	log.Printf("Orbit browser launch: entrypoint=cmd/web auto_open_browser=%v", false)
	if err := orbit.RunWeb(false); err != nil {
		log.Fatal(err)
	}
}
