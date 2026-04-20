# Feature Spec — Chrome/Canvas Separation Layout Benchmark (Snapshot)

- **Project root:** `/Users/rajeshk/.openclaw/projects/orbit`
- **Document type:** Layout benchmark snapshot (visual baseline)
- **Date captured:** 2026-03-22
- **Status:** Active benchmark for chrome-layer layout discussions
- **Source:** Reference screenshot shared by Rajesh (`openclaw-control-ui`, Sun 2026-03-22 00:32 IST)

## Intent
Capture the current implemented chrome/canvas separation layout as a fixed benchmark reference for future chrome-layer layout decisions.

## In scope (this snapshot benchmark)
- Spatial placement of top-level chrome controls vs the canvas board area.
- Relative zoning of visible cards (center vs periphery clusters).
- Current coexistence pattern of top-right chrome controls and board frame.

## Out of scope
- Interaction behavior changes.
- Animation/motion behavior.
- Color token or typography system decisions.
- Responsive/mobile variants not visible in this snapshot.

## Snapshot observations (layout baseline)

### 1) Global frame and chrome striping
- A persistent top chrome band contains app identity on the left and control groups on the right.
- The main board/canvas begins below that chrome band, separated by a horizontal divider line.
- The board itself is visually bounded by a rectangular frame with subtle corner rounding.

### 2) Top-left chrome cluster
- `The Orbit` title and `ENTiger` context indicator sit in the top-left chrome area.
- This block is outside card space and should remain non-overlapping with board cards.

### 3) Top-right chrome cluster
- `Card color` legend pills are right-aligned near the top edge.
- Filter chips (`Hidden (9)`, `All`, `Center`, `Periphery`, `Stale`) sit below the legend, still in chrome.
- Current benchmark behavior: right chrome controls do **not** intrude into card-rendering area; cards begin below separator/frame top.

### 4) Canvas center geometry
- Concentric circular guides are centered in the board, acting as spatial context rings.
- A vertical center stack of cards is present around the focal zone:
  - Upper-center: `Equitas upgrade`
  - Mid-center: `Segmentation`
  - Lower-mid: `ENCollect Pro Home`
  - Lower-center: `DBS Move to prod`

### 5) Periphery card layout (as currently rendered)
- **Upper-left cluster:** `Jana`, `DMI Finance`, `Thinus arrangement` (overlapping/stacked grouping).
- **Left-mid isolated:** `Ambit`.
- **Lower-left cluster:** `Improved 011y`, `Whatsapp for execs`, `Cycle based thinking`, `Arabic mobile app`.
- **Upper-right isolated:** `Niwas`.
- **Lower-right isolated:** `Amber invoicing`.

### 6) Separation invariant captured by this benchmark
- Chrome controls are positioned in dedicated top bands/blocks.
- The task-card canvas occupies the framed board region below the separator.
- Future layout changes should preserve this conceptual separation unless an explicit superseding decision is approved.

## Acceptance criteria for “layout still benchmark-compatible”
1. App identity and global controls remain outside the primary card-rendering board region.
2. The board’s top boundary remains visually below chrome controls (clear separator relationship).
3. Center stack and periphery zoning remain legible as distinct spatial groupings.
4. No new chrome element overlays core center-stack cards by default state.

## Benchmark usage note
Use this snapshot as the default comparison anchor in future chrome-layer layout discussions, reviews, and patch decisions.
