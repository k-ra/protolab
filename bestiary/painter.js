// =====================================================================================
// Engine
// =====================================================================================
const cv = document.getElementById("cv"), ctx = cv.getContext("2d", { willReadFrequently: true });
let W = cv.width, H = cv.height;
const P = new URLSearchParams(location.search);
const state = { scene: P.get("scene") || "abyss", seed: +(P.get("seed") || 3), glaze: P.has("glaze") ? +P.get("glaze") : null };
let index = {}, rejected = new Set(), CUTS = [], pieces = [], xd = new Set(), target = null, tdata = null, run = 0;
const cache = new Map(), uses = new Map();
const scratch = document.createElement("canvas"); scratch.width = scratch.height = 700;
const sx = scratch.getContext("2d");

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixc = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const css = c => `rgb(${c.map(v => Math.round(clamp(v, 0, 255))).join(",")})`;
function cdist(a, b) { const rm = (a[0] + b[0]) / 2, d = a.map((v, i) => v - b[i]); // "redmean" perceptual distance
  return Math.sqrt((2 + rm / 256) * d[0] * d[0] + 4 * d[1] * d[1] + (2 + (255 - rm) / 256) * d[2] * d[2]); }
const tick = () => new Promise(r => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(r))); // keep painting when the tab is in the background
const status = t => { const e = document.getElementById("status"); if (e) e.textContent = t; };

async function boot() {
  [index, rejected] = await Promise.all([fetch("library/cut/index.json").then(r => r.json()), fetch("library/rejects.json").then(r => r.json()).then(a => new Set(a))]);
  const usable = Object.values(index).filter(c => c.edge <= 0.3 && c.area >= 0.004 && c.area <= 0.85 && !rejected.has(c.id));
  status(`preparing ${usable.length} specimens…`);
  CUTS = window.LAZY_CUTS ? [] : (await Promise.all(usable.map(async c => ({ c, g: await loadCut(c) })))).filter(o => o.g && o.g.fill < 0.88) // ~rectangles = failed cuts
    .map(o => ({ ...o.c, g: o.g, aspect: o.g.elong, L: lum(o.c.color) }));
  if (window.ONBOOT) return window.ONBOOT(); // other pages (menagerie) reuse the engine without the painter UI
  bindUI(); paint();
}
function loadCut(c) {
  if (cache.has(c.id)) return cache.get(c.id);
  const p = new Promise(res => { const im = new Image(); im.onload = () => res(prep(im)); im.onerror = () => res(null); im.src = "library/" + c.file; });
  cache.set(c.id, p); return p;
}
function prep(im) {
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const sh = mk(im.width + 24, im.height + 24), s = sh.getContext("2d");
  s.filter = "blur(5px)"; s.drawImage(im, 12, 12); s.filter = "none"; s.globalCompositeOperation = "source-in"; s.fillStyle = "#000"; s.fillRect(0, 0, sh.width, sh.height);
  const A = 48, am = mk(A, A), a = am.getContext("2d", { willReadFrequently: true }); a.drawImage(im, 0, 0, A, A);
  const alpha = a.getImageData(0, 0, A, A).data;
  // shape moments in real pixel units: principal axis angle, elongation, and length along that axis
  const fx = im.width / A, fy = im.height / A; let on = 0, mx = 0, my = 0;
  for (let j = 0; j < A; j++) for (let i = 0; i < A; i++) if (alpha[(j * A + i) * 4 + 3] > 90) { on++; mx += (i + 0.5) * fx; my += (j + 0.5) * fy; }
  mx /= on || 1; my /= on || 1; let sxx = 0, syy = 0, sxy = 0;
  for (let j = 0; j < A; j++) for (let i = 0; i < A; i++) if (alpha[(j * A + i) * 4 + 3] > 90) { const dx = (i + 0.5) * fx - mx, dy = (j + 0.5) * fy - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy), tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc), elong = Math.sqrt(l1 / l2);
  let lo = 1e9, hi = -1e9, lo2 = 1e9, hi2 = -1e9; const ux = Math.cos(theta), uy = Math.sin(theta);
  for (let j = 0; j < A; j++) for (let i = 0; i < A; i++) if (alpha[(j * A + i) * 4 + 3] > 90) {
    const dx = (i + 0.5) * fx - mx, dy = (j + 0.5) * fy - my, p = dx * ux + dy * uy, q = -dx * uy + dy * ux;
    lo = Math.min(lo, p); hi = Math.max(hi, p); lo2 = Math.min(lo2, q); hi2 = Math.max(hi2, q); }
  const axisLen = Math.max(4, hi - lo), rect = (on * fx * fy) / (axisLen * Math.max(2, hi2 - lo2)); // ~1 = a slab / strip, low = organic
  return { im, sh, alpha, A, fill: Math.max(0.05, on / (A * A)), theta, elong, axisLen, rect };
}

// ---- choosing a specimen for a mark: closest colour, right shape, spread usage ----
function pick(r, want, shape, pool = CUTS, tries = 40, unique = false) {
  let best = null;
  for (let k = 0; k < tries; k++) {
    const c = pool[Math.floor(r() * pool.length)];
    let d = cdist(c.color, want) * 0.6;
    if (shape === "round") d += Math.max(0, c.aspect - 1.3) * 120 + Math.max(0, 0.55 - c.g.fill) * 250;
    if (shape === "body") d += Math.max(0, 0.42 - c.g.fill) * 260 + Math.max(0, c.aspect - 2.4) * 40;
    if (shape === "long") d += Math.max(0, 2.6 - c.aspect) * 110;
    d += (uses.get(c.id) || 0) * (unique === true ? 400 : unique || 1.5) + r() * 18;
    if (!best || d < best.d) best = { d, c };
  }
  uses.set(best.c.id, (uses.get(best.c.id) || 0) + 1);
  return best.c;
}
// A mark = specimen + placement + colour correction toward the wanted colour
function mark(r, { x, y, size, dir = 0, want, shape = "any", glaze = state.glaze, pool, shadow = 0.45, alpha = 1, byLength = false, tag, flip, sat = 1, comp, mirror, cast, unique, cut }) {
  const c = cut || pick(r, want, shape, pool, unique ? 80 : 40, unique);
  // the specimen's own principal axis is turned to lie along the mark's direction (dir + 90°)
  const s = byLength ? size / c.g.axisLen : size / Math.sqrt(c.w * c.h * c.g.fill);
  const bright = clamp((lum(want) + 6) / (c.L + 6), 0.35, 2.4);
  return { c, x, y, sw: c.w * s, sh: c.h * s, rot: dir + Math.PI / 2 - c.g.theta + (flip ? Math.PI : 0), bright, sat, glaze, tint: css(want), shadow, alpha, want, tag, comp, mirror, cast };
}
function draw(g, m) {
  const c = m.c, w = Math.max(1, Math.ceil(m.sw)), h = Math.max(1, Math.ceil(m.sh));
  if (w > scratch.width || h > scratch.height) { scratch.width = Math.max(scratch.width, w + 2); scratch.height = Math.max(scratch.height, h + 2); }
  sx.globalCompositeOperation = "source-over"; sx.globalAlpha = 1; sx.clearRect(0, 0, w + 2, h + 2);
  sx.filter = `brightness(${m.bright.toFixed(3)}) saturate(${m.sat})`; sx.drawImage(c.g.im, 0, 0, w, h); sx.filter = "none";
  if (m.glaze > 0) {
    sx.globalCompositeOperation = "color"; sx.globalAlpha = m.glaze; sx.fillStyle = m.tint; sx.fillRect(0, 0, w, h);
    sx.globalAlpha = 1; sx.globalCompositeOperation = "destination-in"; sx.drawImage(c.g.im, 0, 0, w, h); sx.globalCompositeOperation = "source-over";
  }
  const k = m.sw / c.w;
  if (m.cast) { const [dx, dy, a] = m.cast; // a soft shadow thrown onto the ground/wall, offset in world space
    g.save(); g.translate(m.x + dx, m.y + dy); if (m.mirror) g.scale(-1, 1); g.rotate(m.rot); g.globalAlpha = a; g.filter = "blur(7px)";
    g.drawImage(c.g.sh, -m.sw / 2 - 12 * k, -m.sh / 2 - 12 * k, c.g.sh.width * k, c.g.sh.height * k); g.restore(); }
  g.save(); g.translate(m.x, m.y); if (m.mirror) g.scale(-1, 1); g.rotate(m.rot);
  if (m.shadow) { g.globalAlpha = m.shadow * m.alpha;
    g.drawImage(c.g.sh, -m.sw / 2 - 12 * k + m.sw * 0.05, -m.sh / 2 - 12 * k + m.sh * 0.07, c.g.sh.width * k, c.g.sh.height * k); }
  if (m.comp) g.globalCompositeOperation = m.comp;
  g.globalAlpha = m.alpha; g.drawImage(scratch, 0, 0, w, h, -m.sw / 2, -m.sh / 2, m.sw, m.sh);
  g.restore();
}
async function drawAll(list, label, id) {
  let last = performance.now();
  for (let i = 0; i < list.length; i++) {
    draw(ctx, list[i]); pieces.push(list[i]);
    if (performance.now() - last > 30) { status(`${label} · ${i}/${list.length}`); await tick(); last = performance.now(); if (id !== run) return false; }
  }
  return id === run;
}

// ---- target helpers ----
function setTarget(cnv) { target = cnv; tdata = cnv.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data; }
function sample(data, x, y, r = 3) {
  let a = [0, 0, 0], n = 0; const st = Math.max(1, Math.floor(r / 2));
  for (let j = -r; j <= r; j += st) for (let i = -r; i <= r; i += st) {
    const px = clamp(Math.round(x + i), 0, W - 1), py = clamp(Math.round(y + j), 0, H - 1), k = (py * W + px) * 4;
    a[0] += data[k]; a[1] += data[k + 1]; a[2] += data[k + 2]; n++; }
  return a.map(v => v / n);
}
const tColor = (x, y, r) => sample(tdata, x, y, r);
// edge field from the target (Sobel on a blurred, quarter-res luminance)
function edgeField() {
  const q = 4, w = Math.ceil(W / q), h = Math.ceil(H / q), c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true }); x.filter = "blur(2px)"; x.drawImage(target, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, L = new Float32Array(w * h); for (let i = 0; i < w * h; i++) L[i] = lum([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
  const at = (i, j) => L[clamp(j, 0, h - 1) * w + clamp(i, 0, w - 1)];
  return (X, Y) => { const i = Math.round(X / q), j = Math.round(Y / q);
    const gx = at(i + 1, j - 1) + 2 * at(i + 1, j) + at(i + 1, j + 1) - at(i - 1, j - 1) - 2 * at(i - 1, j) - at(i - 1, j + 1);
    const gy = at(i - 1, j + 1) + 2 * at(i, j + 1) + at(i + 1, j + 1) - at(i - 1, j - 1) - 2 * at(i, j - 1) - at(i + 1, j - 1);
    return { ang: Math.atan2(gy, gx) + Math.PI / 2, mag: Math.hypot(gx, gy) }; };
}
// Painterly layer: wherever the canvas still differs from the target, lay a mark (coarse → fine)
async function layer(r, { size, spacing = 0.7, threshold, label, id, shape, glaze, pool, mask, jitter = 0.5, shadow = 0.4, sat = 1, minEdge = 0 }) {
  const cur = ctx.getImageData(0, 0, W, H).data, edge = state.edge, out = [], step = Math.max(3, size * spacing);
  for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) {
    const px = x + (r() - 0.5) * step * jitter * 2, py = y + (r() - 0.5) * step * jitter * 2;
    if (mask && !mask(px, py)) continue;
    const e = edge(px, py); if (e.mag < minEdge) continue;
    const rad = Math.max(2, size * 0.35), want = tColor(px, py, rad);
    if (threshold > 0 && cdist(sample(cur, px, py, rad), want) < threshold) continue; // compare regions, not pixels
    const detailed = e.mag > 60;
    // glaze harder where the target is strongly coloured (robes, sky), lighter on neutral stone so specimen texture shows
    const tSat = (Math.max(...want) - Math.min(...want)) / (Math.max(...want) + 1), g = glaze == null ? state.glaze : glaze;
    out.push(mark(r, { x: px, y: py, size: size * lerp(0.8, 1.2, r()) * (detailed ? 0.85 : 1), dir: (detailed ? e.ang : e.ang + (r() - 0.5) * 1.2) - Math.PI / 2, // axis along the edge
      want, shape: shape || (detailed ? "long" : "body"), glaze: clamp(g + tSat * 0.45 - 0.08, 0, 0.92), pool, shadow, sat }));
  }
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } // paint in random order, like a hand
  return drawAll(out, label, id);
}

