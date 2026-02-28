# Custom Themes for QuickNote

QuickNote supports loading custom themes from the theme picker.

## How to load

1. Open menu command palette (`Ctrl+Space` in menu)
2. Run `settheme`
3. In theme picker, choose **Load custom theme...**
4. Select a `.json` or `.md` file

## Supported file types

- `.json`
- `.md` (with a JSON object, optionally inside a fenced `json` code block)

## Required fields

A custom theme must include at least:

- `bg`
- `surface`
- `text`
- `accent`

## Full theme schema

```json
{
  "name": "My Theme",
  "bg": "#0f1117",
  "surface": "#161a24",
  "surface2": "#1f2633",
  "text": "#e6edf3",
  "textSoft": "#b6c2d2",
  "muted": "#8a97aa",
  "border": "#2a3344",
  "accent": "#58a6ff",
  "accentSoft": "#79c0ff"
}
```

## Markdown file format example

```md
# My custom theme

```json
{
  "name": "My Markdown Theme",
  "bg": "#10141f",
  "surface": "#192135",
  "surface2": "#24304a",
  "text": "#dbe7ff",
  "accent": "#3e9af0"
}
```
```

## Notes

- Missing optional fields fall back to defaults.
- Loaded custom themes are saved and available as `Custom` in the theme picker.
