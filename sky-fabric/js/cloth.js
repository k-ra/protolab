// SKY FABRIC — one length of silk organza, hung on strings in an empty sky.
// It is a real cloth: ~1000 particles, simulated (position-based dynamics) and pushed
// around by an air field built from the forecast. Rendered as sheer silk chiffon: a smooth
// surface with faint fibre streaks and a soft sheen, sheer face-on and denser where it folds.
//
//   wind speed / direction → which way it blows and how hard; gusts arrive as fronts
//   humidity → a touch more body; it always stays sheer
//   (the cloth is coloured like the sky at that hour: zenith → horizon gradient, stars on clear nights)
//   rain     → its strings gather to the top of the sky; it hangs and ripples downward
//   storm    → wind shifts and jolts; electric veins; lightning lights the cloth from the strike
//   snow     → it stiffens and frosts over
//   fog      → it melts into the sky
//   heat     → slow motion, smouldering embers, edges burning away
//   polar vortex → the air swirls round a precessing axis and the cloth twists up into it
// Drag sideways to move through the next 12 hours. Moving the pointer stirs the air.
import { getGL, makeProgram, FS_VS, fullscreen, fitCanvas, loop } from './gl.js';
import { NOISE } from './glsl.js';
import { PRESETS, PRESET_ORDER, KEYS, CALM, loadLive, obsFromMood } from './weather.js';

// ------------------------------------------------------------------ palette
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const mixp = (a, b, t) => ({ c: a.c.map((c, i) => mixc(c, b.c[i], t)) });
const skyc = (top, mid, bot, sheen) => ({ c: [hex(top), hex(mid), hex(bot), hex(sheen)] });

// The cloth is coloured like the sky at that hour: a gradient from the zenith (top) to the horizon (bottom),
// plus a sheen colour. Night is indigo with stars, sunset is blue → rose → apricot, day is blue → pale haze.
const LIGHT = [
  [-18, skyc('#141b3f', '#1f2a57', '#2f3b6e', '#8e9ad6')],   // night
  [-10, skyc('#1b2452', '#33407a', '#5a5a92', '#b3b5e6')],   // late dusk
  [-5,  skyc('#24336b', '#5a5d9a', '#c07f8e', '#f0c8d0')],   // blue hour, pink at the horizon
  [0,   skyc('#34508f', '#c97a93', '#f3a565', '#ffe0bc')],   // sunset
  [6,   skyc('#5d86c2', '#e3b0a4', '#f6cf8e', '#fff0d6')],   // golden hour
  [20,  skyc('#5b8fd6', '#8fb8e6', '#d6e6f2', '#ffffff')],   // day
  [60,  skyc('#4f88d6', '#86b4e8', '#cfe2f3', '#ffffff')],   // high sun
];
function lightFor(elev) {
  if (elev <= LIGHT[0][0]) return LIGHT[0][1];
  for (let i = 0; i < LIGHT.length - 1; i++) {
    const [e0, a] = LIGHT[i], [e1, b] = LIGHT[i + 1];
    if (elev <= e1) return mixp(a, b, ss(e0, e1, elev));
  }
  return LIGHT[LIGHT.length - 1][1];
}
// weather changes the sky the way it really does: overcast greys it, rain turns it slate, and so on
const TINT = {
  cloud: skyc('#7d8590', '#99a1aa', '#b7bdc3', '#e6e9ec'),
  cold:  skyc('#6f97cf', '#a9c6e6', '#e6f1fa', '#ffffff'),
  heat:  skyc('#d6a77c', '#eeb27a', '#ef8f55', '#ffe9c4'),   // white-hot haze, burnt-orange horizon
  rain:  skyc('#46607f', '#6683a3', '#8ba5bf', '#d6e8f7'),   // slate with a blue cast
  storm: skyc('#2b2a3d', '#4a4560', '#6d6585', '#cbc2e4'),
  snow:  skyc('#b9c0cc', '#d4d8df', '#eceef1', '#ffffff'),
  fog:   skyc('#c5c7c6', '#d4d5d2', '#e3e3df', '#f6f5f2'),
  vortex:skyc('#1d3c78', '#5f9ccc', '#cdeefa', '#f2fbff'),
};
const grey = (c, t) => { const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return mixc(c, [l, l, l], t); };
function paletteFor(m, elev) {
  const base = lightFor(elev);
  const dim = 0.22 + 0.78 * ss(-12, 4, elev);           // weather skies are darker at night
  const tint = (t) => ({ c: t.c.map((c) => c.map((v) => v * dim)) });
  const k = 1 - 0.5 * (1 - ss(-12, -2, elev));
  let p = base;
  p = mixp(p, tint(TINT.cold), clamp01((0.38 - m.temp) / 0.3) * 0.35 * k);
  p = mixp(p, tint(TINT.heat), ss(0.72, 1, m.temp) * 0.88 * k);
  p = mixp(p, tint(TINT.cloud), clamp01((m.cloud - 0.3) / 0.6) * 0.7 * (1 - m.rain));
  p = mixp(p, tint(TINT.rain), clamp01(m.rain * 1.2) * 0.75 * (1 - m.storm * 0.6));
  p = mixp(p, tint(TINT.storm), m.storm * 0.8);
  p = mixp(p, tint(TINT.snow), clamp01(m.snow * 1.3) * 0.85);
  p = mixp(p, tint(TINT.fog), m.fog * 0.75);
  p = mixp(p, tint(TINT.vortex), m.vortex * 0.7);
  return p;
}

// ------------------------------------------------------------------ sky: greys only, set by the sun
// The fabric carries all the colour; the sky just says what time of day it is.
const RAD = Math.PI / 180;
function sunElevation(ms, lat, lon) {        // degrees above the horizon (low-precision solar position)
  const d = ms / 86400000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * RAD, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  const ha = (gmst * 15 + lon) * RAD - ra;
  return Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(ha)) / RAD;
}
function skyFor(elev, m) {
  // night → twilight → golden hour → day, as one grey
  let L = elev < -12 ? 0.05 : elev < 0 ? 0.05 + ((elev + 12) / 12) * 0.2 : elev < 12 ? 0.25 + (elev / 12) * 0.27 : 0.52 + Math.min(1, (elev - 12) / 30) * 0.12;
  L *= 1 - 0.15 * m.cloud - 0.5 * m.storm;
  L += (0.6 - L) * m.fog * 0.7;
  const glow = Math.max(0, 1 - Math.abs(elev - 1) / 9) * (1 - 0.6 * m.cloud);   // sunrise / sunset: light low in the sky
  const top = L * (1 - 0.3 * glow), bot = Math.min(0.9, L * (1 + 0.5 * glow) + 0.05 * glow);
  return { top: [top, top, top], bot: [bot, bot, bot], mid: [(top + bot) / 2, (top + bot) / 2, (top + bot) / 2] };
}

// ------------------------------------------------------------------ air (CPU value noise)
function hash3(i, j, k) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let u = x - xi, v = y - yi, w = z - zi;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w);
}

// ------------------------------------------------------------------ cloth
const NX = 62, NY = 46, N = NX * NY;
const CW = 3.7, CH = 2.4, TOP = 0.8, SKY_Y = 2.1;
const DX = CW / (NX - 1), DY = CH / (NY - 1), A00 = DX * DY * 0.5;
let A0 = A00, SIZE = 1;
const id = (i, j) => j * NX + i;
const pos = new Float32Array(N * 3), prv = new Float32Array(N * 3), acc = new Float32Array(N * 3), air = new Float32Array(N * 3);

const HANGS = {
  // strings from the edges of the screen tie onto points inside the cloth, so its edges stay free
  corners: { label: 'Four corners', ties: 4, slack: 1.2 },
  web:   { label: 'Web of strings', ties: 'web', slack: 1.25 },
  three: { label: 'Three strings', ropes: [[0, 0], [(NX - 1) >> 1, 0], [NX - 1, 0]], splay: 1.1 },
  two:   { label: 'Two corners', ropes: [[0, 0], [NX - 1, 0]], splay: 1.3 },
  one:   { label: 'One thread', ropes: [[(NX - 1) >> 1, 0]], splay: 1 },
  side:  { label: 'Like a flag', side: true },
};
let hang = 'web', ropes = [], pole = null;
// where each string ties onto the cloth (u across, v down) and which edge of the screen it runs to (sx, sy)
// order: the four corners first, then top, right, bottom, left — the web uses the first N
const TIES = [[0.34, 0.3, -1, 1], [0.67, 0.35, 1, 1], [0.31, 0.69, -1, -1], [0.65, 0.73, 1, -1],
  [0.5, 0.2, 0.15, 1], [0.8, 0.53, 1, -0.15], [0.47, 0.8, -0.2, -1], [0.2, 0.5, -1, 0.1]];