// =====================================================================================
// Scenes
// =====================================================================================
const SCENES = {
  // ---------------------------------------------------------------------------------
  school: {
    title: "II · The School of the New World",
    about: "After Raphael, as an idea rather than a copy: a gathering of specimen-beings in discourse. At the centre one raises a sundew stalk toward the light while the other turns a palm of abalone toward the earth (the ideal and the observed). Around them: a reclining cynic, a brooding loner, a scribe, a geometer drawing a circle of forams, and two astronomers holding a pearl and a sea-urchin shell as worlds. Specimens keep their own colours; nothing is painted over.",
    size: [1800, 1100], glaze: 0.12,
    async paint(r, id) {
      // ---- ground: bare parchment board, like a specimen cabinet ----
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.35, 50, W * 0.5, H * 0.5, W * 0.75);
      bg.addColorStop(0, "#f1ebde"); bg.addColorStop(1, "#cfc4ad"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      const grain = rng(9); ctx.globalAlpha = 0.05;
      for (let i = 0; i < 16000; i++) { ctx.fillStyle = grain() > 0.5 ? "#fff" : "#6d6352"; ctx.fillRect(grain() * W, grain() * H, grain() * 2 + 0.5, grain() * 2 + 0.5); }
      ctx.globalAlpha = 1;
      tdata = null; target = null; state.ground = ctx.getImageData(0, 0, W, H);

      const by = (...cats) => CUTS.filter(c => cats.includes(c.category));
      const P = {
        head: CUTS.filter(c => c.aspect < 1.45 && c.g.fill > 0.5 && ["shells", "pearls_minerals", "micro", "coral_sea", "scales", "fungi_slime"].includes(c.category)),
        drape: CUTS.filter(c => c.g.rect < 0.8 && ["wings", "feathers", "leaf_edges", "shells", "scales", "coral_sea", "pearls_minerals", "beetles_bugs", "fungi_slime", "bark_lichen"].includes(c.category)),
        limb: CUTS.filter(c => c.aspect > 2.6 && c.g.rect < 0.65),
        small: CUTS.filter(c => c.aspect < 1.6 && c.g.fill > 0.45),
        armour: by("beetles_bugs", "scales"),
      };
      const list = [];
      const M = (o) => list.push(mark(r, { glaze: 0.12, shadow: 0.55, ...o }));

      // ---- the light of reason: a halo of pale tentacles and feathers behind the central pair ----
      const hx = W * 0.5, hy = H * 0.36;
      const paleLimb = P.limb.filter(c => c.L > 120 && Math.max(...c.color) - Math.min(...c.color) < 70);
      for (let k = 0; k < 96; k++) { const a = -Math.PI + (k / 95) * Math.PI + (r() - 0.5) * 0.04, L = H * lerp(0.1, 0.27, r() ** 0.8), d = H * 0.1 + L * 0.5;
        M({ x: hx + Math.cos(a) * d, y: hy + Math.sin(a) * d * 0.9, size: L, dir: a + Math.PI / 2, want: hex("#efe6d2"), shape: "long", byLength: true, pool: paleLimb.length > 20 ? paleLimb : P.limb, glaze: 0.5, sat: 0.4, alpha: 0.9, shadow: 0.25, tag: "halo" }); }
      // a faint stage line of tiny shells: the only "architecture"
      for (let x = W * 0.06; x < W * 0.94; x += 9) M({ x, y: H * 0.64 + Math.sin(x * 0.01) * 2, size: lerp(6, 10, r()), want: hex("#bdb29a"), shape: "round", pool: P.small, alpha: 0.55, shadow: 0.25, tag: "step" });

      // ---- beings: airy organic forms strung from specimens, with an even breathing gap between every piece ----
      const C = h => hex(h);
      const GRID = 40, occ = new Map();
      const free = (x, y, rad) => { const gx = Math.floor(x / GRID), gy = Math.floor(y / GRID);
        for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const cell = occ.get((gx + i) + "," + (gy + j)); if (!cell) continue;
          for (const p of cell) if (Math.hypot(p.x - x, p.y - y) < (p.r + rad) * 1.08) return false; } return true; }; // ~8% gap minimum
      const occupy = (x, y, rad) => { const k = Math.floor(x / GRID) + "," + Math.floor(y / GRID); if (!occ.has(k)) occ.set(k, []); occ.get(k).push({ x, y, r: rad }); };
      const D = Math.PI / 180;

      function being(f) {
        const h = f.h, s0 = h * (f.s || 0.082), rot = f.rot || 0, lean = f.lean || 0;
        const T = (lx, ly) => { const c = Math.cos(rot), sn = Math.sin(rot); return [f.x + lx * c - ly * sn, f.y + lx * sn + ly * c]; };
        const ax = t => lean * h * 0.2 * t * t;
        const tone = (t, side = 0.5) => { const a = C(f.robe), b = C(f.robe2 || f.robe), base = mixc(a, b, clamp(t * 1.2 - 0.1, 0, 1));
          return mixc(base.map(v => v * 1.15), base.map(v => v * 0.7), side); };
        // place one specimen at a local point, oriented along the path, only if it keeps the gap
        const place = (lx, ly, tan, sz, kind, want, tag, extra = {}) => {
          const [x, y] = T(lx, ly), long = kind === "long", rad = long ? sz * 0.32 : sz * 0.5;
          if (!free(x, y, rad)) return false; occupy(x, y, rad);
          M({ x, y, size: long ? sz * 1.7 : sz, byLength: long, dir: tan + rot - Math.PI / 2, want, shape: kind, pool: long ? P.limb : kind === "round" ? P.head : P.drape, tag: f.name + (tag ? ` (${tag})` : ""), ...extra });
          return true;
        };
        // walk a curve, dropping specimens at an even spacing along its length
        const walk = (fn, { t0 = 0, t1 = 1, size = () => s0, kind = () => "body", want = t => tone(t), tag, gap = 1.16 } = {}) => {
          let t = t0, [px, py] = fn(t0), first = true;
          while (t < t1) {
            const sz = size(t), k = kind(t), step = (k === "long" ? sz * 1.7 : sz) * gap * (first ? 0 : 1);
            let t2 = t, q = [px, py];
            while (t2 < t1 && Math.hypot(q[0] - px, q[1] - py) < step) { t2 += 0.0015; q = fn(t2); }
            if (t2 >= t1 && !first) break;
            const nq = fn(Math.min(t1, t2 + 0.01)), tan = Math.atan2(nq[1] - q[1], nq[0] - q[0]);
            place(q[0], q[1], tan, sz, k, want(t2), tag);
            [px, py] = q; t = t2 + 0.0001; first = false;
          }
        };
        const alt = t => (Math.floor(t * 97) % 3 === 0 ? "long" : "body");
        const top = -h * 0.96;

        if (f.form === "plume") { // a fountain: rays rise from low on the body and arc outward
          const n = 7, bx = 0, by = -h * 0.12;
          for (let i = 0; i < n; i++) { const u = i / (n - 1) - 0.5, a = -Math.PI / 2 + u * 1.25, L = h * (0.86 - Math.abs(u) * 0.45), curl = u * 0.9;
            walk(t => [bx + ax(t) + Math.cos(a) * t * L + curl * t * t * L * 0.35, by + Math.sin(a) * t * L + t * t * L * 0.22 * Math.abs(u) * 2], { size: t => s0 * (1 - t * 0.35), kind: alt, want: t => tone(t, u + 0.5) }); }
        }
        if (f.form === "helix") { // two strands turning around a leaning axis
          for (let k = 0; k < 2; k++) walk(t => [ax(t) + h * 0.12 * (1 - t * 0.55) * Math.sin(t * Math.PI * 4.4 + k * Math.PI), -t * h * 0.92], { size: t => s0 * (1 - t * 0.3), want: t => tone(t, k * 0.8 + 0.1) });
        }
        if (f.form === "bell") { // a medusa: an open bell, tentacles reaching for the earth
          const bw = h * 0.2, by = -h * 0.8;
          walk(u => [ax(1) + Math.cos(Math.PI + u * Math.PI) * bw, by - Math.sin(u * Math.PI) * h * 0.16], { size: () => s0 * 1.1, kind: () => "body", want: u => tone(0.9, u), tag: "bell" });
          for (let i = 0; i < 6; i++) { const x0 = ax(1) + lerp(-bw * 0.85, bw * 0.85, i / 5);
            walk(t => [x0 + Math.sin(t * 7 + i * 1.7) * h * 0.035 + (x0 - ax(1)) * t * 0.25, by + h * 0.04 + t * h * 0.74], { size: t => s0 * (0.85 - t * 0.35), kind: t => (t > 0.5 ? "long" : "body"), want: t => tone(0.6 - t * 0.5, i / 5), tag: "tentacle", gap: 1.25 }); }
        }
        if (f.form === "frond") { // a fern: a rachis with alternating pinnae
          walk(t => [ax(t), -t * h * 0.95], { size: () => s0 * 0.9, kind: () => "body", tag: "rachis" });
          for (let j = 1; j <= 7; j++) { const tj = j / 8.5, side = j % 2 ? 1 : -1, L = h * 0.3 * (1 - tj * 0.65);
            walk(u => [ax(tj) + side * u * L, -tj * h * 0.95 - u * L * 0.5 - u * u * L * 0.15], { size: u => s0 * (1 - u * 0.35), kind: alt, want: u => tone(tj, side > 0 ? 0.2 + u * 0.5 : 0.8 - u * 0.3), tag: "pinna" }); }
        }
        if (f.form === "spiral") { // curled inward like a nautilus
          const cy = -h * 0.42;
          walk(u => { const th = u * Math.PI * 3.6, rr = h * 0.4 * Math.exp(-0.2 * th); return [ax(0.5) + Math.cos(th + 0.5) * rr, cy + Math.sin(th + 0.5) * rr]; }, { size: u => s0 * 1.25 * Math.exp(-0.65 * u), kind: () => "body", want: u => tone(u, u) });
        }
        if (f.form === "coral") { // a branching coral
          const branch = (x, y, a, L, d) => { const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
            walk(t => [lerp(x, ex, t) + Math.sin(t * Math.PI) * L * 0.08 * (d % 2 ? 1 : -1), lerp(y, ey, t)], { size: () => s0 * (1 - d * 0.16), kind: () => (d >= 2 ? "long" : "body"), want: () => tone(d / 3, (a + Math.PI) / Math.PI - 0.3), tag: "branch" });
            if (d < 3) { branch(ex, ey, a - 0.48 - r() * 0.15, L * 0.72, d + 1); branch(ex, ey, a + 0.42 + r() * 0.15, L * 0.68, d + 1); } };
          branch(0, 0, -Math.PI / 2 + lean * 0.3, h * 0.36, 0);
        }
        if (f.form === "contour") { // a hollow teardrop drawn only by its edge, with one line through it
          walk(u => { const p = u * Math.PI * 2, w = h * 0.2 * Math.sin(p) * (0.32 + 0.68 * (1 - Math.cos(p)) / 2); return [ax(0.5) + w, -h * 0.5 - h * 0.45 * Math.cos(p)]; }, { size: () => s0 * 0.85, kind: alt, want: u => tone(0.5, u), tag: "edge" });
          walk(t => [ax(t) + Math.sin(t * 5) * h * 0.02, -h * 0.08 - t * h * 0.7], { size: () => s0 * 0.7, kind: () => "long", tag: "spine" });
        }
        if (f.form === "rings") { // a column of vertebra-like rings
          for (let k = 0; k < 6; k++) { const yk = -h * (0.1 + k * 0.15), rx = h * 0.17 * (1 - k * 0.1), ry = rx * 0.32;
            walk(u => [ax(k / 6) + Math.cos(u * Math.PI * 2) * rx, yk + Math.sin(u * Math.PI * 2) * ry], { size: () => s0 * (0.95 - k * 0.06), kind: () => "body", want: u => tone(k / 6, (Math.cos(u * Math.PI * 2) + 1) / 2), tag: "ring" }); }
        }
        // a crown: the one larger specimen that makes it a being (no face)
        const [hx, hy] = f.form === "bell" ? [ax(1), -h * 0.99] : f.form === "spiral" ? [ax(0.5) + h * 0.05, -h * 0.82] : [ax(1), top];
        place(hx, hy, -Math.PI / 2, s0 * 1.7, "round", C(f.crown || "#e8dccb"), "crown", { glaze: 0.08, pool: P.head.filter(c => c.category !== "micro") });

        // gestures and attributes
        if (f.gesture === "up") walk(t => [ax(1) + 4, top - s0 * 1.6 - t * h * 0.42], { size: () => s0 * 0.8, kind: () => "long", want: () => C("#efe8d6"), tag: "the stalk raised to the light", gap: 1.15 });
        if (f.gesture === "down") { walk(t => [ax(0.7) + t * h * 0.28, -h * 0.62 + t * t * h * 0.38], { size: () => s0 * 0.8, kind: () => "long", want: () => C("#d8d2c8"), tag: "the arm toward the earth", gap: 1.15 });
          place(ax(0.7) + h * 0.3, -h * 0.2, 0.4, s0 * 2.1, "body", C("#d8d0c4"), "palm of abalone", { pool: CUTS.filter(c => /abalone|Haliotis|nacre|Nacre|Pinctada/i.test(c.name + c.query)).concat(P.head).slice(0, 30) }); }
        if (f.gesture === "globe") place(ax(1) + h * 0.2, -h * 0.55, 0, s0 * 2.4, "round", C(f.globe), "a world");
        if (f.gesture === "book") place(ax(0.5) + h * 0.16, -h * 0.35, 0.3, s0 * 2.2, "body", C("#e9e2d2"), "the book", { pool: by("pearls_minerals", "shells") });
      }

      // ---- the gathering (x, feet y, height as fractions of the canvas) ----
      const F = (x, y, h, o) => ({ x: W * x, y: H * y, h: H * h, ...o });
      const people = [
        F(0.085, 0.61, 0.3, { name: "a listener", form: "frond", robe: "#6f7a3c", robe2: "#a8b070", lean: 0.4 }),
        F(0.15, 0.63, 0.32, { name: "the soldier", form: "rings", robe: "#b88a4a", robe2: "#6a7a4a", lean: 0.2 }),
        F(0.215, 0.6, 0.29, { name: "a listener", form: "helix", robe: "#8a8a5a", robe2: "#c8b888", lean: -0.25 }),
        F(0.28, 0.625, 0.33, { name: "the questioner", form: "plume", robe: "#6b6b3a", robe2: "#b0a070", lean: 0.3 }),
        F(0.345, 0.6, 0.3, { name: "a youth", form: "contour", robe: "#8f7aa0", robe2: "#d9c7e0", lean: -0.35 }),
        F(0.4, 0.62, 0.3, { name: "a listener", form: "coral", robe: "#c08a3a", robe2: "#e0b070", lean: 0.1 }),
        F(0.465, 0.64, 0.42, { name: "the idealist", form: "plume", robe: "#c0502e", robe2: "#a08ab0", gesture: "up", lean: 0.05, crown: "#efe9dd" }),
        F(0.545, 0.645, 0.42, { name: "the empiricist", form: "bell", robe: "#5e86c0", robe2: "#7a5a3a", gesture: "down", lean: -0.1, crown: "#c8a888" }),
        F(0.62, 0.6, 0.32, { name: "the stoic", form: "rings", robe: "#d07a2a", robe2: "#f0c080", lean: -0.3 }),
        F(0.68, 0.63, 0.3, { name: "a listener", form: "frond", robe: "#e0d8c8", robe2: "#8a9a7a", lean: 0.35 }),
        F(0.74, 0.595, 0.28, { name: "a listener", form: "helix", robe: "#7a5a80", robe2: "#b89ac0", lean: -0.15 }),
        F(0.8, 0.62, 0.31, { name: "the hedonist", form: "coral", robe: "#b03a2a", robe2: "#d9a040", lean: -0.3 }),
        F(0.875, 0.605, 0.3, { name: "a listener", form: "plume", robe: "#4a7a5a", robe2: "#90b8a0", lean: -0.4 }),
        F(0.58, 0.8, 0.26, { name: "the cynic, reclining", form: "helix", robe: "#6a8ac0", robe2: "#c8d4e8", rot: -1.3, lean: 0.4 }),
        F(0.27, 0.8, 0.27, { name: "a girl in white", form: "contour", robe: "#f0ebe2", robe2: "#dcd4c4", lean: -0.2 }),
        F(0.15, 0.95, 0.4, { name: "the scribe", form: "frond", robe: "#e8e2d6", robe2: "#c87a2a", gesture: "book", lean: 0.25 }),
        F(0.4, 0.95, 0.38, { name: "the brooding one", form: "spiral", robe: "#9a6a8a", robe2: "#4a3a4a" }),
        F(0.73, 0.96, 0.4, { name: "the geometer", form: "coral", robe: "#b0402a", robe2: "#d8b060", rot: 0.5, lean: 0.3 }),
        F(0.855, 0.95, 0.38, { name: "the astronomer", form: "bell", robe: "#c09a3a", robe2: "#6a5a3a", gesture: "globe", globe: "#3a3a40" }),
        F(0.935, 0.94, 0.36, { name: "the astrologer", form: "plume", robe: "#ece6da", robe2: "#7a8a9a", gesture: "globe", globe: "#ece8e0", lean: -0.2 }),
      ];
      // nearer beings first claim their space; draw order is then back-to-front
      const start = list.length;
      [...people].sort((a, b) => b.y - a.y).forEach(being);
      const placedMarks = list.splice(start);
      placedMarks.sort((a, b) => a.y - b.y); list.push(...placedMarks);
      // the geometer's circle and triangle, laid on the ground in forams and pollen
      const gx = W * 0.665, gy = H * 0.965;
      for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; M({ x: gx + Math.cos(a) * 46, y: gy + Math.sin(a) * 16, size: 9, want: hex("#e8e4dc"), shape: "round", pool: P.small, shadow: 0.3, tag: "the geometer's circle" }); }
      for (let k = 0; k < 3; k++) for (let u = 0; u < 1; u += 0.2) { const A = [[-40, 10], [40, 10], [0, -14]], p = A[k], q = A[(k + 1) % 3];
        M({ x: gx + lerp(p[0], q[0], u), y: gy + lerp(p[1], q[1], u) * 0.9, size: 6, want: hex("#3a3632"), shape: "round", pool: P.small, shadow: 0.2, tag: "the geometer's triangle" }); }
      await drawAll(list, "the gathering", id);
    },
  },
  // ---------------------------------------------------------------------------------
  abyss: {
    title: "I · Abyssal lamprophore",
    about: "A deep-water fish that doesn't exist, built anatomically from real specimens. Its fin crest is sundew tentacles, wings and feathers; its body is fish scales, nacre and shell laid tail-to-head the way scales grow. Pearls and forams are its photophores, its lure is a chain of microscopic forms, and the water is dark specimens and drifting pollen.",
    size: [1600, 1000], glaze: 0.42,
    async paint(r, id) {
      // ---- anatomy: a sinuous oarfish-like body along a spine curve, head at left ----
      const P0 = [W * 0.25, H * 0.5], P1 = [W * 0.47, H * 0.2], P2 = [W * 0.66, H * 0.82], P3 = [W * 0.95, H * 0.42];
      const spine = t => { const u = 1 - t; return [0, 1].map(i => u * u * u * P0[i] + 3 * u * u * t * P1[i] + 3 * u * t * t * P2[i] + t * t * t * P3[i]); };
      const tang = t => { const a = spine(Math.max(0, t - 0.002)), b = spine(Math.min(1, t + 0.002)); return Math.atan2(b[1] - a[1], b[0] - a[0]); };
      const width = t => H * (0.105 * Math.pow(1 - t, 0.55) * (0.55 + 0.45 * Math.sin(Math.min(1, t * 6 + 0.2) * Math.PI / 2)) + 0.006);
      const at = (t, v) => { const [x, y] = spine(t), a = tang(t) + Math.PI / 2, w = width(t); return [x + Math.cos(a) * w * v, y + Math.sin(a) * w * v]; }; // v=-1 dorsal, +1 ventral
      const dorsalN = t => tang(t) - Math.PI / 2;
      const C = { abyss: hex("#03060d"), deep: hex("#11294f"), dorsal: hex("#152443"), flank: hex("#b8b3cf"), flank2: hex("#8fb3c2"), belly: hex("#e3dde4"),
        crest: hex("#a8283a"), crestTip: hex("#f0a0a8"), glow: hex("#8ff3ff"), fin: hex("#c9b6d8") };
      const bodyColor = (t, v) => { const base = v < -0.3 ? mixc(C.dorsal, C.flank2, (v + 1) / 0.7) : v < 0.45 ? mixc(C.flank2, C.flank, (v + 0.3) / 0.75) : mixc(C.flank, C.belly, (v - 0.45) / 0.55);
        const shade = 1 - 0.45 * Math.pow(Math.abs(v), 2.2) + 0.18 * Math.exp(-(((v + 0.05) / 0.22) ** 2)); // round body: dark edges, lit flank
        return mixc(base.map(c => c * shade), C.dorsal, clamp((t - 0.6) / 0.5, 0, 0.55)); }; // tail darkens into the water

      // ---- underpainting (also used by "show underpainting" and the water layers) ----
      const t = document.createElement("canvas"); t.width = W; t.height = H; const g = t.getContext("2d");
      const bg = g.createRadialGradient(W * 0.3, -H * 0.3, 10, W * 0.4, H * 0.2, H * 1.4); bg.addColorStop(0, css(C.deep)); bg.addColorStop(1, css(C.abyss));
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      for (let k = 0; k <= 400; k++) { const tt = k / 400; for (let v = -1; v <= 1; v += 0.1) { const [x, y] = at(tt, v); g.fillStyle = css(bodyColor(tt, v)); g.beginPath(); g.arc(x, y, width(tt) * 0.16 + 2, 0, 7); g.fill(); } }
      setTarget(t); state.edge = edgeField();
      const water = (x, y) => { for (let k = 0; k <= 60; k++) { const tt = k / 60, [sx, sy] = spine(tt); if (Math.hypot(x - sx, y - sy) < width(tt) * 1.25 + 30) return false; } return true; };

      // ---- 1. the water: dark specimens, coarse to fine ----
      ctx.fillStyle = css(C.abyss); ctx.fillRect(0, 0, W, H);
      const darkPool = CUTS.filter(c => c.L < 150);
      for (const [size, threshold] of [[90, 0], [52, 10], [30, 12]])
        if (!(await layer(r, { size, threshold, label: "the water", id, glaze: 0.6, pool: darkPool, shadow: 0.6, spacing: 0.75 }))) return;

      const list = [];
      const longPool = CUTS.filter(c => c.aspect > 2.4 && c.g.rect < 0.72);
      const spinePool = CUTS.filter(c => c.aspect > 3 && c.g.rect < 0.6 && ["sticky_traps", "feathers", "wings", "leaf_edges", "micro", "beetles_bugs"].includes(c.category));
      const finPool = spinePool.length > 12 ? spinePool : longPool, roundPool = CUTS.filter(c => c.aspect < 1.4 && c.g.fill > 0.5);
      const scalePool = CUTS.filter(c => ["scales", "pearls_minerals", "shells", "coral_sea", "wings"].includes(c.category) && c.g.fill > 0.4);

      // ---- 2. crest: a long dorsal fin of tentacles / wings / feathers, raked back, tall behind the head ----
      for (let k = 0; k < 260; k++) {
        const tt = 0.02 + (k / 259) * 0.86, [x, y] = at(tt, -0.8), h = H * (0.05 + 0.15 * Math.pow(1 - tt, 1.5)) * lerp(0.75, 1.2, r());
        const a = dorsalN(tt) + 0.5 + Math.sin(tt * 40) * 0.08 + (r() - 0.5) * 0.14; // raked back, rippling
        const tip = mixc(C.crest, C.crestTip, r() * 0.6);
        list.push(mark(r, { x: x + Math.cos(a) * h * 0.47, y: y + Math.sin(a) * h * 0.47, size: h, dir: a + Math.PI / 2, want: tip, shape: "long", byLength: true, pool: finPool, glaze: 0.55, alpha: lerp(0.6, 0.9, r()), shadow: 0.25, tag: "crest" }));
      }
      // pectoral fin: a translucent fan just behind the gills
      for (let k = 0; k < 11; k++) { const [x, y] = at(0.1, 0.75), a = tang(0.1) + Math.PI * 0.62 + (k / 10) * 0.9, h = H * lerp(0.1, 0.16, Math.sin(k / 10 * Math.PI));
        list.push(mark(r, { x: x + Math.cos(a) * h * 0.5, y: y + Math.sin(a) * h * 0.5, size: h, dir: a + Math.PI / 2, want: C.fin, shape: "long", byLength: true, pool: finPool, glaze: 0.5, alpha: 0.7, shadow: 0.2, tag: "pectoral" })); }
      // tail: a split fan
      for (let k = 0; k < 16; k++) { const [x, y] = spine(0.985), a = tang(0.985) + (k / 15 - 0.5) * 1.5, h = H * lerp(0.09, 0.15, Math.abs(k / 15 - 0.5) * 2);
        list.push(mark(r, { x: x + Math.cos(a) * h * 0.5, y: y + Math.sin(a) * h * 0.5, size: h, dir: a + Math.PI / 2, want: mixc(C.crest, C.dorsal, 0.4), shape: "long", byLength: true, pool: finPool, glaze: 0.55, alpha: 0.8, tag: "tail" })); }

      // ---- 3. body: scales laid tail → head, so each row overlaps the one behind it ----
      for (let tt = 0.995; tt >= 0.05; ) {
        const w = width(tt), s = w * 0.42, rows = Math.max(3, Math.round(2 / 0.32));
        for (let j = 0; j <= rows; j++) {
          const v = -0.95 + (j / rows) * 1.9 + ((Math.round(tt * 500) % 2) ? 0.08 : -0.08), [x, y] = at(tt, v);
          list.push(mark(r, { x: x + (r() - 0.5) * s * 0.15, y: y + (r() - 0.5) * s * 0.15, size: s * lerp(0.9, 1.15, r()) * (1 - Math.abs(v) * 0.25), dir: tang(tt) + Math.PI / 2 + (r() - 0.5) * 0.25,
            want: bodyColor(tt, v), shape: "body", pool: scalePool, glaze: 0.4, shadow: 0.55, tag: "scale" }));
        }
        tt -= Math.max(0.0035, (s * 0.38) / (W * 1.05));
      }
      // head: a gill plate arc of overlapping nacre/scale pieces, toned to the flank so it reads as anatomy, not a pasted shell
      for (let k = 0; k < 9; k++) { const v = -0.7 + k * 0.17, [x, y] = at(0.07 + Math.abs(v) * 0.012, v);
        list.push(mark(r, { x, y, size: width(0.07) * 0.34, dir: tang(0.07) + Math.PI / 2 + v * 0.6, want: mixc(bodyColor(0.07, v), C.dorsal, 0.25), shape: "body", pool: scalePool, glaze: 0.5, shadow: 0.75, tag: "gill plate" })); }
      for (let k = 0; k < 7; k++) { const [x, y] = at(0.012 + k * 0.006, -0.55 + k * 0.17);
        list.push(mark(r, { x, y, size: width(0.02) * 0.55, dir: tang(0.02) + Math.PI / 2, want: mixc(C.dorsal, C.flank, 0.5), shape: "body", pool: scalePool, glaze: 0.35, tag: "snout" })); }

      // jaw: a dark seam of thin specimens, with glassy fangs hanging from the upper jaw
      for (let k = 0; k < 14; k++) { const tt = 0.004 + k * 0.0045, [x, y] = at(tt, 0.3), [x2, y2] = at(tt + 0.0045, 0.3);
        list.push(mark(r, { x, y, size: 26, dir: Math.atan2(y2 - y, x2 - x) + Math.PI / 2, want: hex("#0b0d16"), shape: "long", byLength: true, pool: longPool, glaze: 0.5, shadow: 0.1, tag: "jaw" })); }
      for (let k = 0; k < 6; k++) { const tt = 0.008 + k * 0.009, [x, y] = at(tt, 0.32), a = tang(tt) + Math.PI / 2 - 0.25, h = lerp(22, 46, r());
        list.push(mark(r, { x: x + Math.cos(a) * h * 0.45, y: y + Math.sin(a) * h * 0.45, size: h, dir: a + Math.PI / 2, want: hex("#e6eef2"), shape: "long", byLength: true, pool: finPool, glaze: 0.45, alpha: 0.85, shadow: 0.3, tag: "fang" })); }

      // ---- 4. photophores along the belly, and the eye ----
      const lights = [];
      for (let tt = 0.13; tt < 0.8; tt += 0.026) { const [x, y] = at(tt, 0.74 + Math.sin(tt * 60) * 0.04), s = width(tt) * 0.11 + 3;
        lights.push([x, y, s * 3.2]); list.push(mark(r, { x, y, size: s, want: hex("#9fd9ea"), shape: "round", pool: roundPool, glaze: 0.55, shadow: 0.3, tag: "photophore" })); }
      const [ex, ey] = at(0.035, -0.22), es = width(0.035) * 0.62;
      list.push(mark(r, { x: ex, y: ey, size: es, want: hex("#c8c2d6"), shape: "round", pool: roundPool, glaze: 0.15, shadow: 0.8, tag: "eye" }));
      list.push(mark(r, { x: ex + es * 0.06, y: ey + es * 0.04, size: es * 0.5, want: hex("#0c0f18"), shape: "round", pool: roundPool.filter(c => c.L < 90).length > 3 ? roundPool.filter(c => c.L < 90) : roundPool, glaze: 0.3, shadow: 0.2, tag: "pupil" }));

      // ---- 5. the lure: a filament of tiny forms arching forward, ending in a glowing cluster ----
      const [lx, ly] = at(0.03, -0.95), L0 = [lx, ly], L1 = [lx - W * 0.02, ly - H * 0.32], L2 = [lx - W * 0.16, ly - H * 0.28], L3 = [lx - W * 0.17, ly - H * 0.02];
      const lure = u => { const v = 1 - u; return [0, 1].map(i => v * v * v * L0[i] + 3 * v * v * u * L1[i] + 3 * v * u * u * L2[i] + u * u * u * L3[i]); };
      for (let u = 0; u < 0.97; u += 0.009) { const [x, y] = lure(u), [x2, y2] = lure(u + 0.01);
        list.push(mark(r, { x, y, size: 7.5, dir: Math.atan2(y2 - y, x2 - x) + Math.PI / 2, want: hex("#b9b0c4"), shape: "round", glaze: 0.5, shadow: 0.2, tag: "lure" })); }
      const [qx, qy] = lure(1);
      for (let k = 0; k < 9; k++) { const a = r() * 6.28, d = r() * 22;
        list.push(mark(r, { x: qx + Math.cos(a) * d, y: qy + Math.sin(a) * d, size: lerp(14, 26, r()), dir: r() * 6.28, want: hex("#c8fbff"), shape: "round", pool: roundPool, glaze: 0.55, shadow: 0, tag: "esca" })); }
      lights.push([qx, qy, 150]);

      if (!(await drawAll(list, "the fish", id))) return;

      // ---- 6. bioluminescence and marine snow ----
      ctx.save(); ctx.globalCompositeOperation = "screen";
      for (const [x, y, rr] of lights) { const gl = ctx.createRadialGradient(x, y, 0, x, y, rr); gl.addColorStop(0, "rgba(143,243,255,.55)"); gl.addColorStop(0.25, "rgba(90,200,255,.18)"); gl.addColorStop(1, "rgba(0,40,80,0)");
        ctx.fillStyle = gl; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      ctx.restore();
      const snowPool = CUTS.filter(c => ["micro", "pearls_minerals", "shells"].includes(c.category) && c.L > 120);
      const snow = [];
      for (let k = 0; k < 520; k++) { const x = r() * W, y = r() * H; if (!water(x, y) && r() < 0.8) continue;
        snow.push(mark(r, { x, y, size: lerp(2.5, 9, r() ** 2), dir: r() * 6.28, want: hex("#d6e4ee"), shape: "any", pool: snowPool, glaze: 0.5, shadow: 0, alpha: lerp(0.35, 0.95, r()), tag: "marine snow" })); }
      await drawAll(snow, "marine snow", id);
      state.lights = lights;
    },
  },
};

