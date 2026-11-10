import { PLAYER, ICE, POWERUP } from '../config.js';
import { Bullet } from './bullet.js';
import { dirVec, bulletSpawnPoint } from './tank.js';

export const EMPTY_INPUT = { up: false, down: false, left: false, right: false, fire: false };

/**
 * Player tank. Pure logic — rendering/input/audio are injected by the browser layer.
 * Movement resolution (walls + other tanks) is delegated to the `move` helper passed
 * into tick, keeping collision rules in one place (game.js) for both factions.
 */
export class Player {
  constructor(id, spawn) {
    this.id = id;                      // 0 = P1, 1 = P2
    this.spawn = { cx: spawn.cx, cy: spawn.cy };
    this.x = spawn.cx * 16;
    this.y = spawn.cy * 16;
    this.dir = 'up';
    this.alive = true;
    this.lives = PLAYER.livesStart;    // reserve lives; the initial one is active
    this.score = 0;
    this.powerLevel = 0;               // 0..3 fire levels
    this.cooldown = 0;
    this.shieldTicks = PLAYER.respawnShieldTicks;
    this.stunTicks = 0;
    this.slideTicks = 0;               // ice glide remaining ticks
    this.slideDir = 'up';
    this.levelKills = { basic: 0, fast: 0, power: 0, armor: 0 };
    this.nextExtraLife = PLAYER.extraLifeEveryScore;
    this.liveBullets = 0;              // maintained by game.js
    this.rapidTicks = 0;               // machine-gun power remaining ticks
    this.scatterTicks = 0;             // triple-shot power remaining ticks
    this.wasOnIce = false;
  }

  get rect() { return { x: this.x, y: this.y, w: 32, h: 32 }; }
  get centre() { return { x: this.x + 16, y: this.y + 16 }; }

  get maxBullets() {
    return this.scatterTicks > 0 ? POWERUP.weapon.scatterBudget : PLAYER.maxBulletsByLevel[this.powerLevel];
  }
  maxBulletSpeed() {
    const base = PLAYER.bulletSpeedByLevel[this.powerLevel];
    return this.rapidTicks > 0 ? base * POWERUP.weapon.rapidSpeedMult : base;
  }
  fireCooldownSeconds() {
    if (this.rapidTicks > 0) return POWERUP.weapon.rapidCooldown;
    return this.powerLevel >= 2 ? PLAYER.fireCooldownL2Plus : PLAYER.fireCooldownBase;
  }
  get bulletPower() { return this.powerLevel >= 3 ? 2 : 1; }

  /** Returns true when an extra life was awarded on this score increase. */
  addScore(n) {
    this.score += n;
    if (this.score >= this.nextExtraLife) {
      this.lives += 1;
      this.nextExtraLife += PLAYER.extraLifeEveryScore;
      return true;
    }
    return false;
  }

  /** README rule: on death the fire level drops by one (never below 0). */
  onDeath() {
    this.powerLevel = Math.max(0, this.powerLevel - 1);
    this.alive = false;
    this.shieldTicks = 0;
    this.stunTicks = 0;
    this.slideTicks = 0;
    this.rapidTicks = 0;      // weapon powers never survive a respawn
    this.scatterTicks = 0;
    this.levelKills = { basic: 0, fast: 0, power: 0, armor: 0 };
  }

  respawn() {
    this.x = this.spawn.cx * 16;
    this.y = this.spawn.cy * 16;
    this.dir = 'up';
    this.alive = true;
    this.cooldown = 0;
    this.shieldTicks = PLAYER.respawnShieldTicks;
    this.stunTicks = 0;
    this.slideTicks = 0;
    this.liveBullets = 0;
  }

  stun() { this.stunTicks = PLAYER.stunTicks; }

  /**
   * One logic tick. `move(tank, dir, dist)` performs collision-checked movement and
   * returns true if the tank actually moved; `mayFire()` reports live-bullet budget.
   * Returns { fired: Bullet|null, moving: boolean }
   */
  tick(input, dt, map, move, mayFire) {
    let fired = null;
    if (this.stunTicks > 0) {
      this.stunTicks--;
      input = EMPTY_INPUT;
    }
    if (this.shieldTicks > 0) this.shieldTicks--;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.rapidTicks > 0) this.rapidTicks--;
    if (this.scatterTicks > 0) this.scatterTicks--;

    if (input.up && input.down) input = { ...input, up: false, down: false };
    if (input.left && input.right) input = { ...input, left: false, right: false };
    let want = null;
    if (input.up) want = 'up';
    else if (input.down) want = 'down';
    else if (input.left) want = 'left';
    else if (input.right) want = 'right';

    let moving = false;
    if (want) {
      if (want !== this.dir) this.dir = want;
      moving = move(this, want, PLAYER.speed * dt);
    } else if (this.slideTicks > 0) {
      // ice glide with no held key: keep drifting on the last heading until it ends
      moving = move(this, this.slideDir, PLAYER.speed * dt);
      if (!moving) this.slideTicks = 0; else this.slideTicks--;
    }

    const onIce = map.onIce(this.rect);
    if (onIce) {
      if (want) this.slideDir = want;
      this.slideTicks = ICE.slideTicks;
    } else if (!want && this.slideTicks === 0) {
      // nothing to do; glide state already cleared
    }
    this.wasOnIce = onIce;

    if (input.fire && this.cooldown <= 0 && mayFire(this)) {
      const p = bulletSpawnPoint(this);
      fired = new Bullet({
        x: p.x, y: p.y, dir: this.dir,
        speed: this.maxBulletSpeed(),
        faction: 'player', ownerId: this.id, power: this.bulletPower,
      });
      this.cooldown = this.fireCooldownSeconds();
    }
    return { fired, moving };
  }
}
