import sys; s=open(sys.argv[2] if len(sys.argv)>2 else 'sf.html').read()
css = """
  .about-link { position:fixed; right:max(16px, env(safe-area-inset-right, 0px)); bottom:max(14px, env(safe-area-inset-bottom, 0px)); font:500 14px "EB Garamond", Garamond, Georgia, serif; letter-spacing:.04em; color:var(--muted); background:none; border:0; border-bottom:1px solid transparent; padding:2px 0; cursor:pointer; }
  .about-link:hover, .about-link[aria-expanded="true"] { color:var(--red); border-bottom-color:var(--red); }
  .about-link:focus-visible { outline:1.5px solid var(--red); outline-offset:3px; }
  .about { position:fixed; right:max(16px, env(safe-area-inset-right, 0px)); bottom:max(44px, calc(env(safe-area-inset-bottom, 0px) + 44px)); width:min(380px, calc(100vw - 32px)); max-height:calc(100vh - 80px); overflow:auto; background:#fffdf8; color:var(--ink); border:1.5px solid var(--red); padding:20px 22px 18px; font:400 16px/1.55 "EB Garamond", Garamond, Georgia, serif; box-shadow:0 18px 40px -24px rgba(43,42,40,.35); }
  .about h2 { font:500 26px/1.1 "EB Garamond", Garamond, Georgia, serif; margin:0 0 2px; text-wrap:balance; }
  .about .sub { color:var(--muted); font-size:12px; letter-spacing:.06em; margin:0 0 12px; }
  .about p { margin:0 0 10px; }
  .about .meta { font-size:12px; color:var(--muted); margin-top:12px; }
  body.embed { padding:0; justify-content:center; overflow:hidden; height:100vh; }
  body.embed .sheet { width:min(100vw, 100vh); }
  body.embed canvas { pointer-events:none; }
  body.embed .about-link, body.embed .about { display:none; }
  .open-full { position:fixed; inset:0; display:none; }
  body.embed .open-full { display:block; }
"""
html = """
<a class="open-full" href="./" target="_top" aria-label="Open the painted map of San Francisco"></a>
<button class="about-link" id="aboutBtn" type="button" aria-expanded="false" aria-controls="about">About</button>
<aside class="about" id="about" hidden>
  <h2>San Francisco from Twin Peaks</h2>
  <p class="sub">Study after Yoshida Hatsusaburō</p>
  <p>A bird’s-eye view after the panoramic railway maps (<i>chōkanzu</i>) of Yoshida Hatsusaburō (1884–1955). The centre is enlarged; the surrounding terrain is compressed toward a curved horizon, where distant places are set at their true bearings.</p>
  <p>Elevation from Terrarium tiles (Mapzen, AWS Open Data) at 12.5 m within 4 km of Twin Peaks and 50 m to 24 km. Radius is logarithmic in distance, relief is exaggerated toward the rim, and slopes are stepped at 24 m. Drawn in the browser.</p>
  <p class="meta">Drag to rotate · drag up to tilt · pinch or scroll to zoom</p>
</aside>
<script>
(function(){
  const embed = new URLSearchParams(location.search).has('embed');
  const btn=document.getElementById('aboutBtn'), box=document.getElementById('about');
  btn.onclick=()=>{ const open=box.hidden; box.hidden=!open; btn.setAttribute('aria-expanded', String(open)); };
  addEventListener('keydown', e=>{ if(e.key==='Escape' && !box.hidden){ box.hidden=true; btn.setAttribute('aria-expanded','false'); btn.focus(); } });
  document.addEventListener('pointerdown', e=>{ if(!box.hidden && !box.contains(e.target) && e.target!==btn){ box.hidden=true; btn.setAttribute('aria-expanded','false'); } });
  if (!embed) return;
  document.body.classList.add('embed');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let deg=0, last=0, visible=true;
  if ('IntersectionObserver' in window) new IntersectionObserver(es=>{ visible=es[0].isIntersecting; }).observe(document.body);
  const tick=(t)=>{ requestAnimationFrame(tick); if(!window.__turn || !visible || document.hidden || t-last<66) return;
    deg=(deg+ (t-last>500?0:(t-last)*0.0015))%360; last=t; window.__turn(deg); };
  requestAnimationFrame(tick);
})();
</script>
"""
a=s.index('</style>'); s=s[:a]+css+s[a:]
b=s.rindex('</body>'); s=s[:b]+html+s[b:]
s=s.replace('<meta name="viewport" content="width=device-width, initial-scale=1">','<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',1)
import sys; open(sys.argv[1] if len(sys.argv)>1 else '/mnt/project-files/sf-map/lab/index.html','w').write(s)
