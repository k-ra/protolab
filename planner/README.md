# Spread

A two-page planner resting on a desk. Open `index.html` — no build, no dependencies,
everything is kept in `localStorage`.

Each page is one day, laid out like a Japanese weekly planner:

- **Time blocks**, 8:00 → 24:00. Drag on empty grid to draw one (or click for 30 min),
  drag a block to move it — across the two pages too — and pull its bottom edge to resize.
  Click to edit the label.
- **Todo** list with a tiny check box, highlighter per item.
- **Notes**: a dotted canvas. Double-click to drop a scrap of text anywhere, drag it around.
- **Show** menu: *all hours*, *work hours*, or *off hours*. Nothing is deleted when you
  switch; the hidden span collapses into a hatched bar (click it to expand) and the
  visible hours stretch to fill the page. Work hours are configurable next to it.
- **Highlighter** row: picks the pastel used for new blocks, scraps and stickies.
  Every item has a small colour dot to change it later.
- **Sticky note** on the desk beside the book — draggable, editable, as many as you like.
  Stationery lives in `state.desk.items`, so other desk objects can be added the same way.

Arrow keys page through spreads; the small month on the right page jumps to a date.

Type is IBM Plex Sans (monoline sans) with IBM Plex Mono for times; falls back to the
system sans if offline. Swap `--font` / `--mono` in `styles.css`.
