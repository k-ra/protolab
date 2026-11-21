// Shared GLSL chunks (GLSL ES 3.00).

export const NOISE = /* glsl */ `
float sstep(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 mod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

// Mood: NOW on the left of the sky, SOON sweeping in from the right.
export const MOOD = /* glsl */ `
uniform vec4 uA0, uA1, uA2, uB0, uB1, uB2;
uniform vec3 uFabA, uFabB, uShA, uShB, uSkyTA, uSkyTB, uSkyBA, uSkyBB;
uniform float uFlash, uGustNow, uTime, uFlow, uFlut;
uniform vec2 uFlashPos;
struct Mood { float wind; float gust; float rain; float snow; float cloud; float temp; float storm; float fog; float vortex; float day;
              vec3 fab; vec3 sheen; vec3 skyT; vec3 skyB; };
Mood moodAt(float k){
  Mood m;
  vec4 a0 = mix(uA0, uB0, k), a1 = mix(uA1, uB1, k), a2 = mix(uA2, uB2, k);
  m.wind = a0.x; m.gust = a0.y; m.rain = a0.z; m.snow = a0.w;
  m.cloud = a1.x; m.temp = a1.y; m.storm = a1.z; m.fog = a1.w;
  m.vortex = a2.x; m.day = a2.y;
  m.fab = mix(uFabA, uFabB, k); m.sheen = mix(uShA, uShB, k);
  m.skyT = mix(uSkyTA, uSkyTB, k); m.skyB = mix(uSkyBA, uSkyBB, k);
  return m;
}
float timeK(float x01){ return smoothstep(0.45, 0.98, x01); }
`;

// Sky, precipitation, lightning, haze, grain. Needs uniform vec2 uRes.
export const ATMOS = /* glsl */ `
vec3 skyColor(vec2 uv, Mood m){
  vec3 c = mix(m.skyB, m.skyT, smoothstep(-0.15, 1.05, uv.y));
  vec2 d = (uv - vec2(0.5, 0.55)) * vec2(uRes.x / uRes.y, 1.0);
  c += (m.skyB * 0.22 + 0.025) * exp(-dot(d, d) * 2.6);
  return c;
}
float rainField(vec2 frag, float amt, float wind){
  if (amt < 0.005) return 0.0;
  vec2 q = frag / uRes.y * 900.0;
  float acc = 0.0;
  for (int L = 0; L < 3; L++){
    float fl = float(L);
    vec2 s = q;
    s.x += s.y * (0.06 + 0.4 * wind) * (0.8 + 0.2 * fl);
    float cw = 6.0 + fl * 5.0;
    float col = floor(s.x / cw);
    float r1 = hash11(col * 1.37 + fl * 17.1);
    float r2 = hash11(col * 3.11 + fl * 5.3);
    float speed = 700.0 + fl * 450.0 + r1 * 250.0;
    float period = 220.0 + r2 * 380.0;
    float y = s.y + uTime * speed + r1 * 977.0;
    float cell = floor(y / period);
    float fy = fract(y / period);
    float on = step(hash12(vec2(col, cell + fl * 31.0)), amt * (0.5 + 0.25 * fl));
    float len = (30.0 + fl * 30.0) / period;
    float tail = clamp(1.0 - fy / len, 0.0, 1.0);
    float xo = 0.5 + (r2 - 0.5) * 0.5;
    float dx = abs(fract(s.x / cw) - xo) * cw;
    float line = 1.0 - smoothstep(0.0, 0.7 + fl * 0.45, dx);
    acc += line * tail * tail * on * (0.2 + 0.2 * fl);
  }
  return acc;
}
float snowField(vec2 frag, float amt, float wind){
  if (amt < 0.005) return 0.0;
  vec2 q = frag / uRes.y * 900.0;
  float acc = 0.0;
  for (int L = 0; L < 3; L++){
    float fl = float(L);
    float sz = 38.0 + fl * 30.0;
    vec2 p = q / sz;
    p.y += uTime * (20.0 + fl * 18.0) / sz;
    p.x += uTime * (5.0 + wind * 70.0) / sz + sin(p.y * 0.9 + fl * 2.0 + uTime * 0.5) * 0.25;
    vec2 id = floor(p);
    vec2 f = fract(p) - 0.5;
    float h = hash12(id + fl * 13.7);
    vec2 o = (vec2(hash12(id + 3.7), hash12(id + 9.1)) - 0.5) * 0.6;
    float d = length(f - o) * sz;
    float rad = 0.9 + fl * 1.0 + h * 1.4;
    acc += step(h, amt * 0.8) * (1.0 - smoothstep(rad * 0.2, rad, d)) * (0.45 + 0.25 * fl);
  }
  return acc;
}
vec3 finish(vec3 col, vec2 frag, vec2 uv, Mood m, float cover){
  float r = rainField(frag, m.rain, m.wind);
  float s = snowField(frag, m.snow, m.wind);
  vec3 rc = mix(vec3(0.72, 0.8, 0.92), m.sheen, 0.3);
  col += rc * r * (1.0 - 0.35 * cover);
  col = mix(col, vec3(0.97, 0.98, 1.0), clamp(s, 0.0, 1.0) * 0.85);
  vec2 d = (uv - uFlashPos) * vec2(uRes.x / uRes.y, 1.0);
  col += uFlash * m.storm * (vec3(0.78, 0.74, 1.0) * exp(-dot(d, d) * 5.0) * (0.5 + 1.3 * cover) + vec3(0.09, 0.09, 0.13));
  vec3 fogc = mix(m.skyB, vec3(0.86), 0.35);
  col = mix(col, fogc, m.fog * 0.36);
  vec2 v = uv - 0.5;
  col *= 1.0 - dot(v, v) * 0.32;
  col += (hash12(frag + fract(uTime * 7.3) * 311.0) - 0.5) * (3.0 / 255.0);
  return col;
}
`;
