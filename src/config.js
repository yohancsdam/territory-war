// All game constants and tuning values. Change the numbers here to rebalance the game;
// the gameplay modules read everything from this file.

/* ---------- Canvas ---------- */
export const W = 960;
export const H = 540;

/* ---------- Physics ---------- */
export const DT = 1 / 120;  // fixed simulation step (seconds)
export const GRAV = 900;    // gravity for soldiers, grenades and dynamite (px/s²)

/* ---------- Turns ---------- */
export const TURN_TIME = 30;            // seconds per turn
export const BANNER_TIME = 2;           // seconds the "turn of…" banner stays on screen
// After a shot the turn ends once nothing has moved for RESOLVE_SETTLE_TIME seconds,
// but never before RESOLVE_MIN_TIME nor later than RESOLVE_MAX_TIME.
export const RESOLVE_MIN_TIME = 1;
export const RESOLVE_SETTLE_TIME = 0.8;
export const RESOLVE_MAX_TIME = 14;

/* ---------- Soldiers ---------- */
export const WALK_SPEED = 58;           // px/s
export const JUMP_SPEED_Y = 330;        // upward launch speed (px/s)
export const JUMP_SPEED_X = 70;         // forward launch speed (px/s)
export const FALL_SAFE_SPEED = 430;     // landing faster than this hurts
export const FALL_DAMAGE_DIV = 9;       // damage = (landing speed - safe speed) / this
export const AIM_SPEED = 1.4;           // rad/s when aiming with the keys
export const AIM_LIMIT = 1.35;          // max aim angle above/below horizontal (rad)
export const START_AIM = 0.35;          // initial aim angle (rad)

export const TEAM_COLORS = ['#d9434f', '#3f7be0'];
export const SOLDIER_NAMES = [
  ['Rex', 'Ana', 'Pipo', 'Luz', 'Tito', 'Nano'],
  ['Bruno', 'Sol', 'Kira', 'Max', 'Lola', 'Zoe']
];

/* ---------- Wind ---------- */
export const WIND_MAX = 1;              // wind is rolled in [-WIND_MAX, WIND_MAX] each turn

/* ---------- Charged weapons ---------- */
export const CHARGE_TIME = 1.4;         // seconds to reach full power (auto-fires at full)
export const MIN_POWER = 0.08;          // power used when released instantly

/* ---------- Bullets ---------- */
export const BULLET_KNOCKBACK = 110;    // horizontal push on hit (px/s)
export const BULLET_LIFT = 70;          // upward push on hit (px/s)
export const BULLET_OWNER_SAFE_DIST = 18; // bullets can't hit the shooter before travelling this far

/* ---------- Explosions ---------- */
export const EXPLOSION_RANGE_PAD = 10;  // damage reaches radius + this
export const EXPLOSION_KNOCKBACK_MUL = 1.15;
export const EXPLOSION_LIFT = 90;       // extra upward push at the centre (px/s)

/* ---------- Thrown items (grenade, dynamite) ---------- */
export const THROWN_STOP_SPEED = 60;        // vertical speed below which it stops bouncing
export const THROWN_BOUNCE_FRICTION = 0.85; // horizontal speed kept on each floor bounce
export const THROWN_GROUND_FRICTION = 0.03; // fraction of horizontal speed kept per second while rolling

/* ---------- Weapons ----------
   kind 'bullet': instant-fire bullets
     pellets   bullets per shot          spread    random angle ± (rad)
     speed     bullet speed (px/s)       speedVar  extra random speed 0..speedVar
     damage    damage per bullet         crater    terrain hole radius (px)
     life      seconds before vanishing  gravity   bullet drop (px/s²)
   kind 'rocket' / 'thrown': charged, speed = minSpeed + power * (maxSpeed - minSpeed)
     radius    explosion radius (px)     damage    damage at the centre
     knockback push at the centre (px/s) fuse      seconds until it explodes (thrown)
     bounce    speed kept on wall/floor bounces (thrown)
     gravity   rocket drop (px/s², rockets only; thrown items use GRAV)
     windFactor how much wind pushes it  ownerSafeTime rocket can't hit the shooter this early (s)
   ammo: per team per battle (Infinity = unlimited). sound: 'shot' | 'big' */
export const WEAPONS = [
  { key: 'pistol', name: 'Pistol', ammo: Infinity, charge: false, kind: 'bullet', sound: 'shot',
    pellets: 1, spread: 0.015, speed: 900, speedVar: 0, damage: 14, crater: 5, life: 0.9, gravity: 140 },
  { key: 'shotgun', name: 'Shotgun', ammo: 6, charge: false, kind: 'bullet', sound: 'big',
    pellets: 5, spread: 0.14, speed: 720, speedVar: 100, damage: 9, crater: 3, life: 0.45, gravity: 220 },
  { key: 'sniper', name: 'Sniper', ammo: 4, charge: false, kind: 'bullet', sound: 'big',
    pellets: 1, spread: 0, speed: 1700, speedVar: 0, damage: 45, crater: 9, life: 1.6, gravity: 0 },
  { key: 'bazooka', name: 'Bazooka', ammo: 6, charge: true, kind: 'rocket', sound: 'big',
    minSpeed: 160, maxSpeed: 800, gravity: 180, radius: 42, damage: 55, knockback: 420,
    windFactor: 70, ownerSafeTime: 0.25 },
  { key: 'grenade', name: 'Grenade', ammo: 6, charge: true, kind: 'thrown', sound: 'shot',
    minSpeed: 140, maxSpeed: 840, fuse: 3, bounce: 0.5, radius: 46, damage: 55, knockback: 400,
    windFactor: 14 },
  { key: 'dynamite', name: 'Dynamite', ammo: 3, charge: true, kind: 'thrown', sound: 'shot',
    minSpeed: 50, maxSpeed: 310, fuse: 4, bounce: 0.1, radius: 76, damage: 85, knockback: 540,
    windFactor: 0 }
];

export function weaponDef(key) {
  for (var i = 0; i < WEAPONS.length; i++) if (WEAPONS[i].key === key) return WEAPONS[i];
  return WEAPONS[0];
}
