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
| Add elements | Click an icon in the "部品" (parts) tab in the left pane |
| Edit properties | Select an element → edit name, label, and kind in the right panel |
| Edit labels in place | **Double-click** a node or message to edit it inline |

Labels wrap automatically to fit their node, and node width adjusts automatically to the label (up to a limit).

### Sequence diagrams

- **Create a message**: drag from a lifeline's life line (vertical dashed line) to another lifeline.
  Or use the "メッセージ" palette item (with 2 elements selected, connects them in selection order;
  with 1 selected, connects to the nearest; with none, connects the first two lifelines)
- **Move a message vertically**: select the message and drag its center handle up/down (it always stays horizontal)
- **Reconnect**: select a message and drag an endpoint handle to another lifeline
- **Kinds**: synchronous (solid line, filled arrow) / asynchronous (solid, open arrow) / return (dashed, open arrow) / self (loop) — switch in the right panel
- **Activation bars (execution specifications)**: the "活性化バー" palette item. Constrained to the lifeline's center line; movable vertically and resizable in both directions
- **Combined fragments**: the "フラグメント" palette item. Change the operator (alt / opt / loop / break / par / seq / strict / critical) and guard in the right panel; double-click also edits the guard. Drag the border to move, select to resize. For alt / par, use "＋区切り線を追加" in the right panel to add dashed separators (drag vertically to move, Delete to remove)

### Activity diagrams

- Switch to "アクティビティ図" in the toolbar's diagram-type selector
- **Create a flow**: drag from a connection port (the circles on each side shown on hover).
  Or use the "フロー" palette item (with 2 nodes selected, connects them in selection order; with 1, connects to the nearest)
- Flows use orthogonal (manhattan) routing; select a flow to add and adjust waypoints
- Edit guard conditions by selecting a flow and using the right panel
- **Decision and merge are separate nodes**: a decision is a diamond with a condition label, while a merge is a small empty diamond (the "合流" palette item)
- **Swimlanes** can be resized: select one and drag the handles to change its width and height
- **Frames (containers)**: the "フレーム" palette item. A transparent frame with a header tab in the top-left corner; nodes inside remain fully interactive. Drag the border or header to move, select to resize, and edit the header via the right panel or double-click (the tab width follows the text)
- New nodes are added at the **center of the current view** (consecutive additions are offset slightly)

## Text generation (PlantUML subset)

### Sequence diagrams

```
participant User
participant "Web Server" as Server
actor Admin
User -> Server : synchronous message
User ->> Server : asynchronous message
activate Server
Server --> User : return
Server -> Server : self message
deactivate Server
alt authenticated
  Server --> User : success
else rejected
  Server --> User : failure
end
```

- **Display name and alias**: `participant "Display name" as Alias`. Referenced by the alias afterwards.
- **Activation bars**: `activate <participant>` … `deactivate <participant>`. Omitting `deactivate` closes it automatically at the end.
- **Combined fragments**: `alt` / `opt` / `loop` / `break` / `par` / `seq` / `strict` / `critical` (closed with `end`, nestable).
  Dashed separators via `else` are available inside `alt` / `par` (each operand's guard can also be edited individually in the right panel after generation).

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
