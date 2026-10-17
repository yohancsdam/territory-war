import {
  W, H, GRAV, MIN_POWER, weaponDef,
  BULLET_KNOCKBACK, BULLET_LIFT, BULLET_OWNER_SAFE_DIST,
  EXPLOSION_RANGE_PAD, EXPLOSION_KNOCKBACK_MUL, EXPLOSION_LIFT,
  THROWN_STOP_SPEED, THROWN_BOUNCE_FRICTION, THROWN_GROUND_FRICTION
} from './config.js';
import { G, S, emit } from './state.js';
import { solid, carve } from './terrain.js';
import { hurt } from './units.js';
import { canAct, beginResolve } from './turns.js';
import { rand } from './rng.js';

function burst(x, y, n, col, speed, life, size, g) {
  emit({ k: 'burst', x: x, y: y, n: n, col: col, speed: speed, life: life, size: size, g: g });
}

export function unitAt(x, y, skip) {
  var units = S.units;
  for (var i = 0; i < units.length; i++) {
    var u = units[i];
    if (!u.alive || u === skip) continue;
    if (Math.abs(x - u.x) <= 5 && y > u.y - 27 && y <= u.y + 1) return u;
  }
  return null;
}
export function muzzle(u) {
  var ang = u.face === 1 ? -G.elev : Math.PI + G.elev;
  return { ang: ang, x: u.x + Math.cos(ang) * 12, y: u.y - 16 + Math.sin(ang) * 12 };
}
function pushBullet(m, ang, speed, w, team, owner) {
  S.proj.push({
    id: ++S.projSeq, type: 'bullet', w: w.key, x: m.x, y: m.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
    dmg: w.damage, crater: w.crater, life: w.life, g: w.gravity, team: team, owner: owner, age: 0, travel: 0
  });
}
export function doFire() {
  var u = G.active;
  if (!canAct()) return;
  var T = S.teams[G.t], k = G.weapon, w = weaponDef(k);
  if (!(T.ammo[k] > 0)) return;
  var m = muzzle(u), pw = Math.max(MIN_POWER, G.power), i;
  if (w.kind === 'bullet') {
    for (i = 0; i < w.pellets; i++) {
      var ang = m.ang + (w.spread ? rand(-w.spread, w.spread) : 0);
      var speed = w.speed + (w.speedVar ? rand(0, w.speedVar) : 0);
      pushBullet(m, ang, speed, w, G.t, u);
    }
  } else {
    var s = w.minSpeed + pw * (w.maxSpeed - w.minSpeed);
    var p = {
      id: ++S.projSeq, type: w.kind === 'rocket' ? 'rocket' : k, w: k, x: m.x, y: m.y,
      vx: Math.cos(m.ang) * s, vy: Math.sin(m.ang) * s, team: G.t, owner: u, age: 0
    };
    if (w.kind === 'rocket') p.trail = 0; else p.fuse = w.fuse;
    S.proj.push(p);
  }
  emit({ k: 'sfx', s: w.sound });
  T.stat.shots++;
  if (T.ammo[k] !== Infinity) T.ammo[k]--;
  G.fired = true; G.charging = false; G.power = 0;
  beginResolve();
}
export function explode(x, y, R, maxDmg, maxKB, team) {
  carve(x, y, R);
  var range = R + EXPLOSION_RANGE_PAD;
  S.units.forEach(function (u) {
    if (!u.alive) return;
    var cx = u.x, cy = u.y - 13, dx = cx - x, dy = cy - y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < range) {
      var f = 1 - d / range;
      var dmg = Math.max(1, Math.round(maxDmg * f));
      if (d < 1) { dx = 0; dy = -1; d = 1; }
      u.vx += dx / d * maxKB * f * EXPLOSION_KNOCKBACK_MUL;
      u.vy += dy / d * maxKB * f * EXPLOSION_KNOCKBACK_MUL - EXPLOSION_LIFT * f;
      u.onGround = false;
      hurt(u, dmg, team);
    }
  });
  var i;
  for (i = 0; i < 3; i++) burst(x, y, 10, ['#ffb703', '#fb8500', '#ffd166'][i], R * 3.2, 0.55, 3 + i, 0);
  burst(x, y, 12, '#555b60', R * 1.6, 1.1, 4, -40);
  S.booms.push({ x: x, y: y, r: R, t: 0 });
  emit({ k: 'shake', v: Math.min(12, R / 6) });
  emit({ k: 'sfx', s: 'boom' });
}
export function stepBullet(p, dt) {
  p.life -= dt; if (p.life <= 0) return true;
  p.vy += p.g * dt;
  var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy), dist = sp * dt, n = Math.max(1, Math.ceil(dist / 2));
  var sx = p.vx * dt / n, sy = p.vy * dt / n, sl = dist / n;
  for (var i = 0; i < n; i++) {
    p.x += sx; p.y += sy; p.travel += sl;
    if (p.x < -30 || p.x > W + 30 || p.y > H + 30 || p.y < -400) return true;
    var u = unitAt(p.x, p.y, p.travel < BULLET_OWNER_SAFE_DIST ? p.owner : null);
    if (u) {
      u.vx += p.vx / sp * BULLET_KNOCKBACK; u.vy -= BULLET_LIFT; u.onGround = false;
      hurt(u, p.dmg, p.team);
      burst(p.x, p.y, 5, '#ffe082', 160, 0.3, 2, 0);
      emit({ k: 'sfx', s: 'hit' });
      return true;
    }
    if (solid(p.x, p.y)) {
      carve(p.x, p.y, p.crater);
      burst(p.x, p.y, 5, '#ffe082', 150, 0.3, 2, 300);
      return true;
    }
  }
  return false;
}
export function stepRocket(p, dt) {
  var w = weaponDef(p.w);
  p.age += dt;
  p.vy += w.gravity * dt;
  var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy), dist = sp * dt, n = Math.max(1, Math.ceil(dist / 2));
  for (var i = 0; i < n; i++) {
    p.x += p.vx * dt / n; p.y += p.vy * dt / n;
    if (p.x < -40 || p.x > W + 40 || p.y > H + 40) return true;
    var u = unitAt(p.x, p.y, p.age < w.ownerSafeTime ? p.owner : null);
    if (u || solid(p.x, p.y)) { explode(p.x, p.y, w.radius, w.damage, w.knockback, p.team); return true; }
  }
  p.trail -= dt;
  if (p.trail <= 0) { p.trail = 0.02; emit({ k: 'trail', x: p.x, y: p.y }); }
  return false;
}
export function stepThrown(p, dt) {
  var w = weaponDef(p.w);
  p.age += dt;
  p.vy += GRAV * dt;
  var nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
  if (solid(nx, p.y)) p.vx = -p.vx * w.bounce; else p.x = nx;
  if (solid(p.x, ny)) {
    if (Math.abs(p.vy) < THROWN_STOP_SPEED) p.vy = 0; else p.vy = -p.vy * w.bounce;
    p.vx *= THROWN_BOUNCE_FRICTION;
  } else p.y = ny;
  var c = 0;
  while (solid(p.x, p.y) && c < 12) { p.y--; c++; }
  if (solid(p.x, p.y + 2)) p.vx *= Math.pow(THROWN_GROUND_FRICTION, dt);
  p.fuse -= dt;
  if (p.fuse <= 0) { explode(p.x, p.y, w.radius, w.damage, w.knockback, p.team); return true; }
  if (p.x < -40 || p.x > W + 40 || p.y > H + 60) return true;
  return false;
}
export function updateProj(dt) {
  var proj = S.proj, i;
  for (i = proj.length - 1; i >= 0; i--) {
    var p = proj[i], rem;
    if (p.type === 'bullet') rem = stepBullet(p, dt);
    else if (p.type === 'rocket') rem = stepRocket(p, dt);
    else rem = stepThrown(p, dt);
    if (rem) proj.splice(i, 1);
  }
  for (i = S.booms.length - 1; i >= 0; i--) {
    S.booms[i].t += dt; if (S.booms[i].t > 0.4) S.booms.splice(i, 1);
  }
}
