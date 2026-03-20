package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"runtime"
	"time"

	"orbit"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	defaultWindowX      = 50
	defaultWindowY      = 50
	defaultWindowWidth  = 1320
	defaultWindowHeight = 860
	minWindowWidth      = 1000
	minWindowHeight     = 680
)

func desktopAppOptions(handler http.Handler) *options.App {
	return &options.App{
		Title:            "The Orbit",
		Width:            defaultWindowWidth,
		Height:           defaultWindowHeight,
		MinWidth:         minWindowWidth,
		MinHeight:        minWindowHeight,
		Frameless:        false,
		WindowStartState: options.Normal,
		OnStartup:        recoverBrokenWindowPlacement,
		OnDomReady:       recoverBrokenWindowPlacementAfterDomReady,
		AssetServer: &assetserver.Options{
			Handler: handler,
		},
		BackgroundColour: &options.RGBA{R: 12, G: 17, B: 31, A: 255},
	}
}

func isBrokenWindowPlacement(x, y, w, h int) bool {
	return x < -5000 || y < -5000 || x > 5000 || y > 5000 || w < minWindowWidth || h < minWindowHeight
}

func recoverBrokenWindowPlacementWithRuntime(ctx context.Context) {
	wailsruntime.WindowShow(ctx)
	wailsruntime.WindowUnminimise(ctx)
	wailsruntime.WindowUnmaximise(ctx)
	wailsruntime.WindowSetSize(ctx, defaultWindowWidth, defaultWindowHeight)
	wailsruntime.WindowSetPosition(ctx, defaultWindowX, defaultWindowY)
}

func recoverBrokenWindowPlacement(ctx context.Context) {
	if runtime.GOOS != "windows" {
		return
	}

	x, y := wailsruntime.WindowGetPosition(ctx)
	w, h := wailsruntime.WindowGetSize(ctx)
	if !isBrokenWindowPlacement(x, y, w, h) {
		return
	}

	wailsruntime.LogWarningf(ctx, "Recovering Orbit window placement: x=%d y=%d w=%d h=%d", x, y, w, h)
	recoverBrokenWindowPlacementWithRuntime(ctx)
	recoverBrokenNativeWindowPlacement()
}

func recoverBrokenWindowPlacementAfterDomReady(ctx context.Context) {
	if runtime.GOOS != "windows" {
		return
	}

	go func() {
		delays := []time.Duration{
			250 * time.Millisecond,
			1 * time.Second,
			2 * time.Second,
			4 * time.Second,
		}

		for _, delay := range delays {
			time.Sleep(delay)
			recoverBrokenWindowPlacement(ctx)
		}
	}()
}

func main() {
	handler, err := orbit.NewHandler()
	if err != nil {
		log.Fatal(err)
	}

	app := desktopAppOptions(handler)
	exe, exeErr := os.Executable()
	if exeErr != nil {
		exe = "<unknown>"
	}
	log.Printf("Orbit desktop launch: executable=%q frameless=%v start_state=%v title=%q size=%dx%d min=%dx%d", exe, app.Frameless, app.WindowStartState, app.Title, app.Width, app.Height, app.MinWidth, app.MinHeight)

	err = wails.Run(app)
	if err != nil {
		log.Fatal(err)
	}
}