// =====================================================================================
// Studies after the reference bank (structure learned from each reference, made only from our specimens)
// =====================================================================================
const pools = () => {
  const cat = (...c) => CUTS.filter(x => c.includes(x.category));
  return {
    veins: cat("translucent").filter(c => c.g.rect < 0.85),
    cleanWing: cat("translucent").filter(c => /wing|Odonata|Anisoptera|Zygoptera|Dragon|Aeshna|Libellul|Calopteryx/i.test(c.name) && !/broken|stick|terrac/i.test(c.name) && c.g.fill > 0.25),
    wings: cat("translucent", "wings", "leaf_edges", "feathers").filter(c => c.aspect > 1.5 && c.g.rect < 0.8),
    nacre: cat("shells", "pearls_minerals").filter(c => c.L > 95 && c.g.rect < 0.85 && c.g.fill > 0.55 && c.aspect > 1.1 && c.aspect < 2.6), // single solid valves and pieces, no scattered groups
    petal: cat("shells", "pearls_minerals", "wings", "translucent", "leaf_edges", "scales").filter(c => c.g.fill > 0.35 && c.g.rect < 0.85 && c.aspect < 3.2),
    stem: CUTS.filter(c => c.aspect > 3 && c.g.rect < 0.6),
    insect: cat("beetles_bugs", "wings", "translucent").filter(c => c.g.rect < 0.75),
    center: CUTS.filter(c => c.aspect < 1.4 && c.g.fill > 0.5 && ["coral_sea", "micro", "fungi_slime", "shells", "sticky_traps"].includes(c.category)),
    mesh: cat("micro", "translucent", "scales", "leaf_edges", "pearls_minerals").filter(c => c.g.rect < 0.85),
    small: CUTS.filter(c => c.aspect < 1.6 && c.g.fill > 0.45),
  };
};
const mirrored = (m, cx) => ({ ...m, x: 2 * cx - m.x, mirror: !m.mirror });
const groundFill = (top, bottom) => { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bottom); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); state.ground = null; };
const keepGround = () => { state.ground = ctx.getImageData(0, 0, W, H); tdata = null; target = null; };

