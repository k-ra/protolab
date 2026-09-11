# Spread

A two-page planner resting on a desk. Open `index.html` — no build, no dependencies,
everything is kept in `localStorage`.

Each page is one day, laid out like a Japanese weekly planner:

- **Time blocks**, 8 am → 12 am. Drag on empty grid to draw one (or click for 30 min),
  drag a block to move it — across the two pages too — and pull its bottom edge to resize.
  Click to edit the label; a new block you leave blank is discarded.
- **Keyboard first.** The line under each grid takes plain text: `lunch 12–1`,
  `standup 9:30`, `call 3`, `gym 10pm–12` become blocks; anything without a time
  becomes a todo. Press `/` to jump to today's line.
- **Now line** on today's page, with everything earlier greyed out.
- **Todo** list with a tiny check box. Unchecked items roll forward to today on their own,
  marked with a small → that remembers where they came from.
- **Deliverables**: a few ruled lines per day for what actually got done.
- **Notes**: a ruled text field, as plain as a notes app.
- **Habit** strip at the top of the right page. Collapsed, it only lists the habits you're
  currently holding, with the streak length; open it to tick the week.
- **Show** menu: *all hours*, *work hours*, or *off hours*. Nothing is deleted when you
  switch; the hidden span collapses into a hatched bar (click it to expand) and the
  visible hours stretch to fill the page. Work hours are configurable next to it.

On the desk beside the book:

- **Pen tray** of highlighters. The pen pulled forward is the colour for new blocks and
  stickies; the little eraser means no highlight. Every block, todo and sticky also has a
  small colour dot to change it later.
- **Index card** with the week at a glance. Click a line to open that day.
- **Sticky notes**, as many as you like.

Everything on the desk drags. Desk objects live in `state.desk.items`, so more stationery
can be added the same way. Arrow keys page through spreads; the small month on the right
page jumps to a date.

Type is IBM Plex Sans (monoline sans) with IBM Plex Mono for times; falls back to the
system sans if offline. Swap `--font` / `--mono` in `styles.css`.
