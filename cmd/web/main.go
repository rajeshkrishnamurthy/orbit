package main

import (
	"log"

	"orbit"
)

func main() {
	log.Printf("Orbit browser launch: entrypoint=cmd/web auto_open_browser=%v", true)
	if err := orbit.RunWeb(true); err != nil {
		log.Fatal(err)
	}
}
