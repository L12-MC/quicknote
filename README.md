# QuickNote

QuickNote is a minimal Tauri desktop notes app tailored for programmers with an inline command workflow and rich inline block chips.

## Features

- Single-surface writing editor (distraction-free)
- Inline block chips (atomic/selectable/deletable as one unit)
- Block types: `code`, `latex`, `link`, `image`, `video`, `file`
- Command palette with autocomplete
- Multi-note menu
- Markdown import/export

## Keyboard Shortcuts

- `Ctrl + Space` — Open command palette
- `Ctrl + R` — Rename current note (popup)
- In block editor:
	- `Tab` — Insert block
	- `Esc` — Cancel block

## Block Commands

Type one of these and press `Enter` or `Space`:

- `:code`
- `:latex`
- `:link`
- `:image`
- `:video`
- `:file`

After the block input appears, enter content and press `Tab`.

## Command Palette Commands

- `exit` — Go to “All Notes” menu
- `copyall` — Copy entire note content
- `exportmd` — Export current note as Markdown
- `importmd` — Import Markdown into current note

## Development

Install dependencies:

```bash
npm install
```

Run web dev server:

```bash
npm run dev
```

Run desktop app (Tauri):

```bash
npm run tauri dev
```

Build production frontend:

```bash
npm run build
```
