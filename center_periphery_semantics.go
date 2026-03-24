package orbit

import "math"

// centerPeripherySemanticContract is the backend-owned center/periphery model
// shared with the UI bootstrap payload.
type centerPeripherySemanticContract struct {
	DesktopWidth  float64 `json:"desktopWidth"`
	DesktopHeight float64 `json:"desktopHeight"`
	RadiusScale   float64 `json:"radiusScale"`
	LensRatio     float64 `json:"lensRatio"`
}

var desktopCenterPeripheryContract = centerPeripherySemanticContract{
	DesktopWidth:  1272.0,
	DesktopHeight: 740.0,
	RadiusScale:   0.42,
	LensRatio:     0.68,
}

func centerPeripherySemantics() centerPeripherySemanticContract {
	return desktopCenterPeripheryContract
}

func classifyDesktopBand(x, y float64) bool {
	contract := centerPeripherySemantics()
	cx, cy := contract.DesktopWidth/2.0, contract.DesktopHeight/2.0
	maxR := math.Min(contract.DesktopWidth, contract.DesktopHeight) * contract.RadiusScale
	return math.Hypot(x-cx, y-cy) <= (maxR * contract.LensRatio)
}
