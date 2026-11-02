// ═══════════════════════════════════════════════════════════════
// gouache.js — paint a height field the way the round map paints terrain.
//
// Same recipe as twin-peaks/source/template.html, lifted off the map so any
// pressing can use it:
//   heights stepped into terraces   →  a lit rim at each step, shade at its foot
//   a north-west sun                →  slopes modelled in value, not in glare
//   colour from a gouache ramp      →  picked by altitude, sun, rim and shade
//   a wash that breathes            →  ±7% value, warm where light pools
//   pigment pooling at every edge   →  the dark line a wash leaves as it dries
//   a violet cast shadow            →  the shadow colour of the old lithographs
//
// The result is flat colour — a painting, not a lit relief — so it goes in
// as a colour map and the sheet's lamp only lights the paper it sits on.
// ═══════════════════════════════════════════════════════════════

const Gouache = (function(){
  // the map's own greens and straws, plus three flower washes in its key
  const RAMPS = {
    leaf:  [[30,68,66],   [70,116,82],   [138,166,98],  [196,204,138]],
    straw: [[150,104,48], [218,184,120], [238,212,134], [246,231,172]],
    seal:  [[150,30,26],  [200,55,45],   [214,84,70],   [232,140,124]],
    rose:  [[124,50,68],  [190,104,114], [230,166,160], [247,222,210]],
    lav:   [[60,60,118],  [124,114,172], [188,178,212], [230,224,240]],
    coral: [[146,58,44],  [212,112,80],  [240,172,128], [250,226,196]]
  };
  const SHADOW = [70,74,138];
  const SUN = (() => { const l = [-0.55, -0.55, 0.63], n = Math.hypot(l[0], l[1], l[2]); return l.map(v => v/n); })();

  const clamp = (x, a, b) => x < a ? a : (x > b ? b : x);
  const mix = (a, b, t) => a + (b - a)*t;
  function ramp(R, t){
    let a, b, u;
    if(t < 0.5){ a = R[0]; b = R[1]; u = t*2; }
    else if(t < 0.85){ a = R[1]; b = R[2]; u = (t - 0.5)/0.35; }
    else { a = R[2]; b = R[3]; u = (t - 0.85)/0.15; }
    return [mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u)];
  }

  // o: {F, h, layers: [{mask, ramp}] bottom→top, ground: [r,g,b], ss,
  //     step (terrace height), relief (normal strength), shadow: {dx, dy, r}}
  // returns an RGB map the size of the field
  function paint(o){
    const F = o.F, W = F.W, H = F.H, n2 = W*H, ss = o.ss || 1;
    const step = o.step || 0.07;
    const h = F.blur(o.h, Math.max(1, Math.round(ss)), 2);
    const T = new Float32Array(n2);
    for(let i=0;i<n2;i++) T[i] = Math.floor(h[i]/step)*step;
    const BT  = F.blur(T, Math.max(1, Math.round(1.2*ss)), 3);   // the step, softened: rim above, foot below
    const BTw = F.blur(T, Math.max(2, Math.round(4*ss)), 3);     // and the wider pool of shade at its foot
    const k = (o.relief || 30)*ss;

    // everything painted casts one violet shadow toward the south-east
    let cast = null;
    if(o.shadow){
      const all = new Float32Array(n2);
      o.layers.forEach(L => { for(let i=0;i<n2;i++) if(L.mask[i] > all[i]) all[i] = L.mask[i]; });
      const b = F.blur(all, Math.max(1, Math.round(o.shadow.r*ss)), 3);
      const dx = Math.round(o.shadow.dx*ss), dy = Math.round(o.shadow.dy*ss);
      cast = new Float32Array(n2);
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        const sx = x - dx, sy = y - dy;
        if(sx >= 0 && sy >= 0 && sx < W && sy < H) cast[y*W + x] = b[sy*W + sx];
      }
    }
    const pools = o.layers.map(L => F.blur(L.mask, Math.max(1, Math.round(1.6*ss)), 2));

    const out = new Uint8ClampedArray(n2*3);
    const g0 = o.ground;
    for(let y=0;y<H;y++){
      for(let x=0;x<W;x++){
        const i = y*W + x;
        // the wash: two octaves of slow noise, in sheet units so it holds its scale
        const X = x/ss, Y = y/ss;
        const w = (noise(X/70 + 40, Y/70)*2 - 1)*0.65 + (noise(X/23 + 17, Y/23 + 5)*2 - 1)*0.35;

        let r = g0[0], g = g0[1], b = g0[2], painted = 0;
        if(cast){
          const s = cast[i]*0.30;
          r = mix(r, SHADOW[0], s); g = mix(g, SHADOW[1], s); b = mix(b, SHADOW[2], s);
        }

        const xl = x > 0 ? i - 1 : i, xr = x < W - 1 ? i + 1 : i;
        const yu = y > 0 ? i - W : i, yd = y < H - 1 ? i + W : i;
        const nx = -(h[xr] - h[xl])*k, ny = -(h[yd] - h[yu])*k, nl = Math.hypot(nx, ny, 1);
        const sh = (nx*SUN[0] + ny*SUN[1] + SUN[2])/nl - 0.72;
        const ao  = clamp((BT[i] - T[i])/step*1.6, 0, 1)*0.6 + clamp((BTw[i] - T[i])/step, 0, 1)*0.4;
        const rim = clamp((T[i] - BT[i])/step*2.0, 0, 1);

        for(let L=0; L<o.layers.length; L++){
          const a = o.layers[L].mask[i];
          if(a <= 0.003) continue;
          const lay = o.layers[L];
          const alt = clamp((T[i] - (lay.lo || 0))/((lay.hi || 1) - (lay.lo || 0)), 0, 1);
          const t = clamp(0.30 + alt*0.42 + sh*0.75 + rim*0.20 - ao*0.34, 0, 1);
          let c = ramp(lay.ramp, t);
          // pigment pools where the wash stopped
          const edge = clamp((a - pools[L][i])*2.4, 0, 1)*0.75;
          const d = lay.ramp[0];
          c = [mix(c[0], d[0], edge), mix(c[1], d[1], edge), mix(c[2], d[2], edge)];
          r = mix(r, c[0], a); g = mix(g, c[1], a); b = mix(b, c[2], a);
          if(a > painted) painted = a;
        }
        const wp = w*painted;                     // the wash lives in the paint, not the paper
        const kk = 1 + wp*0.07;
        out[i*3]   = clamp(r*kk + wp*5, 0, 255);
        out[i*3+1] = clamp(g*kk + wp*2, 0, 255);
        out[i*3+2] = clamp(b*kk - wp*3, 0, 255);
      }
    }
    return out;
  }

  return {RAMPS, SHADOW, ramp, paint};
})();
