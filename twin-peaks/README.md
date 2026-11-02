# San Francisco from Twin Peaks

Study after the panoramic railway maps (*chōkanzu*) of Yoshida Hatsusaburō (1884–1955).

- `index.html`: the sheet. `index.html?embed` turns slowly, ignores touch, and links to the full sheet.
- `poster.png`: still.
- `clipping.jpg`: the land disc cropped from the poster, for the round slip on the cover.
- `source/`: `template.html` and `data.b64` (gzip + base64 elevation and land cover). `python3 make.py` writes `sf.html`; `python3 lab.py index.html sf.html` adds the note and embed mode.

Elevation: Terrarium tiles (Mapzen, AWS Open Data), 12.5 m within 4 km of Twin Peaks, 50 m to 24 km. Projection: logarithmic radius, relief exaggerated toward the rim, slopes stepped at 24 m.
