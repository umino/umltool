# UmlTool

[日本語](README.md) | English

A WYSIWYG UML diagramming tool where you can freely place and wire elements, Visio-style.
Supports sequence diagrams and activity diagrams. A serverless Electron desktop app.

- Engine: [AntV X6](https://github.com/antvis/X6) v3 + Electron + TypeScript (electron-vite)
- **One-way initial generation** from text (a PlantUML subset) — after generation, adjust everything freely in the GUI
- Projects are saved as `.umlproj` (JSON envelope + X6 model)
- Image export: PNG / JPEG / WebP

## Development

```bash
npm install
npm run dev        # start in development mode
npm run typecheck  # type check
npm test           # unit tests (Vitest)
npm run build      # production build (out/)
npm start          # preview the built app
```

### Headless self-diagnostics

```powershell
$env:UMLTOOL_DIAG='1'; npx electron-vite preview
```

Verifies diagram generation, export in all three formats, save⇄load round-trips, and editing behavior,
then writes `diag-output.png` (activity diagram) and `diag-output-seq.png` (sequence diagram).

## Usage

| Action | How |
|---|---|
| Scroll | Mouse wheel (scrollbars also work) |
| Zoom | Ctrl + wheel (centered on cursor), or toolbar −/100%/＋/Fit |
| Pan | Left-drag on empty space, or middle-button drag |
| Rubber-band selection | Shift + left-drag |
| Undo / redo | Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) |
| Copy / cut / paste | Ctrl+C / Ctrl+X / Ctrl+V (paste places elements slightly offset) |
| Select all | Ctrl+A |
| Delete | Delete / Backspace, or the 🗑 toolbar button |
| Edit properties | Select an element → edit name, label, and kind in the right panel |
| Edit labels in place | **Double-click** a node or message to edit it inline |

Labels wrap automatically to fit their node, and node width adjusts automatically to the label (up to a limit).

### Sequence diagrams

- **Create a message**: drag from a lifeline's life line (vertical dashed line) to another lifeline.
  Or use the toolbar "＋メッセージ" button (with 2 elements selected, connects them in selection order;
  with 1 selected, connects to the nearest; with none, connects the first two lifelines)
- **Move a message vertically**: select the message and drag its center handle up/down (it always stays horizontal)
- **Reconnect**: select a message and drag an endpoint handle to another lifeline
- **Kinds**: synchronous (solid line, filled arrow) / asynchronous (solid, open arrow) / return (dashed, open arrow) / self (loop) — switch in the right panel
- **Activation bars (execution specifications)**: toolbar "＋活性化バー". Constrained to the lifeline's center line; movable vertically and resizable in both directions

### Activity diagrams

- Switch to "アクティビティ図" in the toolbar's diagram-type selector
- **Create a flow**: drag from a connection port (the circles on each side shown on hover).
  Or use the toolbar "＋フロー" button (with 2 nodes selected, connects them in selection order; with 1, connects to the nearest)
- Flows use orthogonal (manhattan) routing; select a flow to add and adjust waypoints
- Edit guard conditions by selecting a flow and using the right panel
- **Decision and merge are separate nodes**: a decision is a diamond with a condition label, while a merge is a small empty diamond (toolbar "＋合流")
- **Swimlanes** can be resized: select one and drag the handles to change its width and height
- New nodes are added at the **center of the current view** (consecutive additions are offset slightly)

## Text generation (PlantUML subset)

### Sequence diagrams

```
participant User
actor Admin
User -> Server : synchronous message
User ->> Server : asynchronous message
Server --> User : return
Server -> Server : self message
```

### Activity diagrams

```
|Reception|        ← swimlane (optional)
start
:Accept the order;
if (In stock?) then (yes)
  :Allocate the item;
else (no)
  :Arrange a backorder;
endif
fork
  :Issue the invoice;
fork again
  :Ship the item;
end fork
stop
```

Comments start with `'`, `#`, or `//`. `@startuml` / `@enduml` / `title` are ignored.

## The `.umlproj` file format

```json
{
  "format": "umltool-project",
  "version": 2,
  "diagramType": "sequence",
  "graph": { "cells": [] }
}
```

Version 1 files (the XML format of the old maxGraph implementation) cannot be loaded (an explicit error is shown).

## License

[MIT License](LICENSE)
