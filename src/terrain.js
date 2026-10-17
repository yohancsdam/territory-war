import { W, H } from './config.js';
import { mulberry32, rangeOf } from './rng.js';
import { clamp } from './util.js';

// 1 = solid ground, 0 = air. Row-major, W×H.
export const mask = new Uint8Array(W * H);
// version increases every time the mask changes, so the renderer knows when to repaint.
// log, when it is an array, collects every carve as {x, y, r} so it can be sent to the guest.
export const terrain = { version: 0, log: null, style: 'hills' };

export function solid(x, y) {
  x = x | 0; y = y | 0;
  if (x < 0 || x >= W || y < 0 || y >= H) return false;
  return mask[y * W + x] === 1;
}
export function groundAt(x, y) { return solid(x, y + 1) || solid(x - 2, y + 1) || solid(x + 2, y + 1); }
export function groundY(x) {
  x = Math.round(x);
  if (x < 0 || x >= W) return -1;
  for (var y = 0; y < H; y++) if (mask[y * W + x]) return y;
  return -1;
}
function plateau(x, c, r) {
  var d = Math.abs(x - c) / r; if (d >= 1) return 0;
  var t = Math.min(1, (1 - d) * 2.4); return t * t * (3 - 2 * t);
}
function fillIsland(cx, cy, rx, ry) {
  var x, y;
  for (y = Math.max(0, Math.floor(cy)); y < Math.min(H, Math.ceil(cy + ry)); y++) {
    for (x = Math.max(0, Math.floor(cx - rx)); x < Math.min(W, Math.ceil(cx + rx)); x++) {
      var ex = (x - cx) / rx, ey = (y - cy) / ry;
      if (ex * ex + ey * ey <= 1) mask[y * W + x] = 1;
    }
  }
}
function fillRect(x0, y0, w, h) {
  for (var y = Math.max(0, y0); y < Math.min(H, y0 + h); y++)
    for (var x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) mask[y * W + x] = 1;
}

export const MAP_STYLES = ['hills', 'islands', 'canyon'];

// Builds the terrain for a style ('hills' | 'islands' | 'canyon' | 'random') from a seed.
// The same style and seed always produce the same mask. Returns the resolved style.
export function genTerrain(style, seed) {
  var rng = mulberry32(seed);
  function rand(a, b) { return rangeOf(rng, a, b); }
  if (MAP_STYLES.indexOf(style) < 0) style = MAP_STYLES[Math.floor(rng() * MAP_STYLES.length)];
  mask.fill(0);
  var x, y;
  if (style === 'hills') {
    var p1 = rand(0, 6.28), p2 = rand(0, 6.28), p3 = rand(0, 6.28);
    for (x = 0; x < W; x++) {
      var h = H * 0.6 + Math.sin(x * 0.011 + p1) * 42 + Math.sin(x * 0.027 + p2) * 22 + Math.sin(x * 0.005 + p3) * 40;
      var w1 = plateau(x, 150, 120), w2 = plateau(x, 810, 120);
      h = h * (1 - w1) + (H * 0.55) * w1; h = h * (1 - w2) + (H * 0.55) * w2;
      for (y = Math.max(0, Math.floor(h)); y < H; y++) mask[y * W + x] = 1;
    }
  } else if (style === 'islands') {
    var blobs = [[150, 320, 150, 120], [810, 320, 150, 120], [480, 250, 95, 60], [330, 400, 80, 55], [630, 400, 80, 55], [480, 450, 60, 40]];
    blobs.forEach(function (b) { fillIsland(b[0] + rand(-22, 22), b[1] + rand(-22, 22), b[2], b[3]); });
  } else {
    var p = rand(0, 6.28);
    for (x = 0; x < W; x++) {
      var ph = clamp((Math.abs(x - 480) - 150) / 60, 0, 1);
      var hh = 470 - ph * 170 + Math.sin(x * 0.03 + p) * 7;
      for (y = Math.floor(hh); y < H; y++) mask[y * W + x] = 1;
    }
    fillRect(400 + Math.floor(rand(-20, 20)), 240, 150, 12);
    fillIsland(480, 400, 42, 50);
  }
  terrain.style = style;
  measureOriginalDepth();
  terrain.version++;
  return style;
}

/* ---------- Painting (cosmetic only) ---------- */

// Depth of every pixel below the surface the map was generated with, so craters show bare
// earth instead of growing new grass.
var origDepth = new Uint8Array(W * H);
function measureOriginalDepth() {
  for (var x = 0; x < W; x++) {
    var d = 0;
    for (var y = 0; y < H; y++) {
      var i = y * W + x;
      d = mask[i] ? Math.min(255, d + 1) : 0;
      origDepth[i] = d;
    }
  }
}

