package main

import (
	"log"

	"orbit"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

func main() {
	handler, err := orbit.NewHandler()
	if err != nil {
		log.Fatal(err)
	}

	err = wails.Run(&options.App{
		Title:     "The Orbit",
		Width:     1320,
		Height:    860,
		MinWidth:  1000,
		MinHeight: 680,
		AssetServer: &assetserver.Options{
			Handler: handler,
		},
		BackgroundColour: &options.RGBA{R: 12, G: 17, B: 31, A: 255},
	})
	if err != nil {
		log.Fatal(err)
	}
}
