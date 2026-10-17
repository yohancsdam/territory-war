import { W, H } from './config.js';
import { rand } from './rng.js';
import { clamp } from './util.js';

// 1 = solid ground, 0 = air. Row-major, W×H.
export const mask = new Uint8Array(W * H);
// version increases every time the mask changes, so the renderer knows when to repaint.
export const terrain = { version: 0 };

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

export function genTerrain(style) {
  if (style === 'random') style = ['hills', 'islands', 'canyon'][Math.floor(Math.random() * 3)];
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
  terrain.version++;
  return style;
}

// Writes the terrain colours into an RGBA pixel array (ImageData.data) of size W×H.
export function paintTerrain(d) {
  var x, y;
  for (x = 0; x < W; x++) {
    var depth = 0;
    for (y = 0; y < H; y++) {
      var i = y * W + x, o = i * 4;
      if (mask[i]) {
        depth++;
        var n = (x * 7 + y * 13) % 9;
        if (depth <= 5) { d[o] = 66 + n * 2; d[o + 1] = 158 + n * 3; d[o + 2] = 56; }
        else {
          var k = Math.min(depth, 140) / 140;
          d[o] = Math.round(150 - 54 * k) + n; d[o + 1] = Math.round(104 - 40 * k) + n; d[o + 2] = Math.round(66 - 26 * k) + n;
        }
        d[o + 3] = 255;
      } else { depth = 0; d[o + 3] = 0; }
    }
  }
}

export function carve(cx, cy, r) {
  var x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  var y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
    var dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= r * r) mask[y * W + x] = 0;
  }
  terrain.version++;
}
