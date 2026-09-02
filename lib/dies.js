// ═══════════════════════════════════════════════════════════════
// dies.js — the engraver's vocabulary.
//
// Every function draws a WHITE mask on a 2D context whose origin has
// already been translated to the centre of the die. The relief engine
// turns those masks into height. Nothing here knows about colour.
// ═══════════════════════════════════════════════════════════════

const Dies = (function(){
  const TWOPI = Math.PI*2;
  const SERIF = 'Lora, Georgia, "Times New Roman", serif';

  function ring(ctx, r, lw){
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(0,0,r,0,TWOPI); ctx.stroke();
  }

  function beadRing(ctx, r, n, dot){
    for(let i=0;i<n;i++){
      const a = i/n*TWOPI;
      ctx.beginPath();
      ctx.arc(Math.cos(a)*r, Math.sin(a)*r, dot, 0, TWOPI);
      ctx.fill();
    }
  }

  // letterspaced centred text — tracking is a fraction of the font size
  function tracked(ctx, str, y, size, tracking, weight){
    ctx.font = (weight || '600') + ' ' + size + 'px ' + SERIF;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const tr = size*tracking;
    let w = 0;
    for(let i=0;i<str.length;i++) w += ctx.measureText(str[i]).width + (i < str.length-1 ? tr : 0);
    let x = -w/2;
    for(let i=0;i<str.length;i++){
      ctx.fillText(str[i], x, y);
      x += ctx.measureText(str[i]).width + tr;
    }
    return w;
  }

  function measureTracked(ctx, str, size, tracking, weight){
    ctx.font = (weight || '600') + ' ' + size + 'px ' + SERIF;
    const tr = size*tracking;
    let w = 0;
    for(let i=0;i<str.length;i++) w += ctx.measureText(str[i]).width + (i < str.length-1 ? tr : 0);
    return w;
  }

  // fit one or more words into a circle of radius R
  function monogram(ctx, R, text, tracking){
    const t = String(text).trim().toUpperCase();
    if(!t) return;
    tracking = tracking === undefined ? 0.10 : tracking;
    const words = t.split(/\s+/);
    // short strings stay on one line; longer names stack
    let lines;
    if(t.length <= 3) lines = [t];
    else if(words.length === 1) lines = [t];
    else if(words.length === 2) lines = words;
    else lines = [words.slice(0, Math.ceil(words.length/2)).join(' '), words.slice(Math.ceil(words.length/2)).join(' ')];

    const nl = lines.length;
    let size = R*(nl === 1 ? (t.length <= 2 ? 1.05 : (t.length <= 4 ? 0.62 : 0.40)) : 0.34);
    // shrink until every line fits the chord at its own height
    for(let pass=0; pass<24; pass++){
      let ok = true;
      for(let i=0;i<nl;i++){
        const yc = (i - (nl-1)/2) * size*1.25;
        const half = Math.sqrt(Math.max(0.04, 1 - Math.pow((Math.abs(yc)+size*0.55)/R, 2)))*R*0.92;
        if(measureTracked(ctx, lines[i], size, tracking) > half*2){ ok = false; break; }
      }
      if(ok) break;
      size *= 0.92;
    }
    for(let i=0;i<nl;i++){
      const yc = (i - (nl-1)/2) * size*1.25;
      tracked(ctx, lines[i], yc + size*0.03, size, tracking);
    }
  }

  function ringText(ctx, r, text, size, arc, flip){
    const t = String(text).trim().toUpperCase();
    if(!t) return;
    ctx.font = '600 ' + size + 'px ' + SERIF;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const step = arc/Math.max(1, t.length);
    const start = -Math.PI/2 - arc/2 + step/2;
    for(let i=0;i<t.length;i++){
      const a = start + i*step + (flip ? Math.PI : 0);
      ctx.save();
      ctx.rotate(a + Math.PI/2);
      ctx.translate(0, flip ? r : -r);
      ctx.rotate(flip ? Math.PI : 0);
      ctx.fillText(t[i], 0, 0);
      ctx.restore();
    }
  }

  function rosette(ctx, R, n){
    n = Math.max(5, Math.round(n));
    for(let i=0;i<n;i++){
      ctx.save(); ctx.rotate(i/n*TWOPI);
      ctx.beginPath();
      ctx.moveTo(0,-R*0.13);
      ctx.quadraticCurveTo(R*0.34,-R*0.40, R*0.88, 0);
      ctx.quadraticCurveTo(R*0.34, R*0.40, 0, R*0.13);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0,0,R*0.19,0,TWOPI); ctx.fill();
  }

  function starburst(ctx, R, n){
    n = Math.max(5, Math.round(n));
    ctx.beginPath();
    for(let i=0;i<n*2;i++){
      const a = i/(n*2)*TWOPI - Math.PI/2;
      const r = (i%2) ? R*0.33 : R*0.92;
      const x = Math.cos(a)*r, y = Math.sin(a)*r;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath(); ctx.fill();
  }

  function compass(ctx, R, n){
    n = Math.max(6, Math.round(n))*2;
    for(let i=0;i<n;i++){
      const len = (i%2) ? R*0.54 : R*0.93;
      const w = (i%2) ? R*0.030 : R*0.055;
      ctx.save(); ctx.rotate(i/n*TWOPI);
      ctx.beginPath();
      ctx.moveTo(R*0.10,-w); ctx.lineTo(len,0); ctx.lineTo(R*0.10,w);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0,0,R*0.14,0,TWOPI); ctx.fill();
  }

  function laurel(ctx, R, n){
    n = Math.max(4, Math.round(n));
    for(let s=-1;s<=1;s+=2){
      for(let i=0;i<n;i++){
        const t = i/(n-1);
        const a = Math.PI/2 + s*(0.28 + t*2.28);
        const rr = R*0.88;
        ctx.save();
        ctx.translate(Math.cos(a)*rr, Math.sin(a)*rr);
        ctx.rotate(a + s*0.55);
        ctx.beginPath();
        ctx.ellipse(0,0,R*0.145,R*0.052,0,0,TWOPI);
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.lineWidth = R*0.022;
      for(let i=0;i<=40;i++){
        const t = i/40;
        const a = Math.PI/2 + s*(0.20 + t*2.42);
        const x = Math.cos(a)*R*0.86, y = Math.sin(a)*R*0.86;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
  }

  // ── heraldry ─────────────────────────────────────────────────
  function shieldPath(ctx, w, h){
    ctx.beginPath();
    ctx.moveTo(-w, -h);
    ctx.lineTo( w, -h);
    ctx.lineTo( w, h*0.18);
    ctx.quadraticCurveTo( w*0.94, h*0.74, 0, h);
    ctx.quadraticCurveTo(-w*0.94, h*0.74, -w, h*0.18);
    ctx.closePath();
  }

  function crest(ctx, R, rng, detail){
    const w = R*0.62, h = R*0.80;
    // field
    ctx.save();
    shieldPath(ctx, w, h);
    ctx.lineWidth = R*0.055;
    ctx.stroke();
    // charge — clipped to the shield so nothing spills
    ctx.save();
    shieldPath(ctx, w*0.90, h*0.92);
    ctx.clip();
    const kind = Math.floor(rng()*5);
    if(kind === 0){                                  // chevron
      ctx.lineWidth = R*0.13;
      ctx.beginPath();
      ctx.moveTo(-w, h*0.30); ctx.lineTo(0,-h*0.20); ctx.lineTo(w, h*0.30);
      ctx.stroke();
    } else if(kind === 1){                           // bend
      ctx.lineWidth = R*0.15;
      ctx.beginPath();
      ctx.moveTo(-w*1.2,-h*0.9); ctx.lineTo(w*1.2, h*0.7);
      ctx.stroke();
    } else if(kind === 2){                           // cross
      ctx.lineWidth = R*0.13;
      ctx.beginPath();
      ctx.moveTo(-w*1.2,-h*0.12); ctx.lineTo(w*1.2,-h*0.12);
      ctx.moveTo(0,-h*1.2); ctx.lineTo(0, h*1.2);
      ctx.stroke();
    } else if(kind === 3){                           // chief + mullets
      ctx.fillRect(-w*1.2, -h*1.05, w*2.4, h*0.52);
      const n = 3;
      for(let i=0;i<n;i++){
        ctx.save();
        ctx.translate((i-(n-1)/2)*w*0.62, h*0.24);
        starburst(ctx, R*0.16, 5);
        ctx.restore();
      }
    } else {                                         // pales
      const n = 3;
      for(let i=0;i<n;i++){
        const x = (i-(n-1)/2)*w*0.66;
        ctx.fillRect(x - w*0.13, -h*1.2, w*0.26, h*2.4);
      }
    }
    ctx.restore();
    ctx.restore();
    // wreath around the shield
    laurel(ctx, R*0.99, Math.round(detail*0.7));
  }

  // ── stationery: a name pressed into a card ───────────────────
  function stationery(ctx, W, H, opts){
    const name = String(opts.name || '').trim().toUpperCase();
    const sub  = String(opts.sub || '').trim().toUpperCase();
    const maxW = W*0.72;
    let size = H*0.155;
    while(measureTracked(ctx, name, size, 0.22) > maxW && size > 4) size *= 0.94;
    const yName = sub ? -H*0.02 : 0;
    tracked(ctx, name, yName, size, 0.22, '500');
    if(opts.rules){
      const rw = Math.min(maxW, measureTracked(ctx, name, size, 0.22)*1.14);
      ctx.lineWidth = Math.max(1.5, H*0.006);
      [-1,1].forEach(s => {
        ctx.beginPath();
        ctx.moveTo(-rw/2, yName + s*size*1.30);
        ctx.lineTo( rw/2, yName + s*size*1.30);
        ctx.stroke();
      });
    }
    if(sub){
      let ss = size*0.34;
      while(measureTracked(ctx, sub, ss, 0.34) > maxW*0.85 && ss > 3) ss *= 0.94;
      tracked(ctx, sub, yName + size*2.05, ss, 0.34, '500');
    }
  }

  return {
    ring: ring, beadRing: beadRing, tracked: tracked, measureTracked: measureTracked,
    monogram: monogram, ringText: ringText, rosette: rosette, starburst: starburst,
    compass: compass, laurel: laurel, shieldPath: shieldPath, crest: crest,
    stationery: stationery, SERIF: SERIF
  };
})();