Object.assign(SCENES, {
  // ---------------------------------------------------------------------------------
  pinned: {
    title: "III · Pinned wings (study)",
    about: "After the pinned-wing photograph: real dragonfly and damselfly wings, skeleton leaves and butterfly wings fanned from one root, overlapping so the membranes darken where they cross, held by black pins, with soft shadows thrown to the left.",
    size: [1400, 1100], glaze: 0.1,
    async paint(r, id) {
      groundFill("#f6f5f2", "#e9e7e2"); keepGround();
      const p = pools(), list = [], pins = [];
      const ox = W * 0.16, oy = H * 0.86, n = 6, single = p.cleanWing;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), a = lerp(-0.12, -1.5, t) + (r() - 0.5) * 0.06, L = W * lerp(0.6, 0.46, Math.abs(t - 0.4)) * lerp(0.85, 1.05, r());
        const m = mark(r, { x: ox + Math.cos(a) * L * 0.5, y: oy + Math.sin(a) * L * 0.5, size: L, dir: a - Math.PI / 2, byLength: true, shape: "long",
          want: hex("#c9c6c0"), pool: single.length >= 3 ? single : p.veins, unique: 70, glaze: 0.15, sat: 0.6, alpha: 0.88, comp: "multiply", shadow: 0, cast: [-W * 0.05, H * 0.02, 0.22], tag: "wing" });
        list.push(m);
        const pa = a + (r() - 0.5) * 0.25, px = ox + Math.cos(a) * L * 0.86, py = oy + Math.sin(a) * L * 0.86;
        pins.push([px, py, pa + 0.35 * (r() < 0.5 ? 1 : -1)]);
      }
      if (!(await drawAll(list, "wings", id))) return;
      // the pins: steel shafts with black heads, the only marks not cut from a photograph
      ctx.save(); for (const [x, y, a] of pins) { const L = W * 0.06, ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
        ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 18, y + 8); ctx.lineTo(ex - 30, ey + 12); ctx.stroke();
        ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(ex, ey, 4.2, 0, 7); ctx.fill(); } ctx.restore();
    },
  },
  // ---------------------------------------------------------------------------------
  corolla: {
    title: "IV · Corolla (study)",
    about: "After the wing flower: three whorls of real wings and skeleton leaves as petals, luminous on black (each petal is screened onto the dark so overlaps glow), around a centre of coral, forams and slime-mould fruiting bodies.",
    size: [1200, 1200], glaze: 0.2,
    async paint(r, id) {
      groundFill("#060608", "#0a0a0d"); keepGround();
      const p = pools(), list = [], cx = W / 2, cy = H / 2;
      const whorl = (n, L, off, want, alpha, comp) => { const one = pick(r, want, "long", p.cleanWing.length >= 3 ? p.cleanWing : p.veins, 60, true); for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + off + (k / n) * Math.PI * 2 + (r() - 0.5) * 0.05;
        list.push(mark(r, { x: cx + Math.cos(a) * L * 0.52, y: cy + Math.sin(a) * L * 0.52, size: L, dir: a - Math.PI / 2, byLength: true, shape: "long",
          want, cut: one, mirror: k % 2 === 1, glaze: 0.42, sat: 0.7, alpha, comp, shadow: comp ? 0 : 0.5, tag: "petal" })); } };
      whorl(5, H * 0.46, 0, hex("#9fb0dc"), 0.85, "screen");
      whorl(5, H * 0.34, Math.PI / 5, hex("#bdb6e6"), 0.85, "screen");
      whorl(6, H * 0.2, 0.25, hex("#d9cfe0"), 0.95);
      whorl(8, H * 0.11, 0.55, hex("#ead2a8"), 0.95);
      for (let k = 0; k < 14; k++) { const a = r() * 6.28, d = r() * H * 0.035;
        list.push(mark(r, { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, size: lerp(18, 34, r()), dir: r() * 6.28, want: hex(k % 3 ? "#c8643c" : "#e8c070"), shape: "round", pool: p.center, glaze: 0.2, shadow: 0.4, tag: "centre" })); }
      await drawAll(list, "petals", id);
    },
  },
  // ---------------------------------------------------------------------------------
  dress: {
    title: "V · Dress form (study)",
    about: "After the wing-ribbon dress: ribbons made of chains of translucent wings and skeleton leaves spiral from one shoulder around the body and fall past the hip, breaking free as a wing at the other shoulder. Almost white on white; the shadow on the wall is part of the piece.",
    size: [1000, 1400], glaze: 0.45,
    async paint(r, id) {
      groundFill("#ebe7e1", "#d9d4cc");
      // dress form: torso, neck and the black finial
      const x0 = W * 0.5; ctx.fillStyle = "#d8cab4";
      ctx.beginPath(); ctx.moveTo(x0 - 70, 210); ctx.quadraticCurveTo(x0 - 210, 250, x0 - 200, 360); ctx.quadraticCurveTo(x0 - 175, 560, x0 - 150, 640);
      ctx.quadraticCurveTo(x0 - 205, 800, x0 - 190, 980); ctx.lineTo(x0 + 190, 980); ctx.quadraticCurveTo(x0 + 205, 800, x0 + 150, 640);
      ctx.quadraticCurveTo(x0 + 175, 560, x0 + 200, 360); ctx.quadraticCurveTo(x0 + 210, 250, x0 + 70, 210); ctx.quadraticCurveTo(x0, 180, x0 - 70, 210); ctx.fill();
      ctx.fillStyle = "#cbbca4"; ctx.fillRect(x0 - 38, 150, 76, 70); ctx.fillStyle = "#151515"; ctx.beginPath(); ctx.ellipse(x0, 132, 26, 22, 0, 0, 7); ctx.fill(); ctx.fillRect(x0 - 10, 70, 20, 70);
      ctx.beginPath(); ctx.ellipse(x0, 66, 16, 14, 0, 0, 7); ctx.fill(); ctx.fillStyle = "#2a2a2a"; ctx.fillRect(x0 - 6, 980, 12, H - 980);
      keepGround();
      const p = pools(), list = [];
      const ribbon = (P0, P1, P2, P3, s0, alpha) => { const at = u => { const v = 1 - u; return [0, 1].map(i => v * v * v * P0[i] + 3 * v * v * u * P1[i] + 3 * v * u * u * P2[i] + u * u * u * P3[i]); };
        let u = 0, [px, py] = at(0);
        while (u < 1) { const sz = s0 * (1 - u * 0.45); let u2 = u, q = [px, py]; while (u2 < 1 && Math.hypot(q[0] - px, q[1] - py) < sz * 0.8) { u2 += 0.002; q = at(u2); }
          const n = at(Math.min(1, u2 + 0.01)), a = Math.atan2(n[1] - q[1], n[0] - q[0]);
          list.push(mark(r, { x: q[0], y: q[1], size: sz, dir: a - Math.PI / 2, byLength: true, shape: "long", want: hex("#f3f1ec"), pool: ribbonPool, glaze: 0.55, sat: 0.25, alpha, shadow: 0.1, cast: [W * 0.08, 16, 0.07], tag: "ribbon" }));
          [px, py] = q; u = u2 + 0.0001; } };
      const ribbonPool = p.veins.concat(CUTS.filter(c => c.category === "leaf_edges" && c.g.rect < 0.7 && c.aspect > 1.6)); // venation only: no fuzzy white blobs
      // each ribbon starts at a different point along neckline and shoulder, wraps the chest to the right, crosses back over the waist, and falls past the opposite hip
      for (let k = 0; k < 12; k++) { const u = k / 11, s = u - 0.5;
        const P0 = [lerp(x0 - 185, x0 + 70, u), lerp(300, 222, u) + r() * 12];
        const P1 = [x0 + lerp(60, 320, u), lerp(330, 620, u)];
        const P2 = [x0 - lerp(300, 40, u), lerp(540, 920, u)];
        const P3 = [x0 + lerp(-170, 330, u) + r() * 40, lerp(940, 1320, u) + r() * 30];
        ribbon(P0, P1, P2, P3, lerp(55, 85, r()), lerp(0.7, 0.9, r())); }
      for (let k = 0; k < 7; k++) { const a = lerp(-1.25, -0.25, k / 6), L = lerp(170, 300, Math.sin(k / 6 * Math.PI)); // the wing breaking free at the right shoulder
        list.push(mark(r, { x: x0 + 150 + Math.cos(a) * L * 0.5, y: 300 + Math.sin(a) * L * 0.5, size: L, dir: a - Math.PI / 2, byLength: true, shape: "long", want: hex("#f1efea"), pool: p.cleanWing.length >= 3 ? p.cleanWing : p.veins, glaze: 0.5, sat: 0.2, alpha: 0.85, shadow: 0.1, cast: [W * 0.1, 26, 0.08], tag: "wing" })); }
      await drawAll(list, "ribbons", id);
    },
  },
  // ---------------------------------------------------------------------------------
  totems: {
    title: "VI · Totems (study)",
    about: "After the mirrored totems: five columns, each bilaterally symmetric about its axis. Lobes are built on one side from mesh-like specimens (electron-microscope pollen and forams, insect-wing venation, fish scales under the microscope, leaf skeletons) and mirrored to the other, in a grey and pink register.",
    size: [1500, 1300], glaze: 0.42,
    async paint(r, id) {
      groundFill("#efede8", "#e4e1da"); keepGround();
      const p = pools(), list = [];
      const pinks = ["#d9a8c4", "#c890b0", "#e8c8d8", "#a8708e"], greys = ["#b9b4ae", "#8f8a85", "#d8d4cc", "#6d6964"];
      for (let c = 0; c < 5; c++) {
        const cx = W * (0.11 + c * 0.195), top = H * 0.05, bot = H * 0.96, lobes = 5 + Math.floor(r() * 3), pinkish = r();
        let y = top;
        for (let k = 0; k < lobes && y < bot; k++) {
          const lh = (bot - top) / lobes * lerp(0.75, 1.25, r()), cy = y + lh / 2, wmax = W * lerp(0.035, 0.085, r());
          const tone = () => hex((r() < pinkish * 0.8 ? pinks : greys)[Math.floor(r() * 4)]);
          const kind = Math.floor(r() * 3);
          const half = [];
          if (kind === 0) for (let i = 0; i < 5; i++) { const a = lerp(-1.2, 1.2, i / 4); // a fan of lobes
            half.push(mark(r, { x: cx + Math.cos(a) * wmax * 0.55, y: cy + Math.sin(a) * lh * 0.32, size: wmax * lerp(0.7, 1.05, r()), dir: a, want: tone(), shape: "body", pool: p.mesh, glaze: 0.45, sat: 0.5, comp: "multiply", shadow: 0.15, tag: "lobe" })); }
          if (kind === 1) half.push(mark(r, { x: cx + wmax * 0.45, y: cy, size: Math.max(wmax * 1.6, lh * 0.8), dir: 0.15, byLength: true, want: tone(), shape: "long", pool: p.wings, glaze: 0.45, sat: 0.5, comp: "multiply", shadow: 0.12, tag: "wing lobe" }));
          if (kind === 2) for (let i = 0; i < 4; i++) half.push(mark(r, { x: cx + wmax * (0.25 + i * 0.22), y: cy + (i - 1.5) * lh * 0.18, size: wmax * lerp(0.4, 0.6, r()), dir: r() * 0.5, want: tone(), shape: "round", pool: p.mesh, glaze: 0.4, sat: 0.6, comp: "multiply", shadow: 0.2, tag: "nodes" }));
          for (const m of half) { list.push(m); list.push(mirrored(m, cx)); }
          y += lh * 0.92;
        }
        for (let yy = top; yy < bot; yy += 11) list.push(mark(r, { x: cx, y: yy, size: 7, dir: 0, want: hex("#6d6964"), shape: "round", pool: p.small, glaze: 0.5, sat: 0.3, shadow: 0.1, alpha: 0.7, tag: "axis" }));
      }
      await drawAll(list, "totems", id);
    },
  },
  // ---------------------------------------------------------------------------------
  inlay: {
    title: "VII · Inlay (study)",
    about: "After the mother-of-pearl inlay: a bouquet on black lacquer where every piece is a real specimen toned to one material. Shells and nacre become petals, sundew and agave become stems and leaves, a beetle and a moth are pinned among them, a gastropod shell sits below, and a ribbon of nacre curls from the corner.",
    size: [1100, 1500], glaze: 0.5,
    async paint(r, id) {
      groundFill("#0a0908", "#11100e");
      const sheen = ctx.createRadialGradient(W * 0.6, H * 0.4, 50, W * 0.6, H * 0.45, H * 0.7); sheen.addColorStop(0, "rgba(60,55,50,.18)"); sheen.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = sheen; ctx.fillRect(0, 0, W, H); keepGround();
      const p = pools(), list = [], pearl = () => hex(r() < 0.75 ? ["#e6e3dc", "#d4d0c8", "#c6c2ba"][Math.floor(r() * 3)] : ["#c8b48a", "#b8a27a"][Math.floor(r() * 2)]);
      const nacreOpts = { glaze: 0.6, sat: 0.18, shadow: 0.55 };
      const chain = (pts, sz, tag, pool = p.stem) => { for (let i = 0; i < pts.length - 1; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], L = Math.hypot(x2 - x1, y2 - y1);
        list.push(mark(r, { x: (x1 + x2) / 2, y: (y1 + y2) / 2, size: L * 1.15, dir: Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2, byLength: true, shape: "long", want: hex("#bfb7a6"), pool, ...nacreOpts, tag })); } };
      const curve = (P0, P1, P2, n) => Array.from({ length: n + 1 }, (_, i) => { const u = i / n, v = 1 - u; return [0, 1].map(k => v * v * P0[k] + 2 * v * u * P1[k] + u * u * P2[k]); });
      const flower = (x, y, R, petals, tilt) => { for (let k = 0; k < petals; k++) { const a = tilt + (k / petals) * Math.PI * 2 + (r() - 0.5) * 0.2;
          list.push(mark(r, { x: x + Math.cos(a) * R * 0.55, y: y + Math.sin(a) * R * 0.55 * 0.85, size: R * lerp(0.75, 1, r()), dir: a - Math.PI / 2, shape: "body", want: pearl(), pool: p.nacre, ...nacreOpts, tag: "petal" })); }
        list.push(mark(r, { x, y, size: R * 0.5, dir: r() * 6, shape: "round", want: hex("#b8a888"), pool: p.center, glaze: 0.45, sat: 0.3, shadow: 0.6, tag: "flower centre" })); };
      // ribbon from the top-left corner
      const rib = curve([W * 0.02, H * 0.02], [W * 0.38, H * 0.12], [W * 0.18, H * 0.36], 14).map(([x, y], i) => [x + Math.sin(i * 1.3) * 18, y]);
      for (let i = 0; i < rib.length; i++) list.push(mark(r, { x: rib[i][0], y: rib[i][1], size: 46, dir: i * 0.6, shape: "body", want: pearl(), pool: p.nacre, ...nacreOpts, tag: "ribbon" }));
      // stems, leaves, flowers
      const heads = [[0.25, 0.5, 120], [0.55, 0.42, 95], [0.82, 0.5, 105], [0.68, 0.65, 115], [0.45, 0.7, 90], [0.85, 0.78, 85], [0.4, 0.28, 70]];
      const root = [W * 0.5, H * 0.95];
      for (const [hx, hy, R] of heads) { const end = [W * hx, H * hy], mid = [lerp(root[0], end[0], 0.5) + (r() - 0.5) * 160, lerp(root[1], end[1], 0.55)];
        const pts = curve(root, mid, end, 9); chain(pts, 0, "stem");
        for (let k = 2; k < 8; k += 3) { const [x, y] = pts[k], side = k % 2 ? 1 : -1;
          list.push(mark(r, { x: x + side * 40, y: y - 10, size: 80, dir: side * 0.9 - Math.PI / 2, byLength: true, shape: "long", want: pearl(), pool: p.petal, ...nacreOpts, tag: "leaf" })); } }
      for (const [hx, hy, R] of heads) flower(W * hx, H * hy, R, 6 + Math.floor(r() * 3), r() * 6);
      // insects and a snail shell, toned to the same nacre
      list.push(mark(r, { x: W * 0.78, y: H * 0.18, size: 180, dir: -0.6, byLength: true, shape: "long", want: pearl(), pool: CUTS.filter(c => c.category === "beetles_bugs" && c.g.fill > 0.4 && c.aspect > 1.3 && c.aspect < 2.8), ...nacreOpts, tag: "insect" }));
      list.push(mark(r, { x: W * 0.14, y: H * 0.72, size: 150, dir: 0.4, byLength: true, shape: "long", want: pearl(), pool: CUTS.filter(c => c.category === "wings" && c.g.fill > 0.3), ...nacreOpts, tag: "moth" }));
      list.push(mark(r, { x: W * 0.3, y: H * 0.88, size: 95, dir: 0.2, shape: "round", want: pearl(), pool: CUTS.filter(c => c.category === "shells"), ...nacreOpts, tag: "snail shell" }));
      await drawAll(list, "inlay", id);
    },
  },
});

// =====================================================================================
// Beasts: mirrored x-rays of animals that don't exist (grown out of the totem study)
// =====================================================================================
const PINKS = ["#d9a8c4", "#c890b0", "#e8c8d8", "#a8708e"], GREYS = ["#b9b4ae", "#8f8a85", "#d8d4cc", "#6d6964"];
const EPITHETS = ["vitrea", "nacrea", "alata", "pellucida", "ossea", "venosa", "margaritifera", "lucida", "spectra", "nova"];
const BEASTS = {
  frog: "Rana", rabbit: "Lepus", bird: "Avis", worm: "Vermis", fish: "Piscis", lizard: "Lacerta", bat: "Vespertilio", ray: "Raja",
};
// Build one beast: every part is placed on the right half, then mirrored about the axis cx.
function beast(r, kind, cx, y0, u, pinkish = 0.5, plate = "pale") {
  const p = pools(), out = [], dark = plate === "dark";
  const tone = (pk = pinkish) => hex((r() < pk ? PINKS : GREYS)[Math.floor(r() * 4)]);
  const look = { glaze: dark ? 0.55 : 0.45, sat: dark ? 0.25 : 0.5, comp: dark ? "screen" : "multiply", shadow: dark ? 0 : 0.14 };
  const half = [], axis = [];
  const put = (o) => half.push(mark(r, { ...look, ...o }));
  const P = (x, y) => [cx + x * u, y0 + y * u];
  // parts ---------------------------------------------------------------------
  const lobe = (x, y, s, o = {}) => { const [X, Y] = P(x, y); put({ x: X, y: Y, size: s * u, dir: o.dir ?? r() * 0.6, want: o.want || tone(), shape: o.shape || "body", pool: o.pool || p.mesh, tag: o.tag || "lobe" }); };
  const eye = (x, y, s) => { const [X, Y] = P(x, y); put({ x: X, y: Y, size: s * u * 0.8, want: hex(dark ? "#cfcac2" : "#9a948e"), shape: "round", pool: p.small, tag: "eye", glaze: 0.55, alpha: 0.75 }); }; // eyes stay quiet and translucent: two dark dots read as a cartoon face
  const bone = (x1, y1, x2, y2, w = 1, tag = "bone") => { const [A, B] = P(x1, y1), [C2, D] = P(x2, y2), L = Math.hypot(C2 - A, D - B);
    put({ x: (A + C2) / 2, y: (B + D) / 2, size: L * 1.12 * w, byLength: true, dir: Math.atan2(D - B, C2 - A) - Math.PI / 2, want: tone(pinkish * 0.6), shape: "long", pool: p.stem.concat(p.cleanWing), tag }); };
  const limb = (x, y, segs, toes = 0, toeLen = 0.6, tag = "limb") => { let cx0 = x, cy0 = y;
    for (const [a, L] of segs) { const x2 = cx0 + Math.cos(a) * L, y2 = cy0 + Math.sin(a) * L; bone(cx0, cy0, x2, y2, 1, tag); cx0 = x2; cy0 = y2; }
    const last = segs.at(-1)[0];
    for (let k = 0; k < toes; k++) { const a = last + (k / Math.max(1, toes - 1) - 0.5) * 1.2; bone(cx0, cy0, cx0 + Math.cos(a) * toeLen, cy0 + Math.sin(a) * toeLen, 1, "toe"); }
    return [cx0, cy0]; };
  const fan = (x, y, a0, a1, n, L, pool = p.cleanWing, tag = "fin") => { for (let k = 0; k < n; k++) { const a = lerp(a0, a1, k / Math.max(1, n - 1)), [X, Y] = P(x, y);
    put({ x: X + Math.cos(a) * L * u * 0.5, y: Y + Math.sin(a) * L * u * 0.5, size: L * u, byLength: true, dir: a - Math.PI / 2, want: tone(), shape: "long", pool: pool.length > 3 ? pool : p.wings, tag, alpha: 0.9 }); } };
  const ribs = (ya, yb, n, L0, L1, droop = 0.5) => { for (let k = 0; k < n; k++) { const t = k / Math.max(1, n - 1), y = lerp(ya, yb, t), L = lerp(L0, L1, t);
    bone(0.12, y, 0.12 + L, y + L * droop, 0.9, "rib"); } };
  const spine = (ya, yb, s = 0.16) => { for (let y = ya; y <= yb; y += s * 1.15) { const [X, Y] = P(0, y); axis.push(mark(r, { ...look, x: X, y: Y, size: s * u, want: hex(dark ? "#d8d4cc" : "#6d6964"), shape: "round", pool: p.small, tag: "vertebra", glaze: 0.5, sat: 0.3 })); } };
  const center = (y, s, o = {}) => { const [X, Y] = P(0, y); axis.push(mark(r, { ...look, x: X, y: Y, size: s * u, dir: Math.PI / 2, want: o.want || tone(), shape: o.shape || "body", pool: o.pool || p.mesh, tag: o.tag || "skull" })); };
  const J = () => (r() - 0.5) * 0.15; // a little individuality per specimen of a species

  // body plans (u = 1/10 of the beast's height, y grows downward, x is the right half) ------------
  if (kind === "frog") {
    center(1.3, 1.9, { tag: "skull" }); lobe(0.75, 1.5 + J(), 1.3); eye(1.05, 1.0, 0.75);
    spine(2.3, 6.3); ribs(2.7, 3.5, 3, 0.8, 0.6, 0.15);
    lobe(0.75, 3.4 + J(), 1.7, { tag: "lung" }); lobe(0.65, 4.6 + J(), 1.5, { tag: "gut" }); center(5.9, 1.4, { tag: "pelvis" });
    limb(0.95, 2.7, [[0.7 + J(), 1.4], [1.6 + J(), 1.1]], 4, 0.55, "forelimb");
    limb(0.8, 6.2, [[-0.35 + J(), 1.9], [2.2 + J(), 1.8], [0.55, 1.4]], 5, 0.75, "hind limb");
  }
  if (kind === "rabbit") {
    bone(0.25, 1.9, 0.75 + J(), -0.6, 1.25, "ear"); bone(0.45, 1.9, 1.2 + J(), -0.2, 1.1, "ear");
    center(2.4, 1.7, { tag: "skull" }); lobe(0.55, 2.5, 1.1); eye(0.75, 2.2, 0.6);
    spine(3.3, 7.6); ribs(3.6, 4.6, 4, 0.9, 1.1, 0.35);
    lobe(1.0, 4.3 + J(), 2.0, { tag: "chest" }); lobe(1.15, 5.8 + J(), 2.2, { tag: "haunch" });
    limb(0.55, 5.0, [[1.35, 1.1], [1.65, 0.7]], 3, 0.4, "foreleg");
    limb(1.4, 6.6, [[1.2 + J(), 1.0], [0.15, 1.5]], 4, 0.45, "hind foot");
    center(8.0, 0.9, { shape: "round", tag: "tail", pool: p.small });
  }
  if (kind === "fish") {
    center(1.2, 1.8, { tag: "skull" }); lobe(0.7, 1.35, 1.1); eye(0.85, 0.9, 0.7);
    spine(1.9, 7.4, 0.14); ribs(2.2, 6.6, 11, 1.25, 0.45, 0.55);
    fan(0.9, 2.3, 0.2, 1.3, 5, 1.7, p.cleanWing, "pectoral fin"); fan(0.4, 5.3, 0.9, 1.5, 3, 1.0, p.cleanWing, "pelvic fin");
    lobe(0.5, 3.0 + J(), 1.4, { tag: "swim bladder" });
    fan(0.15, 7.6, 1.05, 1.45, 3, 2.3, p.cleanWing, "tail fin");
  }
  if (kind === "lizard") {
    center(1.0, 1.4, { tag: "skull" }); lobe(0.45, 1.1, 0.8); eye(0.55, 0.8, 0.5);
    spine(1.7, 9.2, 0.13); ribs(2.4, 4.6, 6, 0.75, 0.6, 0.25);
    lobe(0.55, 3.5 + J(), 1.3, { tag: "body" });
    limb(0.5, 2.3, [[-0.25 + J(), 1.2], [0.9, 1.0]], 5, 0.5, "foreleg");
    limb(0.5, 5.0, [[0.25 + J(), 1.3], [1.6, 1.1]], 5, 0.55, "hind leg");
    for (let k = 0; k < 8; k++) { const y = 5.6 + k * 0.45; lobe(0.18 * (1 - k / 9), y, 0.45 * (1 - k / 10), { tag: "tail", shape: "round", pool: p.small }); }
  }
  if (kind === "bat") {
    center(1.6, 1.05, { tag: "skull" }); eye(0.45, 1.45, 0.4); bone(0.3, 1.1, 0.75 + J(), 0.1, 1, "ear");
    spine(2.4, 6.2); lobe(0.45, 3.4, 1.3, { tag: "chest" }); lobe(0.4, 4.8, 1.1, { tag: "gut" });
    const [hx, hy] = limb(0.5, 2.6, [[-0.25, 1.6], [-0.05, 1.4]], 0, 0, "arm");
    for (let k = 0; k < 4; k++) { const a = lerp(-0.7, 0.9, k / 3) + J(); bone(hx, hy, hx + Math.cos(a) * 2.8, hy + Math.sin(a) * 2.8, 1, "wing finger"); }
    fan(hx - 0.3, hy + 0.6, -0.25, 0.85, 4, 2.6, p.cleanWing, "wing membrane");
    limb(0.4, 6.0, [[1.2, 1.1], [1.5, 0.6]], 4, 0.35, "foot");
  }
  if (kind === "ray") {
    center(1.4, 1.5, { tag: "skull" }); eye(0.55, 1.2, 0.5);
    spine(1.6, 9.4, 0.12);
    fan(0.2, 3.4, -0.75, 0.75, 7, 3.6, p.cleanWing.concat(p.mesh.filter(c => c.category === "translucent")), "pectoral disc");
    ribs(2.0, 5.2, 7, 2.4, 1.0, 0.1);
    lobe(0.45, 3.6, 1.3, { tag: "body" }); fan(0.25, 5.8, 0.6, 1.2, 3, 1.2, p.cleanWing, "pelvic fin");
  }
  if (kind === "bird") { // seen from above, wings spread. Skeleton leaves are the flight feathers (a veined vane), a sea fan is the tail,
    // a bivalve is the keel the flight muscles hang from, a long shell is the beak. No real feathers: that would only copy a bird.
    const vane = CUTS.filter(c => /skeleton|sceleton|leaf vein|dry leaf|blattadern/i.test(c.name) && c.g.rect < 0.85 && c.g.fill > 0.25);
    const tailP = CUTS.filter(c => /sea fan|basket star|by-the-wind/i.test(c.name)), keelP = CUTS.filter(c => ["shells", "pearls_minerals"].includes(c.category) && c.aspect > 1.05 && c.aspect < 1.8 && c.g.fill > 0.5);
    const beakP = CUTS.filter(c => /murex|cone|argonaut|thorn/i.test(c.name) || (c.category === "shells" && c.aspect > 1.8));
    const or = (a, b) => (a.length > 2 ? a : b);
    center(-0.35, 1.0, { tag: "beak · long shell", shape: "long", pool: or(beakP, p.stem) });
    center(0.75, 1.0, { tag: "skull", shape: "round", pool: p.small }); eye(0.33, 0.7, 0.35);
    spine(1.5, 5.4, 0.15); center(2.95, 2.1, { tag: "keel · bivalve", shape: "body", pool: or(keelP, p.mesh) });
    ribs(2.2, 3.7, 4, 0.9, 0.7, 0.3);
    const [hx, hy] = limb(0.45, 2.0, [[-0.4 + J(), 1.6], [-0.1, 1.5]], 0, 0, "wing bone");
    fan(hx - 0.1, hy + 0.15, -0.6, 0.85, 6, 3.8, or(vane, p.cleanWing), "wing · primary");
    fan(1.1, 2.4, 0.35, 1.05, 4, 2.4, or(vane, p.cleanWing), "wing · secondary");
    fan(0.05, 5.6, 1.18, 1.62, 4, 2.7, or(vane, p.wings), "tail · vane");
    limb(0.35, 4.7, [[1.35, 1.0], [1.65, 0.8]], 3, 0.4, "leg");
  }
  if (kind === "worm") { // a bristle worm: segments of pollen, foraminifera and pearls; on each, a pair of leaf paddles with sundew bristles;
    // a crown of basket-star and sundew tentacles at the head
    const segP = CUTS.filter(c => ["micro", "pearls_minerals", "coral_sea", "shells"].includes(c.category) && c.aspect < 1.45 && c.g.fill > 0.5);
    const bristle = CUTS.filter(c => c.category === "sticky_traps" && c.aspect > 2.2 && c.g.rect < 0.75), crownP = CUTS.filter(c => /basket star|sea fan/i.test(c.name));
    const padP = CUTS.filter(c => /skeleton|sceleton|leaf vein|dry leaf|odonata|zygopt|anisopt|wing/i.test(c.name) && c.category !== "wings" && c.g.rect < 0.85 && c.g.fill > 0.25);
    const or = (a, b) => (a.length > 2 ? a : b);
    fan(0.1, 0.55, -2.5, -1.75, 3, 1.3, or(bristle, p.stem), "crown · tentacle");
    lobe(0.45, 0.2, 0.9, { tag: "crown · basket star", pool: or(crownP, p.mesh), dir: -0.6 });
    center(0.75, 0.95, { tag: "head · mouth", shape: "round", pool: p.small }); eye(0.28, 0.55, 0.25);
    for (let k = 0; k < 12; k++) { const y = 1.5 + k * 0.7, s = 1.05 - 0.5 * Math.abs(k - 3.5) / 9;
      center(y, s * 0.95, { tag: "segment", shape: "round", pool: or(segP, p.small) });
      lobe(0.55 * s + 0.35, y + 0.05, 0.62 * s, { tag: "fin · paddle", pool: or(padP, p.wings), dir: 0.2 });
      fan(0.55 * s + 0.6, y, -0.35, 0.35, 2, 1.05 * s, or(bristle, p.stem), "fin · bristle"); }
    center(10.1, 0.4, { tag: "tail", shape: "round", pool: p.small });
  }
  for (const m of half) { out.push(m); out.push(mirrored(m, cx)); }
  return out.concat(axis);
}

