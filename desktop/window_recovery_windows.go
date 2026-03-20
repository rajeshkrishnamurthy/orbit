//go:build windows

package main

import (
	"log"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	swRestore     = 9
	swpNoZOrder   = 0x0004
	swpShowWindow = 0x0040
)

type winRect struct {
	Left   int32
	Top    int32
	Right  int32
	Bottom int32
}

var (
	user32            = windows.NewLazySystemDLL("user32.dll")
	procFindWindowW   = user32.NewProc("FindWindowW")
	procGetWindowRect = user32.NewProc("GetWindowRect")
	procSetWindowPos  = user32.NewProc("SetWindowPos")
	procShowWindow    = user32.NewProc("ShowWindow")
)

func recoverBrokenNativeWindowPlacement() bool {
	hwnd := findOrbitWindowHandle()
	if hwnd == 0 {
		return false
	}

	x, y, w, h, ok := getOrbitWindowRect(hwnd)
	if !ok {
		return false
	}
	if !isBrokenWindowPlacement(x, y, w, h) {
		return true
	}

	log.Printf("Orbit native window recovery: hwnd=%#x x=%d y=%d w=%d h=%d", hwnd, x, y, w, h)
	procShowWindow.Call(hwnd, uintptr(swRestore))
	procSetWindowPos.Call(hwnd, 0, uintptr(defaultWindowX), uintptr(defaultWindowY), uintptr(defaultWindowWidth), uintptr(defaultWindowHeight), uintptr(swpNoZOrder|swpShowWindow))

	x, y, w, h, ok = getOrbitWindowRect(hwnd)
	return ok && !isBrokenWindowPlacement(x, y, w, h)
}

func findOrbitWindowHandle() uintptr {
	className, err := windows.UTF16PtrFromString("wailsWindow")
	if err != nil {
		return 0
	}
	windowTitle, err := windows.UTF16PtrFromString("The Orbit")
	if err != nil {
		return 0
	}

	hwnd, _, _ := procFindWindowW.Call(uintptr(unsafe.Pointer(className)), uintptr(unsafe.Pointer(windowTitle)))
	return hwnd
}

func getOrbitWindowRect(hwnd uintptr) (int, int, int, int, bool) {
	var rect winRect
	result, _, _ := procGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&rect)))
	if result == 0 {
		return 0, 0, 0, 0, false
	}

	width := int(rect.Right - rect.Left)
	height := int(rect.Bottom - rect.Top)
	return int(rect.Left), int(rect.Top), width, height, true
}
