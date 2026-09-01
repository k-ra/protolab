# PROTOLAB

A sheet of paper you can plant things in.

Click anywhere to press a specimen into the page. Click one to select it and
change what it is. Drag to move it. Move the mouse and a small lamp travels
across the surface behind your cursor, because none of this is drawn — it's
modelled as height and then lit.

**Inked** gives you flowers as coloured objects sitting on paper.
**Blind** removes the ink entirely: the whole frame becomes one sheet and every
flower is nothing but a change in its height, invisible until the light rakes
across it.

Everything persists to `localStorage`, and **Settings → Copy** puts the whole
arrangement on your clipboard as JSON. Paste one back in and hit Apply.

---

## How it works

Nothing here draws a picture of a flower. The pipeline is:

```
rasterise petals with gradient fills   →  a height field
gradients of that field                →  surface normals    (once)
a small point lamp + soft materials    →  pixels             (every relight)
```

Two details do most of the work:

**Petals are filled with a gradient along their axis** — high at the base,
falling to the tip — so the bloom becomes a mound without anything drawing a
dome. Cupped species lift the tip back up. Each petal is then stroked with a
darker grey, which cuts a groove between overlapping petals; that crease is what
makes a flat mask read as three-dimensional under raking light.

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
| `lib/flora.js` | flower geometry: 12 species, grown from a seed, rendered as height or colour |
| `index.html` | the page |
| `PRESETS.md` | saved lighting and paper conditions |

No build step and no dependencies beyond a vendored copy of p5.js, which is used
only for `noise()`. Serve the folder rather than opening `index.html` over
`file://` — the shared scripts need an origin.

```bash
npx serve .
```
