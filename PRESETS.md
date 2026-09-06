# Presets

Conditions you've found and want to keep. Paste any of these into the Settings
box of a study (or PROTOLAB) and hit Apply.

**The portable part is the conditions**, not the object: `lightSize`,
`lightHeight`, `ease`, `lampColor`, `finish`, `grainAmt`, `contrast`, `steps`,
`toneShadow`, `toneHigh`, `toneAmt`, `cSheet`, `surface`, `emboss`. Everything
else describes a particular flower and can be dropped. PROTOLAB accepts a
conditions-only object, so a preset copied out of the flowers study works there.

## Taking a style to another project

Select a pressing on the [clippings sheet](canvas/) and hit **Copy style
prompt** (or **Whole sheet** for all of them). What lands on your clipboard is
one block in three registers:

1. **Prose** — what the material, light and finish actually are, in words. This
   is the part to paste into another project, another model, or a brief. It
   says *why* it looks like that, not just what the numbers are.
2. **A JSON block** of the exact conditions — for anyone reimplementing it, or
   to paste into the Apply box of any study here.
3. **A link** that reopens the pressing in the study that made it, settings
   intact. Works from anywhere once the site is published.

Notes you write on a pressing come along in the prose, under *Why I kept it*.

---

## Blueprint

Kyra, 2026-09-01. Full-strength duotone — deep blue shadow, pure white
highlight, `toneAmt: 1` — over an amber sheet, with `steps: 1`. One band is the
extreme setting: it collapses the whole range to a hard light/dark split, so the
relief reads as a flat graphic silhouette rather than a lit surface. Cyanotype
territory.

The conditions:

```json
{
  "lightSize": 700,
  "lightHeight": 280,
  "ease": 0.1,
  "lampColor": "#fff6ec",
  "finish": "matte",
  "grainAmt": 0.3,
  "contrast": 0.86,
  "steps": 1,
  "toneShadow": "#002e7a",
  "toneHigh": "#ffffff",
  "toneAmt": 1,
  "cSheet": "#aa7942",
  "surface": "ink",
  "emboss": 0.24
}
```

Full state as sent, including the specimen it was found on:

```json
{
 "seed": 12348, "species": "dahlia", "petals": 18, "whorls": 3,
 "petalLen": 0.95, "petalWid": 0.22, "sharp": 0.4, "open": 0.45, "disc": 0.1,
 "size": 300, "leaves": 0, "relief": 30, "gloss": 0, "scatter": 0.1,
 "lightSize": 700, "lightHeight": 280, "ease": 0.1, "lampColor": "#fff6ec",
 "finish": "matte", "grainAmt": 0.3, "contrast": 0.86, "steps": 1,
 "toneShadow": "#002e7a", "toneHigh": "#ffffff", "toneAmt": 1,
 "cBase": "#7d1f3d", "cTip": "#f0b7bd", "cDisc": "#4a3510", "cLeaf": "#4f6141",
 "surface": "ink", "emboss": 0.24, "press": "up", "cSheet": "#aa7942"
}
```
