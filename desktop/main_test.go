package main

import (
	"net/http"
	"testing"

	"github.com/wailsapp/wails/v2/pkg/options"
)

func TestDesktopAppOptionsKeepsNativeFrame(t *testing.T) {
	app := desktopAppOptions(http.NewServeMux())

	if app.Frameless {
		t.Fatalf("desktop app must keep the native window frame enabled")
	}
	if app.OnStartup == nil {
		t.Fatalf("desktop app must install startup recovery")
	}
	if app.OnDomReady == nil {
		t.Fatalf("desktop app must install dom-ready recovery")
	}
	if app.WindowStartState != options.Normal {
		t.Fatalf("unexpected start state: got %v want %v", app.WindowStartState, options.Normal)
	}
	if app.Width != defaultWindowWidth || app.Height != defaultWindowHeight {
		t.Fatalf("unexpected default size: got %dx%d want %dx%d", app.Width, app.Height, defaultWindowWidth, defaultWindowHeight)
	}
	if app.MinWidth != minWindowWidth || app.MinHeight != minWindowHeight {
		t.Fatalf("unexpected minimum size: got %dx%d want %dx%d", app.MinWidth, app.MinHeight, minWindowWidth, minWindowHeight)
	}
	if app.Title != "The Orbit" {
		t.Fatalf("unexpected title: got %q want %q", app.Title, "The Orbit")
	}
}

func TestIsBrokenWindowPlacement(t *testing.T) {
	cases := []struct {
		name string
		x    int
		y    int
		w    int
		h    int
		want bool
	}{
		{name: "normal", x: 50, y: 50, w: 1320, h: 860, want: false},
		{name: "tiny", x: 50, y: 50, w: 158, h: 26, want: true},
		{name: "offscreen", x: -21333, y: -21333, w: 158, h: 26, want: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := isBrokenWindowPlacement(tc.x, tc.y, tc.w, tc.h)
			if got != tc.want {
				t.Fatalf("isBrokenWindowPlacement(%d,%d,%d,%d) = %v want %v", tc.x, tc.y, tc.w, tc.h, got, tc.want)
			}
		})
	}
}
