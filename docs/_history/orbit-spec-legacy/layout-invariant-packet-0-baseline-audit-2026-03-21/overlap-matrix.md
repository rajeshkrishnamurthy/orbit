# Packet 0 Overlap Matrix

| Profile | Viewport | Zoom | Result | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| wide-default | 1440x900 | 100% | FAIL | [wide-default.png](./screenshots/wide-default.png) | overlaps: context-head, toolbar, hidden-toggle, open-contexts |
| medium-default | 1280x800 | 100% | FAIL | [medium-default.png](./screenshots/medium-default.png) | overlaps: context-head, toolbar, hidden-toggle, open-contexts |
| narrow-default | 1024x768 | 100% | FAIL | [narrow-default.png](./screenshots/narrow-default.png) | overlaps: context-head, toolbar, hidden-toggle, open-contexts |
| wide-zoom125 | 1440x900 | 125% | FAIL | [wide-zoom125.png](./screenshots/wide-zoom125.png) | overlaps: context-head, toolbar, hidden-toggle, open-contexts |

Baseline verdict: these profiles currently fail the future layout-invariant target because system chrome is still rendered inside the canvas region.