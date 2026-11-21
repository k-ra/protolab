// Weather → mood. Everything visual is driven by a small "mood" vector (0..1 values)
// for NOW (left of the sky) and SOON (right of the sky, the next ~3–12 hours).

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

export const KEYS = ['wind', 'gust', 'rain', 'snow', 'cloud', 'temp', 'storm', 'fog', 'vortex', 'day', 'humid', 'wx', 'wz'];
const BASE = { wind: 0.15, gust: 0.1, rain: 0, snow: 0, cloud: 0.15, temp: 0.55, storm: 0, fog: 0, vortex: 0, day: 1, humid: 0.5, wx: 0.95, wz: 0.3 };
const M = (o) => ({ ...BASE, ...o });

// ---------------------------------------------------------------- presets (for eval)
export const PRESETS = {
  clear:    { label: 'Clear & still',     now: M({ humid: 0.4, temp: 0.62, cloud: 0.05, wind: 0.1 }) },
  breezy:   { label: 'Breezy',            now: M({ humid: 0.35, wind: 0.62, gust: 0.7, cloud: 0.3 }) },
  overcast: { label: 'Overcast',          now: M({ humid: 0.75, cloud: 0.95, temp: 0.45, wind: 0.25 }) },
  rain:     { label: 'Steady rain',       now: M({ humid: 0.95, rain: 0.65, cloud: 1, temp: 0.45, wind: 0.35 }) },
  storm:    { label: 'Thunderstorm',      now: M({ wx: -0.85, wz: 0.5, humid: 0.9, rain: 0.9, storm: 1, wind: 0.85, gust: 1, cloud: 1, temp: 0.55 }) },
  snow:     { label: 'Snowfall',          now: M({ humid: 0.8, snow: 0.7, cloud: 0.9, temp: 0.22, wind: 0.15 }) },
  fog:      { label: 'Fog',               now: M({ humid: 1, fog: 1, cloud: 1, temp: 0.45, wind: 0.04 }) },
  heat:     { label: 'Heatwave',          now: M({ humid: 0.3, temp: 0.97, cloud: 0, wind: 0.08 }) },
  vortex:   { label: 'Polar vortex',      now: M({ humid: 0.45, temp: 0.02, wind: 0.9, gust: 0.8, snow: 0.3, cloud: 0.6, vortex: 1 }) },
  night:    { label: 'Clear night',       now: M({ humid: 0.6, day: 0, temp: 0.42, cloud: 0.05 }) },
  muggy:    { label: 'Muggy & humid',     now: M({ humid: 1, temp: 0.8, cloud: 0.5, wind: 0.08 }) },
  dry:      { label: 'Dry & windy',       now: M({ wx: -0.9, wz: -0.4, humid: 0.04, wind: 0.6, gust: 0.7, temp: 0.62, cloud: 0 }) },
  front:    { label: 'Storm moving in',   now: M({ temp: 0.62, cloud: 0.15 }), soon: M({ wx: -0.9, wz: 0.4, rain: 0.9, storm: 1, wind: 0.85, gust: 0.9, cloud: 1, temp: 0.52 }) },
  clearing: { label: 'Rain clearing',     now: M({ humid: 0.95, rain: 0.6, cloud: 1, wind: 0.3, temp: 0.45 }), soon: M({ cloud: 0.1, temp: 0.55, humid: 0.45 }) },
  freeze:   { label: 'Cold snap coming',  now: M({ temp: 0.5, cloud: 0.4 }), soon: M({ temp: 0.02, wind: 0.9, gust: 0.8, snow: 0.3, cloud: 0.6, vortex: 1 }) },
};
export const PRESET_ORDER = ['live', ...Object.keys(PRESETS)];
export const CALM = M({ cloud: 0.4, wind: 0.12, temp: 0.5 });

// ---------------------------------------------------------------- WMO codes
const CODE = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Showers', 81: 'Showers',
  82: 'Violent showers', 85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm & hail', 99: 'Thunderstorm & hail',
};
const RAIN_LVL = { 51: 0.15, 53: 0.25, 55: 0.35, 56: 0.3, 57: 0.45, 61: 0.35, 63: 0.6, 65: 0.9, 66: 0.4, 67: 0.7, 80: 0.4, 81: 0.65, 82: 1, 95: 0.7, 96: 0.85, 99: 0.95 };
const SNOW_LVL = { 71: 0.35, 73: 0.6, 75: 0.9, 77: 0.25, 85: 0.5, 86: 0.9 };
const severity = (c) =>
  c >= 95 ? 10 : [65, 67, 75, 82, 86].includes(c) ? 8 : [63, 66, 73, 81, 85].includes(c) ? 6
  : [55, 57, 61, 71, 77, 80].includes(c) ? 4 : [51, 53, 56].includes(c) ? 3 : [45, 48].includes(c) ? 2 : c === 3 ? 1 : 0;

