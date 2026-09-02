// ═══════════════════════════════════════════════════════════════
// relief.js — shared height-field relief engine
//
// Everything here treats an image as a MATERIAL, not a drawing:
//   rasterise shapes  →  coverage masks
//   blur + curve      →  a height field
//   gradients         →  surface normals   (computed once)
//   soft lighting     →  pixels            (recomputed on relight)
//
// The lighting model is deliberately low-glare: a small point lamp with
// falloff, wrapped diffuse for a soft terminator, a broad specular lobe
// with the hot core rolled off, and a `matte` mode that removes specular
// altogether. A split-tone grade and soft posterisation sit at the end.
//
// Fields may be rectangular: Relief.field(w, h). Relief.field(n) is square.
// ═══════════════════════════════════════════════════════════════

const Relief = (function(){

  function makeRng(seed){
    let s = (seed>>>0) || 1;
    return function(){
      s ^= s<<13; s>>>=0;
      s ^= s>>>17;
      s ^= s<<5;  s>>>=0;
      return s/4294967296;
    };
  }

  function hexRgb(h){
    h = String(h).replace('#','');
    if(h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }

  function makeCanvas(w,h){
    const c = document.createElement('canvas');
    c.width = w; c.height = h === undefined ? w : h;
    return c;
  }

  function Field(W, H){
    this.W = W;
    this.H = H === undefined ? W : H;
    this.N = W;                       // legacy alias
    this.CX = this.W/2;
    this.CY = this.H/2;
    this.n2 = this.W*this.H;
    this._rc = makeCanvas(this.W, this.H);
    this._rctx = this._rc.getContext('2d', {willReadFrequently:true});
  }

  function prep(ctx, W, H, clear){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0,0,W,H);
    if(clear){ ctx.fillStyle = clear; ctx.fillRect(0,0,W,H); }
  }

  // shapes → coverage mask (reads alpha)
  Field.prototype.raster = function(fn){
    const W = this.W, H = this.H, ctx = this._rctx;
    prep(ctx, W, H);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    fn(ctx);
    const d = ctx.getImageData(0,0,W,H).data;
    const out = new Float32Array(W*H);
    for(let i=0,j=3;i<out.length;i++,j+=4) out[i] = d[j]/255;
    return out;
  };

  // greyscale/gradient fills → height directly (reads red)
  Field.prototype.rasterLuma = function(fn){
    const W = this.W, H = this.H, ctx = this._rctx;
    prep(ctx, W, H, '#000');
    fn(ctx);
    const d = ctx.getImageData(0,0,W,H).data;
    const out = new Float32Array(W*H);
    for(let i=0,j=0;i<out.length;i++,j+=4) out[i] = d[j]/255;
    return out;
  };

  // colour fills → per-pixel base colour + coverage
  Field.prototype.rasterColor = function(fn){
    const W = this.W, H = this.H, ctx = this._rctx;
    prep(ctx, W, H);
    fn(ctx);
    const d = ctx.getImageData(0,0,W,H).data;
    const n2 = W*H;
    const map = new Uint8ClampedArray(n2*3);
    const cov = new Float32Array(n2);
    for(let i=0;i<n2;i++){
      const j = i*4;
      map[i*3] = d[j]; map[i*3+1] = d[j+1]; map[i*3+2] = d[j+2];
      cov[i] = d[j+3]/255;
    }
    return {colorMap: map, cov: cov};
  };

  // separable box blur, 3 passes ≈ gaussian
  Field.prototype.blur = function(src, r, passes){
    const W = this.W, H = this.H;
    passes = passes || 3;
    r = Math.round(r);
    if(r < 1) return Float32Array.from(src);
    let a = Float32Array.from(src), b = new Float32Array(W*H);
    const clx = v => v<0 ? 0 : (v>=W ? W-1 : v);
    const cly = v => v<0 ? 0 : (v>=H ? H-1 : v);
    const inv = 1/(2*r+1);
    for(let p=0;p<passes;p++){
      for(let y=0;y<H;y++){
        const o = y*W; let sum = 0;
        for(let x=-r;x<=r;x++) sum += a[o+clx(x)];
        for(let x=0;x<W;x++){
          b[o+x] = sum*inv;
          sum += a[o+clx(x+r+1)] - a[o+clx(x-r)];
        }
      }
      for(let x=0;x<W;x++){
        let sum = 0;
        for(let y=-r;y<=r;y++) sum += b[cly(y)*W+x];
        for(let y=0;y<H;y++){
          a[y*W+x] = sum*inv;
          sum += b[cly(y+r+1)*W+x] - b[cly(y-r)*W+x];
        }
      }
    }
    return a;
  };

  Field.prototype.normals = function(cov, hgt, strength){
    const W = this.W, H = this.H, n2 = W*H;
    const nX = new Float32Array(n2), nY = new Float32Array(n2), nZ = new Float32Array(n2);
    for(let i=0;i<n2;i++) nZ[i] = 1;
    for(let y=1;y<H-1;y++){
      for(let x=1;x<W-1;x++){
        const i = y*W + x;
        if(cov[i] <= 0.004) continue;
        const vx = -(hgt[i+1] - hgt[i-1]) * strength;
        const vy = -(hgt[i+W] - hgt[i-W]) * strength;
        const inv = 1/Math.sqrt(vx*vx + vy*vy + 1);
        nX[i] = vx*inv; nY[i] = vy*inv; nZ[i] = inv;
      }
    }
    return {nX:nX, nY:nY, nZ:nZ};
  };

  // ── the lighting pass ────────────────────────────────────────
  // A small POINT lamp hovering above the surface: per-pixel light vector
  // and falloff, so the highlight is a moving pool rather than a sheen.
  // Ambient is never attenuated, so nothing outside the pool goes black.
  Field.prototype.shade = function(ctx, o){
    const W = this.W, H = this.H;
    const img = ctx.createImageData(W,H), d = img.data;

    const L = o.light;
    const lpx = L.x, lpy = L.y;
    const lph = L.h === undefined ? 300 : L.h;
    const lrad = L.radius === undefined ? 420 : L.radius;
    const lph2 = lph*lph;
    const invR2 = 1/(lrad*lrad);
    const lc = hexRgb(L.color || '#fff1de');
    const lcr = lc[0]/255, lcg = lc[1]/255, lcb = lc[2]/255;

    const c0 = hexRgb(o.color || '#ffffff');
    const cmap = o.colorMap || null;
    const matte = !!o.matte;
    const tone = o.tone && o.tone.amount > 0 ? o.tone : null;
    const tS = tone ? hexRgb(tone.shadow) : null;
    const tH = tone ? hexRgb(tone.high) : null;
    const tAmt = tone ? tone.amount : 0;
    const steps = o.steps || 0;
    const contrast = o.contrast === undefined ? 1 : o.contrast;
    const sheenAmt = o.sheen === undefined ? (matte ? 0.07 : 0) : o.sheen;

    const gloss = o.gloss === undefined ? 0.35 : o.gloss;
    const shin  = 5 + gloss*32;
    const spa   = gloss*0.55;
    const amb   = o.ambient === undefined ? 0.26 : o.ambient;
    const scat  = o.scatter || 0;
    const wrap  = o.wrap === undefined ? 0.40 : o.wrap;
    const aoLo  = o.aoLo === undefined ? 0.52 : o.aoLo;
    const aoHi  = 1 - aoLo;
    const exp   = o.exposure === undefined ? 1 : o.exposure;
    const sp0   = hexRgb(o.specColor || '#ece4d8');
    const useEnv = !!o.env;
    const envLo = o.envLo === undefined ? 0.62 : o.envLo;
    const envHi = o.envHi === undefined ? 1.30 : o.envHi;

    // Optional per-pixel material: matMap indexes into `materials`, so one
    // sheet can carry wax, brass and paper at once under a single lamp.
    const matMap = o.matMap || null;
    const mats = (matMap && o.materials && o.materials.length) ? o.materials : null;
    let mAmb, mAoLo, mExp, mScat, mSheen, mShin, mSpa, mEnv, mEnvLo, mEnvHi;
    if(mats){
      const n = mats.length;
      mAmb = new Float32Array(n); mAoLo = new Float32Array(n); mExp = new Float32Array(n);
      mScat = new Float32Array(n); mSheen = new Float32Array(n); mShin = new Float32Array(n);
      mSpa = new Float32Array(n); mEnv = new Uint8Array(n);
      mEnvLo = new Float32Array(n); mEnvHi = new Float32Array(n);
      for(let k=0;k<n;k++){
        const M = mats[k] || {};
        const gk = M.gloss === undefined ? gloss : M.gloss;
        mAmb[k]   = M.ambient  === undefined ? amb   : M.ambient;
        mAoLo[k]  = M.aoLo     === undefined ? aoLo  : M.aoLo;
        mExp[k]   = M.exposure === undefined ? exp   : M.exposure;
        mScat[k]  = M.scatter  === undefined ? scat  : M.scatter;
        mSheen[k] = M.sheen    === undefined ? sheenAmt : M.sheen;
        mShin[k]  = 5 + gk*32;
        mSpa[k]   = gk*0.55;
        mEnv[k]   = M.env ? 1 : 0;
        mEnvLo[k] = M.envLo === undefined ? envLo : M.envLo;
        mEnvHi[k] = M.envHi === undefined ? envHi : M.envHi;
      }
    }

    const cov = o.cov, hgt = o.hgt, nX = o.nX, nY = o.nY, nZ = o.nZ;
    const invH = 1/(o.hMax || 1);
    const invW = 1/(1+wrap);

    for(let y=0;y<H;y++){
      const dy = lpy - y, dy2 = dy*dy, row = y*W;
      for(let x=0;x<W;x++){
        const i = row + x, o4 = i*4;
        const c = cov[i];
        if(c <= 0.004){ d[o4+3] = 0; continue; }

        const dx = lpx - x;
        const flat = dx*dx + dy2;
        const inv = 1/Math.sqrt(flat + lph2);
        const lx = dx*inv, ly = dy*inv, lz = lph*inv;
        const atten = 1/(1 + flat*invR2);

        let pAmb = amb, pAoLo = aoLo, pExp = exp, pScat = scat, pSheen = sheenAmt,
            pShin = shin, pSpa = spa, pEnv = useEnv, pEnvLo = envLo, pEnvHi = envHi;
        if(mats){
          const k = matMap[i];
          pAmb = mAmb[k]; pAoLo = mAoLo[k]; pExp = mExp[k]; pScat = mScat[k];
          pSheen = mSheen[k]; pShin = mShin[k]; pSpa = mSpa[k];
          pEnv = mEnv[k] === 1; pEnvLo = mEnvLo[k]; pEnvHi = mEnvHi[k];
        }

        const nx = nX[i], ny = nY[i], nz = nZ[i];

        let diff = (nx*lx + ny*ly + nz*lz + wrap) * invW;
        if(diff < 0) diff = 0;
        diff *= atten;

        let sp;
        if(matte && pSpa <= 0.0001){
          // matte is pure diffuse — no specular at all. A whisper of grazing
          // sheen keeps edges alive; pow() lifts midtones so the falloff
          // reads flat rather than modelled.
          diff = Math.pow(diff, 0.72);
          sp = Math.pow(1 - nz, 5.0)*pSheen*atten;
        } else {
          let hx = lx, hy = ly, hz = lz + 1;
          const hn = 1/Math.sqrt(hx*hx + hy*hy + hz*hz);
          const ndh = (nx*hx + ny*hy + nz*hz)*hn;
          if(matte) diff = Math.pow(diff, 0.72);
          sp = ndh > 0 ? Math.pow(ndh, pShin)*pSpa*atten : 0;
          sp = sp/(1 + sp*0.8);
          sp += Math.pow(1 - nz, 5.0)*pSheen*atten;
        }

        const ao = pAoLo + (1 - pAoLo)*Math.min(1, hgt[i]*invH*1.3);

        let envMul = 1;
        if(pEnv){
          let t = 0.5 - ny*0.5 + nx*0.10;
          t = t < 0 ? 0 : (t > 1 ? 1 : t);
          t = t*t*(3 - 2*t);
          envMul = pEnvLo + (pEnvHi - pEnvLo)*t;
        }

        let b0 = c0[0], b1 = c0[1], b2 = c0[2];
        if(cmap){ const m = i*3; b0 = cmap[m]; b1 = cmap[m+1]; b2 = cmap[m+2]; }

        const base = pAmb * ao * envMul * pExp;
        const key  = (1-pAmb) * diff * ao * envMul * pExp;
        const sc   = pScat > 0 ? Math.pow(1 - nz, 2.4)*pScat*(0.35 + 0.65*atten) : 0;

        let r = b0*(base + key*lcr + sc)      + sp*sp0[0];
        let g = b1*(base + key*lcg + sc*0.84) + sp*sp0[1];
        let b = b2*(base + key*lcb + sc*0.68) + sp*sp0[2];

        if(contrast !== 1){
          const mid = (b0 + b1 + b2)*0.333;
          r = mid + (r - mid)*contrast;
          g = mid + (g - mid)*contrast;
          b = mid + (b - mid)*contrast;
        }
        if(steps > 0){
          const l0 = r*0.299 + g*0.587 + b*0.114;
          if(l0 > 1){
            const f = (Math.round(l0/255*steps)/steps*255)/l0;
            r *= f; g *= f; b *= f;
          }
        }
        if(tone){
          const lum = (r*0.299 + g*0.587 + b*0.114)/255;
          r += (tS[0] + (tH[0]-tS[0])*lum - r)*tAmt;
          g += (tS[1] + (tH[1]-tS[1])*lum - g)*tAmt;
          b += (tS[2] + (tH[2]-tS[2])*lum - b)*tAmt;
        }

        d[o4]   = r > 255 ? 255 : (r < 0 ? 0 : r);
        d[o4+1] = g > 255 ? 255 : (g < 0 ? 0 : g);
        d[o4+2] = b > 255 ? 255 : (b < 0 ? 0 : b);
        d[o4+3] = c*255;
      }
    }
    ctx.putImageData(img,0,0);
  };

  Field.prototype.shadow = function(ctx, cov, radius, alpha){
    const W = this.W, H = this.H;
    const sh = this.blur(cov, radius);
    const img = ctx.createImageData(W,H), d = img.data;
    for(let i=0;i<W*H;i++){
      d[i*4] = 44; d[i*4+1] = 37; d[i*4+2] = 30;
      d[i*4+3] = Math.min(255, sh[i]*255*alpha);
    }
    ctx.putImageData(img,0,0);
  };

  Field.prototype.paper = function(ctx, hex, opts){
    opts = opts || {};
    const W = this.W, H = this.H, CX = this.CX, CY = this.CY;
    const p = hexRgb(hex), fib = makeRng(opts.seed || 777);
    const vig = opts.vignette === undefined ? 0.42 : opts.vignette;
    const amt = opts.amount === undefined ? 18 : opts.amount;
    const S = Math.max(W,H);
    const img = ctx.createImageData(W,H), d = img.data;
    for(let y=0;y<H;y++){
      const dy = (y-CY)/S;
      for(let x=0;x<W;x++){
        const i = (y*W + x)*4;
        const n = (noise(x*0.021 + 900, y*0.021 + 900) - 0.5)*amt + (fib()-0.5)*(amt*0.45);
        const dx = (x-CX)/S;
        const v = 1 - (dx*dx + dy*dy)*vig;
        d[i]   = Math.max(0, Math.min(255, (p[0]+n)*v));
        d[i+1] = Math.max(0, Math.min(255, (p[1]+n)*v));
        d[i+2] = Math.max(0, Math.min(255, (p[2]+n*0.85)*v));
        d[i+3] = 255;
      }
    }
    ctx.putImageData(img,0,0);
  };

  // A tile of neutral-grey dither. Drawn over the finished frame with
  // 'overlay' at low alpha it breaks up smooth gradients and banding —
  // the thing that reads as "rendered" rather than "printed".
  function grainTile(size, seed, amount){
    const c = makeCanvas(size, size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size), d = img.data;
    const rng = makeRng(seed || 1);
    const a = amount === undefined ? 26 : amount;
    for(let i=0;i<size*size;i++){
      const v = 128 + (rng() - 0.5)*a;
      d[i*4] = v; d[i*4+1] = v; d[i*4+2] = v; d[i*4+3] = 255;
    }
    ctx.putImageData(img,0,0);
    return c;
  }

  // the split-tone grade, applied once to an already-painted canvas
  function toneCanvas(ctx, W, H, tone){
    if(H === undefined || typeof H === 'object'){ tone = H; H = W; }
    if(!tone || !tone.amount) return;
    const tS = hexRgb(tone.shadow), tH = hexRgb(tone.high), a = tone.amount;
    const img = ctx.getImageData(0,0,W,H), d = img.data;
    for(let i=0;i<d.length;i+=4){
      const lum = (d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114)/255;
      d[i]   += (tS[0] + (tH[0]-tS[0])*lum - d[i])*a;
      d[i+1] += (tS[1] + (tH[1]-tS[1])*lum - d[i+1])*a;
      d[i+2] += (tS[2] + (tH[2]-tS[2])*lum - d[i+2])*a;
    }
    ctx.putImageData(img,0,0);
  }

  return {
    grainTile: grainTile,
    toneCanvas: toneCanvas,
    makeRng: makeRng,
    hexRgb: hexRgb,
    makeCanvas: makeCanvas,
    field: function(w,h){ return new Field(w,h); }
  };
})();
