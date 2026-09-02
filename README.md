# PROTOLAB

A sheet of paper you can plant things in — and the menu for everything else.

**[The sheet](./protolab/)** is the landing page and the navigation at once.
Click bare paper to plant a bloom. Click a specimen to select it and change what
it is. Drag to move it. **Double-click it to open the study that made it**, with
its settings intact; edit there, hit *Save to hub*, and it comes back changed.
Anything you like goes in the **Library**, which persists between visits.

Move the mouse and a small lamp travels across the surface behind your cursor,
because none of this is drawn — it's modelled as height and then lit.

**Inked** puts colour on the paper. **Blind** takes it all away: the frame
becomes one sheet and every specimen is nothing but a change in its height,
invisible until the light rakes across it.

## Clippings

**[The clippings sheet](./canvas/)** is a swatch book, and a deliberately
different thing from the landing page. One white ground, one fixed light, and
*material* as the only variable — a wax seal on white, a brass bloom on white, a
cotton-paper card with a flower pressed into it. It exists to compare effects
side by side, so nothing about the background is allowed to move.

That needed the engine to carry a **per-pixel material map**: `matMap` indexes
into a list of light responses, so wax, brass, plaster and paper sit on one
sheet under one lamp and each answers it differently. Material index 0 is the
ground, given `ambient: 1` so the lamp cannot touch it — which is what keeps the
white behind everything exactly one white.

Every pressing takes a note, and the notes copy out as markdown.

## The studies

| | |
|---|---|
| [The Press](./press/) | wax · clay · paper · metal, pressed with a monogram, emblem, figure or stationery die |
| [Specimen](./flowers/) | twelve species grown from a seed, inked or blind-embossed |
| [Sigil Pressure](./wax-seal/) | the first one — a wax pour with its own pipeline |

## How it works

Nothing draws a picture of anything. The pipeline is:

```
rasterise with gradient fills   →  a height field
gradients of that field         →  surface normals    (once)
a small point lamp + materials  →  pixels             (every relight)
```

Three details do most of the work:

**Petals are filled with a gradient along their axis** — high at the base,
falling to the tip — so a bloom becomes a mound without anything drawing a dome.
Each petal is then stroked darker, cutting a groove between overlapping petals;
that crease is what makes a flat mask read as three-dimensional under raking
light. Seals use the same trick: a domed body, a flat plateau where the die
landed, a lighter ring for the material squeezed out at its edge, and the motif
painted darker.

**The whole frame is one surface.** Specimens aren't sprites composited over a
background — they're marks in a single shared height field, which is why the
wordmark can be part of the paper and why the light falls across everything at
once.

**The relief field is computed at ~60% of display resolution and upscaled**,
with film grain applied at full resolution on top. The grain hides the
interpolation, and that's what keeps a page-sized height field relightable at
frame rate.

## Lighting

Deliberately low-glare. A small point lamp with distance falloff rather than a
directional vector, eased toward the cursor so it trails rather than snaps.
Matte mode removes specular altogether — a matte surface has no highlight — and
zeroes subsurface scatter, which is the term that makes a surface look *wet* and
which survives turning gloss down. A split-tone grade and optional posterisation
sit at the end of the pass.

## Files

| | |
|---|---|
| `lib/relief.js` | the height-field engine — raster, blur, normals, shade, grain, tone |
| `lib/flora.js` | 12 flower species, grown from a seed, rendered as height or colour |
| `lib/press.js` | a pressed seal, same contract as a flower |
| `lib/dies.js` | the engraver's vocabulary — rings, beads, monograms, laurels, crests |
| `lib/matter.js` | the material catalogue — colour, light response, relief character |
| `lib/hub.js` | the collection, and how presets travel between pages |
| `PRESETS.md` | saved lighting and paper conditions |

A specimen is `{kind, spec}` — `kind` picks the renderer, `spec` is what that
renderer needs. The same shape is used on the canvas, in the library, and in the
URL hash that carries a preset into a study and back. Adding a new material
means writing one `stamp(ctx, spec, mode)` function.

No build step, and no dependency beyond a vendored p5.js used only for
`noise()`. Serve the folder rather than opening over `file://` — the shared
scripts need an origin.

```bash
npx serve .
```
