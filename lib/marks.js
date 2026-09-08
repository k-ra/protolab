// ═══════════════════════════════════════════════════════════════
// marks.js — printmaking, not lighting.
//
// Everything else in this project models a surface and lights it. These
// don't: a print is a tonal REPRODUCTION made of marks — dots, grain,
// hatching, carved edges — and the tone comes from somewhere else. Here it
// comes from the relief's own height field, so the same object can be
// pressed into wax or pulled as a litho and stay recognisably itself.
//
// Two kinds live here:
//   screens  — per-pixel, baked at build time (halftone, litho, hatch, cut)
//   live     — redrawn every frame, so they can move (jitter, spikes)
// ═══════════════════════════════════════════════════════════════

const Marks = (function(){
  const TWOPI = Math.PI*2;

  // cheap deterministic per-pixel hash, for stochastic screens
  function hash2(x, y){
    let h = (x|0)*374761393 + (y|0)*668265263;
    h = (h ^ (h >> 13))*1274126177;
    return ((h ^ (h >> 16)) >>> 0)/4294967296;
  }

  // ── screens ──────────────────────────────────────────────────
  // A rotated dot screen. Classic halftone: the grid is regular, the dot
  // grows with tone, and the angle keeps it from moiréing with the image.
  function halftone(x, y, tone, cell, ang){
    if(tone <= 0.002) return 0;
    const c = Math.cos(ang), s = Math.sin(ang);
    const u = x*c - y*s, v = x*s + y*c;
    const cx = Math.round(u/cell)*cell, cy = Math.round(v/cell)*cell;
    const dx = u - cx, dy = v - cy;
    const d = Math.sqrt(dx*dx + dy*dy);
    const r = cell*0.52*Math.sqrt(Math.min(1, tone)*0.88);   // 0.5 = just touching
    return d < r ? 1 : (d < r + 0.9 ? (r + 0.9 - d)/0.9 : 0);   // one soft pixel
  }

  // Crayon on a grained stone: no grid at all, just a stochastic threshold.
  // Tone survives as probability, which is why litho holds delicate greys.
  function litho(x, y, tone, grain){
    if(tone <= 0.002) return 0;
    const g = grain || 1;
    const n = hash2(Math.floor(x/g), Math.floor(y/g));
    const t = Math.pow(tone, 1.45);
    return n < t ? 1 : 0;
  }

  // Etched hatching. One set of lines, crossed by a second where it's dark.
  function hatch(x, y, tone, spacing, ang){
    if(tone <= 0.004) return 0;
    const c = Math.cos(ang), s = Math.sin(ang);
    let v = x*s + y*c;
    let ph = v - Math.floor(v/spacing)*spacing;
    const w = spacing*Math.min(0.60, Math.pow(tone, 0.9)*0.78);
    let a = ph < w ? 1 : 0;
    if(tone > 0.62){
      const u = x*c - y*s;
      let ph2 = u - Math.floor(u/spacing)*spacing;
      const w2 = spacing*Math.min(0.58, Math.pow((tone - 0.62)/0.38, 0.95)*0.7);
      if(ph2 < w2) a = 1;
    }
    return a;
  }

  // Carved: a hard threshold, but the edge chatters the way a gouge does.
  function linocut(x, y, tone, chatter){
    const n = (hash2(Math.floor(x/2), Math.floor(y/2)) - 0.5)*(chatter || 0.16);
    return tone + n > 0.42 ? 1 : 0;
  }

  // Ink spreading into fibre: a soft, noisy threshold on a blurred mask, so
  // the edge feathers and occasionally runs.
  function bleed(spread, x, y, amount){
    if(spread <= 0.002) return 0;
    const n = hash2(Math.floor(x/3), Math.floor(y/3))*0.30 +
              hash2(Math.floor(x/11), Math.floor(y/11))*0.24;
    const t = 0.30 - (amount || 0.5)*0.20 + n*0.34;
    const e = (spread - t)/0.16;
    return e <= 0 ? 0 : (e >= 1 ? 1 : e);
  }

  // ── live marks ───────────────────────────────────────────────
  // Redrawn every frame, so they can respond to the cursor.

  // A pen line that boils: the same mark laid down several times, each pass
  // displaced slightly. Hand-drawn animation gets its life from exactly this.
  function jitter(ctx, markCv, opts){
    const passes = opts.passes || 3;
    const amp = opts.amp || 2.2;
    const t = opts.time || 0;
    const w = markCv.width, h = markCv.height;
    ctx.save();
    ctx.globalAlpha = opts.alpha === undefined ? 0.5 : opts.alpha;
    for(let i=0;i<passes;i++){
      // step the phase so the wobble jumps rather than slides — on twos,
      // the way drawn animation is shot
      const step = Math.floor(t*opts.fps || 0) + i*37;
      const dx = (hash2(step, i*13) - 0.5)*2*amp;
      const dy = (hash2(step + 991, i*7) - 0.5)*2*amp;
      const rot = (hash2(step + 55, i*3) - 0.5)*0.018*amp;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(rot);
      ctx.drawImage(markCv, -w/2, -h/2);
      ctx.restore();
    }
    ctx.restore();
  }

  // Geometric spikes struck out of the silhouette, leaning away from the
  // cursor — the mark knows where you are.
  function spikes(ctx, opts){
    const n = opts.count || 18;
    const R = opts.radius || 70;
    const seed = opts.seed || 1;
    const away = opts.away || 0;            // direction to lean, radians
    const push = opts.push || 0;            // 0..1, how hard
    const t = opts.time || 0;
    ctx.save();
    ctx.fillStyle = opts.color || '#2b2a30';
    for(let i=0;i<n;i++){
      const a = i/n*TWOPI + seedFloat(seed, i)*0.09;
      const lean = Math.cos(a - away);
      const wob = Math.sin(t*1.6 + i*1.7)*0.05;
      const len = R*(0.42 + seedFloat(seed, i + 500)*0.55)*(1 + push*lean*0.75 + wob);
      const w = R*(0.030 + seedFloat(seed, i + 900)*0.045);
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(R*0.16, -w);
      ctx.lineTo(len, 0);
      ctx.lineTo(R*0.16, w);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, R*0.20, 0, TWOPI);
    ctx.fill();
    ctx.restore();
  }
  function seedFloat(seed, i){ return hash2(seed + i*7919, i*104729); }

  return {
    hash2: hash2,
    halftone: halftone, litho: litho, hatch: hatch, linocut: linocut, bleed: bleed,
    jitter: jitter, spikes: spikes
  };
})();
