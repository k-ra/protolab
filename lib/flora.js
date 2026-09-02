// ═══════════════════════════════════════════════════════════════
// flora.js — flower geometry, decoupled from any one canvas.
//
// Grow a spec into `parts` (relative to the bloom's centre), then render
// twice: greyscale, where the gradients ARE the petal cross-sections,
// and colour. The relief engine turns the first into height and uses the
// second as a base-colour map.
//
// The height pass matters more than it looks. Each petal is filled with a
// gradient ALONG its axis — high at the base, low at the tip — so the
// bloom becomes a mound without anything having to draw a dome. Cupped
// species lift the tip back up. Every petal is then stroked with a darker
// grey, cutting a groove between overlapping petals: that crease is what
// makes the thing read as three-dimensional under raking light.
// ═══════════════════════════════════════════════════════════════

const Flora = (function(){
  const TWOPI = Math.PI*2;
  const GOLDEN = Math.PI*(3 - Math.sqrt(5));

  // shape: lance | round | notch | quill      cup: tip lifts back up
  const SPECIES = {
    aster:      {petals:21, whorls:2, petalLen:1.05, petalWid:0.13, sharp:0.55, open:0.30, disc:0.26, shape:'lance', ruffle:0.10, cup:0.00},
    ranunculus: {petals:9,  whorls:7, petalLen:0.80, petalWid:0.52, sharp:1.25, open:0.55, disc:0.07, shape:'round', ruffle:0.22, cup:0.75},
    anemone:    {petals:7,  whorls:2, petalLen:1.02, petalWid:0.46, sharp:1.05, open:0.25, disc:0.30, shape:'round', ruffle:0.16, cup:0.25},
    dahlia:     {petals:13, whorls:5, petalLen:0.95, petalWid:0.22, sharp:0.40, open:0.45, disc:0.10, shape:'quill', ruffle:0.08, cup:0.40},
    rose:       {petals:8,  whorls:6, petalLen:0.74, petalWid:0.58, sharp:1.35, open:0.62, disc:0.05, shape:'round', ruffle:0.18, cup:0.90},
    peony:      {petals:11, whorls:5, petalLen:0.86, petalWid:0.46, sharp:1.15, open:0.48, disc:0.06, shape:'round', ruffle:0.42, cup:0.60},
    poppy:      {petals:4,  whorls:1, petalLen:1.00, petalWid:0.78, sharp:1.45, open:0.16, disc:0.28, shape:'round', ruffle:0.38, cup:0.35},
    cosmos:     {petals:8,  whorls:1, petalLen:1.00, petalWid:0.40, sharp:0.95, open:0.18, disc:0.22, shape:'notch', ruffle:0.14, cup:0.15},
    marigold:   {petals:17, whorls:4, petalLen:0.78, petalWid:0.26, sharp:0.85, open:0.52, disc:0.06, shape:'round', ruffle:0.20, cup:0.70},
    chrysanth:  {petals:24, whorls:5, petalLen:1.08, petalWid:0.09, sharp:0.35, open:0.38, disc:0.05, shape:'quill', ruffle:0.10, cup:0.55},
    scabiosa:   {petals:12, whorls:3, petalLen:0.92, petalWid:0.34, sharp:0.70, open:0.34, disc:0.34, shape:'notch', ruffle:0.26, cup:0.20},
    tulip:      {petals:6,  whorls:2, petalLen:0.98, petalWid:0.50, sharp:1.20, open:0.08, disc:0.04, shape:'round', ruffle:0.06, cup:1.00}
  };
  const NAMES = Object.keys(SPECIES);

  const PALETTES = [
    ['#a8817c','#e7d5cb','#7a6b5c','#93a08c'],
    ['#9c8570','#e8ded0','#6f6355','#8e9a86'],
    ['#8d8b96','#e2e0e4','#6a6670','#8d9490'],
    ['#b09184','#efe4d9','#7b6a5e','#9aa392'],
    ['#a89a86','#ece4d6','#6e6455','#909a88'],
    ['#9d8a92','#e9dfe2','#6b6069','#8f9689']
  ];

  const hex2 = v => ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
  // returns HEX, not rgb(), so the result can be mixed again
  function mixHex(a, b, t){
    const A = Relief.hexRgb(a), B = Relief.hexRgb(b);
    return '#' + hex2(A[0]+(B[0]-A[0])*t) + hex2(A[1]+(B[1]-A[1])*t) + hex2(A[2]+(B[2]-A[2])*t);
  }
  const grey = v => {
    const c = Math.round(Math.max(0, Math.min(1, v))*255);
    return 'rgb('+c+','+c+','+c+')';
  };

  function defaults(over){
    const sp = (over && over.species && SPECIES[over.species]) ? over.species : 'aster';
    return Object.assign({
      seed: 1, size: 150, leaves: 3,
      cBase: '#a8817c', cTip: '#e7d5cb', cDisc: '#7a6b5c', cLeaf: '#93a08c'
    }, SPECIES[sp], {species: sp}, over || {});
  }

  // ── petal outlines ───────────────────────────────────────────
  function petalPath(ctx, len, wid, sharp, shape, ruf){
    const j = (a) => 1 + (a - 0.5)*ruf*0.9;      // ruffle = control-point jitter
    ctx.beginPath();
    ctx.moveTo(0,0);
    if(shape === 'round'){
      ctx.bezierCurveTo( wid*1.14*j(0.3), -len*0.12,  wid*1.02*sharp*j(0.7), -len*0.84, 0, -len);
      ctx.bezierCurveTo(-wid*1.02*sharp*j(0.2), -len*0.84, -wid*1.14*j(0.8), -len*0.12, 0, 0);
    } else if(shape === 'notch'){
      ctx.bezierCurveTo( wid*1.10*j(0.35), -len*0.14,  wid*0.96*sharp*j(0.65), -len*0.80,  wid*0.34, -len);
      ctx.quadraticCurveTo(wid*0.16, -len*0.90, 0, -len*0.88);
      ctx.quadraticCurveTo(-wid*0.16, -len*0.90, -wid*0.34, -len);
      ctx.bezierCurveTo(-wid*0.96*sharp*j(0.25), -len*0.80, -wid*1.10*j(0.75), -len*0.14, 0, 0);
    } else if(shape === 'quill'){
      ctx.bezierCurveTo( wid*0.72*j(0.4), -len*0.30,  wid*0.58*sharp*j(0.6), -len*0.80, 0, -len);
      ctx.bezierCurveTo(-wid*0.58*sharp*j(0.3), -len*0.80, -wid*0.72*j(0.7), -len*0.30, 0, 0);
    } else {
      ctx.bezierCurveTo( wid*j(0.4),       -len*0.16,  wid*sharp*j(0.6), -len*0.74, 0, -len);
      ctx.bezierCurveTo(-wid*sharp*j(0.3), -len*0.74, -wid*j(0.7),       -len*0.16, 0, 0);
    }
    ctx.closePath();
  }

  // ── spec → parts ─────────────────────────────────────────────
  function grow(spec){
    const s = defaults(spec);
    const rng = Relief.makeRng(s.seed);
    const R = s.size;
    const parts = [];

    for(let i=0;i<s.leaves;i++){
      const a = Math.PI/2 + (rng()-0.5)*2.6;
      const len = R*(0.75 + rng()*0.5), wid = len*(0.22 + rng()*0.12);
      parts.push({
        kind:'leaf', x: Math.cos(a)*R*0.55, y: Math.sin(a)*R*0.55,
        rot: a + Math.PI/2 + (rng()-0.5)*0.35, len: len, wid: wid, sharp: 0.85,
        shape:'lance', ruf: 0.1, level: 0.08 + rng()*0.04, dome: 0.10, drop: 0.06,
        cup: 0, tone: rng()
      });
    }

    const W = s.whorls;
    for(let w=W-1; w>=0; w--){                   // outermost first — painter order
      const t = W === 1 ? 0 : w/(W-1);           // 1 = outer, 0 = inner
      const rf = 0.42 + 0.58*t;
      const n = Math.max(3, Math.round(s.petals*(0.55 + 0.45*rf)));
      const spin = w*GOLDEN*2.2 + (rng()-0.5)*0.3;
      const len = R*s.petalLen*rf;
      const wid = len*s.petalWid*(1.15 - 0.3*t);
      const baseR = R*(0.03 + s.open*0.16*rf) + R*s.disc*0.55*(1-t)*0.4;
      for(let i=0;i<n;i++){
        const a = spin + i/n*TWOPI + (rng()-0.5)*0.05;
        parts.push({
          kind:'petal', x: Math.cos(a-Math.PI/2)*baseR, y: Math.sin(a-Math.PI/2)*baseR,
          rot: a, len: len*(0.92 + rng()*0.16), wid: wid*(0.9 + rng()*0.2),
          sharp: s.sharp, shape: s.shape, ruf: s.ruffle*(0.6 + rng()*0.8),
          // the whole point: inner whorls sit much higher, and every petal
          // falls from base to tip, so the bloom becomes a mound
          level: 0.16 + (1-t)*0.56,
          dome:  0.16 + (1-t)*0.14,
          drop:  0.20 + t*0.14,
          cup:   s.cup,
          tone: t, jit: rng()
        });
      }
    }

    const dR = R*s.disc;
    if(dR > R*0.02){
      parts.push({kind:'disc', x:0, y:0, r:dR, level:0.80, dome:0.18});
      const nf = Math.round(dR*dR*0.030);
      for(let i=0;i<nf;i++){
        const q = i/nf;
        const rr = Math.sqrt(q)*dR*0.94;
        const a = i*GOLDEN;
        parts.push({
          kind:'floret', x: Math.cos(a)*rr, y: Math.sin(a)*rr,
          r: dR*0.058*(0.6 + q*0.7), level: 0.86 + (1-q)*0.12, tone: q, jit: rng()
        });
      }
    }
    return parts;
  }

  // ── render: 'h' greyscale height, 'c' colour ──────────────────
  function render(ctx, parts, spec, mode){
    const s = defaults(spec);
    const isH = mode === 'h';
    for(let i=0;i<parts.length;i++){
      const p = parts[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      if(p.rot !== undefined) ctx.rotate(p.rot);

      if(p.kind === 'petal' || p.kind === 'leaf'){
        let g;
        if(isH){
          // along the axis: high at the base, falling to the tip — cupped
          // species bring the tip back up
          const hi  = p.level + p.dome;
          const mid = p.level + p.dome*0.22 - p.drop*0.45;
          const lo  = p.level - p.drop;
          g = ctx.createLinearGradient(0, 0, 0, -p.len);
          g.addColorStop(0,    grey(hi));
          g.addColorStop(0.34, grey(p.level + p.dome*0.5));
          g.addColorStop(0.70, grey(mid));
          g.addColorStop(1,    grey(lo + (mid - lo)*p.cup));
        } else if(p.kind === 'leaf'){
          g = ctx.createLinearGradient(0,0,0,-p.len);
          g.addColorStop(0, mixHex(s.cLeaf, '#000000', 0.10));
          g.addColorStop(1, mixHex(s.cLeaf, '#ffffff', 0.26 + p.tone*0.16));
        } else {
          g = ctx.createLinearGradient(0,0,0,-p.len);
          g.addColorStop(0,    mixHex(s.cBase, s.cTip, Math.max(0, 0.16 - p.tone*0.16)));
          g.addColorStop(0.42, mixHex(s.cBase, s.cTip, 0.34 + p.tone*0.2));
          g.addColorStop(1,    mixHex(s.cBase, s.cTip, 0.72 + p.tone*0.28));
        }
        ctx.fillStyle = g;
        petalPath(ctx, p.len, p.wid, p.sharp, p.shape, p.ruf);
        ctx.fill();

        if(isH){
          // cut a groove around every petal — this crease is what separates
          // overlapping petals under raking light
          ctx.strokeStyle = grey(Math.max(0, p.level - p.drop - 0.16));
          ctx.lineWidth = Math.max(1, p.len*0.016);
          ctx.stroke();
        } else if(p.wid/p.len < 0.30){
          ctx.strokeStyle = 'rgba(0,0,0,0.055)';
          ctx.lineWidth = Math.max(1, p.wid*0.05);
          ctx.beginPath(); ctx.moveTo(0,-p.len*0.06); ctx.lineTo(0,-p.len*0.86); ctx.stroke();
        }
      } else if(p.kind === 'disc'){
        let g = ctx.createRadialGradient(0,0,p.r*0.05,0,0,p.r);
        if(isH){
          g.addColorStop(0, grey(p.level + p.dome));
          g.addColorStop(1, grey(p.level - 0.16));
        } else {
          g.addColorStop(0, mixHex(s.cDisc,'#ffffff',0.22));
          g.addColorStop(1, mixHex(s.cDisc,'#000000',0.25));
        }
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0,0,p.r,0,TWOPI); ctx.fill();
      } else {
        ctx.fillStyle = isH ? grey(p.level)
                            : mixHex(s.cDisc, s.cTip, 0.10 + p.tone*0.42 + p.jit*0.12);
        ctx.beginPath(); ctx.arc(0,0,p.r,0,TWOPI); ctx.fill();
      }
      ctx.restore();
    }
  }

  return {
    SPECIES: SPECIES, NAMES: NAMES, PALETTES: PALETTES,
    defaults: defaults, grow: grow, render: render, mixHex: mixHex
  };
})();