Object.assign(SCENES, {
  bestiary: {
    title: "VIII · Bestiary",
    about: "Grown from the totem study, which read as x-rays of a frog and a rabbit: six beasts that don't exist, each built on one half from specimens (wing venation for fins and membranes, sundew and stems for bones, micrographs and scales for organs, beads for vertebrae) and mirrored. Every repaint is a new individual of each species.",
    size: [1800, 1350], glaze: 0.45,
    async paint(r, id) {
      const dark = P.get("plate") === "dark";
      groundFill(dark ? "#0b0c0e" : "#efede8", dark ? "#121417" : "#e4e1da"); keepGround();
      const list = [], kinds = Object.keys(BEASTS), cols = 4, rows = Math.ceil(Object.keys(BEASTS).length / 4), cw = W / cols, ch = H / rows;
      const labels = [];
      state.groups = [];
      kinds.forEach((k, i) => { const c = i % cols, rw = Math.floor(i / cols), u = ch * 0.083, cx = cw * (c + 0.5), y0 = ch * rw + ch * 0.1;
        const start = list.length; list.push(...beast(r, k, cx, y0, u, lerp(0.25, 0.75, r()), dark ? "dark" : "pale"));
        labels.push([cx, ch * (rw + 1) - ch * 0.035, `${BEASTS[k]} ${EPITHETS[Math.floor(r() * EPITHETS.length)]}`]);
        state.groups.push({ kind: k, start, end: list.length, name: labels.at(-1)[2], cx, y0, u }); });
      if (!(await drawAll(list, "beasts", id))) return;
      ctx.save(); ctx.textAlign = "center"; ctx.fillStyle = dark ? "#b9b4ae" : "#5a5450"; ctx.font = "italic 22px Georgia, serif";
      for (const [x, y, t] of labels) ctx.fillText(t, x, y);
      ctx.font = "12px IBM Plex Mono, monospace"; ctx.fillStyle = dark ? "#6d6964" : "#8f8a85";
      labels.forEach(([x, y], i) => ctx.fillText(`pl. ${String(i + 1).padStart(2, "0")} · seed ${state.seed}`, x, y + 20)); ctx.restore();
    },
  },
  beast: {
    title: "IX · A single beast",
    about: "One beast at plate size. Choose it with ?beast=frog|rabbit|fish|lizard|bat|ray, and a dark x-ray plate with ?plate=dark. Repaint for another individual.",
    size: [1000, 1400], glaze: 0.45,
    async paint(r, id) {
      const dark = P.get("plate") === "dark", kind = BEASTS[P.get("beast")] ? P.get("beast") : "frog";
      groundFill(dark ? "#0b0c0e" : "#efede8", dark ? "#121417" : "#e4e1da"); keepGround();
      const list = beast(r, kind, W / 2, H * 0.08, H * 0.083, lerp(0.3, 0.7, r()), dark ? "dark" : "pale");
      if (!(await drawAll(list, "beast", id))) return;
      ctx.save(); ctx.textAlign = "center"; ctx.fillStyle = dark ? "#b9b4ae" : "#5a5450"; ctx.font = "italic 30px Georgia, serif";
      ctx.fillText((state.groups = [{ kind, start: 0, end: list.length, name: `${BEASTS[kind]} ${EPITHETS[Math.floor(r() * EPITHETS.length)]}`, cx: W / 2, y0: H * 0.08, u: H * 0.083 }])[0].name, W / 2, H - 50); ctx.restore();
    },
  },
});

// =====================================================================================
// Beast Lab: kept beasts, a machine-parts layer, big-bodied beasts, and controls
// =====================================================================================
const ser = m => ({ id: m.c.id, x: m.x, y: m.y, sw: m.sw, sh: m.sh, rot: m.rot, bright: m.bright, sat: m.sat, glaze: m.glaze, tint: m.tint,
  shadow: m.shadow, alpha: m.alpha, comp: m.comp || null, mirror: !!m.mirror, tag: m.tag || "", want: m.want });
async function keepGroup(g, name, meta = {}) { // save the exact placed specimens of one beast
  const ps = pieces.slice(g.start, g.end).map(ser);
  const res = await fetch("api/keep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, meta: { ...meta, cx: g.cx, u: g.u, kind: g.kind }, pieces: ps }) });
  return res.json();
}
async function cutById(id) {
  const have = CUTS.find(c => c.id === id); if (have) return have;
  const e = index[id]; if (!e) return null; const g = await loadCut(e); if (!g) return null;
  return { ...e, g, aspect: g.elong, L: lum(e.color) };
}
const MACHINE_TONE = { pale: "#a8753a", dark: "#8fe3ff" };

// ---- machine parts, read off any beast's tagged anatomy (works for kept and new beasts) ----
function machineLayer(r, marks, cx, u, amount, dark) {
  const half = [], axis = [], notes = [], leds = [], tone = hex(dark ? MACHINE_TONE.dark : MACHINE_TONE.pale);
  const traceP = CUTS.filter(c => c.aspect > 3.2 && c.g.rect < 0.7);
  const roundP = CUTS.filter(c => c.aspect < 1.3 && c.g.fill > 0.55);
  const gearP = roundP.filter(c => ["micro", "coral_sea", "pearls_minerals", "shells"].includes(c.category));
  const chipP = CUTS.filter(c => c.g.rect > 0.7 && c.g.fill > 0.55);
  const cableP = CUTS.filter(c => c.category === "sticky_traps" && c.aspect > 2.5);
  const look = { glaze: 0.72, sat: 0.15, comp: dark ? "screen" : "multiply", shadow: dark ? 0 : 0.12, want: tone };
  const M = (to, o) => to.push(mark(r, { ...look, ...o }));
  const seg = (to, x1, y1, x2, y2, w, tag) => { const L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.round(L / Math.max(6, w * 5)));
    for (let i = 0; i < n; i++) { const xa = lerp(x1, x2, i / n), ya = lerp(y1, y2, i / n), xb = lerp(x1, x2, (i + 1) / n), yb = lerp(y1, y2, (i + 1) / n);
      M(to, { x: (xa + xb) / 2, y: (ya + yb) / 2, size: Math.hypot(xb - xa, yb - ya) * 1.08, byLength: true, dir: Math.atan2(yb - ya, xb - xa) - Math.PI / 2, shape: "long", pool: traceP, tag }); } };
  const right = m => m.x > cx + u * 0.25 && !m.mirror;
  const spine = marks.filter(m => m.tag === "vertebra").sort((a, b) => a.y - b.y);
  const organs = marks.filter(m => right(m) && /lobe|lung|gut|chest|haunch|body|bladder|organ|carapace|ear|swim/.test(m.tag));
  const joints = marks.filter(m => right(m) && /limb|leg|arm|foot|fore|hind|flipper|toe|wing finger|antler|horn/.test(m.tag));
  const skull = marks.find(m => /skull/.test(m.tag)), eyes = marks.filter(m => right(m) && m.tag === "eye");
  const bx = cx + u * 0.42;
  if (spine.length > 2) { seg(half, bx, spine[0].y, bx, spine.at(-1).y, u * 0.12, "bus · wing venation"); notes.push([bx, lerp(spine[0].y, spine.at(-1).y, 0.3), "B · venation bus"]); }
  // right-angled traces from the bus to organs, ending in a via
  const orgs = [...organs].sort((a, b) => a.y - b.y).filter((o, i, a) => i === 0 || Math.abs(o.y - a[i - 1].y) > u * 0.5);
  orgs.forEach((o, i) => { if (r() > amount) return; const ox = Math.max(o.x, bx + u * 0.6);
    seg(half, bx, o.y, ox, o.y, u * 0.1, "trace"); M(half, { x: ox, y: o.y, size: u * 0.26, shape: "round", pool: roundP, tag: "via · pearl" });
    if (notes.length < 2) notes.push([ox, o.y, "T · trace to organ"]); });
  // gears at well-spaced joints
  const js = []; joints.forEach(j => { if (js.every(k => Math.hypot(k.x - j.x, k.y - j.y) > u * 1.5)) js.push(j); });
  js.forEach(j => { if (r() > amount * 0.9) return; const s = u * 0.72;
    M(half, { x: j.x, y: j.y, size: s, shape: "round", pool: gearP.length > 3 ? gearP : roundP, glaze: 0.5, tag: "gear · urchin test" });
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; M(half, { x: j.x + Math.cos(a) * s * 0.66, y: j.y + Math.sin(a) * s * 0.66, size: s * 0.3, byLength: true, dir: a - Math.PI / 2, shape: "long", pool: traceP, tag: "gear tooth" }); }
    if (!notes.some(n => n[2].startsWith("G"))) notes.push([j.x, j.y, "G · urchin gear"]); leds.push([j.x, j.y, s * 0.9]); });
  // a die on the body's main mass, sitting on the axis, with pins
  const chest = [...organs].sort((a, b) => b.sw * b.sh - a.sw * a.sh)[0]; let yC = null;
  if (chest && amount > 0.15) { yC = chest.y; const s = u * 1.15;
    M(axis, { x: cx, y: yC, size: s, shape: "body", pool: chipP.length > 3 ? chipP : roundP, glaze: 0.55, tag: "chip · agate die" });
    for (let k = 0; k < 5; k++) M(half, { x: cx + s * 0.62, y: yC + (k - 2) * s * 0.17, size: s * 0.28, byLength: true, dir: 0, shape: "long", pool: traceP, tag: "pin" });
    notes.push([cx + s * 0.5, yC, "C · agate die"]); }
  // a cable from the skull down to the die
  if (skull && yC != null && amount > 0.3) { const a0 = [cx + u * 0.35, skull.y + u * 0.3], a1 = [cx + u * 1.9, (skull.y + yC) / 2], a2 = [cx + u * 0.75, yC - u * 0.3];
    const q = t => [0, 1].map(k => (1 - t) * (1 - t) * a0[k] + 2 * (1 - t) * t * a1[k] + t * t * a2[k]);
    for (let t = 0; t < 1; t += 0.08) { const [x1, y1] = q(t), [x2, y2] = q(t + 0.08);
      M(half, { x: (x1 + x2) / 2, y: (y1 + y2) / 2, size: Math.hypot(x2 - x1, y2 - y1) * 1.15, byLength: true, dir: Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2, shape: "long", pool: cableP.length > 3 ? cableP : traceP, glaze: 0.45, tag: "cable · sundew" }); }
    notes.push([...q(0.5), "W · sundew cable"]); }
  eyes.forEach(e => leds.push([e.x, e.y, u * 0.8]));
  const out = []; for (const m of half) { out.push(m); out.push(mirrored(m, cx)); } out.push(...axis);
  return { out, notes, leds };
}
function drawMachineExtras({ notes, leds }, dark, labels) {
  if (dark) { ctx.save(); ctx.globalCompositeOperation = "screen";
    for (const [x, y, rr] of leds) { const g = ctx.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, "rgba(143,227,255,.5)"); g.addColorStop(1, "rgba(0,40,80,0)"); ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
    ctx.restore(); }
  if (!labels) return;
  ctx.save(); ctx.strokeStyle = dark ? "rgba(143,227,255,.6)" : "rgba(120,80,40,.7)"; ctx.fillStyle = dark ? "#9fdcf0" : "#7a5228"; ctx.lineWidth = 1; ctx.font = "13px IBM Plex Mono, monospace";
  notes.forEach(([x, y, t], i) => { const lx = W - 230, ly = Math.min(H - 30, Math.max(40, y));
    ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(lx - 30, ly); ctx.lineTo(lx - 8, ly); ctx.stroke(); ctx.fillText(t, lx, ly + 4); });
  ctx.restore();
}

