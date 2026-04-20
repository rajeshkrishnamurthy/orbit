# Packet 0 Risk Register

| Risk | Why it matters | Baseline evidence |
| --- | --- | --- |
| Persisted coordinates may be canvas-relative or absolute-display | Packet 1 must know whether a migration is needed before enforcing boundary changes. | Trace sample captures create, drag/move, load, and persist coordinates. |
| Current chrome is rendered inside the canvas surface | Packet 1/2 need a stable boundary contract before moving controls. | Boundary map shows context head, toolbar, hidden toggle, and lens controls inside `#surface`. |
| Zoom/viewport pressure may change overlap behavior | Packet 2 must handle narrow widths and zoom without canvas intrusion. | Overlap matrix captures multiple viewport and zoom profiles. |
| Drag/save flows may write coordinates from DOM positions | Any future shell change can accidentally mutate coordinates if this path is not bounded. | Create and drag request traces show current request bodies. |
| Hidden tray / contextual overlays may need separate placement rules | These are likely to become system chrome candidates in Packet 2. | Boundary map and screenshot bundle document their current placement or hidden state. |