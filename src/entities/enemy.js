import { ENEMY, TICK_HZ, TANK } from '../config.js';
import { Bullet } from './bullet.js';
import { dirVec, bulletSpawnPoint } from './tank.js';
import { decideDirection, bfsToBase, enemyFireDecision } from '../ai.js';

/**
 * Enemy tank. Spawn/animation states and per-type behaviour live here; the actual
 * heading decision is delegated to the AI module (ai.js) to keep rules testable.
 */
export class Enemy {
  constructor(type, cell, { carrier, rng }) {
    this.type = type;             // 'basic' | 'fast' | 'power' | 'armor'
    this.x = cell.cx * 16;
    this.y = cell.cy * 16;
    this.dir = 'down';
    this.alive = true;
    this.hp = ENEMY.hp[type];
    this.hitFlash = 0;
    this.spawning = true;         // materialising: no collision, no damage
    this.spawnTicks = ENEMY.spawnLengthTicks;
    this.shieldTicks = 0;
    this.cooldown = 0;
    this.decideTimer = 0;
    this.decideInterval = 0;
    this.stuckTicks = 0;
    this.lastX = this.x;
    this.lastY = this.y;
    this.bfsTimer = 0;
    this.pathDir = null;
    this.carrier = !!carrier;
    this.blinkOn = carrier;
    this.startedMs = 0;           // spawn order index (set by game.js)
    this.rngOffset = rng ? Math.floor(rng.next() * TICK_HZ * 3) : 0; // desynchronise cadence
    this.liveBullets = 0;
  }

  get rect() { return { x: this.x, y: this.y, w: TANK, h: TANK }; }
  get centre() { return { x: this.x + 16, y: this.y + 16 }; }

  get speed() { return ENEMY.speed[this.type]; }
  bulletSpeed() { return ENEMY.bulletSpeed[this.type]; }
  fireCooldownSeconds() { return ENEMY.fireCooldown[this.type]; }

  hit(amount) {
    if (this.spawning) return 'immune';
    if (this.shieldTicks > 0) return 'shield';
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      return 'destroyed';
    }
    this.hitFlash = 8; // visible damage feedback on multi-hp armour tanks
    return 'damaged';
  }

  /** One logic tick. `move`/`world` behave exactly like the Player contract in game.js. */
  tick(dt, world, mayFire) {
    const { map, move, rng, players, baseRect } = world;
    if (this.spawning) {
      this.spawnTicks -= dt * TICK_HZ;
      if (this.spawnTicks > 0) return { fired: null, moving: false, spawnDone: false };
      this.spawning = false;
      this.spawnTicks = 0;
      this.shieldTicks = ENEMY.spawnShieldTicks;
      // stagger the first decision so mass spawns don't move in lockstep
      this.decideTimer = this.rngOffset % Math.round(TICK_HZ * 1.5) + 1;
      return { fired: null, moving: false, spawnDone: true };
    }
    if (this.shieldTicks > 0) this.shieldTicks--;
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.cooldown > 0) this.cooldown -= dt;

    this.decideTimer -= dt * TICK_HZ;
    this.bfsTimer -= dt * TICK_HZ;

    if (this.type === 'armor' && this.bfsTimer <= 0) {
      this.bfsTimer = 45; // heavy pathing throttled: at most once per 45 ticks per tank
      const from = { cx: Math.floor((this.x + 16) / 16), cy: Math.floor((this.y + 16) / 16) };
      const goal = baseRect();
      if (goal) {
        const to = { cx: Math.floor(goal.x / 16), cy: Math.floor(goal.y / 16) };
        this.pathDir = bfsToBase(from, to, map);
      }
    }

    let moving = false;
    if (this.decideTimer <= 0) {
      this.decideInterval = 30 + Math.floor(rng.next() * 60); // 0.5s–1.5s rhythm, never shared
      this.decideTimer = this.decideInterval;
      this.decideDir = decideDirection(this, world);
    }
    if (this.decideDir == null) this.decideDir = decideDirection(this, world);

    if (this.decideDir) {
      if (this.dir !== this.decideDir) this.dir = this.decideDir;
      moving = move(this, this.decideDir, this.speed * dt);
      if (!moving) {
        // blocked: switch direction right away instead of grinding into the wall
        this.decideDir = decideDirection(this, world, true);
        this.decideTimer = Math.min(this.decideTimer, 20);
      }
    }

    // stuck watchdog: no displacement for 45 ticks forces a fresh heading
    if (Math.abs(this.x - this.lastX) < 0.01 && Math.abs(this.y - this.lastY) < 0.01) {
      this.stuckTicks++;
      if (this.stuckTicks > 45) {
        this.stuckTicks = 0;
        this.decideDir = rng.pick(['up', 'down', 'left', 'right']);
        this.decideTimer = 24;
      }
    } else {
      this.stuckTicks = 0;
      this.lastX = this.x;
      this.lastY = this.y;
    }

    let fired = null;
    if (mayFire(this) && enemyFireDecision(this, world)) {
      const p = bulletSpawnPoint(this);
      fired = new Bullet({
        x: p.x, y: p.y, dir: this.dir,
        speed: this.bulletSpeed(),
        faction: 'enemy', ownerId: this.id ?? -1, power: 1,
      });
      this.cooldown = this.fireCooldownSeconds();
    }
    return { fired, moving, spawnDone: false };
  }
}
