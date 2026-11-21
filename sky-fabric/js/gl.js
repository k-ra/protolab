// Tiny raw-WebGL2 helpers. No frameworks.

export function getGL(canvas, opts = {}) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, powerPreference: 'high-performance', ...opts,
  });
  if (!gl) {
    document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:auto 0 45% 0;text-align:center;color:#999;font:14px system-ui">This study needs WebGL2.</p>');
    throw new Error('WebGL2 unavailable');
  }
  return gl;
}

export function makeProgram(gl, vsSrc, fsSrc) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      console.error(log + '\n' + src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
      throw new Error(log);
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u, use() { gl.useProgram(p); return this; } };
}

export const FS_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

export function fullscreen(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { draw() { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); } };
}

export function fitCanvas(canvas, scale) {
  const w = Math.max(2, Math.round(canvas.clientWidth * scale));
  const h = Math.max(2, Math.round(canvas.clientHeight * scale));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
  return false;
}

// Push the tweened mood state into a program's uniforms (names from glsl.js MOOD chunk).
export function applyMood(gl, u, S) {
  const a = S.cur.now, b = S.cur.soon, pa = S.pal.now, pb = S.pal.soon;
  gl.uniform4f(u.uA0, a.wind, a.gust, a.rain, a.snow);
  gl.uniform4f(u.uA1, a.cloud, a.temp, a.storm, a.fog);
  gl.uniform4f(u.uA2, a.vortex, a.day, 0, 0);
  gl.uniform4f(u.uB0, b.wind, b.gust, b.rain, b.snow);
  gl.uniform4f(u.uB1, b.cloud, b.temp, b.storm, b.fog);
  gl.uniform4f(u.uB2, b.vortex, b.day, 0, 0);
  gl.uniform3fv(u.uFabA, pa.fab); gl.uniform3fv(u.uFabB, pb.fab);
  gl.uniform3fv(u.uShA, pa.sheen); gl.uniform3fv(u.uShB, pb.sheen);
  gl.uniform3fv(u.uSkyTA, pa.skyT); gl.uniform3fv(u.uSkyTB, pb.skyT);
  gl.uniform3fv(u.uSkyBA, pa.skyB); gl.uniform3fv(u.uSkyBB, pb.skyB);
  gl.uniform1f(u.uFlash, S.flash.value);
  gl.uniform2f(u.uFlashPos, S.flash.pos[0], S.flash.pos[1]);
  gl.uniform1f(u.uGustNow, S.gustNow);
  gl.uniform1f(u.uTime, S.time);
  gl.uniform1f(u.uFlow, S.flow);
  gl.uniform1f(u.uFlut, S.flut);
}

// Drops render scale when frames run long (ignores throttled background frames).
export class Perf {
  constructor(scale, min) { this.scale = scale; this.min = min; this.acc = 0; this.n = 0; }
  tick(dt) {
    if (dt > 0.1) return false;
    this.acc += dt; this.n++;
    if (this.n < 45) return false;
    const avg = this.acc / this.n; this.acc = 0; this.n = 0;
    if (avg > 1 / 42 && this.scale > this.min) { this.scale = Math.max(this.min, this.scale * 0.85); return true; }
    return false;
  }
}

export function loop(fn) {
  let last = performance.now();
  const f = (now) => {
    const raw = (now - last) / 1000;
    last = now;
    fn(Math.min(0.05, raw), raw);
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
  // test hook: step the scene by hand (rAF pauses when the page is hidden)
  window.__advance = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) fn(dt, dt); };
}