function restOf(i, j, h = HANGS[hang]) {
  if (h.side) return [pole + (i / (NX - 1)) * CW * flagDir, TOP - (j / (NY - 1)) * CH, 0];   // the flag starts downwind of its pole
  if (h.ties) return [(i / (NX - 1) - 0.5) * CW * SIZE, 0.3 + (0.5 - j / (NY - 1)) * CH * SIZE, 0];
  return [(i / (NX - 1) - 0.5) * CW, TOP - (j / (NY - 1)) * CH, 0];
}
let flagDir = 1;
// a point just past the edge of the visible sky (sx, sy in -1..1 screen units)
function screenAnchor(sx, sy) {
  const aspect = innerWidth / Math.max(1, innerHeight), vs = Math.min(1, aspect * 0.78), k = 3.4 / (3.1 * vs);
  return [sx * aspect * k * 1.02, sy * k * 1.02, 0];
}
function setHang(key, keepPose) {
  hang = HANGS[key] ? key : 'web';
  if (typeof TW !== 'undefined') { TW.hang = hang; saveTweaks(); }
  const h = HANGS[hang];
  pole = null;
  if (h.side) { flagDir = (W.cur.wx ?? 1) < 0 ? -1 : 1; pole = -flagDir * 0.85; }
  if (!keepPose) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = id(i, j) * 3, r = restOf(i, j);
    pos[k] = prv[k] = r[0]; pos[k + 1] = prv[k + 1] = r[1];
    pos[k + 2] = prv[k + 2] = 0.02 * Math.sin(i * 0.7 + j * 0.3);
  }
  const rope = (p, ax, ay, az) => {
    const k = p * 3, L = Math.hypot(pos[k] - ax, pos[k + 1] - ay, pos[k + 2] - az);
    return { p, a: [ax, ay, az], home: [ax, ay, az], L };
  };
  if (h.side) {             // both left corners on one vertical string: a flag on a pole of thread
    ropes = [];
    for (let j = 0; j < NY; j++) { const r = rope(id(0, j), pole, SKY_Y, 0); r.hidden = true; ropes.push(r); }
  } else if (h.ties) {      // strings out to the edges of the screen: the top ones carry it, the rest hang loose
    const n = h.ties === 'web' ? (TW?.webStrings ?? 6) : 4;
    ropes = TIES.slice(0, n).map(([u, v, sx, sy]) => ({
      uv0: [u, v], uv: [u, v], screen: [sx, sy], a: [0, 0, 0], home: [0, 0, 0], L: 1, loose: 0, ph: u * 7 + v * 3,
      slackK: sy > 0.5 ? 1.03 : sy < -0.5 ? h.slack : 1 + (h.slack - 1) * 0.5 }));
  } else {
    ropes = h.ropes.map(([i, j]) => { const r = restOf(i, j); return rope(id(i, j), r[0] * h.splay, SKY_Y, 0); });
  }
  markMenu?.();
}

// distance constraints: structural first, in rows from the top (so the hang propagates fast), then shear
const sA = [], sB = [], sR = [], bA = [], bB = [], bR = [];
const rest = (p, q) => { const a = restOf(p % NX, (p / NX) | 0, HANGS.three), b = restOf(q % NX, (q / NX) | 0, HANGS.three); return Math.hypot(a[0] - b[0], a[1] - b[1]); };
const add = (A, B, R, p, q) => { A.push(p); B.push(q); R.push(rest(p, q)); };
for (let j = 0; j < NY; j++) {
  for (let i = 0; i < NX - 1; i++) add(sA, sB, sR, id(i, j), id(i + 1, j));
  if (j < NY - 1) for (let i = 0; i < NX; i++) add(sA, sB, sR, id(i, j), id(i, j + 1));
}
const NSTRUCT = sA.length;
for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
  add(sA, sB, sR, id(i, j), id(i + 1, j + 1)); add(sA, sB, sR, id(i + 1, j), id(i, j + 1));
}
for (let j = 0; j < NY; j++) for (let i = 0; i < NX - 2; i++) add(bA, bB, bR, id(i, j), id(i + 2, j));
for (let j = 0; j < NY - 2; j++) for (let i = 0; i < NX; i++) add(bA, bB, bR, id(i, j), id(i, j + 2));
const CA = Int32Array.from(sA), CB = Int32Array.from(sB), CR = Float32Array.from(sR);
const BA = Int32Array.from(bA), BB = Int32Array.from(bB), BR = Float32Array.from(bR);
const CR0 = CR.slice(), BR0 = BR.slice();
function applySize(k) {              // grow or shrink the cloth in place: the constraints pull it to the new size
  SIZE = k; A0 = A00 * k * k;
  for (let c = 0; c < CR.length; c++) CR[c] = CR0[c] * k;
  for (let c = 0; c < BR.length; c++) BR[c] = BR0[c] * k;
}

function solve(A, B, R, n, k0, kShear) {
  for (let c = 0; c < n; c++) {
    const a = A[c] * 3, b = B[c] * 3;
    const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-9) continue;
    const k = c < NSTRUCT ? k0 : kShear;
    const f = (k * (d - R[c])) / d * 0.5;
    pos[a] += dx * f; pos[a + 1] += dy * f; pos[a + 2] += dz * f;
    pos[b] -= dx * f; pos[b + 1] -= dy * f; pos[b + 2] -= dz * f;
  }
}
let twist = 0;           // how far the vortex has wound the strings round
function moveAnchors(dt, m) {
  twist += dt * m.vortex * (1.1 + 0.7 * Math.sin(W.time * 0.23));
  // the whole rig turns slowly in space, so you see the cloth from ever-changing angles
  const turn = twist + 0.5 * Math.sin(W.time * 0.071) + 0.22 * Math.sin(W.time * 0.19 + 1.0);
  const pull = 1 - 0.35 * m.vortex, c = Math.cos(turn), s = Math.sin(turn);
  const heat = ss(0.72, 1, m.temp);
  // where the strings grip the cloth: fog gathers them in a little (a hanging veil), storms and snow
  // pull them in towards the middle (the cloth flails / gathers), heat lets them drift apart
  const spread = 1 - 0.18 * m.fog + 0.1 * heat - 0.35 * m.storm - 0.3 * m.snow;
  // how much give the strings have: heat lets them sag, storms pull them taut, snow load drags them down
  const give = 0.28 * heat + 0.08 * m.rain * (1 - m.storm) - 0.03 * m.storm - 0.03 * m.fog + 0.12 * W.snowLoad;
  const ease = 1 - Math.exp(-dt * 0.6);
  // a thunderstorm now and then tears a string loose for a few seconds
  if (m.storm > 0.3 && Math.random() < dt * 0.14 * m.storm) {
    const held = ropes.filter((r) => r.uv && !r.loose);
    if (held.length > 3) held[Math.floor(Math.random() * held.length)].loose = W.time + 1.5 + Math.random() * 2.5;
  }
  for (const r of ropes) {
    if (r.loose && (W.time > r.loose || m.storm < 0.1)) r.loose = 0;
    if (r.screen) {
      // in rain every string gathers up to the top of the sky, so the cloth hangs down like falling water
      const rr = ss(0.05, 0.6, m.rain) * (1 - 0.8 * m.storm);   // in a storm the corners hold on, so it whips in place
      r.home = screenAnchor(r.screen[0] * (1 - 0.5 * rr), r.screen[1] + (1 - r.screen[1]) * rr);
      const ph = r.ph ?? r.p * 0.013;
      r.home[0] += 0.12 * Math.sin(W.time * 0.21 + ph * 7.0); r.home[1] += 0.1 * Math.sin(W.time * 0.27 + ph * 11.0);
      r.home[2] += 0.25 * Math.sin(W.time * 0.17 + ph * 5.0);
    }
    if (r.uv) {
      const tu = Math.max(0.03, Math.min(0.97, 0.5 + (r.uv0[0] - 0.5) * spread));
      const tv = Math.max(0.03, Math.min(0.97, 0.5 + (r.uv0[1] - 0.5) * spread - 0.08 * m.snow));
      r.uv[0] += (tu - r.uv[0]) * ease; r.uv[1] += (tv - r.uv[1]) * ease;
      const rp = restOf(r.uv[0] * (NX - 1), r.uv[1] * (NY - 1));
      r.L = Math.hypot(r.home[0] - rp[0], r.home[1] - rp[1], r.home[2] - rp[2]) * (r.slackK + give);
    }
    const hx = r.home[0] * pull, hz = r.home[2] * pull;
    r.a[0] = hx * c - hz * s; r.a[2] = hx * s + hz * c; r.a[1] = r.home[1];
  }
}
function solveRopes() {
  if (pole !== null) for (let j = 0; j < NY; j++) {   // the flag's edge slides on a taut vertical thread
    const k = id(0, j) * 3; pos[k] += (pole - pos[k]) * 0.7; pos[k + 2] *= 0.3;
  }
  for (const r of ropes) {
    if (r.uv) {                 // a tie between particles: spread the correction over the four around it
      if (r.loose) continue;
      tieAt(r.uv[0], r.uv[1]);
      let px = 0, py = 0, pz = 0;
      for (let q = 0; q < 4; q++) { const k = TIEI[q], w = TIEW[q]; px += pos[k] * w; py += pos[k + 1] * w; pz += pos[k + 2] * w; }
      const dx = px - r.a[0], dy = py - r.a[1], dz = pz - r.a[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > r.L) {
        const s = r.L / d, cx = r.a[0] + dx * s - px, cy = r.a[1] + dy * s - py, cz = r.a[2] + dz * s - pz;
        const w2 = TIEW[0] ** 2 + TIEW[1] ** 2 + TIEW[2] ** 2 + TIEW[3] ** 2;
        for (let q = 0; q < 4; q++) { const k = TIEI[q], f = TIEW[q] / w2; pos[k] += cx * f; pos[k + 1] += cy * f; pos[k + 2] += cz * f; }
      }
      continue;
    }
    const k = r.p * 3, dx = pos[k] - r.a[0], dy = pos[k + 1] - r.a[1], dz = pos[k + 2] - r.a[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > r.L) { const s = r.L / d; pos[k] = r.a[0] + dx * s; pos[k + 1] = r.a[1] + dy * s; pos[k + 2] = r.a[2] + dz * s; }
  }
}
const TIEI = new Int32Array(4), TIEW = new Float32Array(4);
function tieAt(u, v) {
  const fi = u * (NX - 1), fj = v * (NY - 1);
  const i = Math.min(NX - 2, Math.floor(fi)), j = Math.min(NY - 2, Math.floor(fj)), fx = fi - i, fy = fj - j;
  TIEI[0] = id(i, j) * 3; TIEI[1] = id(i + 1, j) * 3; TIEI[2] = id(i, j + 1) * 3; TIEI[3] = id(i + 1, j + 1) * 3;
  TIEW[0] = (1 - fx) * (1 - fy); TIEW[1] = fx * (1 - fy); TIEW[2] = (1 - fx) * fy; TIEW[3] = fx * fy;
}

