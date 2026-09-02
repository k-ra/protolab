// ═══════════════════════════════════════════════════════════════
// hub.js — the library, and how presets travel.
//
// A "specimen" is {kind, spec}. `kind` picks the renderer (flora, press);
// `spec` is everything that renderer needs. The same object shape is used
// on the hub canvas, in the saved library, and in the URL hash that
// carries a preset into a study page and back.
// ═══════════════════════════════════════════════════════════════

const Hub = (function(){
  const LIB = 'protolab.library.v1';
  const ARR = 'protolab.canvas.v2';

  // base64url of JSON — survives a URL hash intact
  function encode(obj){
    const json = JSON.stringify(obj);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decode(str){
    try {
      let b64 = String(str).replace(/-/g,'+').replace(/_/g,'/');
      while(b64.length % 4) b64 += '=';
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch(e){ return null; }
  }

  // the hub always sits in a protolab/ directory, so studies are always ../
  function studyBase(){ return '../'; }
  const STUDY_OF = {flower: 'flowers/', press: 'press/'};

  function linkTo(kind, spec, extra){
    const payload = Object.assign({kind: kind, spec: spec}, extra || {});
    return studyBase() + (STUDY_OF[kind] || 'flowers/') + '#preset=' + encode(payload);
  }
  // hand an edited spec back to the hub
  function backToHub(kind, spec, extra){
    const payload = Object.assign({kind: kind, spec: spec}, extra || {});
    return hubLink() + '#preset=' + encode(payload);
  }
  function hubLink(){ return '../protolab/'; }

  // read a preset handed to a study page, then clear it from the URL so a
  // reload doesn't keep re-applying it
  function takeHashPreset(){
    const m = /[#&]preset=([^&]+)/.exec(location.hash || '');
    if(!m) return null;
    const o = decode(m[1]);
    try { history.replaceState(null, '', location.pathname + location.search); } catch(e){}
    return o;
  }

  function read(key, fallback){
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch(e){ return fallback; }
  }
  function write(key, val){
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch(e){ return false; }
  }

  function library(){ return read(LIB, []); }
  function saveLibrary(list){ return write(LIB, list); }
  function addFavourite(entry){
    const list = library();
    const id = 'f' + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36);
    list.unshift({
      id: id,
      name: entry.name || (entry.kind === 'press' ? 'Seal' : 'Bloom'),
      kind: entry.kind || 'flower',
      spec: entry.spec || {},
      conditions: entry.conditions || null,
      at: Date.now()
    });
    saveLibrary(list.slice(0, 60));
    return id;
  }
  function removeFavourite(id){
    saveLibrary(library().filter(e => e.id !== id));
  }
  function getFavourite(id){
    return library().filter(e => e.id === id)[0] || null;
  }

  function arrangement(){ return read(ARR, null); }
  function saveArrangement(o){ return write(ARR, o); }

  return {
    encode: encode, decode: decode,
    linkTo: linkTo, backToHub: backToHub, hubLink: hubLink, studyBase: studyBase,
    takeHashPreset: takeHashPreset,
    library: library, addFavourite: addFavourite,
    removeFavourite: removeFavourite, getFavourite: getFavourite,
    arrangement: arrangement, saveArrangement: saveArrangement
  };
})();