// Smooth value noise in [0, 1), fixed for the whole session.
var noiseA = null, noiseB = null;
function hash2(x, y) {
  var h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(cell, salt) {
  var out = new Float32Array(W * H);
  for (var y = 0; y < H; y++) {
    var gy = y / cell, y0 = Math.floor(gy), fy = gy - y0;
    fy = fy * fy * (3 - 2 * fy);
    for (var x = 0; x < W; x++) {
      var gx = x / cell, x0 = Math.floor(gx), fx = gx - x0;
      fx = fx * fx * (3 - 2 * fx);
      var a = hash2(x0 + salt, y0), b = hash2(x0 + 1 + salt, y0), c = hash2(x0 + salt, y0 + 1), e = hash2(x0 + 1 + salt, y0 + 1);
      out[y * W + x] = (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
    }
  }
  return out;
}
function ensureNoise() {
  if (noiseA) return;
  noiseA = valueNoise(7, 0);
  noiseB = valueNoise(23, 977);
  var fine = valueNoise(2, 4111);
  for (var i = 0; i < noiseA.length; i++) noiseA[i] = noiseA[i] * 0.7 + fine[i] * 0.3;
}

// Colours per map style. RGB triplets.
var PALETTES = {
  hills: {
    grassTop: [132, 204, 78], grass: [86, 166, 54], grassDeep: [58, 128, 42],
    top: [156, 108, 66], deep: [82, 56, 40], stone: [112, 100, 90], scorch: [64, 46, 36],
    debris: ['#7a5434', '#5d4130', '#4f9a3a']
  },
  islands: {
    grassTop: [140, 214, 104], grass: [92, 178, 86], grassDeep: [60, 136, 70],
    top: [150, 132, 112], deep: [84, 76, 78], stone: [176, 170, 160], scorch: [58, 52, 54],
    debris: ['#8a7b6a', '#5e5658', '#5cae58']
  },
  canyon: {
    grassTop: [240, 206, 140], grass: [226, 182, 112], grassDeep: [204, 154, 92],
    top: [206, 120, 70], deep: [112, 56, 38], stone: [232, 168, 104], scorch: [86, 44, 30],
    strata: [[206, 122, 72], [214, 136, 82], [196, 112, 66], [220, 146, 92], [202, 118, 70]],
    debris: ['#c7753f', '#9c5232', '#e3b06e']
  }
};
export function debrisColors() { return (PALETTES[terrain.style] || PALETTES.hills).debris; }

var dTop = new Uint8Array(W * H), dBot = new Uint8Array(W * H), dSide = new Uint8Array(W * H);

// Writes the terrain colours into an RGBA pixel array (ImageData.data) of size W×H.
export function paintTerrain(d) {
  ensureNoise();
  var P = PALETTES[terrain.style] || PALETTES.hills, canyon = terrain.style === 'canyon';
  var x, y, i, run;
  // Distance to air above, below and to the sides (capped), for edge shading.
  for (x = 0; x < W; x++) {
    run = 0;
    for (y = 0; y < H; y++) { i = y * W + x; run = mask[i] ? Math.min(255, run + 1) : 0; dTop[i] = run; }
    run = 255;
    for (y = H - 1; y >= 0; y--) { i = y * W + x; run = mask[i] ? Math.min(255, run + 1) : 0; dBot[i] = run; }
  }
  for (y = 0; y < H; y++) {
    run = 255;
    for (x = 0; x < W; x++) { i = y * W + x; run = mask[i] ? Math.min(255, run + 1) : 0; dSide[i] = run; }
    run = 255;
    for (x = W - 1; x >= 0; x--) { i = y * W + x; run = mask[i] ? Math.min(255, run + 1) : 0; if (run < dSide[i]) dSide[i] = run; }
  }
  for (i = 0; i < W * H; i++) {
    var o = i * 4;
    if (!mask[i]) { d[o + 3] = 0; continue; }
    y = (i / W) | 0;
    var na = noiseA[i], nb = noiseB[i], top = dTop[i], od = origDepth[i];
    var grassH = canyon ? 3 + ((nb * 3) | 0) : 4 + ((na * 5) | 0);
    var r, g, b, t;
    if (od <= grassH && top <= grassH) {
      t = top / grassH;
      var c0 = top <= 1 ? P.grassTop : P.grass;
      r = c0[0] + (P.grassDeep[0] - c0[0]) * t; g = c0[1] + (P.grassDeep[1] - c0[1]) * t; b = c0[2] + (P.grassDeep[2] - c0[2]) * t;
    } else {
      t = Math.min(od, 170) / 170;
      var base = P.top;
      if (canyon) {
        var band = (y + nb * 10 + na * 3) / 9, bi = Math.floor(band), bf = band - bi;
        var sa = P.strata[bi % P.strata.length], sb = P.strata[(bi + 1) % P.strata.length];
        bf = bf < 0.8 ? 0 : (bf - 0.8) / 0.2;
        base = [sa[0] + (sb[0] - sa[0]) * bf, sa[1] + (sb[1] - sa[1]) * bf, sa[2] + (sb[2] - sa[2]) * bf];
      }
      r = base[0] + (P.deep[0] - base[0]) * t; g = base[1] + (P.deep[1] - base[1]) * t; b = base[2] + (P.deep[2] - base[2]) * t;
      if (na > 0.74 && nb > 0.45) { // small stones
        var s = Math.min(1, (na - 0.74) * 10) * 0.55;
        r += (P.stone[0] - r) * s; g += (P.stone[1] - g) * s; b += (P.stone[2] - b) * s;
      }
      if (top <= 3) { // freshly exposed crater surface
        var k = top === 1 ? 0.7 : (top === 2 ? 0.45 : 0.25);
        r += (P.scorch[0] - r) * k; g += (P.scorch[1] - g) * k; b += (P.scorch[2] - b) * k;
      }
    }
    var shade = 0.88 + na * 0.24;
    var under = dBot[i], side = dSide[i];
    if (under <= 4) shade *= 0.62 + under * 0.08;
    if (side <= 3) shade *= 0.8 + side * 0.06;
    d[o] = r * shade; d[o + 1] = g * shade; d[o + 2] = b * shade; d[o + 3] = 255;
  }
}

// 32-bit FNV-1a hash of the mask, to compare terrains cheaply.
export function hashMask() {
  var h = 0x811c9dc5;
  for (var i = 0; i < mask.length; i++) { h ^= mask[i]; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function carve(cx, cy, r) {
  var x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  var y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
    var dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= r * r) mask[y * W + x] = 0;
  }
  terrain.version++;
  if (terrain.log) terrain.log.push({ x: cx, y: cy, r: r });
}
