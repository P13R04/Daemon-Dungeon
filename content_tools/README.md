# Content Tools

Open these standalone pages in your browser (recommended through Vite dev server):

- `content_tools/index.html`
- `content_tools/bonus-editor.html`
- `content_tools/achievement-editor.html`

## Folder save workflow

Because browsers cannot write directly to arbitrary paths without permission, each tool uses this flow:

1. Click the folder selection button.
2. Choose the target folder (recommended:
   - `src/data/items/entries` for bonuses
   - `src/data/achievements/entries` for achievements
   - `src/data/rooms` for room editor)
3. Use save buttons to write JSON files directly to that folder.

## Compatibility mode

Both bonus and achievement editors can also export an aggregated JSON (`items.json` / `achievements.json`) from the current batch for compatibility with existing systems.
