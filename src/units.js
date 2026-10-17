import { W, H, GRAV, WALK_SPEED, JUMP_SPEED_X, JUMP_SPEED_Y } from './config.js';
import { S, feed } from './state.js';
import { solid, groundAt } from './terrain.js';
import { addText, burst } from './fx.js';
import { sfx } from './audio.js';
import { clamp } from './util.js';

export function bodyBlocked(x, y, dir) {
  var lx = x + dir * 3;
  return solid(lx, y) || solid(lx, y - 4) || solid(lx, y - 11) || solid(lx, y - 18) || solid(lx, y - 25);
}
export function tryStep(u, dir) {
  var nx = u.x + dir;
  for (var s = 0; s <= 3; s++) {
    var ny = u.y - s;
    if (!bodyBlocked(nx, ny, dir)) {
      u.x = nx; u.y = ny;
      var d = 0;
      while (d < 4 && !groundAt(u.x, u.y)) { u.y++; d++; }
      if (!groundAt(u.x, u.y)) u.onGround = false;
      return;
    }
  }
}
export function hurt(u, dmg, team) {
  if (!u.alive || dmg <= 0) return;
  u.hp -= dmg; u.hurtT = 0.3;
  if (team >= 0) u.lastHit = team;
  if (team >= 0 && team !== u.team) S.teams[team].stat.dmg += dmg;
  addText(u.x, u.y - 42, '-' + dmg, team === u.team ? '#ffd166' : '#ffffff');
  burst(u.x, u.y - 14, 6, '#c62828', 120, 0.5, 2, 400);
  if (u.hp <= 0) die(u, 'dmg');
}
export function die(u, how) {
  if (!u.alive) return;
  u.alive = false; u.hp = 0;
  var cr = (u.lastHit >= 0 && u.lastHit !== u.team) ? u.lastHit : -1;
  if (cr >= 0) S.teams[cr].stat.kills++;
  var x = clamp(u.x, 10, W - 10), y = clamp(u.y - 14, 10, H - 10);
  burst(x, y, 18, '#f4f4f4', 180, 0.8, 3, 300);
  addText(x, y - 20, how === 'out' ? 'Out!' : 'K.O.', '#ffd166');
  feed(u.name + ' (' + S.teams[u.team].name + ') ' + (how === 'out' ? 'was blasted off the map.' : 'fell in battle.'));
  sfx('hit');
}
// c is the control for the active soldier ({move, jump}) or null for everyone else.
export function updateUnit(u, dt, c) {
  if (!u.alive) return;
  u.hurtT = Math.max(0, u.hurtT - dt);
  if (u.onGround) {
    if (!groundAt(u.x, u.y)) { u.onGround = false; }
    else {
      u.moving = false;
      if (c) {
        if (c.move) {
          u.face = c.move; u.walkAcc += WALK_SPEED * dt; u.moving = true; u.walkT += dt * 9;
          while (u.walkAcc >= 1 && u.onGround) { u.walkAcc -= 1; tryStep(u, c.move); }
        }
        if (c.jump) { u.onGround = false; u.vy = -JUMP_SPEED_Y; u.vx = (c.move || u.face) * JUMP_SPEED_X; u.y -= 1; }
      }
      if (u.onGround) return;
    }
  }
  u.moving = false;
  var cnt = 0;
  while (solid(u.x, u.y - 4) && cnt < 14) { u.y--; cnt++; }
  u.vy += GRAV * dt;
  var nx = u.x + u.vx * dt;
  if (u.vx !== 0 && bodyBlocked(nx, u.y, u.vx > 0 ? 1 : -1)) u.vx *= -0.25; else u.x = nx;
  var ny = u.y + u.vy * dt;
  if (u.vy > 0) {
    var landed = false, yy;
    for (yy = Math.floor(u.y); yy <= Math.floor(ny); yy++) {
      if (groundAt(u.x, yy)) {
        u.y = yy; landed = true; break;
      }
    }
    if (landed) { u.vx = 0; u.vy = 0; u.onGround = true; }
    else u.y = ny;
  } else {
    if (solid(u.x, ny - 26) || solid(u.x - 3, ny - 26) || solid(u.x + 3, ny - 26)) u.vy = 0; else u.y = ny;
  }
  if (u.alive && (u.y > H + 20 || u.x < -15 || u.x > W + 15)) die(u, 'out');
}