// ---- big-bodied beasts: heavy masses packed from shells, nacre, coral, agate, fungi, micrographs ----
const BIG = { automaton: "Automaton", elephant: "Elephas", bull: "Bos", bear: "Ursus", whale: "Balaena", tortoise: "Testudo", stag: "Cervus" };
function bigBeast(rB, rO, kind, cx, y0, u, prm, dark) {
  const p = pools(), half = [], axis = []; const top = [];
  const body = CUTS.filter(c => ["shells", "pearls_minerals", "coral_sea", "fungi_slime", "micro", "bark_lichen", "scales"].includes(c.category) && c.g.fill > 0.45 && c.g.rect < 0.85);
  const shellP = CUTS.filter(c => ["shells", "pearls_minerals"].includes(c.category) && c.g.fill > 0.5);
  const earP = p.cleanWing.concat(CUTS.filter(c => c.category === "translucent" || (c.category === "leaf_edges" && c.g.rect < 0.7)));
  const longP = p.stem.concat(p.cleanWing);
  const look = { glaze: dark ? 0.55 : 0.45, sat: dark ? 0.25 : 0.5, comp: dark ? "screen" : "multiply", shadow: dark ? 0 : 0.14 };
  const tone = (r, pk = prm.pink) => hex((r() < pk ? PINKS : GREYS)[Math.floor(r() * 4)]);
  const Pt = (x, y) => [cx + x * u, y0 + y * u];
  const put = (r, to, x, y, o) => { const [X, Y] = Pt(x, y); to.push(mark(r, { ...look, x: X, y: Y, want: o.want || tone(r), ...o, size: o.size * u })); };
  // fill the right half of an ellipse (centred x0 from the axis) with packed specimens
  // dense masses on the dark plate: screen-stacking saturates to white, so packed pieces are thinner, dimmer and more spaced there
  const dense = r => (dark ? { alpha: 0.42, want: mixc(tone(r), [0, 0, 0], 0.3) } : {}), step = dark ? 0.72 : 0.6;
  const mass = (r, x0, ym, rx, ry, s, pool, tag) => { for (let yy = -ry; yy <= ry + 1e-6; yy += s * step) for (let xx = -rx; xx <= rx + 1e-6; xx += s * step) {
      const X = x0 + xx + (r() - 0.5) * s * 0.25, Y = ym + yy + (r() - 0.5) * s * 0.25; if (X < -s * 0.1) continue; if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) > 1) continue;
      put(r, half, X, Y, { size: s * lerp(0.85, 1.25, r()), dir: r() * 6.28, shape: "body", pool, tag, ...dense(r) }); } };
  const bone = (r, x1, y1, x2, y2, tag, w = 1) => { const [A, B] = Pt(x1, y1), [C2, D] = Pt(x2, y2), L = Math.hypot(C2 - A, D - B);
    half.push(mark(r, { ...look, x: (A + C2) / 2, y: (B + D) / 2, size: L * 1.12 * w, byLength: true, dir: Math.atan2(D - B, C2 - A) - Math.PI / 2, want: tone(r, prm.pink * 0.6), shape: "long", pool: longP, tag })); };
  const chain = (r, pts, tag) => { for (let i = 0; i < pts.length - 1; i++) bone(r, ...pts[i], ...pts[i + 1], tag); };
  const column = (r, x, ya, yb, s, tag) => { for (let y = ya; y <= yb; y += s * 0.55) put(r, half, x + (r() - 0.5) * s * 0.2, y, { size: s * lerp(0.85, 1.1, r()), dir: Math.PI / 2 + (r() - 0.5) * 0.4, shape: "body", pool: body, tag, ...dense(r) }); };
  const spine = (ya, yb, s = 0.18) => { for (let y = ya; y <= yb; y += s * 1.15) { const [X, Y] = Pt(0, y); axis.push(mark(rB, { ...look, x: X, y: Y, size: s * u, want: hex(dark ? "#d8d4cc" : "#6d6964"), shape: "round", pool: p.small, tag: "vertebra", glaze: 0.5, sat: 0.3 })); } };
  const eye = (x, y, s) => put(rO, half, x, y, { size: s * 0.8, want: hex(dark ? "#cfcac2" : "#9a948e"), shape: "round", pool: p.small, tag: "eye", glaze: 0.55, alpha: 0.75 });
  const organs = (ya, yb, w) => { for (let k = 0; k < 3; k++) put(rO, half, w * lerp(0.35, 0.7, rO()), lerp(ya, yb, (k + 0.5) / 3), { size: lerp(0.8, 1.3, rO()), shape: "body", pool: p.mesh, tag: ["lung", "organ", "gut"][k], alpha: 0.9 }); };
  const ribs = (ya, yb, L) => { const n = Math.max(0, Math.round(5 * prm.ribs)); for (let k = 0; k < n; k++) { const y = lerp(ya, yb, k / Math.max(1, n - 1)); bone(rB, 0.15, y, 0.15 + L, y + L * 0.35, "rib", 0.9); } };

  // Big beasts as x-rays: one specimen plays one bone or organ, chosen because its own form suggests it
  // (brain coral skull, skeleton-leaf ears, tardigrade "water bear" skull, basket-star antlers, feather baleen...).
  // Nothing is packed into a silhouette.
  const by = re => CUTS.filter(c => re.test(c.name)), or2 = (a, b) => (a.length ? a : b);
  const X = {
    brain: or2(by(/brain coral/i), shellP), basket: or2(by(/basket star|sea fan/i), p.wings), tardi: or2(by(/Echiniscus|Milnesium|Hypsibius|Ramazzottius/i), p.center),
    leaf: or2(CUTS.filter(c => /skeleton|sceleton|leaf vein|dry leaf/i.test(c.name) && c.g.rect < 0.85), p.veins), pollen: or2(CUTS.filter(c => c.category === "micro" && c.aspect < 1.5 && c.g.fill > 0.5), p.mesh),
    desmid: or2(by(/Micrasterias/i), p.mesh), pearl: or2(CUTS.filter(c => /pearl/i.test(c.name) && c.aspect < 1.5), p.small), abal: or2(by(/abalone|nacre|mother/i), shellP),
    urchin: or2(CUTS.filter(c => /urchin|Goniocidaris/i.test(c.name)), p.small), bival: or2(shellP.filter(c => c.aspect > 1.05 && c.aspect < 1.75), shellP),
    stem: p.stem, sundew: or2(CUTS.filter(c => c.category === "sticky_traps" && c.aspect > 2.2), p.stem), feather: or2(CUTS.filter(c => c.category === "feathers" && !/down|fill-power/i.test(c.name)), p.wings),
    long: or2(shellP.filter(c => c.aspect > 1.8), shellP), cleanWing: or2(p.cleanWing, p.wings),
  };
  const one = (r, to, x, y, s, pool, tag, o = {}) => put(r, to, x, y, { size: s, shape: o.shape || "body", pool, tag, unique: 70, dir: o.dir ?? r() * 0.5, ...o });
  const ax = (y, s, pool, tag, o = {}) => one(rB, axis, 0, y, s, pool, tag, { dir: Math.PI / 2, ...o });
  const xb = (x1, y1, x2, y2, tag, pool = X.stem, w = 1) => { const [A, B] = Pt(x1, y1), [C2, D] = Pt(x2, y2), L = Math.hypot(C2 - A, D - B);
    half.push(mark(rB, { ...look, x: (A + C2) / 2, y: (B + D) / 2, size: L * 1.12 * w, byLength: true, dir: Math.atan2(D - B, C2 - A) - Math.PI / 2, want: tone(rB, prm.pink * 0.6), shape: "long", pool, tag, unique: 40 })); };
  const pin = (x, y, s = 0.26) => one(rB, half, x, y, s, X.pearl, "joint · pearl", { shape: "round", glaze: 0.3 });
  const leg = (pts, foot, footPool, tag) => { for (let i = 0; i < pts.length - 1; i++) { xb(...pts[i], ...pts[i + 1], `${tag} · stem bone`); if (i) pin(...pts[i]); }
    one(rB, half, ...pts.at(-1), foot, footPool, `${tag} foot`, { shape: "round" }); };
  const beads = (ya, yb, s0, s1, tag = "vertebra") => { for (let y = ya, k = 0; y <= yb; k++) { const t = (y - ya) / Math.max(0.01, yb - ya), s = lerp(s0, s1, t); ax(y, s, k % 3 === 2 ? X.urchin : X.pearl, `${tag} · ${k % 3 === 2 ? "urchin" : "pearl"}`, { shape: "round", glaze: 0.4 }); y += s * 1.05; } };
  const ribcage = (ya, yb, L, droop = 0.35) => { const n = Math.max(0, Math.round(5 * prm.ribs)); for (let k = 0; k < n; k++) { const y = lerp(ya, yb, k / Math.max(1, n - 1)); xb(0.18, y, 0.18 + L * (1 - 0.25 * Math.abs(k / Math.max(1, n - 1) - 0.4)), y + L * droop, "rib · sundew", X.sundew, 0.95); } };
  const m = prm.mass, sp = prm.spread, lg = prm.limb, sk = prm.skull;
  if (kind === "elephant") {
    one(rB, half, 1.75 * sp, 3.3, 3.1 * sp, X.leaf, "ear · skeleton leaf", { dir: 0.25, alpha: 0.85 });
    ax(3.1, 2.0 * sk, X.brain, "skull · brain coral", { shape: "round" });
    for (let k = 0, y = 2.0; k < 9; k++) { const s = lerp(0.42, 0.18, k / 8); ax(y, s, k % 2 ? X.pearl : X.urchin, "trunk · " + (k % 2 ? "pearl" : "urchin ring"), { shape: "round" }); y -= s * 1.0; }
    xb(0.35, 2.5, 0.95 * sp, 1.1, "tusk · murex", X.long.length > 2 ? X.long : X.stem, 1.1); eye(0.75, 3.0, 0.4);
    beads(4.3, 8.7, 0.3, 0.24); ribcage(4.7, 6.6, 1.7); ax(5.05, 0.85 * m, X.abal, "heart · abalone");
    one(rO, half, 0.75 * m, 5.3, 1.5 * m, X.pollen, "lung · pollen grain"); one(rO, half, 0.6 * m, 6.95, 1.15 * m, X.desmid, "gut · desmid");
    ax(8.1, 1.7 * m, X.bival, "pelvis · bivalve", { dir: 0 });
    leg([[1.15 * m, 4.9], [2.0 * m, 5.55 + 0.3 * lg], [2.35 * m, 6.8 * lg + 0.2]], 0.75, X.urchin, "foreleg");
    leg([[0.95 * m, 8.3], [1.8 * m, 8.9], [2.05 * m, 8.9 + 1.2 * lg]], 0.75, X.urchin, "hind leg");
    beads(9.2, 10.2, 0.16, 0.1, "tail");
  }
  if (kind === "bull") {
    ax(2.3, 1.5 * sk, X.bival, "skull · bivalve", { dir: -Math.PI / 2 });
    xb(0.55, 1.75, 1.6 * sp, 1.3, "horn · stalk", X.long.length > 2 ? X.long : X.stem); xb(1.6 * sp, 1.3, 2.2 * sp, 0.35, "horn tip · sundew", X.sundew, 0.9);
    one(rB, half, 0.3, 3.15, 0.3, X.pearl, "nostril · pearl", { shape: "round" }); eye(0.55, 2.2, 0.38);
    one(rB, half, 1.05, 4.2, 1.9 * sp, X.cleanWing, "shoulder blade · dragonfly wing", { dir: 0.5, shape: "long", alpha: 0.85 });
    beads(3.5, 8.6, 0.3, 0.22); ribcage(4.5, 6.6, 1.8, 0.3); ax(4.9, 0.8 * m, X.abal, "heart · abalone");
    for (let k = 0; k < 2; k++) one(rO, half, 0.55 + k * 0.55, 6.4 + k * 0.5, 0.75 * m, X.pollen, ["rumen", "reticulum", "omasum", "abomasum"][k * 2] + " · micrograph");
    for (let k = 0; k < 2; k++) one(rO, half, 1.0 - k * 0.5, 6.9 + k * 0.5, 0.6 * m, X.desmid, ["rumen", "reticulum", "omasum", "abomasum"][k * 2 + 1] + " · desmid");
    ax(8.2, 1.5 * m, X.bival, "pelvis · bivalve", { dir: 0 });
    leg([[1.2 * m, 4.6], [1.85 * m, 5.6], [2.0 * m, 5.6 + 1.5 * lg]], 0.5, X.bival, "foreleg · hoof");
    leg([[0.95 * m, 8.4], [1.7 * m, 9.0], [1.85 * m, 9.0 + 1.4 * lg]], 0.5, X.bival, "hind leg · hoof");
    xb(0, 8.9, 0.15, 10.6, "tail · stem"); one(rB, half, 0.2, 10.8, 0.6, X.feather, "tail tuft · feather", { shape: "long" });
  }
  if (kind === "bear") {
    ax(2.1, 1.7 * sk, X.tardi, "skull · tardigrade (water bear)", { shape: "round", glaze: 0.35 });
    one(rB, half, 0.95 * sp, 1.5, 0.42, X.bival, "ear · small shell", { shape: "body", dir: 0.7 }); // small and set low, so it never reads as a cartoon eye(0.5, 2.0, 0.35);
    beads(3.2, 8.2, 0.3, 0.24); ribcage(3.9, 5.9, 1.5, 0.4); ax(4.3, 0.75 * m, X.abal, "heart · abalone");
    one(rO, half, 0.7 * m, 4.6, 1.45 * m, X.pollen, "lung · pollen grain"); one(rO, half, 0.65 * m, 6.4, 1.2 * m, X.desmid, "gut · desmid");
    ax(7.6, 1.6 * m, X.bival, "pelvis · bivalve", { dir: 0 });
    const paw = (x, y, a) => { for (let k = 0; k < 5; k++) xb(x, y, x + Math.cos(a + (k - 2) * 0.22) * 0.7, y + Math.sin(a + (k - 2) * 0.22) * 0.7, "claw · sundew", X.sundew, 0.8); };
    leg([[1.1 * m, 3.8], [2.0 * m, 4.4 * lg + 0.2], [2.55 * m, 5.6 * lg]], 0.55, X.urchin, "arm"); paw(2.55 * m, 5.6 * lg, 0.9);
    leg([[0.9 * m, 7.9], [1.6 * m, 8.7], [1.75 * m, 8.7 + 1.0 * lg]], 0.6, X.urchin, "hind leg"); paw(1.75 * m, 8.7 + 1.0 * lg, 1.3);
  }
  if (kind === "whale") {
    ax(1.4, 2.1 * sk, X.long, "skull · cone shell", { dir: Math.PI / 2 });
    for (let k = 0; k < 6; k++) one(rB, half, 0.55 + k * 0.05, 0.9 + k * 0.32, 0.9, X.feather, "baleen · feather", { shape: "long", dir: 0.15 + k * 0.08, alpha: 0.85 });
    eye(0.95, 2.1, 0.35); beads(2.7, 9.4, 0.32, 0.14); ribcage(3.3, 5.6, 1.4, 0.45); ax(3.7, 0.8 * m, X.abal, "heart · abalone");
    one(rO, half, 0.65 * m, 4.2, 1.5 * m, X.pollen, "lung · pollen grain"); one(rO, half, 0.5 * m, 6.1, 1.0 * m, X.desmid, "gut · desmid");
    one(rB, half, 1.45 * sp, 4.6, 2.0 * sp, X.leaf, "flipper · skeleton leaf (finger bones)", { dir: -0.95, alpha: 0.85, byLength: true, shape: "long" }); // angled out and back
    xb(0.25, 7.2, 0.7, 7.6, "vestigial pelvis · stem", X.stem, 0.8);
    one(rB, half, 1.25 * sp, 9.75, 2.6 * sp, X.cleanWing, "fluke · dragonfly wing", { dir: -1.3, shape: "long", byLength: true, alpha: 0.85 }); // spread sideways, like a real fluke
  }
  if (kind === "tortoise") {
    ax(4.5, 3.4 * m, X.abal, "carapace · abalone", { glaze: 0.25, alpha: 0.75 });
    const n = Math.max(3, Math.round(6 * prm.ribs)); for (let k = 0; k < n; k++) { const a = -1.2 + (k / (n - 1)) * 2.4; xb(0.2, 4.5, 0.2 + Math.cos(a) * 1.9 * m, 4.5 + Math.sin(a) * 2.1 * m, "rib fused to shell · sundew", X.sundew, 0.95); }
    ax(1.2, 0.95 * sk, X.urchin, "skull · urchin test", { shape: "round" }); beads(1.8, 7.9, 0.24, 0.16); eye(0.35, 1.05, 0.28);
    one(rO, half, 0.7 * m, 4.2, 0.95 * m, X.pollen, "lung · pollen grain");
    leg([[1.2 * m, 3.0], [2.1 * sp, 2.6], [2.6 * sp, 2.0]], 0.6, X.bival, "foreleg · scute");
    leg([[1.1 * m, 6.2], [1.9 * sp, 6.7], [2.3 * sp, 7.3]], 0.55, X.bival, "hind leg · scute");
  }
  if (kind === "stag") {
    one(rB, half, 0.95 * sp, 1.45, 1.9 * sp, X.basket, "antler · basket star", { dir: -0.5, shape: "body", alpha: 0.9 });
    ax(2.4, 1.3 * sk, X.long, "skull · cone shell", { dir: Math.PI / 2 }); xb(0.55, 1.95, 1.2, 1.6, "ear · dragonfly wing", X.cleanWing, 1.2); eye(0.42, 2.25, 0.32);
    beads(3.4, 8.4, 0.26, 0.2); ribcage(4.2, 6.1, 1.5); ax(4.6, 0.7 * m, X.abal, "heart · abalone");
    one(rO, half, 0.65 * m, 4.9, 1.3 * m, X.pollen, "lung · pollen grain"); one(rO, half, 0.55 * m, 6.6, 1.0 * m, X.desmid, "gut · desmid");
    ax(8.0, 1.3 * m, X.bival, "pelvis · bivalve", { dir: 0 });
    leg([[1.0 * m, 4.4], [1.6 * m, 5.6], [1.75 * m, 5.6 + 1.9 * lg], [1.8 * m, 5.6 + 3.0 * lg]], 0.38, X.bival, "foreleg · hoof");
    leg([[0.85 * m, 8.2], [1.45 * m, 9.2], [1.55 * m, 9.2 + 1.6 * lg]], 0.38, X.bival, "hind leg · hoof");
  }
  if (kind === "automaton") { // a machine built only from natural parts that already work that way
    const roundP = CUTS.filter(c => c.aspect < 1.3 && c.g.fill > 0.5);
    const urchinP = roundP.filter(c => ["micro", "coral_sea"].includes(c.category)), naut = CUTS.filter(c => /nautil/i.test(c.name));
    const bival = shellP.filter(c => c.aspect > 1.05 && c.aspect < 1.75), abal = CUTS.filter(c => /abalone|haliotis|nacre|mother/i.test(c.name));
    const pearl = CUTS.filter(c => /pearl/i.test(c.name) && c.aspect < 1.4), piston = CUTS.filter(c => c.aspect > 3.2 && c.g.rect < 0.7), heat = CUTS.filter(c => c.category === "scales" && c.g.fill > 0.45);
    const or = (a, b) => (a.length > 2 ? a : b);
    const pistonPair = (x1, y1, x2, y2, tag) => { const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a) * 0.13, ny = Math.cos(a) * 0.13, [A1, B1] = Pt(x1, y1), [A2, B2] = Pt(x2, y2), L = Math.hypot(A2 - A1, B2 - B1);
      for (const s of [1, -1]) half.push(mark(rB, { ...look, x: (A1 + A2) / 2 + nx * u * s, y: (B1 + B2) / 2 + ny * u * s, size: L * 1.05, byLength: true, dir: a - Math.PI / 2, want: tone(rB, prm.pink * 0.5), shape: "long", pool: or(piston, longP), tag })); };
    const gear = (x, y, s, tag) => put(rB, half, x, y, { size: s, shape: "round", pool: or(urchinP, roundP), tag, glaze: 0.4 });
    const hinge = (x, y, s, a, tag) => put(rB, half, x, y, { size: s, dir: a, shape: "body", pool: or(bival, shellP), tag });
    put(rB, axis, 0, 1.2 * sk, { size: 1.7 * sk, shape: "round", pool: or(naut, shellP), tag: "skull · nautilus housing", glaze: 0.35 });
    put(rB, top, 0.36 * sk, 1.3 * sk, { size: 0.5, shape: "body", pool: or(abal, shellP), tag: "eye · abalone aperture" }); top.push(mirrored(top.at(-1), cx));
    put(rO, top, 0.36 * sk, 1.3 * sk, { size: 0.22, shape: "round", pool: or(pearl, p.small), tag: "eye · pearl lens", glaze: 0.3 }); top.push(mirrored(top.at(-1), cx)); // eyes sit over the nautilus housing
    for (const y of [2.15, 2.5]) put(rB, axis, 0, y, { size: 0.42, shape: "round", pool: or(urchinP, roundP), tag: "neck · urchin bearing" });
    for (let y = 2.9, k = 0; y <= 6.1; y += 0.34, k++) put(rB, axis, 0, y, { size: k % 2 ? 0.2 : 0.4, shape: "round", pool: k % 2 ? or(pearl, p.small) : or(urchinP, roundP), tag: "vertebra", glaze: 0.45 });
    const n = Math.max(2, Math.round(5 * prm.ribs)); for (let k = 0; k < n; k++) hinge(0.55 * m + 0.02 * k, 3.0 + k * (2.4 / n), 0.75 * m, -0.4 + k * 0.08, "rib · bivalve plate");
    for (let k = 0; k < 3; k++) put(rO, half, 1.35 * m, 3.4 + k * 0.45, { size: 0.5, shape: "body", pool: or(heat, body), dir: Math.PI / 2, tag: "organ · scale heat sink" });
    put(rB, axis, 0, 6.5, { size: 1.25 * m, shape: "body", pool: or(bival, shellP), tag: "body · pelvis shell" });
    // arms: urchin shoulder gear, piston pairs, a bivalve elbow hinge, claws
    const sx = 1.55 * m, ex = 1.55 * m + 0.6 * sp, ey = 2.85 + 1.55 * lg, hx = ex + 0.25 * sp, hy = ey + 1.45 * lg;
    gear(sx, 2.85, 0.68, "limb gear · urchin test"); pistonPair(sx, 2.85, ex, ey, "limb piston · upper arm"); hinge(ex, ey, 0.55, 0.3, "limb hinge · bivalve elbow");
    pistonPair(ex, ey, hx, hy, "limb piston · forearm"); for (let k = 0; k < 4; k++) bone(rB, hx, hy, hx + (k - 1.5) * 0.18, hy + 0.65, "limb claw", 0.8);
    // legs: hip gear, piston thighs, knee hinge, abalone foot
    const kx = 0.95 * m, ky = 6.7 + 1.35 * lg, fy = ky + 1.35 * lg;
    gear(0.78 * m, 6.7, 0.72, "limb gear · urchin hip"); pistonPair(0.78 * m, 6.7, kx, ky, "limb piston · thigh"); hinge(kx, ky, 0.55, -0.2, "limb hinge · bivalve knee");
    pistonPair(kx, ky, kx - 0.05, fy, "limb piston · shin"); put(rB, half, kx, fy + 0.25, { size: 0.85, shape: "body", pool: or(abal, shellP), tag: "limb foot · abalone" });
  }
  const out = []; for (const mm of half) { out.push(mm); out.push(mirrored(mm, cx)); } return out.concat(axis, top);
}