// aerodynamic push on one triangle: pressure ∝ (n·v_rel)|n·v_rel|, so it billows and flags
function aeroTri(a, b, c, h, K) {
  a *= 3; b *= 3; c *= 3;
  const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
  const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
  let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len < 1e-12) return;
  nx /= len; ny /= len; nz /= len;
  const ih = 1 / (3 * h);
  const vx = (air[a] + air[b] + air[c]) / 3 - (pos[a] - prv[a] + pos[b] - prv[b] + pos[c] - prv[c]) * ih;
  const vy = (air[a + 1] + air[b + 1] + air[c + 1]) / 3 - (pos[a + 1] - prv[a + 1] + pos[b + 1] - prv[b + 1] + pos[c + 1] - prv[c + 1]) * ih;
  const vz = (air[a + 2] + air[b + 2] + air[c + 2]) / 3 - (pos[a + 2] - prv[a + 2] + pos[b + 2] - prv[b + 2] + pos[c + 2] - prv[c + 2]) * ih;
  const dn = nx * vx + ny * vy + nz * vz;
  let f = K * dn * Math.abs(dn) * (len * 0.5 / A0) / 6;
  f = Math.max(-80, Math.min(80, f));
  for (const p of [a, b, c]) { acc[p] += nx * f; acc[p + 1] += ny * f; acc[p + 2] += nz * f; }
}

const LITE = new URLSearchParams(location.search).has('embed') && !new URLSearchParams(location.search).has('hq');   // grid cells: a lighter sim so 16 can run at once
const H = LITE ? 1 / 120 : 1 / 180, ITER = LITE ? 5 : 7;
let simAcc = 0;
function simulate(dt, P) {
  simAcc = Math.min(simAcc + dt * P.timeScale, H * 8);
  while (simAcc >= H) {
    simAcc -= H;
    acc.fill(0);
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
      const a = id(i, j), b = id(i + 1, j), c = id(i, j + 1), d = id(i + 1, j + 1);
      aeroTri(a, b, c, H, P.aero); aeroTri(b, d, c, H, P.aero);
    }
    const hh = H * H;
    for (let p = 0; p < N * 3; p += 3) {
      const vx = (pos[p] - prv[p]) / H, vy = (pos[p + 1] - prv[p + 1]) / H, vz = (pos[p + 2] - prv[p + 2]) / H;
      const ax = acc[p] + P.drag * (air[p] - vx);
      const ay = acc[p + 1] + P.drag * (air[p + 1] - vy) - P.g;
      const az = acc[p + 2] + P.drag * (air[p + 2] - vz);
      for (let q = 0; q < 3; q++) {
        const x = pos[p + q], v = (x - prv[p + q]) * P.damp;
        prv[p + q] = x;
        pos[p + q] = x + v + (q === 0 ? ax : q === 1 ? ay : az) * hh;
      }
    }
    for (let it = 0; it < ITER; it++) { solveRopes(); solve(CA, CB, CR, CA.length, 1, 0.2); }
    solve(BA, BB, BR, BA.length, P.bend, P.bend);
    solveRopes();
  }
}

// the air: forecast wind + gust fronts + turbulence (+ thermals, vortex, your pointer)
const mouse = { x: 0, y: 0, vx: 0, vy: 0, on: false };
function airField(m, t, gustNow) {
  const heat = ss(0.72, 1, m.temp), dry = 1 - m.humid;
  let dx = m.wx, dz = -m.wz * 0.65;
  const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  const veer = m.storm * 1.1 * noise3(t * 0.22, 3.3, 0) + 0.25 * noise3(t * 0.07, 8.1, 0);   // storms shift the wind about
  [dx, dz] = [dx * Math.cos(veer) - dz * Math.sin(veer), dx * Math.sin(veer) + dz * Math.cos(veer)];
  const V = TW.wind * (0.25 + 2.3 * m.wind + 0.6 * m.storm) * (1 - 0.65 * heat) * (1 - 0.6 * m.fog);
  const G = 1 + m.gust * 1.1 * gustNow;
  const T = TW.whimsy * (0.6 + 0.35 * V) * (0.75 + 0.4 * dry) * (1 + 1.3 * m.storm) * (1 - 0.4 * m.fog);
  const fr = 0.85, tr = 0.3 + 0.2 * V;
  // a wandering eddy that curls the cloth round, and puffs of air that lift and flip it
  const ex = 0.9 * Math.sin(t * 0.23) + 0.3 * Math.sin(t * 0.61), ey = 0.5 * Math.sin(t * 0.31 + 1.0);
  const calm = 1 - 0.55 * m.fog;                       // fog: everything drifts, dreamlike
  const eddy = calm * TW.whimsy * (1.5 + 0.5 * V) * Math.sin(t * 0.13 + 0.5) * (1 - 0.5 * m.vortex);
  const puff = calm * TW.whimsy * 3.2 * Math.pow(Math.max(0, noise3(t * 0.45, 4.4, 0.0)), 2) * (1 - 0.5 * m.vortex);
  const ex2 = -0.8 * Math.sin(t * 0.17 + 2.0), ey2 = 0.6 * Math.sin(t * 0.29 + 0.4);       // a second eddy, turning the other way
  const eddy2 = -calm * TW.whimsy * (0.9 + 0.4 * V) * Math.sin(t * 0.11 + 2.2) * (1 - 0.5 * m.vortex);
  const px0 = 1.1 * noise3(t * 0.11, 9.9, 0.0), pz0 = 0.6 * noise3(t * 0.17, 2.2, 0.0);
  const ax = 0.35 * Math.sin(t * 0.13), az = 0.3 * Math.cos(t * 0.17), al = Math.hypot(ax, 1, az);
  const Ax = ax / al, Ay = 1 / al, Az = az / al;
  const spin = m.vortex * (4.2 + 2.0 * Math.sin(t * 0.37) + 2.0 * noise3(t * 0.3, 1.1, 5));
  const lift = m.vortex * (0.8 + 1.6 * Math.max(0, Math.sin(t * 0.29)));
  for (let p = 0; p < N * 3; p += 3) {
    const x = pos[p], y = pos[p + 1], z = pos[p + 2];
    const front = 0.55 * m.gust * Math.max(0, noise3(t * 0.8 - (x * dx + z * dz) * 0.9, y * 0.6, 7.7));
    let wx = dx * V * (G + front) + T * noise3(x * fr + t * tr, y * fr, z * fr + 1.7);
    let wy = T * 0.6 * noise3(x * fr + 5.2, y * fr - t * tr * 0.7, z * fr);
    let wz = dz * V * (G + front) + T * noise3(x * fr, y * fr + 9.1, z * fr + t * tr);
    wx += T * 0.45 * noise3(x * 2.6 - t * 0.9, y * 2.6, z * 2.6 + 4.0);               // a finer flutter on top
    wz += T * 0.45 * noise3(x * 2.6, y * 2.6 + t * 0.8, z * 2.6 - 3.0);
    { const rx = x - ex, ry = y - ey, f = eddy * Math.exp(-(rx * rx + ry * ry) / 0.5);
      wx += -ry * f * 2.0; wy += rx * f * 2.0; wz += f * 0.6 * Math.sin(t * 0.7); }
    { const rx = x - ex2, ry = y - ey2, f = eddy2 * Math.exp(-(rx * rx + ry * ry) / 0.4);
      wx += -ry * f * 2.0; wy += rx * f * 2.0; }
    { const rx = x - px0, f = puff * Math.exp(-(rx * rx) / 0.35);
      wy += f; wz += f * (0.6 + pz0); }
    wy += heat * (0.45 + 0.6 * noise3(x * 0.9, t * 0.15, 3.1));
    wy -= m.rain * (0.4 + 0.7 * Math.max(0, Math.sin(y * 3.2 + t * 2.4 + x * 0.8)));      // rain: pulses running down                       // lazy thermals
    if (m.vortex > 0.001) {
      const rx = x, ry = y + 0.05, rz = z, ra = rx * Ax + ry * Ay + rz * Az;
      const px = rx - Ax * ra, py = ry - Ay * ra, pz = rz - Az * ra;
      const r2 = px * px + py * py + pz * pz + 0.1;
      const tx = Ay * pz - Az * py, ty = Az * px - Ax * pz, tz = Ax * py - Ay * px;
      const vxv = (tx * spin) / r2 * 0.5 - px * 2.6 * m.vortex + Ax * lift;
      const vyv = (ty * spin) / r2 * 0.5 - py * 2.6 * m.vortex + Ay * lift;
      const vzv = (tz * spin) / r2 * 0.5 - pz * 2.6 * m.vortex + Az * lift;
      const k = m.vortex;
      wx += (vxv - wx) * k; wy += (vyv - wy) * k; wz += (vzv - wz) * k;
    }
    if (mouse.on) {
      const ddx = x - mouse.x, ddy = y - mouse.y, f = Math.exp(-(ddx * ddx + ddy * ddy) / 0.06);
      wx += mouse.vx * f * 1.4; wy += mouse.vy * f * 1.4; wz -= Math.hypot(mouse.vx, mouse.vy) * f * 0.5;
    }
    air[p] = wx; air[p + 1] = wy; air[p + 2] = wz;
  }
}