export function moodFromObs(o) {
  const code = o.code ?? 0;
  const snowy = SNOW_LVL[code] != null || (o.snow || 0) > 0.05;
  const rainLvl = Math.max(RAIN_LVL[code] || 0, clamp01((o.rain ?? o.precip ?? 0) / 6));
  const snowLvl = Math.max(SNOW_LVL[code] || 0, clamp01((o.snow || 0) / 2.5));
  const temp = clamp01((o.temp + 25) / 65); // -25°C .. 40°C
  const wind = clamp01(o.wind / 55);
  const gust = clamp01(o.gust / 85);
  const cold = clamp01((0.32 - temp) / 0.32);
  return {
    wind, gust,
    rain: snowy ? rainLvl * 0.3 : rainLvl,
    snow: snowy ? snowLvl : 0,
    cloud: clamp01(o.cloud / 100),
    temp,
    storm: code >= 95 ? (code === 95 ? 0.85 : 1) : clamp01((gust - 0.75) / 0.25) * 0.5,
    fog: code === 45 || code === 48 ? 1 : clamp01((o.humidity - 96) / 4) * clamp01((o.cloud - 80) / 20) * 0.5,
    vortex: clamp01(cold * 1.4) * clamp01((wind - 0.3) / 0.4),
    day: o.isDay ? 1 : 0,
    humid: clamp01(((o.humidity ?? 60) - 25) / 70),
    // where the wind blows TO, seen facing north: wx → east (right), wz → north (away from you)
    wx: o.dir == null ? 0.95 : -Math.sin((o.dir * Math.PI) / 180),
    wz: o.dir == null ? 0.3 : -Math.cos((o.dir * Math.PI) / 180),
  };
}

// ---------------------------------------------------------------- palette
function ramp(stops, t) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    if (t <= t1) return mix3(hex(c0), hex(c1), clamp01((t - t0) / (t1 - t0)));
  }
  return hex(stops[stops.length - 1][1]);
}
const desat = (c, t) => { const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return mix3(c, [l, l, l], t); };

export function palette(m) {
  let fab = ramp([[0, '#a6dcff'], [0.3, '#d3e8ff'], [0.5, '#f2eff5'], [0.72, '#ffe4c8'], [1, '#ff9d7c']], m.temp);
  fab = mix3(fab, hex('#8593ad'), m.rain * 0.5);
  fab = mix3(fab, hex('#7a6fa6'), m.storm * 0.45);
  fab = mix3(fab, hex('#f6f9fd'), m.snow * 0.5);
  fab = desat(fab, m.fog * 0.6 + m.cloud * 0.15);
  fab = mix3(fab, hex('#c3cdeb'), (1 - m.day) * 0.3);

  let sheen = ramp([[0, '#c4f1ff'], [0.35, '#e6f4ff'], [0.55, '#ffffff'], [0.8, '#fff0d6'], [1, '#ffd2a6']], m.temp);
  sheen = mix3(sheen, hex('#dccbff'), m.storm * 0.6);
  sheen = mix3(sheen, hex('#e9eef2'), m.fog * 0.6);

  let skyT = ramp([[0, '#29456e'], [0.45, '#3e5f88'], [0.75, '#5b6585'], [1, '#7a5566']], m.temp);
  let skyB = ramp([[0, '#9fb7d2'], [0.45, '#b6c4d2'], [0.75, '#d8c3b5'], [1, '#f0b98f']], m.temp);
  const cl = m.cloud * 0.7;
  skyT = mix3(skyT, hex('#565e6b'), cl); skyB = mix3(skyB, hex('#a2a8b0'), cl);
  skyT = mix3(skyT, hex('#262d3a'), m.rain * 0.85); skyB = mix3(skyB, hex('#56606f'), m.rain * 0.8);
  skyT = mix3(skyT, hex('#0c0d15'), m.storm * 0.9); skyB = mix3(skyB, hex('#2a2839'), m.storm * 0.85);
  skyT = mix3(skyT, hex('#7c858f'), m.snow * 0.55); skyB = mix3(skyB, hex('#cdd4dc'), m.snow * 0.55);
  skyT = mix3(skyT, hex('#949ba3'), m.fog * 0.85); skyB = mix3(skyB, hex('#c4c8cb'), m.fog * 0.85);
  skyT = mix3(skyT, hex('#1b3b66'), m.vortex * 0.5); skyB = mix3(skyB, hex('#8fb6d8'), m.vortex * 0.4);
  const night = (1 - m.day) * 0.88;
  skyT = mix3(skyT, hex('#03050c'), night); skyB = mix3(skyB, hex('#141a2b'), night);
  return { fab, sheen, skyT, skyB };
}

