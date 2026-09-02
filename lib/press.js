// ═══════════════════════════════════════════════════════════════
// press.js — a pressed seal, drawn at the origin.
//
// Same contract as Flora.render: draw greyscale for height, colour for
// the base-colour map, at (0,0), sized by spec.size. That lets the hub
// canvas treat a seal and a flower identically — both are just marks in
// one shared height field.
//
// The whole relief is expressed as GREY LEVELS rather than blurs: a domed
// gradient for the body, a flat plateau where the die landed, a lighter
// ring for the bead of material squeezed out at its edge, and the motif
// painted darker (sunken) or lighter (raised). One small blur downstream
// rounds every edge at once.
// ═══════════════════════════════════════════════════════════════

const Press = (function(){
  const TWOPI = Math.PI*2;

  const MATERIALS = {
    wax:   {color:'#c3877f', dome:[0.88,0.40], plateau:0.76, bead:0.10, motif:0.17, rough:0.012},
    clay:  {color:'#c9b3a1', dome:[0.82,0.46], plateau:0.72, bead:0.05, motif:0.20, rough:0.030},
    paper: {color:'#e6e0d3', dome:[0.62,0.52], plateau:0.58, bead:0.00, motif:0.09, rough:0.008},
    metal: {color:'#bdb7ab', dome:[0.84,0.50], plateau:0.74, bead:0.13, motif:0.15, rough:0.004}
  };
  const NAMES = Object.keys(MATERIALS);

  const grey = v => {
    const c = Math.round(Math.max(0, Math.min(1, v))*255);
    return 'rgb('+c+','+c+','+c+')';
  };

  function defaults(over){
    const sub = (over && over.substrate && MATERIALS[over.substrate]) ? over.substrate : 'wax';
    return Object.assign({
      seed: 1, substrate: sub, die: 'monogram', text: 'M', sub: '',
      size: 130, detail: 6, depth: 1, rim: 1, drips: 3, irregularity: 0.20,
      mode: 'deboss', color: MATERIALS[sub].color
    }, over || {});
  }

  const angDelta = (a,b) => Math.atan2(Math.sin(a-b), Math.cos(a-b));

  // a silhouette built from a few phased sines plus gaussian lobes — no
  // dependency on p5's noise, so this is portable
  function bodyPath(ctx, s, rng, R){
    if(s.substrate === 'metal'){ ctx.beginPath(); ctx.arc(0,0,R,0,TWOPI); ctx.closePath(); return; }
    if(s.substrate === 'paper'){
      const w = R*1.18, h = R*0.84, steps = 200;
      ctx.beginPath();
      const ph = [rng()*TWOPI, rng()*TWOPI, rng()*TWOPI];
      for(let i=0;i<=steps;i++){
        const t = i/steps, per = t*4;
        let x, y, nx, ny;
        if(per < 1){ x = -w + 2*w*per; y = -h; nx = 0; ny = -1; }
        else if(per < 2){ x = w; y = -h + 2*h*(per-1); nx = 1; ny = 0; }
        else if(per < 3){ x = w - 2*w*(per-2); y = h; nx = 0; ny = 1; }
        else { x = -w; y = h - 2*h*(per-3); nx = -1; ny = 0; }
        const n = (Math.sin(per*7.1 + ph[0])*0.5 + Math.sin(per*17.3 + ph[1])*0.3 + Math.sin(per*31.7 + ph[2])*0.2)*R*0.035;
        if(i===0) ctx.moveTo(x + nx*n, y + ny*n); else ctx.lineTo(x + nx*n, y + ny*n);
      }
      ctx.closePath();
      return;
    }
    const lobes = [];
    const wax = s.substrate === 'wax';
    const nl = 4 + Math.floor(rng()*4);
    for(let i=0;i<nl;i++) lobes.push({a: rng()*TWOPI, w: 0.30+rng()*0.55, h: (wax ? 0.05 : 0.03)+rng()*(wax ? 0.11 : 0.06)});
    if(wax){
      for(let i=0;i<s.drips;i++) lobes.push({a: Math.PI/2 + (rng()-0.5)*2.0, w: 0.055+rng()*0.075, h: 0.10+rng()*0.30});
    } else {
      for(let i=0;i<s.drips;i++) lobes.push({a: rng()*TWOPI, w: 0.20+rng()*0.22, h: -(0.04+rng()*0.09)});
    }
    const ph = [rng()*TWOPI, rng()*TWOPI, rng()*TWOPI];
    const wob = s.irregularity*(wax ? 1 : 0.5);
    const steps = 480;
    ctx.beginPath();
    for(let i=0;i<=steps;i++){
      const t = i/steps*TWOPI;
      let r = R*(1 + (Math.sin(t*3 + ph[0])*0.5 + Math.sin(t*5 + ph[1])*0.32 + Math.sin(t*8 + ph[2])*0.18)*wob);
      for(let k=0;k<lobes.length;k++){
        const L = lobes[k], d = angDelta(t, L.a);
        r += R*L.h*Math.exp(-(d*d)/(2*L.w*L.w));
      }
      const x = Math.cos(t)*r, y = Math.sin(t)*r;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath();
  }

  function drawDie(ctx, s, rng, dieR, level, sign){
    const D = s.detail;
    ctx.save();
    ctx.fillStyle = grey(level);
    ctx.strokeStyle = grey(level);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if(s.die === 'plate'){
      Dies.stationery(ctx, dieR*2.5, dieR*1.5, {name: s.text || 'PROTOLAB', sub: s.sub, rules: true});
      ctx.restore();
      return;
    }
    Dies.ring(ctx, dieR*0.93, dieR*0.014);
    const inner = dieR*0.70;
    if(s.die === 'crest'){
      Dies.crest(ctx, inner, rng, D);
    } else if(s.die === 'figure'){
      const k = Math.floor(rng()*3);
      if(k === 0) Dies.rosette(ctx, inner, D);
      else if(k === 1) Dies.starburst(ctx, inner, D);
      else Dies.compass(ctx, inner, D);
    } else {
      Dies.monogram(ctx, inner*0.96, (s.text || 'M'));
    }
    ctx.restore();
  }

  // mode: 'h' greyscale height, 'c' colour
  function stamp(ctx, spec, mode){
    const s = defaults(spec);
    const M = MATERIALS[s.substrate];
    const rng = Relief.makeRng(s.seed);
    const R = s.size;
    const dieR = R*(s.substrate === 'paper' ? 0.72 : 0.74);
    const isH = mode === 'h';

    ctx.save();
    if(isH){
      // body: a dome, bright at the crown and falling to the edge
      const g = ctx.createRadialGradient(0,0,R*0.05,0,0,R*1.02);
      g.addColorStop(0,    grey(M.dome[0]));
      g.addColorStop(0.62, grey(M.dome[0] - (M.dome[0]-M.dome[1])*0.30));
      g.addColorStop(1,    grey(M.dome[1]));
      ctx.fillStyle = g;
      bodyPath(ctx, s, Relief.makeRng(s.seed), R);
      ctx.fill();

      // the die flattened the field it landed on
      ctx.fillStyle = grey(M.plateau);
      ctx.beginPath(); ctx.arc(0,0,dieR,0,TWOPI); ctx.fill();

      if(M.bead > 0){                       // material squeezed out at the rim
        ctx.strokeStyle = grey(M.plateau + M.bead*s.rim);
        ctx.lineWidth = R*0.055;
        ctx.beginPath(); ctx.arc(0,0,dieR*1.01,0,TWOPI); ctx.stroke();
      }

      const sign = s.mode === 'emboss' ? 1 : -1;
      drawDie(ctx, s, rng, dieR, M.plateau + sign*M.motif*s.depth, sign);
    } else {
      const base = s.color || M.color;
      const g = ctx.createRadialGradient(0,0,R*0.05,0,0,R*1.02);
      g.addColorStop(0, Flora.mixHex(base, '#ffffff', 0.05));
      g.addColorStop(1, Flora.mixHex(base, '#000000', 0.06));
      ctx.fillStyle = g;
      bodyPath(ctx, s, Relief.makeRng(s.seed), R);
      ctx.fill();
    }
    ctx.restore();
  }

  return {MATERIALS: MATERIALS, NAMES: NAMES, defaults: defaults, stamp: stamp};
})();