// ------------------------------------------------------------------ shaders
const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec3 uSkyTop, uSkyBot;
uniform float uTime, uGlow, uVig;
${NOISE}
void main(){
  vec2 v = vUv - 0.5;
  vec3 c = mix(uSkyBot, uSkyTop, smoothstep(0.0, 1.0, vUv.y)) * (1.0 - dot(v, v) * 0.18 * uVig) + uGlow;
  c += (hash12(gl_FragCoord.xy + fract(uTime * 7.3) * 311.0) - 0.5) * (2.5 / 255.0);
  outColor = vec4(c, 1.0);
}`;

const PROJ = `
uniform vec2 uRes;
uniform float uView;
const float camZ = 3.4, focal = 3.1;
vec4 project(vec3 P){
  vec2 sp = P.xy * focal * uView / max(camZ - P.z, 0.4);
  return vec4(sp.x * uRes.y / uRes.x, sp.y, 0.0, 1.0);
}`;

const CLOTH_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aST;           // position in the sim grid (fractional)
uniform sampler2D uPos;                      // particle positions with a 1-texel ghost border
uniform float uTime, uHeat;
${PROJ}
out vec3 vP, vN, vTs, vTt;
out vec2 vUV;
const int NX = ${NX}, NY = ${NY};
vec3 F(int i, int j){ return texelFetch(uPos, ivec2(i + 1, j + 1), 0).xyz; }
void cr(float x, out vec4 w, out vec4 d){
  float x2 = x * x, x3 = x2 * x;
  w = 0.5 * vec4(-x3 + 2.0 * x2 - x, 3.0 * x3 - 5.0 * x2 + 2.0, -3.0 * x3 + 4.0 * x2 + x, x3 - x2);
  d = 0.5 * vec4(-3.0 * x2 + 4.0 * x - 1.0, 9.0 * x2 - 10.0 * x, -9.0 * x2 + 8.0 * x + 1.0, 3.0 * x2 - 2.0 * x);
}
void main(){
  int i = min(int(floor(aST.x)), NX - 2), j = min(int(floor(aST.y)), NY - 2);
  vec4 wx, dx, wy, dy;
  cr(aST.x - float(i), wx, dx);
  cr(aST.y - float(j), wy, dy);
  vec3 P = vec3(0), Ps = vec3(0), Pt = vec3(0);
  for (int b = 0; b < 4; b++) for (int a = 0; a < 4; a++){
    vec3 q = F(i - 1 + a, j - 1 + b);
    P += wx[a] * wy[b] * q; Ps += dx[a] * wy[b] * q; Pt += wx[a] * dy[b] * q;
  }
  P.y += uHeat * 0.006 * sin(P.x * 38.0 + uTime * 5.0) * sin(P.y * 23.0 - uTime * 3.0);   // heat haze
  vP = P; vTs = Ps; vTt = Pt; vN = cross(Ps, Pt);
  vUV = aST / vec2(float(NX - 1), float(NY - 1));
  gl_Position = project(P);
}`;

const CLOTH_FS = `#version 300 es
precision highp float;
in vec3 vP, vN, vTs, vTt;
in vec2 vUV;
out vec4 outColor;
uniform vec3 uC1, uC2, uC3, uC4, uSky;          // zenith, middle, horizon, sheen
uniform float uMap, uSheen, uStars;
uniform vec4 uM0, uM1, uM2;                   // wind gust rain snow | cloud temp storm fog | vortex day humid -
uniform float uTime, uFlash, uAlpha;
uniform vec2 uFlashUV;
uniform vec4 uBolt[28];                        // lightning path through the cloth, in uv (x0, y0, x1, y1)
uniform float uBoltB[28], uBoltI;
uniform int uBoltN;
${NOISE}
const vec3 CAM = vec3(0.0, 0.0, 3.4);
const float NWARP = 400.0, NWEFT = 330.0;

// a soft round glint in some cells of a grid, sized in screen pixels so it is never blocky; it twinkles
float sparkle(vec2 uv, vec2 grid, float density, float rPx, float seed, vec2 pxs){
  vec2 g = uv * grid, c = floor(g);
  vec2 p = vec2(hash12(c + seed + 1.7), hash12(c + seed + 4.3)) * 0.7 + 0.15;
  vec2 d = (fract(g) - p) / grid / max(pxs, vec2(1e-6));
  float disc = smoothstep(rPx, rPx * 0.2, length(d)) * step(hash12(c + seed), density);
  float tw = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(uTime * (0.8 + 2.4 * hash12(c + seed + 9.1)) + 6.28 * hash12(c + seed + 2.2)), 3.0);
  return disc * tw;
}

// coverage of a thread of half-width hw in a repeating cell, box-filtered so it never shimmers
float thread(float x, float hw){
  float fw = fwidth(x);
  float d = abs(fract(x) - 0.5);
  float s = 1.0 - smoothstep(hw - fw * 0.6, hw + fw * 0.6, d);
  return mix(s, min(2.0 * hw, 1.0), smoothstep(0.35, 0.8, fw));
}

void main(){
  float rain = uM0.z, snow = uM0.w, temp = uM1.y, storm = uM1.z, fog = uM1.w, humid = uM2.z, load = uM2.w;
  float heat = smoothstep(0.72, 1.0, temp), dry = 1.0 - humid;
  vec2 uv = vUV;
  vec2 pxs = fwidth(uv);                                // uv per screen pixel (for crisp, round glints)

  // ---- silk: no visible weave, just faint fibre streaks running down the cloth (like real silk slubs)
  float side = min(uv.x, 1.0 - uv.x);
  float fibre = 0.86 + 0.14 * snoise(vec2(uv.x * 140.0, uv.y * 3.0)) + 0.06 * snoise(vec2(uv.x * 37.0, uv.y * 1.3 + 4.0));
  float hem = smoothstep(0.012, 0.0, min(min(uv.y, 1.0 - uv.y), side));
  float cover = clamp(fibre, 0.0, 1.0);

  // ---- heat: the edges smoulder and burn away
  if (heat > 0.01){
    float e = min(side, min(uv.y, 1.0 - uv.y) * 1.2);
    float burn = heat * (0.035 + 0.05 * (0.5 + 0.5 * snoise(uv * vec2(7.0, 6.0) + vec2(0.0, uTime * 0.05))));
    if (e < burn) discard;
    hem = max(hem, 0.0);
  }

  // ---- light: anisotropic sheen along each thread family, two colours = shot silk
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(CAM - vP);
  float facing = abs(dot(N, V)), graze = 1.0 - facing;
  vec3 L = normalize(vec3(-0.35, 0.85, 0.45));
  vec3 Hh = normalize(L + V);
  // a broad, soft sheen along the warp — satin glow rather than glossy highlights
  float tw = dot(normalize(vTt), Hh);
  float sheen = pow(sqrt(max(0.0, 1.0 - tw * tw)), 10.0);
  float NL = dot(N, L);
  float lit = 0.72 + 0.28 * abs(NL);
  float through = max(0.0, -NL);                         // light shining through from behind
  // the sky's gradient, by height in the sky (or along the cloth); turning the cloth shifts it a little, like shot silk
  float h = mix(clamp((vP.y + 1.15) / 2.3, 0.0, 1.0), 1.0 - uv.y, uMap);
  h = clamp(h + 0.14 * (graze - 0.3) + 0.04 * sin(uv.x * 5.0 + uTime * 0.2), 0.0, 1.0);
  vec3 col = h < 0.5 ? mix(uC3, uC2, smoothstep(0.0, 0.5, h)) : mix(uC2, uC1, smoothstep(0.5, 1.0, h));
  col = col * lit + col * through * 0.15;
  col = mix(col, uC4, sheen * 0.22 * uSheen * (1.0 - 0.5 * fog));
  col *= 1.0 + 0.12 * hem;

  float a = uAlpha * cover * (mix(0.22, 0.3, humid) + 0.5 * graze * graze + 0.08 * sheen) + 0.12 * hem;

  // ---- rain: fine glinting threads of light slide down the cloth; the wet lower part goes darker and clingier
  if (rain > 0.01){
    col *= 1.0 - 0.18 * rain * smoothstep(0.3, 1.0, uv.y);
    a *= 1.0 + 0.5 * rain * smoothstep(0.3, 1.0, uv.y);
    float cols = 90.0, cx = floor(uv.x * cols);
    if (hash11(cx * 1.37 + 0.3) < 0.32){
      float xc = (cx + 0.2 + 0.6 * hash11(cx * 7.7)) / cols;
      float line = smoothstep(1.1, 0.2, abs(uv.x - xc) / max(pxs.x, 1e-6));
      float seg = fract(uv.y * 1.4 - uTime * (0.16 + 0.22 * hash11(cx * 3.1)) + hash11(cx * 5.3));
      float env = smoothstep(0.0, 0.2, seg) * smoothstep(0.55, 0.25, seg);
      float glit = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uv.y * 640.0 + cx * 17.0 - uTime * 3.0), 6.0);
      float r = line * env * glit * rain;
      col += mix(uC4, vec3(0.82, 0.92, 1.0), 0.5) * r * 0.8;
      a = max(a, r * 0.4);
    }
  }
  // ---- snow: the cloth goes white and sparkles; settled snow whitens the upper folds
  if (snow > 0.01){
    col = mix(col, vec3(0.97, 0.98, 1.0), snow * 0.3 + load * 0.55 * smoothstep(0.15, 0.85, abs(N.y)));
    a += load * 0.2 * smoothstep(0.3, 0.9, abs(N.y));
    // glitter drifting slowly down the cloth, swaying a little — like snow still falling through it
    vec2 fall1 = uv + vec2(0.006 * sin(uTime * 0.7 + uv.y * 9.0), -uTime * 0.022);
    vec2 fall2 = uv + vec2(0.004 * sin(uTime * 1.1 + uv.y * 13.0 + 2.0), -uTime * 0.034);
    float sp = sparkle(fall1, vec2(60.0, 46.0), 0.5, 2.3, 3.0, pxs) + 0.8 * sparkle(fall2, vec2(120.0, 95.0), 0.35, 1.4, 11.0, pxs)
             + 0.6 * sparkle(uv, vec2(90.0, 70.0), 0.12, 2.8, 17.0, pxs) * step(0.75, fract(uTime * 0.9 + hash12(floor(uv * vec2(90.0, 70.0)))));
    sp *= snow;
    col += vec3(1.0) * sp * 1.3;
    a = max(a, sp * 0.75);
  }
  // ---- storm: irregular electric veins all through the cloth; lightning lights it from the strike point outward
  if (storm > 0.01){
    vec2 q = uv * vec2(3.0, 2.4);
    vec2 w = vec2(snoise(q * 1.3 + vec2(uTime * 0.07, 1.7)), snoise(q * 1.3 + vec2(4.1, -uTime * 0.06)));
    float n1 = snoise(q + 0.8 * w + vec2(uTime * 0.12, -uTime * 0.2));
    float n2 = snoise(q * 2.3 - 1.1 * w + vec2(-uTime * 0.18, uTime * 0.1) + 7.0);
    float vein = max(pow(1.0 - abs(n1), 46.0), 0.75 * pow(1.0 - abs(n2), 70.0)) * storm;
    vein *= 0.35 + 0.65 * step(0.45, fract(uTime * 3.7 + n1 * 2.0));
    col += uC4 * vein * (0.18 + 0.5 * uFlash);
    a = max(a, clamp(vein * (0.1 + 0.2 * uFlash), 0.0, 0.9) * max(cover, 0.3));
    // the whole cloth blooms with the flash
    float fl = uFlash * storm * (0.18 + 0.9 * exp(-distance(uv, uFlashUV) * 3.0));
    col = mix(col, vec3(0.92, 0.9, 1.0), clamp(fl, 0.0, 1.0) * 0.6);
    a = max(a, clamp(fl * 0.5, 0.0, 0.8));
    // the bolt itself: a jagged, forking path through the fabric, white-hot core and violet glow
    if (uBoltI > 0.002){
      float core = 0.0, glow = 0.0;
      for (int k = 0; k < 28; k++){
        if (k >= uBoltN) break;
        vec2 pa = uv - uBolt[k].xy, ba = uBolt[k].zw - uBolt[k].xy;
        float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
        float dd = length((pa - ba * hh) / max(pxs, vec2(1e-6)));
        float wpx = 1.2 + 2.4 * uBoltB[k];                    // the main channel is thicker than its forks
        core = max(core, uBoltB[k] * smoothstep(wpx, wpx * 0.3, dd));
        glow = max(glow, uBoltB[k] * (exp(-dd / 14.0) * 0.8 + exp(-dd / 60.0) * 0.45));
      }
      float bi = min(uBoltI, 1.6);
      col += mix(uC4, vec3(0.8, 0.75, 1.0), 0.5) * glow * bi * 2.0;
      col = mix(col, vec3(1.0, 0.98, 1.0), clamp(core * bi, 0.0, 1.0));
      a = max(a, clamp(core * bi + glow * bi * 0.55, 0.0, 1.0));
    }
  }
  // ---- heat: embers crawl up the cloth, burning edges glow
  if (heat > 0.01){
    float ember = pow(max(0.0, snoise(vec2(uv.x * 7.0, uv.y * 5.0 + uTime * 0.25))), 2.5) * heat;
    float e = min(side, min(uv.y, 1.0 - uv.y) * 1.2);
    float burn = heat * (0.035 + 0.05 * (0.5 + 0.5 * snoise(uv * vec2(7.0, 6.0) + vec2(0.0, uTime * 0.05))));
    float rim = smoothstep(burn + 0.03, burn, e) * heat;
    col = col * (1.0 + 0.05 * heat) + mix(uC2, uC3, 0.5) * ember * 0.9;
    col = mix(col, mix(uC4, uC3, 0.5 * rim) * 1.25, rim * 0.8);
    a = max(a, ember * 0.45 + rim * 0.95);
  }
  // ---- clear night: stars twinkle in the cloth
  if (uStars > 0.01){
    float st = sparkle(uv, vec2(54.0, 40.0), 0.16, 1.05, 21.0, pxs) * uStars;
    col += vec3(1.0, 0.98, 0.94) * st * 1.2;
    a = max(a, st * 0.8);
  }
  // ---- fog: the edges dissolve into the mist
  a *= mix(1.0, smoothstep(0.0, 0.24, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y))), fog);
  // ---- fog: it melts into the sky; distance haze
  col = mix(col, uSky + 0.12, fog * 0.45);
  a *= 1.0 - 0.45 * fog;
  col = mix(col, uSky, clamp(-vP.z * 0.2, 0.0, 0.3));

  a = clamp(a, 0.0, 1.0);
  outColor = vec4(col * a, a);
}`;

