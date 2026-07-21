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
| Add to / remove from selection | Ctrl + click |
| Move several elements at once | Select them, then drag any one of them |
| Undo / redo | Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) |
| Copy / cut / paste | Ctrl+C / Ctrl+X / Ctrl+V (paste places elements slightly offset) |
| Select all | Ctrl+A |
| Delete | Delete / Backspace, or the 🗑 toolbar button |
| Add elements | Click an icon in the "部品" (parts) tab in the left pane |
| Text (attached) | The "テキスト" palette item. Attaches to the selected lifeline (linked by a dashed connector, follows it when moved; sequence diagrams). Double-click to edit; set font size, bold, and color in the right panel; drag the handle to change width (auto-wraps) |
| Note | The "ノート" palette item. A top-left dog-eared sticky note, freely placed anywhere (both diagram types). Editing and styling work like text |
| Edit properties | Select an element → edit name, label, and kind in the right panel |
| Edit labels in place | **Double-click** a node or message to edit it inline |
| Change appearance | Select an element → set background colour, line colour, font size, font, bold, and text colour under "外観" in the right panel |

Labels wrap automatically to fit their node, and node width adjusts automatically to the label (up to a limit). Changing the font size or font re-runs that auto-sizing against the new metrics.

### Appearance (colours and fonts)

- Selecting an element reveals an "**外観**" (appearance) section in the right panel, showing only the properties that shape can carry (initial/final/fork nodes have a background colour only; merge has background and line colour)
- **The colour picker combines presets with free input**: click one of the swatches to apply it immediately, or use the colour box on the left to pick any colour
- Supported: lifeline / activation bar / fragment / action / decision / merge / initial / final / fork / join / swimlane / frame / text / note

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
- **Branches do not overlap**: branches leave a decision through its bottom, right and left sides and enter a merge through its top, right and left sides, each on its own side. The assignment follows the position of the node at the other end and is redone when nodes move. Sides are only reused once a node has four or more branches
- **Swimlanes** can be resized: select one and drag the handles to change its width and height
- **Node resizing**: action / decision / merge / initial / final / fork / join nodes show handles when selected, and can also be sized via the "幅" and "高さ" fields in the right panel (initial and final keep a fixed aspect ratio so they stay circular). Actions and decisions normally auto-size to their label; resizing one manually pins that size instead. Use "サイズを自動に戻す" in the right panel to restore the automatic behaviour
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
note right of Server : text attached to the lifeline
note over User, Server : a sticky note spanning both
note left of User
multi-line bodies
are supported too
end note
[-> Server : a message from outside the diagram
Server ->] : a message to outside the diagram
autoactivate on
User -> Server : the call opens a bar
Server --> User : the return closes it
```

- **Display name and alias**: `participant "Display name" as Alias`. Referenced by the alias afterwards.
- **Activation bars**: `activate <participant>` … `deactivate <participant>`. Omitting `deactivate` closes it automatically at the end.
- **Automatic activation bars**: after `autoactivate on`, a call (`->` / `->>`) opens a bar on the receiver and a return (`-->`) closes the sender's bar. `autoactivate off` stops applying this to later messages (bars still open then close at the end). Mixing it with explicit `activate` / `deactivate` is safe — the two are tracked independently.
- **Combined fragments**: `alt` / `opt` / `loop` / `break` / `par` / `seq` / `strict` / `critical` (closed with `end`, nestable).
  Dashed separators via `else` are available inside `alt` / `par` (each operand's guard can also be edited individually in the right panel after generation).
- **Annotations** map onto the two annotation shapes:
  - `note left of <participant>` / `note right of <participant>` → **text**, attached to that lifeline, linked by a dashed connector and following it when moved
  - `note over <participant>` / `note over <a>, <b>` → **note**, a freely placed sticky note; listing several participants widens it to span them

  Either form takes its body after `:`, or omits the `:` and reads everything up to `end note` as a multi-line body. An annotation is placed below the message preceding it, and following messages shift down to make room.
- **Gates (messages to and from outside the diagram)**: `[-> <participant>` comes in from outside, `<participant> ->]` goes out. Arrow kinds (`->`, `->>`, `-->`) work as usual. The gate end is a free point with no participant, extending to the left for inbound messages and to the right for outbound ones. Both ends cannot be outside (`[->]` is an error).

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