// ---------------------------------------------------------------- lightning
class Lightning {
  constructor() { this.t = 0; this.next = 1.5; this.pulses = []; this.value = 0; this.pos = [0.5, 0.6]; this.onStrike = null; }
  update(dt, storm) {
    this.t += dt;
    if (storm > 0.05 && this.t > this.next) {
      const t = this.t;
      this.pulses = [{ at: t, a: 1 }, { at: t + 0.08, a: 0.55 }, { at: t + 0.2 + Math.random() * 0.1, a: 0.85 }];
      this.pos = [0.3 + Math.random() * 0.55, 0.42 + Math.random() * 0.25];
      this.next = t + (1.6 + Math.random() * 6) / Math.max(storm, 0.15);
      this.onStrike && this.onStrike(this.pos);
    } else if (storm <= 0.05) this.next = Math.max(this.next, this.t + 1);
    let v = 0;
    for (const p of this.pulses) if (this.t >= p.at) v += p.a * Math.exp(-(this.t - p.at) * 13);
    this.value = v;
  }
}

// ---------------------------------------------------------------- tweened state
export const timeK = (x) => { const t = clamp01((x - 0.45) / (0.98 - 0.45)); return t * t * (3 - 2 * t); };

export class MoodState {
  constructor() {
    this.cur = { now: { ...CALM }, soon: { ...CALM } };
    this.tgt = { now: { ...CALM }, soon: { ...CALM } };
    this.pal = { now: palette(CALM), soon: palette(CALM) };
    this.flash = new Lightning();
    this.time = 0; this.flow = 0; this.flut = 0; this.gustNow = 0;
  }
  set(now, soon, instant = false) {
    this.tgt = { now: { ...BASE, ...now }, soon: { ...BASE, ...(soon || now) } };
    if (instant) this.cur = { now: { ...this.tgt.now }, soon: { ...this.tgt.soon } };
  }
  at(x01) { const k = timeK(x01); const o = {}; for (const key of KEYS) o[key] = lerp(this.cur.now[key], this.cur.soon[key], k); return o; }
  avg(key) { return (this.cur.now[key] + this.cur.soon[key]) / 2; }
  update(dt) {
    const a = 1 - Math.exp(-dt * 0.9);
    for (const side of ['now', 'soon']) for (const k of KEYS) this.cur[side][k] += (this.tgt[side][k] - this.cur[side][k]) * a;
    this.pal.now = palette(this.cur.now);
    this.pal.soon = palette(this.cur.soon);
    this.time += dt;
    const t = this.time;
    this.gustNow = Math.max(0, Math.sin(t * 0.61) * Math.sin(t * 1.73 + 1.3) + 0.25 * Math.sin(t * 3.1));
    const wind = this.avg('wind'), gust = this.avg('gust'), storm = this.avg('storm');
    this.flow += dt * (0.05 + 0.32 * wind + 0.2 * storm + 0.08 * gust * this.gustNow);
    this.flut += dt * (0.5 + 2.6 * wind + 1.6 * storm + 1.5 * gust * this.gustNow);
    this.flash.update(dt, Math.max(this.cur.now.storm, this.cur.soon.storm));
  }
}

// ---------------------------------------------------------------- live data
const VARS = 'temperature_2m,relative_humidity_2m,precipitation,rain,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day';

async function geocode(city) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
  const g = (await r.json()).results?.[0];
  if (!g) throw new Error('city not found');
  return { lat: g.latitude, lon: g.longitude, name: g.name };
}
async function reverseName({ lat, lon }) {
  const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
  const j = await r.json();
  return j.city || j.locality || j.principalSubdivision || '';
}