const LINE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aP;
${PROJ}
void main(){ gl_Position = project(aP); }`;
const LINE_FS = `#version 300 es
precision highp float;
uniform vec4 uCol;
out vec4 outColor;
void main(){ outColor = vec4(uCol.rgb * uCol.a, uCol.a); }`;

// ------------------------------------------------------------------ GL setup
const canvas = document.querySelector('canvas');
const gl = getGL(canvas, { antialias: true });
const skyP = makeProgram(gl, FS_VS, SKY_FS);
const clothP = makeProgram(gl, CLOTH_VS, CLOTH_FS);
const lineP = makeProgram(gl, LINE_VS, LINE_FS);
const tri = fullscreen(gl);

// render grid: each sim cell subdivided, evaluated as a Catmull-Rom surface in the vertex shader
const SUB = 4, RX = (NX - 1) * SUB + 1, RY = (NY - 1) * SUB + 1;
const st = new Float32Array(RX * RY * 2);
for (let j = 0; j < RY; j++) for (let i = 0; i < RX; i++) { st[(j * RX + i) * 2] = i / SUB; st[(j * RX + i) * 2 + 1] = j / SUB; }
const ix = new Uint32Array((RX - 1) * (RY - 1) * 6);
let n6 = 0;
for (let j = 0; j < RY - 1; j++) for (let i = 0; i < RX - 1; i++) {
  const a = j * RX + i, b = a + 1, c = a + RX, d = c + 1;
  ix[n6++] = a; ix[n6++] = c; ix[n6++] = b; ix[n6++] = b; ix[n6++] = c; ix[n6++] = d;
}
const clothVAO = gl.createVertexArray();
gl.bindVertexArray(clothVAO);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, st, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ix, gl.STATIC_DRAW);

const ROPE_SEG = 18;
const ropeData = new Float32Array(10 * ROPE_SEG * 2 * 3);
const ropeVAO = gl.createVertexArray();
gl.bindVertexArray(ropeVAO);
const ropeBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, ropeBuf);
gl.bufferData(gl.ARRAY_BUFFER, ropeData.byteLength, gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

const TEXW = NX + 2, TEXH = NY + 2;
const texData = new Float32Array(TEXW * TEXH * 4);
const posTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, posTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, TEXW, TEXH);
function ext(i, j, q) {             // positions extrapolated one cell past the edges (smooth borders)
  if (i < 0) return 2 * ext(0, j, q) - ext(1, j, q);
  if (i >= NX) return 2 * ext(NX - 1, j, q) - ext(NX - 2, j, q);
  if (j < 0) return 2 * ext(i, 0, q) - ext(i, 1, q);
  if (j >= NY) return 2 * ext(i, NY - 1, q) - ext(i, NY - 2, q);
  return pos[id(i, j) * 3 + q];
}
function uploadCloth() {
  for (let j = -1; j <= NY; j++) for (let i = -1; i <= NX; i++) {
    const o = ((j + 1) * TEXW + (i + 1)) * 4;
    const inside = i >= 0 && i < NX && j >= 0 && j < NY;
    for (let q = 0; q < 3; q++) texData[o + q] = inside ? pos[id(i, j) * 3 + q] : ext(i, j, q);
  }
  gl.bindTexture(gl.TEXTURE_2D, posTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TEXW, TEXH, gl.RGBA, gl.FLOAT, texData);
}
function buildRopes() {
  let o = 0;
  if (pole !== null) { ropeData.set([pole, SKY_Y, 0, pole, -SKY_Y, 0], 0); o = 6; }
  for (const r of ropes) {
    if (r.hidden) continue;
    let ex, ey, ez;
    if (r.uv && r.loose) {        // torn loose: it dangles from the edge of the sky and swings
      ex = r.a[0] + 0.25 * Math.sin(W.time * 1.7 + r.ph); ey = r.a[1] - Math.min(r.L, 1.4) * 0.75; ez = r.a[2] + 0.2 * Math.cos(W.time * 1.3 + r.ph);
    } else if (r.uv) {
      tieAt(r.uv[0], r.uv[1]); ex = ey = ez = 0;
      for (let q = 0; q < 4; q++) { const k = TIEI[q], w = TIEW[q]; ex += pos[k] * w; ey += pos[k + 1] * w; ez += pos[k + 2] * w; }
    } else { const k = r.p * 3; ex = pos[k]; ey = pos[k + 1]; ez = pos[k + 2]; }
    const d = Math.hypot(ex - r.a[0], ey - r.a[1], ez - r.a[2]);
    const sag = Math.sqrt(Math.max(0, r.L * r.L - d * d)) * 0.45;
    let px, py, pz;
    for (let s = 0; s <= ROPE_SEG; s++) {
      const t = s / ROPE_SEG;
      const x = r.a[0] + (ex - r.a[0]) * t, y = r.a[1] + (ey - r.a[1]) * t - sag * 4 * t * (1 - t), z = r.a[2] + (ez - r.a[2]) * t;
      if (s > 0) { ropeData.set([px, py, pz, x, y, z], o); o += 6; }
      px = x; py = y; pz = z;
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, ropeBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, ropeData, 0, o);
  return o / 3;
}

// ------------------------------------------------------------------ tweaks
const TW_DEFAULT = { followTime: true, hour: 18, bg: 'grey', bgColor: '#1d2230', map: 'cloth', size: 1.15, sheer: 0.95, sheen: 0.9,
  stars: true, whimsy: 1.85, wind: 1, weight: 1.2, strings: true, hang: 'web', webStrings: 6 };
const TW = { ...TW_DEFAULT };
try { Object.assign(TW, JSON.parse(localStorage.getItem('skyfabric:tweaks') || '{}')); } catch {}
const EMBED = new URLSearchParams(location.search).has('embed');   // a cell in grid.html: no UI, never saves
const saveTweaks = () => { if (EMBED) return; try { localStorage.setItem('skyfabric:tweaks', JSON.stringify(TW)); } catch {} };
const flat = (c) => ({ top: c, bot: c, mid: c });
function backgroundFor(w) {
  switch (TW.bg) {
    case 'black': return flat([0.02, 0.02, 0.024]);
    case 'paper': return { top: hex('#f1eee8'), bot: hex('#e3ded5'), mid: hex('#eae6de') };
    case 'white': return flat([1, 1, 1]);
    case 'dimsky': { const c = w.pal.c; return { top: c[0].map((v) => v * 0.35), bot: c[2].map((v) => v * 0.35), mid: c[1].map((v) => v * 0.35) }; }
    case 'custom': return flat(hex(TW.bgColor));
    default: return w.sky;
  }
}

// ------------------------------------------------------------------ lightning: a new path through the cloth every strike
const MAXSEG = 28;
const bolt = { seg: new Float32Array(MAXSEG * 4), bright: new Float32Array(MAXSEG), n: 0 };
function makeBolt() {
  const R = Math.random;
  // enter from the top or a side, leave through another edge: every strike takes its own route
  const edges = [() => [0.1 + 0.8 * R(), 0.0], () => [0.0, 0.1 + 0.6 * R()], () => [1.0, 0.1 + 0.6 * R()], () => [0.1 + 0.8 * R(), 1.0]];
  const e0 = R() < 0.6 ? 0 : 1 + Math.floor(R() * 2);
  let e1; do { e1 = Math.floor(R() * 4); } while (e1 === e0);
  const segs = [], add = (a, b, br) => { if (segs.length < MAXSEG) segs.push([a[0], a[1], b[0], b[1], br]); };
  const walk = (a, b, steps, jag, br, branches) => {
    let p = a;
    const dx = (b[0] - a[0]) / steps, dy = (b[1] - a[1]) / steps, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    for (let k = 1; k <= steps; k++) {
      const off = k === steps ? 0 : (R() - 0.5) * 2 * jag;
      const q = [a[0] + dx * k + nx * off, a[1] + dy * k + ny * off];
      add(p, q, br);
      if (branches > 0 && k < steps - 1 && R() < 0.35) {        // a fork splits off and dies out
        const ang = Math.atan2(dy, dx) + (R() < 0.5 ? -1 : 1) * (0.5 + 0.7 * R()), l = len * (2 + 2 * R());
        walk(q, [q[0] + Math.cos(ang) * l, q[1] + Math.sin(ang) * l], 3 + Math.floor(R() * 2), jag * 0.6, br * 0.55, branches - 1);
      }
      p = q;
    }
  };
  walk(edges[e0](), edges[e1](), 9 + Math.floor(R() * 4), 0.05, 1, 2);
  bolt.n = segs.length;
  segs.forEach((s, i) => { bolt.seg.set(s.slice(0, 4), i * 4); bolt.bright[i] = s[4]; });
  return segs;
}

// ------------------------------------------------------------------ state
const W = {
  hours: Array.from({ length: 13 }, () => ({ mood: { ...CALM }, obs: obsFromMood(CALM) })),
  place: '', pos: 0, target: 0,
  cur: { ...CALM }, pal: paletteFor(CALM, 35), bg: flat([0.4, 0.4, 0.4]), elev: 35, sky: skyFor(35, CALM), lat: 40.7, lon: -74, snowLoad: 0,
  time: 0, gustNow: 0,
  flash: 0, flashUV: [0.5, 0.5], nextStrike: 2, pulses: [],
};
function sampleHours(p) {
  const i = Math.min(11, Math.floor(p)), f = p - i, a = W.hours[i].mood, b = W.hours[i + 1].mood;
  const o = {}; for (const key of KEYS) o[key] = a[key] + (b[key] - a[key]) * f; return o;
}
function sampleSun(p) {
  const i = Math.min(11, Math.floor(p)), f = p - i;
  return (W.hours[i].sun ?? 35) * (1 - f) + (W.hours[i + 1].sun ?? 35) * f;
}
function withSun(hours, lat, lon, baseMs) {
  for (let h = 0; h < hours.length; h++) {
    const t = hours[h].obs.time ? Date.parse(hours[h].obs.time) : NaN;
    const ms = isNaN(t) ? baseMs + h * 3600e3 : t;
    hours[h].sun = sunElevation(ms, lat, lon);
    if (!hours[h].obs.time) hours[h].obs.time = new Date(ms).toISOString();
  }
  return hours;
}
function setHours(hours, instant) {
  W.hours = hours;
  if (instant) W.cur = { ...sampleHours(W.pos) };
}
function update(dt) {
  W.time += dt;
  W.pos += (W.target - W.pos) * (1 - Math.exp(-dt * 2.2));
  const goal = sampleHours(W.pos);
  const a = 1 - Math.exp(-dt * 1.4);
  for (const key of KEYS) W.cur[key] += (goal[key] - W.cur[key]) * a;
  if (TW.followTime) W.elev = sampleSun(W.pos);
  else { const d = new Date(); d.setHours(0, 0, 0, 0); W.elev = sunElevation(d.getTime() + (TW.hour + W.pos) * 3600e3, W.lat, W.lon); }
  W.sky = skyFor(W.elev, W.cur);
  W.bg = backgroundFor(W);
  W.pal = paletteFor(W.cur, W.elev);
  const m = W.cur, t = W.time;
  W.gustNow = Math.max(0, Math.sin(t * 0.61) * Math.sin(t * 1.73 + 1.3) + 0.25 * Math.sin(t * 3.1));
  if (m.storm > 0.05 && t > W.nextStrike) {
    const R = Math.random;
    W.pulses = [{ at: t, a: 1 }, { at: t + 0.06, a: 0.35 }, { at: t + 0.15 + R() * 0.06, a: 1.1 }, { at: t + 0.32 + R() * 0.12, a: 0.6 }];
    if (R() < 0.35) W.pulses.push({ at: t + 0.55 + R() * 0.2, a: 0.8 });   // sometimes it re-strikes along the same path
    W.boltAt = t;
    const segs = makeBolt();
    W.flashUV = [segs[0][0], segs[0][1]];
    W.nextStrike = t + (1.2 + R() * 3.8) / Math.max(m.storm, 0.15);
    // the strike jolts the cloth all along its path
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const u = i / (NX - 1), v = j / (NY - 1);
      let d2 = 1;
      for (const sg of segs) {
        const bx = sg[2] - sg[0], by = sg[3] - sg[1], h = Math.max(0, Math.min(1, ((u - sg[0]) * bx + (v - sg[1]) * by) / (bx * bx + by * by + 1e-9)));
        d2 = Math.min(d2, (u - sg[0] - bx * h) ** 2 + (v - sg[1] - by * h) ** 2);
      }
      const f = Math.exp(-d2 / 0.003) * 0.03 * m.storm, k = id(i, j) * 3;
      prv[k + 2] -= f * (R() < 0.5 ? -1 : 1); prv[k + 1] -= f * 0.4 * (R() - 0.5);
    }
  } else if (m.storm <= 0.05) W.nextStrike = Math.max(W.nextStrike, t + 1);
  W.flash = W.pulses.reduce((v, p) => v + (t >= p.at ? p.a * Math.exp(-(t - p.at) * 12) : 0), 0);
  W.boltI = (W.flash + (W.boltAt != null ? 0.18 * Math.exp(-(t - W.boltAt) * 1.6) : 0)) * clamp01(m.storm * 1.5);   // flicker, then an afterglow

  const heat = ss(0.72, 1, m.temp);
  W.snowLoad = clamp01(W.snowLoad + dt * (0.05 * m.snow - (0.02 + 0.3 * m.gust * W.gustNow + 0.05 * heat + 0.02 * m.wind) * W.snowLoad));
  const massF = 1 + 0.1 * m.humid + 0.3 * m.rain + 0.4 * m.snow;
  moveAnchors(dt, m);
  airField(m, t, W.gustNow);
  simulate(dt, {
    timeScale: (1 - 0.5 * heat) * (1 - 0.2 * m.snow) * (1 - 0.15 * m.fog),
    aero: 1.6 / massF, drag: 0.12 / massF, g: TW.weight * (1.1 + 1.5 * m.rain + 1.2 * m.snow + 2.5 * W.snowLoad - 0.8 * m.fog),
    damp: 0.9995 - 0.012 * heat - 0.004 * m.fog - 0.003 * m.rain,
    bend: 0.002 + 0.3 * m.snow + 0.08 * m.vortex,
  });
  mouse.vx *= Math.exp(-dt * 4); mouse.vy *= Math.exp(-dt * 4);
}

// ------------------------------------------------------------------ render
let viewScale = 1;
loop((dt) => {
  update(dt);
  scrubIdle(dt);
  fitCanvas(canvas, Math.min(devicePixelRatio, LITE ? 1.25 : 2));
  gl.viewport(0, 0, canvas.width, canvas.height);
  const m = W.cur, p = W.pal, aspect = canvas.width / canvas.height;
  viewScale = Math.min(1, aspect * 0.78);

  gl.disable(gl.BLEND);
  skyP.use();
  gl.uniform3fv(skyP.u.uSkyTop, W.bg.top);
  gl.uniform3fv(skyP.u.uSkyBot, W.bg.bot);
  gl.uniform1f(skyP.u.uTime, W.time);
  gl.uniform1f(skyP.u.uVig, TW.bg === 'white' ? 0 : 1);   // pure white must meet the page with no seam
  gl.uniform1f(skyP.u.uGlow, W.flash * m.storm * 0.07);
  tri.draw();

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  // strings up to the sky
  const nv = buildRopes();
  const lu = lineP.use().u;
  gl.uniform2f(lu.uRes, canvas.width, canvas.height);
  gl.uniform1f(lu.uView, viewScale);
  const light = W.bg.mid[1] > 0.6;                       // on a pale background the strings need to be darker to show
  const rc = mixc(light ? mixc(p.c[1], [0.25, 0.26, 0.3], 0.45) : mixc(p.c[3], W.bg.mid, 0.35), [1, 1, 1], clamp01(W.flash * m.storm));
  gl.uniform4f(lu.uCol, rc[0], rc[1], rc[2], 0.55 * (1 - 0.8 * m.fog) + 0.4 * clamp01(W.flash * m.storm));
  gl.bindVertexArray(ropeVAO);
  if (TW.strings) gl.drawArrays(gl.LINES, 0, nv);

  uploadCloth();
  const u = clothP.use().u;
  gl.uniform2f(u.uRes, canvas.width, canvas.height);
  gl.uniform1f(u.uView, viewScale);
  gl.uniform1f(u.uTime, W.time);
  gl.uniform1f(u.uHeat, ss(0.72, 1, m.temp));
  gl.uniform1f(u.uFlash, W.flash);
  gl.uniform2f(u.uFlashUV, W.flashUV[0], W.flashUV[1]);
  gl.uniform4fv(u.uBolt, bolt.seg); gl.uniform1fv(u.uBoltB, bolt.bright);
  gl.uniform1i(u.uBoltN, bolt.n); gl.uniform1f(u.uBoltI, W.boltI || 0);
  gl.uniform4f(u.uM0, m.wind, m.gust, m.rain, m.snow);
  gl.uniform4f(u.uM1, m.cloud, m.temp, m.storm, m.fog);
  gl.uniform4f(u.uM2, m.vortex, m.day, m.humid, W.snowLoad);
  gl.uniform3fv(u.uC1, p.c[0]); gl.uniform3fv(u.uC2, p.c[1]); gl.uniform3fv(u.uC3, p.c[2]); gl.uniform3fv(u.uC4, p.c[3]);
  gl.uniform3fv(u.uSky, W.bg.mid);
  gl.uniform1f(u.uAlpha, TW.sheer * (1 + 0.6 * W.bg.mid[1]));   // a sheer cloth needs a bit more body against a light background
  gl.uniform1f(u.uMap, TW.map === 'cloth' ? 1 : 0);
  gl.uniform1f(u.uSheen, TW.sheen);
  gl.uniform1f(u.uStars, TW.stars ? (1 - ss(-10, -4, W.elev)) * (1 - m.cloud) * (1 - m.rain) * (1 - m.fog) : 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, posTex);
  gl.uniform1i(u.uPos, 0);
  gl.bindVertexArray(clothVAO);
  gl.drawElements(gl.TRIANGLES, ix.length, gl.UNSIGNED_INT, 0);
});

// ------------------------------------------------------------------ interaction + words-on-request
const params = new URLSearchParams(location.search);
const style = document.createElement('style');
style.textContent = `
.ui{position:fixed;inset:0;pointer-events:none;color:#fff;font:300 13px/1.5 Inter,system-ui,sans-serif;text-shadow:0 1px 14px rgba(0,0,0,.3)}
.info{position:absolute;left:clamp(16px,4vw,44px);bottom:clamp(84px,12vh,120px);opacity:0;transform:translateY(6px);transition:opacity .6s,transform .6s;max-width:min(360px,80vw)}
.open .info{opacity:1;transform:none}
.place{font-size:11px;letter-spacing:.18em;text-transform:uppercase;opacity:.75}
.big{display:flex;align-items:baseline;gap:14px;margin:6px 0 2px}
.temp{font:200 54px/1 Inter,system-ui,sans-serif;letter-spacing:-.02em}
.cond{font-size:17px}
.row{opacity:.8;font-variant-numeric:tabular-nums}
.time{position:absolute;left:50%;bottom:clamp(18px,4vh,34px);transform:translateX(-50%);width:min(56vw,460px);opacity:0;transition:opacity .5s}
.open .time,.scrub .time{opacity:.85}
.track{position:relative;height:1px;background:rgba(255,255,255,.35)}
.tick{position:absolute;top:-2px;width:1px;height:5px;background:rgba(255,255,255,.45)}
.dot{position:absolute;top:-4px;width:9px;height:9px;margin-left:-4.5px;border-radius:50%;background:#fff;box-shadow:0 0 12px rgba(255,255,255,.8)}
.lbl{position:absolute;top:-24px;transform:translateX(-50%);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;white-space:nowrap}
.ends{display:flex;justify-content:space-between;margin-top:9px;font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;opacity:.6}
.tw{position:absolute;right:14px;bottom:14px;pointer-events:auto;display:flex;flex-direction:column;align-items:flex-end;gap:8px;text-shadow:none}
.tw .knob{all:unset;cursor:pointer;color:#fff;font:400 10.5px/1 Inter,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;padding:7px 11px;border-radius:999px;background:rgba(0,0,0,.22);backdrop-filter:blur(8px);opacity:.7}
.tw .knob:hover,.tw.on .knob{opacity:1}
.tw .panel{display:none;width:250px;max-height:calc(100vh - 70px);overflow:auto;padding:12px 14px 14px;border-radius:14px;background:rgba(18,18,22,.62);backdrop-filter:blur(14px);font:400 11.5px/1.3 Inter,system-ui,sans-serif;color:#eee}
.tw.on .panel{display:block}
.tw h4{margin:12px 0 6px;font:500 9.5px/1 Inter,system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;opacity:.55}
.tw h4:first-child{margin-top:2px}
.tw label{display:grid;grid-template-columns:78px 1fr 34px;align-items:center;gap:8px;margin:5px 0}
.tw label.chk{grid-template-columns:1fr auto}
.tw output{font-variant-numeric:tabular-nums;opacity:.7;text-align:right;font-size:10.5px}
.tw select,.tw input[type=color]{grid-column:2 / 4;width:100%;background:rgba(255,255,255,.08);color:#eee;border:1px solid rgba(255,255,255,.14);border-radius:7px;padding:4px 6px;font:inherit}
.tw input[type=color]{height:24px;padding:1px 2px}
.tw select option{background:#222}
.tw input[type=range]{width:100%;accent-color:#ddd}
.tw .reset{all:unset;cursor:pointer;color:inherit;margin-top:10px;font-size:10.5px;opacity:.6;text-decoration:underline}
.tw .reset:hover{opacity:1}
.tw .hide{display:none}
`;
document.head.appendChild(style);
const ui = document.createElement('div');
ui.className = 'ui';
ui.innerHTML = `<div class="info"></div>
  <div class="time"><div class="track">${Array.from({ length: 13 }, (_, i) => `<i class="tick" style="left:${(i / 12) * 100}%"></i>`).join('')}<i class="dot"></i><span class="lbl"></span></div><div class="ends"><span>now</span><span>+12h</span></div></div>
  <div class="tw"><div class="panel"></div><button class="knob">Tweaks</button></div>`;
document.body.append(ui);
const $ = (s) => ui.querySelector(s);

const imperial = (navigator.language || '').toLowerCase() === 'en-us';
const fT = (c) => `${Math.round(imperial ? c * 9 / 5 + 32 : c)}°`;
const fW = (k) => (imperial ? `${Math.round(k * 0.621)} mph` : `${Math.round(k)} km/h`);
const C8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const fD = (d) => (d == null ? '' : ` from the ${C8[Math.round((((d % 360) + 360) % 360) / 45) % 8]}`);
const hourLabel = (h) => {
  const iso = W.hours[h]?.obs?.time;
  if (h === 0) return 'now';
  if (!iso) return `+${h}h`;
  const d = new Date(iso);
  return isNaN(d) ? `+${h}h` : d.toLocaleTimeString([], { hour: 'numeric' });
};
let shownHour = -1;
function renderInfo(force) {
  const h = Math.round(W.pos);
  $('.dot').style.left = `${(W.pos / 12) * 100}%`;
  $('.lbl').style.left = `${(W.pos / 12) * 100}%`;
  if (h === shownHour && !force) return;
  shownHour = h;
  $('.lbl').textContent = hourLabel(h);
  const o = W.hours[h].obs;
  $('.info').innerHTML = `<div class="place">${W.place}</div>
    <div class="big"><span class="temp">${fT(o.temp)}</span><span class="cond">${o.label}</span></div>
    <div class="row">Wind ${fW(o.wind)}${fD(o.dir)} · gusts ${fW(o.gust)} · humidity ${Math.round(o.humidity)}%</div>`;
}

// pointer → world (on the z = 0 plane), so moving over the sky stirs the air
function toWorld(cx, cy) {
  const r = canvas.getBoundingClientRect();
  const nx = ((cx - r.left) / r.width) * 2 - 1, ny = 1 - ((cy - r.top) / r.height) * 2;
  const k = 3.4 / (3.1 * viewScale);
  return [nx * (r.width / r.height) * k, ny * k];
}
let lastMove = 0;
canvas.addEventListener('pointermove', (e) => {
  const [x, y] = toWorld(e.clientX, e.clientY), now = performance.now() / 1000, dtm = Math.max(1 / 120, now - lastMove);
  if (mouse.on && dtm < 0.2) {
    const k = 0.5;
    mouse.vx += ((x - mouse.x) / dtm - mouse.vx) * k; mouse.vy += ((y - mouse.y) / dtm - mouse.vy) * k;
    const sp = Math.hypot(mouse.vx, mouse.vy); if (sp > 7) { mouse.vx *= 7 / sp; mouse.vy *= 7 / sp; }
  }
  mouse.x = x; mouse.y = y; mouse.on = true; lastMove = now;
});
canvas.addEventListener('pointerleave', () => { mouse.on = false; });

// drag (or scroll) sideways to move through the next 12 hours
let down = null, scrubbing = false, idle = 0;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, pos: W.target }; scrubbing = false; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!down) return;
  const dx = e.clientX - down.x;
  if (!scrubbing && Math.abs(dx) > 6) { scrubbing = true; document.body.classList.add('scrub'); }
  if (scrubbing) { W.target = clamp01((down.pos + (dx / Math.min(innerWidth, 900)) * 12) / 12) * 12; idle = 0; }
});
canvas.addEventListener('pointerup', () => {
  if (down && !scrubbing) document.body.classList.toggle('open');
  down = null; scrubbing = false; idle = 0;
  setTimeout(() => !down && document.body.classList.remove('scrub'), 1200);
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  W.target = Math.max(0, Math.min(12, W.target + (e.deltaX || e.deltaY) * 0.012));
  idle = 0;
  document.body.classList.add('scrub');
  clearTimeout(canvas._wt); canvas._wt = setTimeout(() => document.body.classList.remove('scrub'), 1400);
}, { passive: false });
function scrubIdle(dt) {
  idle += dt;
  if (!down && idle > 7 && W.target > 0) W.target = 0;   // drift back to now
  renderInfo(false);
}

// weather sources: live, or a preset (presets ramp from "now" to "soon" over the hours)
let current = params.get('mood') || 'live', first = true;
const presetHours = (key) => {
  const p = PRESETS[key], soon = p.soon || p.now;
  return Array.from({ length: 13 }, (_, h) => {
    const t = ss(2, 8, h), mood = {};
    for (const k2 of KEYS) mood[k2] = p.now[k2] + (soon[k2] - p.now[k2]) * t;
    return { mood, obs: obsFromMood(mood) };
  });
};
const here = { lat: 40.7, lon: -new Date().getTimezoneOffset() / 4 };   // presets: your time zone, a mid latitude
function presetStart(key) {
  const d = new Date();
  d.setHours(params.has('at') ? +params.get('at') : PRESETS[key]?.now.day === 0 ? 21 : 15, 0, 0, 0);
  return d.getTime();
}
async function load(key) {
  current = key;
  markMenu();
  if (key !== 'live' && PRESETS[key]) {
    W.place = PRESETS[key].label;
    W.lat = here.lat; W.lon = here.lon;
    setHours(withSun(presetHours(key), here.lat, here.lon, presetStart(key)), first); first = false;
    renderInfo(true);
    return;
  }
  try {
    const w = await loadLive(params);
    if (current !== key) return;
    W.place = w.info.place;
    W.lat = w.info.lat; W.lon = w.info.lon;
    setHours(withSun(w.hours, w.info.lat, w.info.lon, Date.now()), first); first = false;
  } catch (e) {
    console.warn('live weather unavailable', e);
    if (current !== key) return;
    W.place = 'Offline';
    setHours(withSun(presetHours('overcast'), here.lat, here.lon, Date.now()), first); first = false;
  }
  renderInfo(true);
}

// ---- the Tweaks panel (collapsible, remembered in this browser)
const panel = $('.panel');
const opt = (v, l) => `<option value="${v}">${l}</option>`;
const slider = (k, l, min, max, step) => `<label>${l}<input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}"><output data-o="${k}"></output></label>`;
const check = (k, l) => `<label class="chk">${l}<input type="checkbox" data-k="${k}"></label>`;
const fmtHour = (h) => { const d = new Date(); d.setHours(0, 0, 0, 0); return new Date(d.getTime() + h * 3600e3).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
panel.innerHTML = `
  <h4>Weather</h4>
  <label>Forecast<select data-x="mood">${PRESET_ORDER.map((k) => opt(k, k === 'live' ? 'Live, here' : PRESETS[k].label)).join('')}</select></label>
  <label>Hang<select data-x="hang">${Object.keys(HANGS).map((k) => opt(k, HANGS[k].label)).join('')}</select></label>
  <label class="webRow">Strings<input type="range" data-k="webStrings" min="4" max="8" step="1"><output data-o="webStrings"></output></label>
  <h4>Light</h4>
  ${check('followTime', 'Time of day follows the forecast')}
  <label class="timeRow">Time<input type="range" data-k="hour" min="0" max="24" step="0.25"><output data-o="hour"></output></label>
  <label>Cloth colour<select data-k="map">${opt('height', 'Sky by height')}${opt('cloth', 'Sky along the cloth')}</select></label>
  ${check('stars', 'Stars on clear nights')}
  <h4>Background</h4>
  <label>Behind<select data-k="bg">${opt('grey', 'Grey, by time of day')}${opt('black', 'Black')}${opt('white', 'White')}${opt('paper', 'Paper')}${opt('dimsky', 'Dim sky')}${opt('custom', 'Colour…')}</select></label>
  <label class="bgColor">Colour<input type="color" data-k="bgColor"></label>
  <h4>Cloth</h4>
  ${slider('size', 'Size', 0.6, 1.6, 0.05)}
  ${slider('sheer', 'Opacity', 0.4, 2.2, 0.05)}
  ${slider('sheen', 'Sheen', 0, 3, 0.05)}
  ${check('strings', 'Show strings')}
  <h4>Motion</h4>
  ${slider('whimsy', 'Whimsy', 0, 2.5, 0.05)}
  ${slider('wind', 'Wind', 0, 2, 0.05)}
  ${slider('weight', 'Weight', 0.2, 3, 0.05)}
  <button class="reset">Reset tweaks</button> &nbsp; <a class="reset" href="grid.html" target="_blank" rel="noopener">Every weather in a grid ↗</a>`;
function syncPanel() {
  for (const el of panel.querySelectorAll('[data-k]')) {
    const k = el.dataset.k;
    if (el.type === 'checkbox') el.checked = !!TW[k]; else el.value = TW[k];
  }
  for (const o of panel.querySelectorAll('[data-o]')) {
    const k = o.dataset.o; o.textContent = k === 'hour' ? fmtHour(TW.hour) : k === 'webStrings' ? String(TW[k]) : `${(+TW[k]).toFixed(2)}×`;
  }
  panel.querySelector('.timeRow').classList.toggle('hide', TW.followTime);
  panel.querySelector('.webRow').classList.toggle('hide', hang !== 'web');
  panel.querySelector('.bgColor').classList.toggle('hide', TW.bg !== 'custom');
  panel.querySelector('[data-x=mood]').value = current;
  panel.querySelector('[data-x=hang]').value = hang;
}
panel.addEventListener('input', (e) => {
  const el = e.target, k = el.dataset.k;
  if (k) {
    TW[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
    if (k === 'size') applySize(TW.size);
    if (k === 'webStrings' && hang === 'web') setHang('web', true);
    saveTweaks();
  } else if (el.dataset.x === 'mood') load(el.value);
  else if (el.dataset.x === 'hang') setHang(el.value);
  syncPanel();
});
panel.querySelector('.reset').onclick = () => { Object.assign(TW, TW_DEFAULT); applySize(TW.size); setHang(TW.hang, true); saveTweaks(); syncPanel(); };
for (const ev of ['pointerdown', 'wheel', 'keydown']) panel.addEventListener(ev, (e) => e.stopPropagation());
$('.knob').onclick = () => { $('.tw').classList.toggle('on'); syncPanel(); };
function markMenu() { if (panel.querySelector('[data-x]')) syncPanel(); }
applySize(TW.size);
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('.tw')) return;
  const i = PRESET_ORDER.indexOf(current);
  if (e.key === 'ArrowRight') load(PRESET_ORDER[(i + 1) % PRESET_ORDER.length]);
  else if (e.key === 'ArrowLeft') load(PRESET_ORDER[(i - 1 + PRESET_ORDER.length) % PRESET_ORDER.length]);
  else if (e.key === 'l' || e.key === 'L') load('live');
  else if (e.key === 'h' || e.key === 'H') { const ks = Object.keys(HANGS); setHang(ks[(ks.indexOf(hang) + 1) % ks.length]); }
  else if (e.key === ' ' || e.key === 'i') document.body.classList.toggle('open');
});
if (params.has('clock')) { TW.followTime = false; TW.hour = +params.get('clock'); }   // pin the time of day (grid view)
if (params.has('bg')) TW.bg = params.get('bg');   // e.g. ?bg=white for the portfolio page (not saved)
if (EMBED) ui.style.display = 'none';
setHang(params.get('hang') || TW.hang);
if (params.has('info')) document.body.classList.add('open');
if (params.has('hour')) W.target = W.pos = +params.get('hour');
load(current);
window.__scrub = (h) => { W.target = h; idle = 0; };
window.__strike = () => { W.nextStrike = W.time; };   // test hook: lightning on the next frame
