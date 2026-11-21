# bestiary

A new species, assembled from found specimens of earth. Each one is drawn as a flat x-ray plate, then lifted into 3D and set crawling or flying. Every bone and organ is a single photograph of a real organism or mineral, cut along its own edge. Hover any part to see what it really is, where and when it was photographed, and its natural history. Each species also has a mythology composed from what it is made of.

- `index.html`: one species. `?kept=<slug>` for a kept species, `?species=<seed>` for a new one, `&plan=bird|worm|whale|fish|bear|…` for a body plan.
- `bestiary.html`: every kept species, by air, water and land.
- `species.html`: make a new one.
- `credits.html`: every photograph, its author and its licence.

**Photographs.** The specimens come from iNaturalist and Wikimedia Commons under CC0, CC BY or CC BY-SA, credited in `credits.html`. Cut-outs of CC BY-SA photographs are shared under CC BY-SA. The backgrounds were removed with BRIA's RMBG-1.4, whose licence allows non-commercial use only.

**Natural history** is fetched live from the iNaturalist and Wikipedia public APIs when you open a part.

**Mythologies** are speculative field notes written by Claude. The species are invented; the natural history of every part is real.

Built from a local project by `scripts/build_protolab.sh`. Keeping new species needs that project's local server, so it is turned off here.
