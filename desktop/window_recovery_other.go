//go:build !windows

package main

func recoverBrokenNativeWindowPlacement() bool {
	return false
}
