# Packet 0 Boundary Map

Captured from profile: wide-default (1440x900 @ 100%)

| Element | Selector | Visible | Rect | Relation to #surface |
| --- | --- | --- | --- | --- |
| app-title | `.app-title` | yes | 84,16 1272x24 | outside canvas |
| subtitle | `.sub` | yes | 84,44 1272x18 | outside canvas |
| context-head | `.context-head` | yes | 97,85 106.7x34 | inside/overlapping canvas |
| toolbar | `#toolbar` | yes | 859.36,85 483.64x36 | inside/overlapping canvas |
| hidden-toggle | `#hidden-toggle` | yes | 1066.22,93 67.36x20 | inside/overlapping canvas |
| open-contexts | `#open-contexts` | yes | 173.7,92 20x20 | inside/overlapping canvas |

Current summary: the app title/subtitle remain above the canvas, while the context header, toolbar, hidden toggle, and lens controls render inside the surface/canvas region in the baseline layout.