// ---- lab state, read from the URL so any configuration is a link ----
const LABP = ["size", "mass", "limb", "spread", "skull", "ribs", "machine", "pink"];
const labState = () => {
  const L = state.lab || (state.lab = {
    kind: P.get("k") || "elephant", plate: P.get("plate") || "dark", labels: P.get("labels") !== "0",
    seeds: { body: +(P.get("sb") || 7), organs: +(P.get("so") || 7), machine: +(P.get("sm") || 7) },
    prm: Object.fromEntries(LABP.map(k => [k, P.has(k) ? +P.get(k) : { size: 1, mass: 1, limb: 1, spread: 1, skull: 1, ribs: 1, machine: 0, pink: 0.45 }[k]])),
  }); return L; };
function syncLabURL() { const L = labState(), u = new URL(location); u.searchParams.set("scene", state.scene); u.searchParams.set("k", L.kind); u.searchParams.set("plate", L.plate);
  u.searchParams.set("labels", L.labels ? "1" : "0"); u.searchParams.set("sb", L.seeds.body); u.searchParams.set("so", L.seeds.organs); u.searchParams.set("sm", L.seeds.machine);
  LABP.forEach(k => u.searchParams.set(k, L.prm[k])); history.replaceState(null, "", u); }

Object.assign(SCENES, {
  lab: {
    title: "X · Beast lab",
    about: "Build beasts and reconfigure them. Big beasts (elephant, bull, bear, whale, tortoise, stag) are packed from shells, nacre, coral, agate, fungi and micrographs; the small ones come from the bestiary. Body, organs and machine parts each have their own seed, so you can re-roll one without losing the others. Keep saves the exact specimens.",
    size: [1500, 1500], glaze: 0.45,
    async paint(r, id) {
      const L = labState(), dark = L.plate === "dark", s = L.prm.size;
      groundFill(dark ? "#0b0c0e" : "#efede8", dark ? "#121417" : "#e4e1da"); keepGround();
      const cx = W * 0.44, u = H * 0.082 * s, y0 = H * 0.5 - u * 5;
      let list; const name = `${(BIG[L.kind] || BEASTS[L.kind])} ${EPITHETS[L.seeds.body % EPITHETS.length]}`;
      if (BIG[L.kind]) list = bigBeast(rng(L.seeds.body), rng(L.seeds.organs * 7919 + 1), L.kind, cx, y0, u, L.prm, dark);
      else list = beast(rng(L.seeds.body), L.kind, cx, y0, u, L.prm.pink, dark ? "dark" : "pale");
      const mach = machineLayer(rng(L.seeds.machine * 104729 + 3), list, cx, u, L.prm.machine, dark);
      const all = list.concat(L.prm.machine > 0 ? mach.out : []);
      state.groups = [{ kind: L.kind, start: 0, end: all.length, name, cx, y0, u }];
      if (!(await drawAll(all, "beast", id))) return;
      if (L.prm.machine > 0) drawMachineExtras(mach, dark, L.labels);
      ctx.save(); ctx.textAlign = "center"; ctx.fillStyle = dark ? "#b9b4ae" : "#5a5450"; ctx.font = "italic 30px Georgia, serif"; ctx.fillText(name, cx, H - 46); ctx.restore();
      syncLabURL();
    },
  },
  kept: {
    title: "XI · Kept beasts",
    about: "Beasts you chose to keep, redrawn from their exact saved specimens, with the machine layer added on top. Pick one from the kept list; the machine amount and callouts are adjustable.",
    size: [1500, 1500], glaze: 0.45,
    async paint(r, id) {
      const L = labState(), slug = P.get("slug") || state.keptSlug || "piscis-vitrea";
      const k = await fetch(`library/kept/${slug}.json`).then(x => (x.ok ? x.json() : null)); if (!k) { status(`no kept beast "${slug}" yet`); return; }
      const dark = (k.meta.plate || "dark") === "dark";
      groundFill(dark ? "#0b0c0e" : "#efede8", dark ? "#121417" : "#e4e1da"); keepGround();
      // recentre and scale the saved beast to this plate
      const xs = k.pieces.flatMap(p => [p.x - Math.max(p.sw, p.sh) / 2, p.x + Math.max(p.sw, p.sh) / 2]), ys = k.pieces.flatMap(p => [p.y - Math.max(p.sw, p.sh) / 2, p.y + Math.max(p.sw, p.sh) / 2]);
      const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys), sc = Math.min(W * 0.6 / bw, H * 0.78 / bh);
      const ox = k.meta.cx, oy = (Math.min(...ys) + Math.max(...ys)) / 2, cx = W * 0.44, cy = H * 0.47;
      const marks = [];
      for (const p of k.pieces) { const c = await cutById(p.id); if (!c) continue;
        marks.push({ ...p, c, x: cx + (p.x - ox) * sc, y: cy + (p.y - oy) * sc, sw: p.sw * sc, sh: p.sh * sc, comp: p.comp || undefined }); }
      const u = (k.meta.u || 100) * sc, mach = machineLayer(rng(L.seeds.machine * 104729 + 3), marks, cx, u, L.prm.machine, dark);
      if (!(await drawAll(marks.concat(L.prm.machine > 0 ? mach.out : []), k.name, id))) return;
      if (L.prm.machine > 0) drawMachineExtras(mach, dark, L.labels);
      ctx.save(); ctx.textAlign = "center"; ctx.fillStyle = dark ? "#b9b4ae" : "#5a5450"; ctx.font = "italic 30px Georgia, serif"; ctx.fillText(k.name, cx, H - 46); ctx.restore();
      state.groups = [{ kind: k.meta.kind, start: 0, end: marks.length, name: k.name, cx, u }];
    },
  },
});

// ---- the control panel (shown for the lab and kept scenes) ----
async function renderControls() {
  const box = document.getElementById("controls"); if (!box) return;
  if (!["lab", "kept"].includes(state.scene)) { box.innerHTML = ""; return; }
  const L = labState(), kept = await fetch("api/kept").then(r => r.json()).catch(() => []);
  const opt = (v, t, sel) => `<option value="${v}" ${sel ? "selected" : ""}>${t}</option>`;
  const range = (k, lo, hi, st, label) => `<label class="ctl"><span>${label}</span><input type="range" data-p="${k}" min="${lo}" max="${hi}" step="${st}" value="${L.prm[k]}"><output>${L.prm[k]}</output></label>`;
  box.innerHTML = `
    ${state.scene === "lab" ? `<label class="ctl"><span>species</span><select id="c-kind"><optgroup label="big beasts">${Object.keys(BIG).map(k => opt(k, k, k === L.kind)).join("")}</optgroup><optgroup label="bestiary">${Object.keys(BEASTS).map(k => opt(k, k, k === L.kind)).join("")}</optgroup></select></label>
    <label class="ctl"><span>plate</span><select id="c-plate">${opt("dark", "dark x-ray", L.plate === "dark")}${opt("pale", "pale", L.plate === "pale")}</select></label>
    ${range("size", 0.6, 1.3, 0.05, "size")}${range("mass", 0.5, 1.6, 0.05, "body mass")}${range("limb", 0.5, 1.6, 0.05, "limb length")}${range("spread", 0.5, 1.8, 0.05, "spread (ears, horns, fins)")}${range("skull", 0.6, 1.5, 0.05, "skull")}${range("ribs", 0, 2, 0.1, "ribs")}${range("pink", 0, 1, 0.05, "pink ↔ grey")}` : ""}
    ${range("machine", 0, 1, 0.05, "machine parts")}
    <label class="ctl row"><input type="checkbox" id="c-labels" ${L.labels ? "checked" : ""}><span>blueprint callouts</span></label>
    <div class="ctlrow">${state.scene === "lab" ? `<button class="chip" data-roll="body">re-roll body</button><button class="chip" data-roll="organs">re-roll organs</button>` : ""}<button class="chip" data-roll="machine">re-roll machine</button></div>
    ${state.scene === "lab" ? `<div class="ctlrow"><input id="c-name" placeholder="name to keep it under" value=""><button class="chip" id="c-keep">keep</button></div>` : ""}
    <div><span class="lbl" style="margin-left:0">kept</span><div class="ctlrow">${kept.map(k => `<button class="chip" data-kept="${k.slug}">${k.name}</button>`).join("") || "<span style='color:#8f877a'>none yet</span>"}</div></div>`;
  const repaint = () => { syncLabURL(); paint(); };
  box.querySelectorAll("input[type=range]").forEach(i => { i.oninput = () => (i.nextElementSibling.textContent = i.value); i.onchange = () => { L.prm[i.dataset.p] = +i.value; repaint(); }; });
  const kind = box.querySelector("#c-kind"); if (kind) kind.onchange = () => { L.kind = kind.value; repaint(); };
  const plate = box.querySelector("#c-plate"); if (plate) plate.onchange = () => { L.plate = plate.value; repaint(); };
  box.querySelector("#c-labels").onchange = e => { L.labels = e.target.checked; repaint(); };
  box.querySelectorAll("[data-roll]").forEach(b => b.onclick = () => { L.seeds[b.dataset.roll] = Math.floor(Math.random() * 99999); repaint(); });
  box.querySelectorAll("[data-kept]").forEach(b => b.onclick = () => { state.scene = "kept"; state.keptSlug = b.dataset.kept; const u = new URL(location); u.searchParams.set("slug", b.dataset.kept); history.replaceState(null, "", u); P.set("slug", b.dataset.kept); document.querySelectorAll("[data-scene]").forEach(x => x.setAttribute("aria-pressed", x.dataset.scene === "kept")); paint(); });
  const keep = box.querySelector("#c-keep"); if (keep) keep.onclick = async () => { const g = state.groups?.[0]; if (!g) return;
    const nm = box.querySelector("#c-name").value.trim() || g.name; const res = await keepGroup(g, nm, { plate: L.plate, source: "lab", ...L.seeds, prm: L.prm });
    status(res.ok ? `kept as "${nm}"` : "could not keep"); renderControls(); };
}

// =====================================================================================
// Alive: click a beast and it moves — x-ray, shadow puppet, or 3D — from a rig read off its own anatomy
// =====================================================================================
const MOTION = { // per species: limb swing, wing/fin flap, ear sway, body wave, speed, gait style
  frog: { limb: 0.2, wing: 0, ear: 0, wave: 0, w: 2.2, breathe: 0.05 }, rabbit: { limb: 0.14, ear: 0.12, wave: 0, w: 3, hop: 0.35 },
  fish: { limb: 0.1, wing: 0.28, wave: 0.35, w: 3 }, lizard: { limb: 0.28, wave: 0.25, w: 2.5 }, bat: { limb: 0.08, wing: 0.38, wave: 0, w: 4.2, bob: 0.3 },
  ray: { limb: 0.05, wing: 0.24, wave: 0.12, w: 1.6 }, elephant: { limb: 0.08, ear: 0.18, w: 1.3 }, bull: { limb: 0.1, ear: 0.03, w: 1.5 },
  bear: { limb: 0.14, ear: 0.05, w: 1.4 }, whale: { limb: 0.15, wing: 0.15, wave: 0.2, w: 1.1 }, tortoise: { limb: 0.16, w: 1.0 },
  stag: { limb: 0.1, ear: 0.06, w: 1.5 }, automaton: { limb: 0.22, ear: 0, w: 2.0, stepped: true },
};
function classify(tag) { const t = (tag || "").toLowerCase();
  if (/gear/.test(t)) return "gear";
  if (/wing|membrane|finger|pectoral|disc/.test(t)) return "wing";
  if (/fin|fluke/.test(t)) return "fin";
  if (/ear|horn|antler|tusk/.test(t)) return "ear";
  if (/limb|leg|arm|fore|hind|foot|toe|claw|hoof|flipper|paw|piston|hinge/.test(t)) return "limb";
  if (/skull|eye|crown|muzzle|beard|blowhole|housing|neck/.test(t)) return "head";
  return "core"; }