export async function resolveLocation(params) {
  if (params.get('lat') && params.get('lon')) return { lat: +params.get('lat'), lon: +params.get('lon'), name: params.get('name') || '' };
  if (params.get('city')) { try { return await geocode(params.get('city')); } catch (e) { console.warn(e); } }
  const geo = await new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    const to = setTimeout(() => res(null), 7000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(to); res({ lat: p.coords.latitude, lon: p.coords.longitude, name: '' }); },
      () => { clearTimeout(to); res(null); },
      { maximumAge: 600000, timeout: 7000 });
  });
  if (geo) { geo.name = await reverseName(geo).catch(() => ''); return geo; }
  return { lat: 40.7128, lon: -74.006, name: 'New York', fallback: true };
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(a.length, 1);
const max = (a) => Math.max(0, ...a);

async function cached(key, fn) {
  try { const c = JSON.parse(sessionStorage.getItem(key)); if (c && Date.now() - c.at < 600000) return c.data; } catch {}
  const data = await fn();
  try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch {}
  return data;
}
async function getJSON(url, ms) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
    return await r.json();
  } finally { clearTimeout(to); }
}

// Primary: Open-Meteo (WMO weather codes, current + hourly).
async function openMeteo(loc) {
  const d = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=${VARS}&hourly=${VARS}&forecast_hours=13&timezone=auto`, 6000);
  const c = d.current, H = d.hourly;
  const now = { temp: c.temperature_2m, wind: c.wind_speed_10m, gust: c.wind_gusts_10m, precip: c.precipitation, rain: c.rain,
    snow: c.snowfall, cloud: c.cloud_cover, code: c.weather_code, humidity: c.relative_humidity_2m, isDay: c.is_day, dir: c.wind_direction_10m };
  const idx = [...H.time.keys()].slice(3, 13);
  const pick = (k) => idx.map((i) => H[k][i]).filter((v) => v != null);
  const worst = idx.map((i) => H.weather_code[i]).reduce((w, cd) => (severity(cd) > severity(w) ? cd : w), 0);
  const soon = { temp: mean(pick('temperature_2m')), wind: max(pick('wind_speed_10m')), gust: max(pick('wind_gusts_10m')),
    precip: max(pick('precipitation')), rain: max(pick('rain')), snow: max(pick('snowfall')), cloud: mean(pick('cloud_cover')),
    code: worst, humidity: mean(pick('relative_humidity_2m')), isDay: H.is_day[idx[Math.floor(idx.length / 2)]] ?? c.is_day };
  const hours = [...H.time.keys()].slice(0, 13).map((i) => ({ time: H.time[i], temp: H.temperature_2m[i], wind: H.wind_speed_10m[i],
    gust: H.wind_gusts_10m[i], precip: H.precipitation[i], rain: H.rain[i], snow: H.snowfall[i], cloud: H.cloud_cover[i],
    code: H.weather_code[i], humidity: H.relative_humidity_2m[i], isDay: H.is_day[i], dir: H.wind_direction_10m[i] }));
  if (hours.length) hours[0] = { ...now, time: hours[0].time };
  return { now, soon, hours, source: 'Open-Meteo' };
}

// Fallback: MET Norway (global, CORS-enabled). Symbol codes → WMO-ish codes.
const MET = { clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45, lightrain: 61, rain: 63, heavyrain: 65,
  lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82, lightsleet: 66, sleet: 66, heavysleet: 67,
  lightsleetshowers: 66, sleetshowers: 66, heavysleetshowers: 67, lightsnow: 71, snow: 73, heavysnow: 75,
  lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86 };
function metCode(sym = '') {
  const base = sym.replace(/_(day|night|polartwilight)$/, '');
  return base.includes('thunder') ? 95 : MET[base] ?? 3;
}
function metObs(e, lon) {
  const d = e.data.instant.details, n1 = e.data.next_1_hours || e.data.next_6_hours || {};
  const sym = n1.summary?.symbol_code || '';
  const code = metCode(sym);
  const precip = n1.details?.precipitation_amount ?? 0;
  const solar = (new Date(e.time).getUTCHours() + lon / 15 + 24) % 24;
  const isDay = /_night$/.test(sym) ? 0 : /_day$/.test(sym) ? 1 : solar > 6.5 && solar < 17.5 ? 1 : 0;
  const snowy = SNOW_LVL[code] != null;
  return { temp: d.air_temperature, wind: d.wind_speed * 3.6, gust: (d.wind_speed_of_gust ?? d.wind_speed * 1.6) * 3.6,
    precip, rain: snowy ? 0 : precip, snow: snowy ? precip : 0, cloud: d.cloud_area_fraction ?? 50, code,
    humidity: d.relative_humidity ?? 70, isDay, dir: d.wind_from_direction };
}
async function metNo(loc) {
  const d = await getJSON(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${loc.lat.toFixed(3)}&lon=${loc.lon.toFixed(3)}`, 8000);
  const ts = d.properties.timeseries;
  const nowIdx = Math.max(0, ts.findIndex((e) => new Date(e.time).getTime() > Date.now() - 3600e3));
  const now = metObs(ts[nowIdx], loc.lon);
  const soonObs = ts.slice(nowIdx + 3, nowIdx + 13).map((e) => metObs(e, loc.lon));
  const worst = soonObs.map((o) => o.code).reduce((w, cd) => (severity(cd) > severity(w) ? cd : w), 0);
  const pick = (k) => soonObs.map((o) => o[k]);
  const soon = { temp: mean(pick('temp')), wind: max(pick('wind')), gust: max(pick('gust')), precip: max(pick('precip')),
    rain: max(pick('rain')), snow: max(pick('snow')), cloud: mean(pick('cloud')), code: worst, humidity: mean(pick('humidity')),
    isDay: soonObs[Math.floor(soonObs.length / 2)]?.isDay ?? now.isDay };
  const hours = ts.slice(nowIdx, nowIdx + 13).map((e) => ({ ...metObs(e, loc.lon), time: e.time }));
  return { now, soon, hours, source: 'MET Norway' };
}

