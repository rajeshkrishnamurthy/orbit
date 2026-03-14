package main

import (
	"log"

	"orbit"
)

func main() {
	if err := orbit.RunWeb(true); err != nil {
		log.Fatal(err)
	}
}