function buildRig(marks, cx, u, kind) {
  const ys = marks.map(m => m.y), yTop = Math.min(...ys), yBot = Math.max(...ys), cy = (yTop + yBot) / 2;
  const groups = new Map(), rig = { cx, cy, u, yTop, yBot, kind, mo: MOTION[kind] || MOTION.frog, parts: [] };
  marks.forEach(m => { let cls = classify(m.tag); const side = Math.abs(m.x - cx) < u * 0.2 ? 0 : m.x > cx ? 1 : -1;
    if ((cls === "limb" || cls === "wing" || cls === "ear" || cls === "fin") && side === 0) cls = "core";
    const key = ["core", "head", "gear"].includes(cls) ? cls : `${cls}|${side}|${m.y < cy ? "f" : "h"}|${(m.tag || "").split(" ")[0]}`;
    if (!groups.has(key)) groups.set(key, { cls, side, front: m.y < cy, items: [] }); groups.get(key).items.push(m); });
  for (const g of groups.values()) {
    if (g.side) { const root = g.items.reduce((a, b) => (Math.abs(a.x - cx) + 0.3 * Math.abs(a.y - cy) < Math.abs(b.x - cx) + 0.3 * Math.abs(b.y - cy) ? a : b));
      const k = Math.min(root.sw, root.sh) * 0.4 * (root.x > cx ? -1 : 1); g.px = root.x + k; g.py = root.y;
      const dmax = Math.max(1, ...g.items.map(m => Math.hypot(m.x - g.px, m.y - g.py))); g.items.forEach(m => (m._d = Math.hypot(m.x - g.px, m.y - g.py) / dmax)); }
    rig.parts.push(g); }
  return rig;
}
// where every piece is at time t (seconds): returns [{m, x, y, rot, s}]
function pose(rig, t) {
  const mo = rig.mo, u = rig.u, out = [], w = mo.w;
  const tick = v => (mo.stepped ? Math.round(v * 3) / 3 : v); // robots move in ticks
  const hop = mo.hop ? -Math.abs(Math.sin(t * w * 0.5)) * mo.hop * u : 0, bob = mo.bob ? Math.sin(t * w) * mo.bob * u : 0;
  for (const g of rig.parts) {
    let th = 0;
    if (g.cls === "limb") { const gait = (g.side < 0 ? Math.PI : 0) + (g.front ? 0 : Math.PI); th = g.side * (mo.limb || 0) * tick(Math.sin(t * w + gait)); }
    if (g.cls === "wing" || g.cls === "fin") th = g.side * (mo.wing || 0.1) * Math.sin(t * w * (g.cls === "fin" ? 1.3 : 1));
    if (g.cls === "ear") th = g.side * (mo.ear || 0) * Math.sin(t * w * 0.7 + (g.side > 0 ? 0 : 0.6));
    for (const m of g.items) {
      let x = m.x, y = m.y, rot = m.rot, s = 1;
      if (g.side && th) { const a = th * (0.35 + 0.65 * (m._d || 0)), c = Math.cos(a), sn = Math.sin(a), dx = x - g.px, dy = y - g.py;
        x = g.px + dx * c - dy * sn; y = g.py + dx * sn + dy * c; rot += m.mirror ? -a : a; }
      if (g.cls === "core") { const b = (mo.breathe || 0.025) * Math.sin(t * w * 0.6); x = rig.cx + (x - rig.cx) * (1 + b); s = 1 + b * 0.6; }
      if (g.cls === "head") y += Math.sin(t * w * 0.5) * 0.05 * u;
      if (g.cls === "gear") rot += (m.mirror ? -1 : 1) * t * 1.6;
      if (mo.wave) { const f = (y - rig.yTop) / (rig.yBot - rig.yTop); x += mo.wave * u * Math.sin(f * 4.5 - t * w) * Math.pow(f, 1.3); }
      out.push({ m, x, y: y + hop + bob, rot, s });
    }
  }
  return out;
}
// bake each mark once (colour correction, glaze) so animation only moves bitmaps
function bake(m, shadowPuppet) {
  const w = Math.max(1, Math.ceil(m.sw)), h = Math.max(1, Math.ceil(m.sh)), c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d");
  if (shadowPuppet) { x.drawImage(m.c.g.im, 0, 0, w, h); x.globalCompositeOperation = "source-in";
    const membrane = ["translucent", "wings", "leaf_edges"].includes(m.c.category) || /wing|membrane|fin|ear/.test(m.tag || "");
    x.fillStyle = membrane ? "rgba(150,58,22,.55)" : "rgba(26,17,11,.93)"; x.fillRect(0, 0, w, h); return c; }
  x.filter = `brightness(${(m.bright || 1).toFixed(3)}) saturate(${m.sat ?? 1})`; x.drawImage(m.c.g.im, 0, 0, w, h); x.filter = "none";
  if (m.glaze > 0) { x.globalCompositeOperation = "color"; x.globalAlpha = m.glaze; x.fillStyle = m.tint; x.fillRect(0, 0, w, h);
    x.globalAlpha = 1; x.globalCompositeOperation = "destination-in"; x.drawImage(m.c.g.im, 0, 0, w, h); }
  return c;
}

let alive = null;
function openAlive(g) {
  const marks = pieces.slice(g.start, g.end).map(m => ({ ...m })); if (!marks.length) return;
  // fit the beast into the alive canvas
  const cv2 = document.getElementById("alive2d"), A = cv2.width, xs = marks.flatMap(m => [m.x - m.sw / 2, m.x + m.sw / 2]), ys = marks.flatMap(m => [m.y - m.sh / 2, m.y + m.sh / 2]);
  const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys), sc = Math.min(A * 0.74 / bw, A * 0.74 / bh), ox = g.cx, oy = (Math.min(...ys) + Math.max(...ys)) / 2;
  marks.forEach(m => { m.x = A / 2 + (m.x - ox) * sc; m.y = A / 2 + (m.y - oy) * sc; m.sw *= sc; m.sh *= sc; });
  const dark = state.lab?.plate === "dark" || P.get("plate") === "dark" || (state.scene === "kept");
  const rig = buildRig(marks, A / 2, (g.u || 80) * sc, g.kind);
  marks.forEach(m => { m._x = bake(m, false); m._s = bake(m, true); });
  alive = { g, marks, rig, dark, mode: "xray", t0: performance.now(), raf: 0, three: null };
  document.getElementById("alive-name").textContent = g.name || g.kind;
  document.getElementById("alive").hidden = false;
  setAliveMode("xray");
}
function closeAlive() { if (!alive) return; cancelAnimationFrame(alive.raf); if (alive.three) alive.three.dispose(); alive = null; document.getElementById("alive").hidden = true; }
function setAliveMode(mode) {
  if (!alive) return; alive.mode = mode; cancelAnimationFrame(alive.raf);
  if (alive.three && mode !== "3d") { alive.three.dispose(); alive.three = null; }
  document.querySelectorAll("[data-amode]").forEach(b => b.setAttribute("aria-pressed", b.dataset.amode === mode));
  document.getElementById("alive2d").hidden = mode === "3d"; document.getElementById("alive3d").hidden = mode !== "3d";
  if (mode === "3d") return start3d();
  const cv2 = document.getElementById("alive2d"), x = cv2.getContext("2d"), A = cv2.width;
  const frame = now => { if (!alive || alive.mode !== mode) return; const t = (now - alive.t0) / 1000, ps = pose(alive.rig, t);
    if (mode === "xray") { x.fillStyle = alive.dark ? "#0b0c0e" : "#efede8"; x.fillRect(0, 0, A, A); }
    else { const g = x.createRadialGradient(A * 0.5, A * 0.42, A * 0.05, A * 0.5, A * 0.5, A * 0.75); g.addColorStop(0, "#f6e2b6"); g.addColorStop(0.6, "#d9a967"); g.addColorStop(1, "#6e4220"); x.fillStyle = g; x.fillRect(0, 0, A, A); }
    if (mode === "shadow") x.filter = "blur(1.4px)";
    for (const p of ps) { const m = p.m, spr = mode === "xray" ? m._x : m._s;
      x.save(); x.translate(p.x, p.y); if (m.mirror) x.scale(-1, 1); x.rotate(p.rot);
      if (mode === "xray" && m.comp) x.globalCompositeOperation = m.comp; x.globalAlpha = mode === "xray" ? m.alpha ?? 1 : 1;
      x.drawImage(spr, -m.sw * p.s / 2, -m.sh * p.s / 2, m.sw * p.s, m.sh * p.s); x.restore(); }
    x.filter = "none";
    if (mode === "shadow") { // puppet rods to the head and two limb tips, held from below the screen
      const tips = []; const head = ps.filter(p => classify(p.m.tag) === "head"); if (head.length) tips.push(head.reduce((a, b) => (a.y < b.y ? a : b)));
      for (const sd of [1, -1]) { const lim = ps.filter(p => classify(p.m.tag) === "limb" && Math.sign(p.x - A / 2) === sd); if (lim.length) tips.push(lim.reduce((a, b) => (Math.abs(a.x - A / 2) > Math.abs(b.x - A / 2) ? a : b))); }
      x.strokeStyle = "rgba(30,18,10,.85)"; x.lineWidth = 3; tips.forEach(p => { x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x * 0.85 + A * 0.075, A + 20); x.stroke(); }); // each rod hangs below the part it holds
      const v = x.createRadialGradient(A / 2, A / 2, A * 0.35, A / 2, A / 2, A * 0.75); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(40,20,5,.55)"); x.fillStyle = v; x.fillRect(0, 0, A, A); }
    alive.raf = requestAnimationFrame(frame); };
  alive.raf = requestAnimationFrame(frame);
}
async function start3d() {
  const THREE = await import("three"), { OrbitControls } = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js");
  if (!alive || alive.mode !== "3d") return;
  const c3 = document.getElementById("alive3d"), size = Math.min(c3.parentElement.clientWidth - 32, window.innerHeight * 0.8);
  const renderer = new THREE.WebGLRenderer({ canvas: c3, antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(size, size);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(alive.dark ? 0x0b0c0e : 0xefede8);
  const A = document.getElementById("alive2d").width, cam = new THREE.PerspectiveCamera(32, 1, 10, 20000); cam.position.set(0, 0, A * 1.45);
  const controls = new OrbitControls(cam, c3); controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 0.8;
  const DEPTH = { core: -70, head: 45, gear: 25, limb: 20, wing: -45, fin: -30, ear: 35 };
  const meshes = alive.marks.map((m, i) => { const tex = new THREE.CanvasTexture(m._x); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: (m.alpha ?? 1) * (alive.dark ? 0.82 : 0.95), blending: THREE.NormalBlending });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(m.sw, m.sh), mat); mesh.userData.z = (DEPTH[classify(m.tag)] ?? 0) + ((i * 7) % 11) * 3; scene.add(mesh); return mesh; });
  const t0 = performance.now(), ease = k => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // spring with overshoot
  const loop = now => { if (!alive || alive.mode !== "3d") return; const t = (now - alive.t0) / 1000, k = Math.min(1, (now - t0) / 1400), ps = pose(alive.rig, t);
    ps.forEach((p, i) => { const mesh = meshes[i], m = p.m; mesh.position.set(p.x - A / 2, -(p.y - A / 2), mesh.userData.z * ease(k) * 2.2);
      mesh.scale.set((m.mirror ? -1 : 1) * p.s, p.s, 1); mesh.rotation.z = m.mirror ? p.rot : -p.rot; mesh.renderOrder = Math.round(mesh.userData.z * 10) + i * 0.001; });
    controls.update(); renderer.render(scene, cam); alive.raf = requestAnimationFrame(loop); };
  alive.three = { dispose: () => { meshes.forEach(m => { m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); }); renderer.dispose(); controls.dispose(); } };
  alive.raf = requestAnimationFrame(loop);
}
// =====================================================================================
// Run, review, UI
// =====================================================================================
async function paint() {
  const id = ++run, S = SCENES[state.scene];
  [W, H] = S.size; cv.width = W; cv.height = H;
  if (state.glaze == null) state.glaze = S.glaze;
  document.getElementById("glaze").value = state.glaze;
  document.getElementById("title").textContent = S.title; document.getElementById("about").textContent = S.about;
  pieces = []; uses.clear(); xd.clear(); refreshX(); state.ground = null;
  document.getElementById("target").style.display = state.scene === "abyss" ? "" : "none";
  const t0 = performance.now();
  await S.paint(rng(state.seed), id);
  renderControls();
  if (id === run) status(`${pieces.length.toLocaleString()} specimens placed · ${new Set(pieces.map(p => p.c.id)).size} different photographs · ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  state.final = ctx.getImageData(0, 0, W, H);
  if (id === run && P.get("snap") === "1") await fetch("api/render", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `${state.scene}${P.get("plate") === "dark" ? "-dark" : ""}${P.get("beast") ? "-" + P.get("beast") : ""}-${state.seed}`, png: cv.toDataURL("image/png") }) });
  const u = new URL(location); u.searchParams.set("scene", state.scene); u.searchParams.set("seed", state.seed); u.searchParams.set("glaze", state.glaze); history.replaceState(null, "", u);
}
async function redraw() { // repaint every recorded mark (after replacing X'd specimens)
  if (state.ground) ctx.putImageData(state.ground, 0, 0); else { ctx.fillStyle = "#03060d"; ctx.fillRect(0, 0, W, H); }
  const all = pieces; pieces = []; const id = ++run;
  await drawAll(all, "repainting", id);
  if (state.scene === "abyss" && state.lights) { ctx.save(); ctx.globalCompositeOperation = "screen";
    for (const [x, y, rr] of state.lights) { const gl = ctx.createRadialGradient(x, y, 0, x, y, rr); gl.addColorStop(0, "rgba(143,243,255,.55)"); gl.addColorStop(0.25, "rgba(90,200,255,.18)"); gl.addColorStop(1, "rgba(0,40,80,0)");
      ctx.fillStyle = gl; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2); } ctx.restore(); }
  state.final = ctx.getImageData(0, 0, W, H); drawX(); status(`${pieces.length.toLocaleString()} specimens placed`);
}
function drawX() {
  if (state.final) ctx.putImageData(state.final, 0, 0);
  for (const i of xd) { const m = pieces[i]; ctx.save(); ctx.translate(m.x, m.y); ctx.strokeStyle = "#e0533d"; ctx.lineWidth = 2.5;
    const s = Math.max(6, Math.min(m.sw, m.sh) * 0.45); ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(s, s); ctx.moveTo(s, -s); ctx.lineTo(-s, s); ctx.stroke(); ctx.restore(); }
}
function hit(e) {
  const b = cv.getBoundingClientRect(), x = (e.clientX - b.left) * W / b.width, y = (e.clientY - b.top) * H / b.height;
  for (let i = pieces.length - 1; i >= 0; i--) { const m = pieces[i];
    const dx = (x - m.x) * (m.mirror ? -1 : 1), dy = y - m.y;
    const c = Math.cos(-m.rot), s = Math.sin(-m.rot), lx = dx * c - dy * s, ly = dx * s + dy * c;
    const u = lx / m.sw + 0.5, v = ly / m.sh + 0.5; if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
    const g = m.c.g; if (g.alpha[(Math.floor(v * g.A) * g.A + Math.floor(u * g.A)) * 4 + 3] > 90) return i; }
  return -1;
}
cv.addEventListener("mousemove", e => { const i = hit(e), tip = document.getElementById("tip");
  if (i < 0) { tip.style.display = "none"; return; }
  const m = pieces[i], b = cv.getBoundingClientRect();
  tip.textContent = `${m.c.name}${m.tag ? " · " + m.tag : ""} · ${m.c.category}`; tip.style.display = "block";
  tip.style.left = Math.min(b.width - 200, e.clientX - b.left + 14) + "px"; tip.style.top = (e.clientY - b.top + 14) + "px"; });
cv.addEventListener("click", e => { const i = hit(e); if (i < 0) return;
  if (!state.xmode) { const g = (state.groups || []).find(g => i >= g.start && i < g.end); if (g) return openAlive(g); } // click a beast: it comes to life
  const id = pieces[i].c.id, on = !xd.has(i); pieces.forEach((m, j) => { if (m.c.id === id) on ? xd.add(j) : xd.delete(j); }); refreshX(); drawX(); });
function refreshX() {
  const ids = [...new Set([...xd].map(i => pieces[i].c.id))];
  const btn = document.getElementById("replace"); btn.disabled = !ids.length; btn.textContent = `replace X'd (${ids.length})`;
  document.getElementById("xlist").innerHTML = ids.map(id => { const c = index[id];
    return `<li><img src="library/${c.file}" alt=""><span>${c.name}<br><span style="color:#8f877a">${c.category}</span></span></li>`; }).join("");
}
async function replaceX() {
  const ids = [...new Set([...xd].map(i => pieces[i].c.id))]; if (!ids.length) return;
  await fetch("api/reject", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, reason: `x'd in painter (${state.scene})` }) });
  ids.forEach(id => rejected.add(id)); CUTS = CUTS.filter(c => !rejected.has(c.id));
  const r = rng(state.seed + 77);
  for (const m of pieces) if (rejected.has(m.c.id)) { // same mark, new specimen, same colour intent
    const n = mark(r, { x: m.x, y: m.y, size: Math.sqrt(m.sw * m.sh), want: m.want, glaze: m.glaze, shadow: m.shadow, alpha: m.alpha, tag: m.tag });
    Object.assign(m, { c: n.c, sw: n.sw, sh: n.sh, bright: n.bright, rot: m.rot }); }
  xd.clear(); refreshX(); await redraw();
}
function bindUI() {
  const sync = () => document.querySelectorAll("[data-scene]").forEach(b => b.setAttribute("aria-pressed", b.dataset.scene === state.scene));
  document.querySelectorAll("[data-scene]").forEach(b => b.onclick = () => { state.scene = b.dataset.scene; state.glaze = null; sync(); paint(); });
  document.getElementById("glaze").onchange = e => { state.glaze = +e.target.value; paint(); };
  document.getElementById("reseed").onclick = () => { state.seed = Math.floor(Math.random() * 9999); paint(); };
  const tb = document.getElementById("target");
  tb.onclick = () => { const on = tb.getAttribute("aria-pressed") !== "true"; tb.setAttribute("aria-pressed", on);
    if (on && target) ctx.drawImage(target, 0, 0); else drawX(); };
  document.getElementById("replace").onclick = replaceX;
  const xb = document.getElementById("xmode"); xb.onclick = () => { state.xmode = !state.xmode; xb.setAttribute("aria-pressed", state.xmode); };
  document.querySelectorAll("[data-amode]").forEach(b => b.onclick = () => setAliveMode(b.dataset.amode));
  document.getElementById("alive-close").onclick = closeAlive; addEventListener("keydown", e => { if (e.key === "Escape") closeAlive(); });
  document.getElementById("save").onclick = () => { if (state.final) ctx.putImageData(state.final, 0, 0);
    cv.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `onw-${state.scene}-${state.seed}.png`; a.click(); drawX(); }); };
  sync();
}
boot();
