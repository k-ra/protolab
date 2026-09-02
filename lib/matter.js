// ═══════════════════════════════════════════════════════════════
// matter.js — the material catalogue.
//
// On the clippings sheet the ground never changes, so material is the only
// variable. Each entry is a colour plus a light response plus a relief
// character: how deep it takes an impression, how crisply it holds an edge,
// how much tooth it has.
// ═══════════════════════════════════════════════════════════════

const Matter = (function(){
  const M = {
    wax:      {name:'Sealing wax', color:'#b8746c',
               ambient:0.40, aoLo:0.52, exposure:1.16, gloss:0.10, sheen:0.05, scatter:0.06,
               relief:1.00, bevel:1.0, tooth:0.010, crisp:0.85},
    clay:     {name:'Terracotta',  color:'#c08a6c',
               ambient:0.44, aoLo:0.54, exposure:1.10, gloss:0.00, sheen:0.03, scatter:0.00,
               relief:1.10, bevel:1.3, tooth:0.030, crisp:0.70},
    paper:    {name:'Cotton paper',color:'#efeae0',
               ambient:0.52, aoLo:0.66, exposure:0.98, gloss:0.00, sheen:0.02, scatter:0.02,
               relief:0.80, bevel:1.1, tooth:0.016, crisp:0.75},
    brass:    {name:'Brass',       color:'#c3a468',
               ambient:0.34, aoLo:0.46, exposure:1.10, gloss:0.42, sheen:0.10, scatter:0.00,
               env:true, envLo:0.50, envHi:1.46,
               relief:0.95, bevel:0.7, tooth:0.004, crisp:1.00},
    pewter:   {name:'Pewter',      color:'#a9a69d',
               ambient:0.36, aoLo:0.48, exposure:1.08, gloss:0.30, sheen:0.08, scatter:0.00,
               env:true, envLo:0.56, envHi:1.34,
               relief:0.95, bevel:0.8, tooth:0.006, crisp:0.95},
    plaster:  {name:'Plaster',     color:'#e6e2d8',
               ambient:0.48, aoLo:0.58, exposure:1.04, gloss:0.00, sheen:0.02, scatter:0.03,
               relief:1.05, bevel:0.9, tooth:0.014, crisp:0.90},
    slate:    {name:'Slate',       color:'#6f7076',
               ambient:0.30, aoLo:0.44, exposure:1.20, gloss:0.08, sheen:0.05, scatter:0.00,
               relief:0.90, bevel:0.8, tooth:0.022, crisp:0.95},
    vellum:   {name:'Vellum',      color:'#e4dcc6',
               ambient:0.54, aoLo:0.68, exposure:0.96, gloss:0.04, sheen:0.03, scatter:0.05,
               relief:0.70, bevel:1.2, tooth:0.012, crisp:0.70}
  };
  const NAMES = Object.keys(M);

  // the subset shade() cares about
  function response(key){
    const m = M[key] || M.wax;
    return {
      ambient: m.ambient, aoLo: m.aoLo, exposure: m.exposure,
      gloss: m.gloss, sheen: m.sheen, scatter: m.scatter,
      env: !!m.env, envLo: m.envLo, envHi: m.envHi
    };
  }
  function get(key){ return M[key] || M.wax; }

  return {ALL: M, NAMES: NAMES, get: get, response: response};
})();