export async function loadLive(params) {
  const loc = await resolveLocation(params);
  const key = `skyfabric3:${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
  const obs = await cached(key, async () => {
    try { return await openMeteo(loc); }
    catch (e) { console.warn('Open-Meteo unavailable, using MET Norway', e); return metNo(loc); }
  });
  return {
    now: moodFromObs(obs.now), soon: moodFromObs(obs.soon),
    hours: obs.hours.map((o) => ({ mood: moodFromObs(o), obs: { ...o, label: CODE[o.code] || '—' } })),
    info: { lat: loc.lat, lon: loc.lon, place: loc.name || `${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}`, fallback: !!loc.fallback, live: true, source: obs.source,
      now: { ...obs.now, label: CODE[obs.now.code] || '—' }, soon: { ...obs.soon, label: CODE[obs.soon.code] || '—' } },
  };
}

// ---------------------------------------------------------------- words (only shown on click)
export function labelFor(m) {
  let l = m.vortex > 0.5 ? 'Polar vortex' : m.storm > 0.5 ? 'Thunderstorm' : m.snow > 0.5 ? 'Snow' : m.snow > 0.1 ? 'Light snow'
    : m.rain > 0.7 ? 'Heavy rain' : m.rain > 0.3 ? 'Rain' : m.rain > 0.08 ? 'Drizzle' : m.fog > 0.5 ? 'Fog'
    : m.cloud > 0.8 ? 'Overcast' : m.cloud > 0.45 ? 'Mostly cloudy' : m.cloud > 0.2 ? 'Partly cloudy' : m.day ? 'Clear' : 'Clear night';
  if (m.wind > 0.5 && m.vortex < 0.5 && m.storm < 0.5) l = `Windy, ${l.toLowerCase()}`;
  if (m.temp > 0.9 && l === 'Clear') l = 'Hot & clear';
  return l;
}
export function presetInfo(key) {
  const p = PRESETS[key], now = p.now, soon = p.soon || p.now;
  const obs = obsFromMood;
  return { place: p.label, preset: true, now: obs(now), soon: obs(soon) };
}

export const obsFromMood = (m) => ({ temp: m.temp * 65 - 25, wind: m.wind * 55, gust: m.gust * 85, precip: m.rain * 6 + m.snow * 2,
  humidity: 25 + (m.humid ?? 0.5) * 70, label: labelFor(m),
  dir: ((Math.atan2(-(m.wx ?? 1), -(m.wz ?? 0)) * 180) / Math.PI + 360) % 360 });
